"""自动同步测试：should_sync 判定、任务创建/取消、lifespan 隔离（全部离线）。"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from contextlib import suppress
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi.testclient import TestClient

from backend.app.core.settings import Settings, get_settings
from backend.app.data_sources.hko.client import HkoClient, read_state_value
from backend.app.main import create_app
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import ServiceState
from backend.app.services.auto_sync import (
    STATE_AUTO_SYNC_LAST_ERROR,
    STATE_AUTO_SYNC_LAST_SUCCESS,
    last_auto_sync_at,
    run_auto_sync,
    should_sync,
    start_auto_sync,
)
from backend.app.services.hko_ingest import ParsedDailyRow, PendingRow, upsert_daily_rows

# 固定“当前时间”：香港时区 2026-10-25 12:00，昨天 = 2026-10-24
NOW = datetime(2026, 10, 25, 4, 0, tzinfo=timezone.utc)
YESTERDAY = date(2026, 10, 24)

ClientFactory = Callable[[], HkoClient]


def _seed_rows(database: Database, day: date, *, station: str = "HKO") -> None:
    upsert_daily_rows(
        database,
        [
            PendingRow(
                row=ParsedDailyRow(
                    station_id=station,
                    metric="tmax",
                    obs_date=day,
                    value_raw="30.0",
                    value=30.0,
                    unit="°C",
                    quality_flag="C",
                ),
                source_document_id=None,
                fetched_at=utc_now_naive(),
            )
        ],
        mode="official",
    )


def _enabled_settings(settings: Settings, **updates: object) -> Settings:
    base: dict[str, object] = {
        "auto_sync_enabled": True,
        "auto_sync_days": 2,
        "fetch_min_interval_seconds": 0.0,
        "fetch_jitter_seconds": 0.0,
        "fetch_daily_budget": 50,
    }
    base.update(updates)
    return settings.model_copy(update=base)


def _make_factory(
    settings: Settings,
    database: Database,
    *,
    failing: bool = False,
) -> ClientFactory:
    """构造 MockTransport 客户端工厂（不联网）。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if failing:
            raise httpx.ConnectError("mock failure")
        raw = request.url.params.get("date", "")
        day = date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        payload = {
            "ReportTimeInfoDate": day.strftime("%Y%m%d"),
            "BulletinDate": (day + timedelta(days=1)).strftime("%Y%m%d"),
            "HKOReadingsMaxTemp": "31.8",
            "HKOReadingsMinTemp": "26.9",
            "ShaTinLocationName": "Sha Tin",
            "ShaTinMaxTemp": "32.6",
            "ShaTinMinTemp": "24.4",
        }
        return httpx.Response(200, json=payload)

    def factory() -> HkoClient:
        return HkoClient(settings, database, transport=httpx.MockTransport(handler))

    return factory


def _write_state(database: Database, key: str, value: str) -> None:
    with database.session() as session:
        session.add(
            ServiceState(key=key, value=value, updated_at=utc_now_naive())
        )


# --------------------------------------------------------------------- should_sync


def test_should_sync_false_when_disabled(
    weather_settings: Settings, weather_database: Database
) -> None:
    settings = _enabled_settings(weather_settings, auto_sync_enabled=False)
    assert should_sync(weather_database, settings, now=NOW) is False


def test_should_sync_false_when_external_fetch_disabled(
    weather_settings: Settings, weather_database: Database
) -> None:
    settings = _enabled_settings(weather_settings, external_fetch_enabled=False)
    assert should_sync(weather_database, settings, now=NOW) is False


def test_should_sync_true_when_database_empty(
    weather_settings: Settings, weather_database: Database
) -> None:
    assert should_sync(weather_database, _enabled_settings(weather_settings), now=NOW)


def test_should_sync_true_when_latest_observation_is_stale(
    weather_settings: Settings, weather_database: Database
) -> None:
    _seed_rows(weather_database, YESTERDAY - timedelta(days=1))
    assert should_sync(weather_database, _enabled_settings(weather_settings), now=NOW)


def test_should_sync_false_when_fresh_and_recent_success(
    weather_settings: Settings, weather_database: Database
) -> None:
    _seed_rows(weather_database, YESTERDAY)
    _write_state(
        weather_database,
        STATE_AUTO_SYNC_LAST_SUCCESS,
        (NOW - timedelta(hours=1)).isoformat(),
    )
    settings = _enabled_settings(weather_settings)
    assert should_sync(weather_database, settings, now=NOW) is False


def test_should_sync_true_when_last_success_is_too_old(
    weather_settings: Settings, weather_database: Database
) -> None:
    _seed_rows(weather_database, YESTERDAY)
    _write_state(
        weather_database,
        STATE_AUTO_SYNC_LAST_SUCCESS,
        (NOW - timedelta(hours=48)).isoformat(),
    )
    assert should_sync(weather_database, _enabled_settings(weather_settings), now=NOW)


# ---------------------------------------------------------------- run_auto_sync


async def test_run_auto_sync_writes_rows_and_state(
    weather_settings: Settings, weather_database: Database
) -> None:
    """成功同步：补写 RYES 行、记录 last success，之后不再需要同步。"""
    settings = _enabled_settings(weather_settings)
    factory = _make_factory(settings, weather_database)
    summary = await run_auto_sync(weather_database, settings, factory, now=NOW)
    assert summary is not None
    assert summary.end == YESTERDAY
    assert summary.rows_written > 0
    assert last_auto_sync_at(weather_database) is not None
    assert should_sync(weather_database, settings, now=NOW) is False
    assert read_state_value(weather_database, STATE_AUTO_SYNC_LAST_ERROR) == ""


async def test_run_auto_sync_failure_is_logged_not_raised(
    weather_settings: Settings, weather_database: Database
) -> None:
    """抓取失败只写错误状态并返回 None，后台循环不会崩溃。"""
    settings = _enabled_settings(weather_settings, fetch_max_retries=0)
    factory = _make_factory(settings, weather_database, failing=True)
    summary = await run_auto_sync(weather_database, settings, factory, now=NOW)
    assert summary is None
    error = read_state_value(weather_database, STATE_AUTO_SYNC_LAST_ERROR)
    assert error is not None and "ConnectError" in error


# ------------------------------------------------------------- 任务创建与取消


async def test_start_auto_sync_returns_none_when_disabled(
    weather_settings: Settings, weather_database: Database
) -> None:
    settings = weather_settings.model_copy(update={"auto_sync_enabled": False})
    task = start_auto_sync(
        weather_database, settings, _make_factory(settings, weather_database)
    )
    assert task is None


async def test_start_auto_sync_creates_and_cancels_task(
    weather_settings: Settings, weather_database: Database
) -> None:
    settings = _enabled_settings(weather_settings, external_fetch_enabled=False)
    task = start_auto_sync(
        weather_database, settings, _make_factory(settings, weather_database)
    )
    assert task is not None
    await asyncio.sleep(0)
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    assert task.cancelled()


# ------------------------------------------------------------- 测试隔离与 lifespan


def test_settings_default_disabled_in_tests() -> None:
    """conftest 必须把测试环境的自动同步默认关闭（fixture 会清理缓存）。"""
    assert get_settings().auto_sync_enabled is False


def test_lifespan_starts_task_only_when_enabled(
    weather_settings: Settings, weather_database: Database
) -> None:
    """enabled + 外部抓取关闭：lifespan 创建任务但不联网，退出时取消。"""
    settings = _enabled_settings(weather_settings, external_fetch_enabled=False)
    app = create_app(
        settings,
        database=weather_database,
        client_factory=_make_factory(settings, weather_database),
    )
    with TestClient(app):
        task = app.state.auto_sync_task
        assert task is not None
        assert not task.done()
    assert app.state.auto_sync_task is task
    assert task.done()


def test_lifespan_does_not_start_task_when_disabled(
    weather_settings: Settings, weather_database: Database
) -> None:
    settings = weather_settings.model_copy(update={"auto_sync_enabled": False})
    app = create_app(settings, database=weather_database)
    with TestClient(app):
        assert app.state.auto_sync_task is None
