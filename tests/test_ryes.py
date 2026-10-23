"""RYES 官方日雨量回填测试（阶段 4 可选能力）：解析、Trace、缺失、离线入库。

全部离线：用 ``httpx.MockTransport`` 注入固定样本，不访问 RYES 官方接口。
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import func, select

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient
from backend.app.data_sources.hko.limiter import HostRateLimiter
from backend.app.data_sources.hko.ryes import (
    RAINFALL_METRIC,
    RAINFALL_UNIT,
    RainfallIngestSummary,
    RyesParseError,
    ingest_rainfall_range,
    parse_ryes_payload,
)
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, SourceDocument


def _payload(bulletin: str, rainfall: object) -> dict[str, object]:
    """构造一份平铺 RYES 响应样本。"""
    return {
        "BulletinDate": bulletin,
        "HKOReadingsRainfall": rainfall,
        "HKOReadingsAccumRainfall": 12.3,
        "HKOReadingsMaxRH": 93,
        "HKOReadingsMinRH": 61,
    }


def _numeric_payload(day: date, rainfall: float) -> dict[str, object]:
    return _payload(day.strftime("%Y%m%d"), rainfall)


def _make_client(
    settings: Settings,
    database: Database,
    handler: Callable[[httpx.Request], httpx.Response],
) -> HkoClient:
    limiter = HostRateLimiter(
        min_interval_seconds=0.0,
        jitter_seconds=0.0,
        jitter_source=lambda: 0.0,
    )
    return HkoClient(settings, database, limiter=limiter, transport=httpx.MockTransport(handler))


def _count_rainfall(database: Database) -> int:
    statement = (
        select(func.count())
        .select_from(DailyWeather)
        .where(DailyWeather.metric == RAINFALL_METRIC)
    )
    with database.session() as session:
        value = session.execute(statement).scalar()
    return int(value) if isinstance(value, int) else 0


# ------------------------------------------------------------------ 解析


def test_parse_numeric_rainfall_keeps_raw_string() -> None:
    """数值雨量：value_raw 保留原样，单位由调用方写 mm。"""
    day = date(2026, 10, 20)
    parsed = parse_ryes_payload(_payload("20261020", 12.5), requested_date=day)
    assert parsed.requested_date == day
    assert parsed.bulletin_date == day
    assert parsed.rainfall_raw == "12.5"
    assert parsed.rainfall_value == pytest.approx(12.5)
    assert parsed.quality_flag == "C"
    assert parsed.skip_reason is None


def test_parse_zero_rainfall_is_real_zero() -> None:
    """真实 0.0 mm 是有效观测（区别于缺失）。"""
    parsed = parse_ryes_payload(_payload("2026-10-20", 0.0), requested_date=date(2026, 10, 20))
    assert parsed.rainfall_value == pytest.approx(0.0)
    assert parsed.skip_reason is None


def test_parse_trace_is_marked_not_zero() -> None:
    """Trace（<0.05mm）是官方独立特殊值：标记 trace 且不写 0。"""
    parsed = parse_ryes_payload(
        _payload("20261020", "Trace"), requested_date=date(2026, 10, 20)
    )
    assert parsed.rainfall_raw == "Trace"
    assert parsed.rainfall_value is None
    assert parsed.quality_flag == "trace"
    assert parsed.skip_reason == "trace_not_stored"


def test_parse_missing_rainfall_field() -> None:
    """没有 HKOReadingsRainfall 字段：返回 skip_reason，而不是抛错或写 0。"""
    parsed = parse_ryes_payload(
        {"BulletinDate": "20261020"}, requested_date=date(2026, 10, 20)
    )
    assert parsed.rainfall_raw is None
    assert parsed.skip_reason == "no_rainfall_field"


def test_parse_missing_value_token() -> None:
    """``***`` 等缺失标记：记 missing_value，不写 0。"""
    parsed = parse_ryes_payload(
        _payload("20261020", "***"), requested_date=date(2026, 10, 20)
    )
    assert parsed.rainfall_value is None
    assert parsed.skip_reason == "missing_value"


def test_parse_accepts_next_day_bulletin_when_report_date_matches() -> None:
    """实测形态：ReportTimeInfoDate=资料日，BulletinDate=次日发布日，应正常入库。"""
    payload = {
        "BulletinDate": "20261023",
        "BulletinTime": "0015",
        "ReportTimeInfoDate": "20261022",
        "HKOReadingsRainfall": "0",
    }
    parsed = parse_ryes_payload(payload, requested_date=date(2026, 10, 22))
    assert parsed.skip_reason is None
    assert parsed.report_date == date(2026, 10, 22)
    assert parsed.bulletin_date == date(2026, 10, 23)
    assert parsed.rainfall_raw == "0"
    assert parsed.rainfall_value == pytest.approx(0.0)


def test_parse_report_date_mismatch_is_skipped() -> None:
    """ReportTimeInfoDate 与请求日期不一致 → 跳过，避免把雨量记到错误日期。"""
    payload = {
        "BulletinDate": "20261023",
        "ReportTimeInfoDate": "20261021",
        "HKOReadingsRainfall": "1.2",
    }
    parsed = parse_ryes_payload(payload, requested_date=date(2026, 10, 22))
    assert parsed.rainfall_value is None
    assert parsed.skip_reason == "date_mismatch"


def test_parse_date_mismatch_is_not_stored_under_wrong_day() -> None:
    """BulletinDate 与请求日期不一致：跳过，不能把雨量记到错误日期上。"""
    parsed = parse_ryes_payload(
        _payload("20261019", 5.0), requested_date=date(2026, 10, 20)
    )
    assert parsed.bulletin_date == date(2026, 10, 19)
    assert parsed.rainfall_value is None
    assert parsed.skip_reason == "date_mismatch"


def test_parse_rejects_non_object_payload() -> None:
    """响应不是 JSON 对象 → RyesParseError（数据错误，不静默）。"""
    with pytest.raises(RyesParseError):
        parse_ryes_payload([], requested_date=date(2026, 10, 20))


# ------------------------------------------------------------------ 入库


async def test_ingest_rainfall_range_offline(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """两天数值雨量：写入 2 行、metric=rainfall、单位 mm、来源凭据 2 条。"""
    start = date(2026, 10, 20)
    values = {start: 12.5, start + timedelta(days=1): 0.0}

    def handler(request: httpx.Request) -> httpx.Response:
        requested = request.url.params["date"]
        day = date(int(requested[:4]), int(requested[4:6]), int(requested[6:8]))
        return httpx.Response(200, json=_numeric_payload(day, values[day]))

    client = _make_client(weather_settings, weather_database, handler)
    try:
        summary: RainfallIngestSummary = await ingest_rainfall_range(
            client,
            weather_database,
            weather_settings,
            start=start,
            end=start + timedelta(days=1),
        )
    finally:
        await client.aclose()

    assert summary.requests == 2
    assert summary.written == 2
    assert summary.trace_skipped == 0
    assert summary.errors == []
    assert _count_rainfall(weather_database) == 2
    with weather_database.session() as session:
        rows = (
            session.execute(
                select(DailyWeather)
                .where(DailyWeather.metric == RAINFALL_METRIC)
                .order_by(DailyWeather.obs_date)
            )
            .scalars()
            .all()
        )
        assert [(row.obs_date, row.value_raw, row.value, row.unit) for row in rows] == [
            (start, "12.5", 12.5, RAINFALL_UNIT),
            (start + timedelta(days=1), "0.0", 0.0, RAINFALL_UNIT),
        ]
        assert all(row.station_id == "HKO" for row in rows)
        assert all(row.mode == "official" for row in rows)
        documents = session.execute(
            select(SourceDocument).where(SourceDocument.dataset_key == "RYES")
        ).scalars().all()
        assert len(documents) == 2


async def test_ingest_skips_trace_without_writing_zero(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """Trace 日跳过入库：数据库里没有该日雨量，也没有 0 值。"""
    start = date(2026, 10, 20)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_payload("20261020", "Trace"))

    client = _make_client(weather_settings, weather_database, handler)
    try:
        summary = await ingest_rainfall_range(
            client,
            weather_database,
            weather_settings,
            start=start,
            end=start,
        )
    finally:
        await client.aclose()

    assert summary.requests == 1
    assert summary.written == 0
    assert summary.trace_skipped == 1
    assert _count_rainfall(weather_database) == 0


async def test_ingest_rejects_non_hko_station(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """RYES 只有 HKO 一站：其他站号必须在发请求前拒绝。"""
    limiter = HostRateLimiter(
        min_interval_seconds=0.0,
        jitter_seconds=0.0,
        jitter_source=lambda: 0.0,
    )

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - 不应被调用
        raise AssertionError("不应发出请求")

    client = HkoClient(
        weather_settings,
        weather_database,
        limiter=limiter,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(ValueError):
            await ingest_rainfall_range(
                client,
                weather_database,
                weather_settings,
                start=date(2026, 10, 20),
                end=date(2026, 10, 20),
                station="KP",
            )
    finally:
        await client.aclose()


async def test_ingest_rejects_invalid_range(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """start 晚于 end 必须拒绝。"""
    limiter = HostRateLimiter(
        min_interval_seconds=0.0,
        jitter_seconds=0.0,
        jitter_source=lambda: 0.0,
    )

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - 不应被调用
        raise AssertionError("不应发出请求")

    client = HkoClient(
        weather_settings,
        weather_database,
        limiter=limiter,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(ValueError):
            await ingest_rainfall_range(
                client,
                weather_database,
                weather_settings,
                start=date(2026, 10, 21),
                end=date(2026, 10, 20),
            )
    finally:
        await client.aclose()
