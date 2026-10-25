"""RYES 全映射站补数 + 自动同步写入范围测试（任务 21 修复 B）。"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from backend.app.cli import main
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient
from backend.app.data_sources.hko.registry import station_ids
from backend.app.data_sources.hko.ryes_temperature import RYES_TEMPERATURE_PREFIXES
from backend.app.models.db import Database
from backend.app.services.auto_sync import run_auto_sync
from backend.app.services.recent_ingest import (
    default_mapped_stations,
    ingest_recent_temperature,
)

OPENDATA_URL = "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php"
NOW = datetime(2026, 10, 25, 4, 0, tzinfo=timezone.utc)


def _payload(day: date) -> dict[str, object]:
    """包含部分可映射站 + 一个未映射站（Chek Lap Kok）的 RYES 固定样本。"""
    return {
        "ReportTimeInfoDate": day.strftime("%Y%m%d"),
        "BulletinDate": (day + timedelta(days=1)).strftime("%Y%m%d"),
        "HKOReadingsMaxTemp": "31.8",
        "HKOReadingsMinTemp": "26.9",
        "ShaTinLocationName": "Sha Tin",
        "ShaTinMaxTemp": "32.6",
        "ShaTinMinTemp": "24.4",
        "KingsParkLocationName": "King's Park",
        "KingsParkReadingsMaxTemp": "31.4",
        "KingsParkReadingsMinTemp": "25.9",
        "CheungChauLocationName": "Cheung Chau",
        "CheungChauMaxTemp": "32.2",
        "CheungChauMinTemp": "25.5",
        "ChekLapKokLocationName": "Chek Lap Kok",
        "ChekLapKokMaxTemp": "32.1",
        "ChekLapKokMinTemp": "26.5",
    }


def _make_client(settings: Settings, database: Database) -> HkoClient:
    def handler(request: httpx.Request) -> httpx.Response:
        raw = request.url.params.get("date", "")
        day = date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        return httpx.Response(200, json=_payload(day))

    return HkoClient(settings, database, transport=httpx.MockTransport(handler))


def _make_factory(settings: Settings, database: Database) -> Callable[[], HkoClient]:
    def factory() -> HkoClient:
        return _make_client(settings, database)

    return factory


def test_default_mapped_stations_are_22_and_in_registry(weather_settings: Settings) -> None:
    """RYES 映射表当前覆盖 22 个官方站，且全部在官方 39 站字典内。"""
    mapped = default_mapped_stations()
    assert len(mapped) == 22
    assert len(set(mapped)) == 22
    assert set(mapped) <= station_ids(weather_settings)
    assert {"HKO", "KP", "SHA", "CCH"} <= set(mapped)
    # 未映射的 RYES 键（如 Chek Lap Kok）不在映射结果里。
    assert "ChekLapKok" not in mapped
    assert len(RYES_TEMPERATURE_PREFIXES) >= len(mapped)


async def test_ingest_defaults_to_all_mapped_stations(
    weather_settings: Settings, weather_database: Database
) -> None:
    """省略 stations 时写入全部可映射站（payload 内可映射站全部入库）。"""
    settings = weather_settings.model_copy(
        update={"fetch_min_interval_seconds": 0.0, "fetch_jitter_seconds": 0.0}
    )
    client = _make_client(settings, weather_database)
    try:
        summary = await ingest_recent_temperature(
            client,
            weather_database,
            settings,
            stations=default_mapped_stations(),
            end=date(2026, 10, 20),
            days=1,
        )
    finally:
        await client.aclose()

    assert summary.stations == default_mapped_stations()
    assert summary.requests == 1
    # 样本 payload 中 4 个可映射站 × tmax/tmin = 8 行；Chek Lap Kok 未映射，不写。
    assert summary.rows_written == 8
    assert summary.unmapped_key_count == 2
    with weather_database.session() as session:
        from sqlalchemy import select

        from backend.app.models.weather import DailyWeather

        stations_in_db = set(
            session.execute(select(DailyWeather.station_id)).scalars().all()
        )
    assert stations_in_db == {"HKO", "SHA", "KP", "CCH"}


async def test_auto_sync_write_scope_is_all_mapped_by_default(
    weather_settings: Settings, weather_database: Database
) -> None:
    """自动同步判断用核心站，但实际写入默认覆盖全部可映射站。"""
    settings = weather_settings.model_copy(
        update={
            "auto_sync_enabled": True,
            "auto_sync_days": 1,
            "fetch_min_interval_seconds": 0.0,
            "fetch_jitter_seconds": 0.0,
        }
    )
    summary = await run_auto_sync(
        weather_database,
        settings,
        _make_factory(settings, weather_database),
        now=NOW,
    )
    assert summary is not None
    assert summary.stations == default_mapped_stations()
    assert summary.end == date(2026, 10, 24)


async def test_auto_sync_can_limit_write_scope_to_core_stations(
    weather_settings: Settings, weather_database: Database
) -> None:
    """auto_sync_write_all_mapped=false 时只写 auto_sync_stations 核心站。"""
    settings = weather_settings.model_copy(
        update={
            "auto_sync_enabled": True,
            "auto_sync_days": 1,
            "auto_sync_write_all_mapped": False,
            "fetch_min_interval_seconds": 0.0,
            "fetch_jitter_seconds": 0.0,
        }
    )
    summary = await run_auto_sync(
        weather_database,
        settings,
        _make_factory(settings, weather_database),
        now=NOW,
    )
    assert summary is not None
    assert summary.stations == ("HKO", "KP", "SHA")


def test_cli_ingest_recent_dry_run_defaults_to_all_mapped(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """CLI 省略 --stations 时按全部可映射站规划请求。"""
    exit_code = main(["ingest-recent", "--days", "2", "--dry-run"])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "22 個" in captured.out
    for station_id in ("HKO", "KP", "SHA", "CCH"):
        assert station_id in captured.out
