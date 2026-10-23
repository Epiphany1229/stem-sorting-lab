"""月表解析与入库测试：质量标记、空数组、精度、配对校验、幂等、窗口、覆盖率。"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import func, select

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient
from backend.app.data_sources.hko.limiter import HostRateLimiter
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, IngestionRun, SourceDocument
from backend.app.services.hko_ingest import (
    HkoPayloadError,
    ParsedDailyRow,
    PendingRow,
    WindowParameterError,
    compute_coverage,
    default_window_anchor,
    find_pairing_issues,
    ingest_year,
    parse_monthly_payload,
    parse_window_dates,
    resolve_window,
    summarize_temperature,
    upsert_daily_rows,
)

FIELDS: list[str] = [
    "年/Year",
    "月/Month",
    "日/Day",
    "數值/Value",
    "數據完整性/data Completeness",
]
LEGEND: list[str] = [
    "*** 沒有數據/unavailable",
    "# 數據不完整/data incomplete",
    "C 數據完整/data Complete",
]
OPENDATA_URL = "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php"


def make_payload(
    data: list[list[str]],
    *,
    title: str = "日最高氣溫(攝氏度) - 天文台",
) -> dict[str, object]:
    """构造一份结构正确的月表响应（值全部是字符串，与官方一致）。"""
    return {
        "type": [title, "Daily Maximum Temperature (°C)"],
        "fields": FIELDS,
        "data": data,
        "legend": LEGEND,
    }


def make_rows(days: Sequence[date], base: float, *, flag: str = "C") -> list[list[str]]:
    """按日期生成连续日值行。"""
    return [
        [str(day.year), str(day.month), str(day.day), f"{base + index * 0.1:.1f}", flag]
        for index, day in enumerate(days)
    ]


def make_record(
    obs_date: date,
    *,
    metric: str = "tmax",
    station_id: str = "HKO",
    value_raw: str = "30.0",
    quality_flag: str = "C",
) -> ParsedDailyRow:
    return ParsedDailyRow(
        station_id=station_id,
        metric=metric,
        obs_date=obs_date,
        value_raw=value_raw,
        value=float(value_raw),
        unit="°C",
        quality_flag=quality_flag,
    )


def date_range(start: date, days: int) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


def seed_rows(
    database: Database,
    records: Sequence[ParsedDailyRow],
    *,
    mode: str = "official",
) -> None:
    now = utc_now_naive()
    pending = [
        PendingRow(row=record, source_document_id=None, fetched_at=now) for record in records
    ]
    upsert_daily_rows(database, pending, mode=mode)


def count_daily(database: Database) -> int:
    with database.session() as session:
        value = session.execute(select(func.count()).select_from(DailyWeather)).scalar()
    return int(value) if isinstance(value, int) else 0


def count_model(database: Database, model: type[SourceDocument] | type[IngestionRun]) -> int:
    with database.session() as session:
        value = session.execute(select(func.count()).select_from(model)).scalar()
    return int(value) if isinstance(value, int) else 0


def make_client(
    settings: Settings,
    database: Database,
    handler: Callable[[httpx.Request], httpx.Response],
) -> HkoClient:
    """构造一个不产生真实等待的客户端（最小间隔 0）。"""
    limiter = HostRateLimiter(
        min_interval_seconds=0.0,
        jitter_seconds=0.0,
        jitter_source=lambda: 0.0,
    )
    return HkoClient(
        settings,
        database,
        limiter=limiter,
        transport=httpx.MockTransport(handler),
    )


# ------------------------------------------------------------------ 解析


def test_parse_keeps_raw_precision_and_quality_flags() -> None:
    """精度保真：``"34.4"`` 不得变成 34；``#`` 入库、``***`` 只计缺失。"""
    payload = make_payload(
        [
            ["2026", "9", "1", "34.4", "C"],
            ["2026", "9", "2", "***", "***"],
            ["2026", "9", "3", "33.1", "#"],
        ]
    )
    result = parse_monthly_payload(
        payload, station_id="HKO", metric="tmax", requested_year=2026
    )

    assert result.published is True
    assert len(result.rows) == 2
    assert result.rows[0].value_raw == "34.4"
    assert result.rows[0].value == pytest.approx(34.4)
    assert result.rows[0].quality_flag == "C"
    assert result.rows[1].quality_flag == "#"
    assert result.missing_count == 1
    assert result.issues == []


def test_parse_empty_data_means_not_published() -> None:
    """当月月表返回 ``data: []``：必须是"未发布"，不是错误也不是空成功。"""
    result = parse_monthly_payload(
        make_payload([]), station_id="HKO", metric="tmax", requested_year=2026
    )
    assert result.published is False
    assert result.reason == "not_published"
    assert result.rows == []
    assert result.issues == []


def test_parse_rejects_structurally_invalid_payload() -> None:
    """响应不是预期结构时必须抛数据错误，而不是静默当成空数据。"""
    with pytest.raises(HkoPayloadError):
        parse_monthly_payload([], station_id="HKO", metric="tmax")
    with pytest.raises(HkoPayloadError):
        parse_monthly_payload({}, station_id="HKO", metric="tmax")
    with pytest.raises(HkoPayloadError):
        parse_monthly_payload({"data": "oops"}, station_id="HKO", metric="tmax")


def test_parse_records_bad_rows_as_issues() -> None:
    """坏行记入 issues 并跳过，不影响同响应里的好行。"""
    payload = make_payload(
        [
            ["2026", "13", "1", "20.0", "C"],
            ["2026", "9", "2", "abc", "C"],
            ["2026", "9", "3", "20.0", "X"],
            ["2026", "9", "4", "28.5", "C"],
        ]
    )
    result = parse_monthly_payload(payload, station_id="HKO", metric="tmax")
    assert len(result.rows) == 1
    assert result.rows[0].value_raw == "28.5"
    reasons = [issue.reason for issue in result.issues]
    assert reasons == ["invalid_date", "invalid_value", "unknown_quality_flag"]


def test_parse_records_year_mismatch_without_dropping_row() -> None:
    """请求年份与实际返回年份不一致时记录问题，但保留数据（官方响应为准）。"""
    result = parse_monthly_payload(
        make_payload([["2025", "9", "1", "30.0", "C"]]),
        station_id="HKO",
        metric="tmax",
        requested_year=2026,
    )
    assert len(result.rows) == 1
    assert result.rows[0].obs_date == date(2025, 9, 1)
    assert result.issues[0].reason == "year_mismatch"


def test_pairing_detects_tmax_below_tmin() -> None:
    """同日同站 tmax < tmin 必须被识别为质量问题。"""
    day = date(2026, 9, 1)
    records = [
        make_record(day, metric="tmax", value_raw="10.0"),
        make_record(day, metric="tmin", value_raw="20.0"),
    ]
    issues = find_pairing_issues(records)
    assert len(issues) == 1
    assert issues[0].station_id == "HKO"
    assert issues[0].obs_date == day
    assert "tmax=10.0" in issues[0].describe()

    equal_records = [
        make_record(day, metric="tmax", value_raw="20.0"),
        make_record(day, metric="tmin", value_raw="20.0"),
    ]
    assert find_pairing_issues(equal_records) == []


# ------------------------------------------------------------------ 入库


async def test_ingest_is_idempotent(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """同样数据跑两次，行数不变（幂等 upsert），且每次都有来源凭据与运行记录。"""
    days = date_range(date(2026, 9, 1), 30)
    payloads = {
        "CLMMAXT": make_payload(make_rows(days, 30.0)),
        "CLMMINT": make_payload(make_rows(days, 25.0)),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        data_type = request.url.params["dataType"]
        return httpx.Response(200, json=payloads[data_type])

    for _ in range(2):
        client = make_client(weather_settings, weather_database, handler)
        try:
            summary = await ingest_year(
                client,
                weather_database,
                weather_settings,
                stations=["HKO"],
                metrics=["tmax", "tmin"],
                year=2026,
            )
        finally:
            await client.aclose()
        assert summary.requests == 2
        assert summary.upserted == 60
        assert summary.errors == []

    assert count_daily(weather_database) == 60
    assert count_model(weather_database, SourceDocument) == 4
    assert count_model(weather_database, IngestionRun) == 2


async def test_ingest_flags_pairing_issue_but_keeps_rows(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """最高温 < 最低温：记质量问题，但两行都必须入库。"""
    payloads = {
        "CLMMAXT": make_payload([["2026", "9", "1", "10.0", "C"]]),
        "CLMMINT": make_payload([["2026", "9", "1", "20.0", "C"]]),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payloads[request.url.params["dataType"]])

    client = make_client(weather_settings, weather_database, handler)
    try:
        summary = await ingest_year(
            client,
            weather_database,
            weather_settings,
            stations=["HKO"],
            metrics=["tmax", "tmin"],
            year=2026,
        )
    finally:
        await client.aclose()

    assert count_daily(weather_database) == 2
    assert len(summary.quality_issues) == 1
    assert "tmax=10.0" in summary.quality_issues[0]


async def test_ingest_recognizes_not_published_instead_of_error(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """``data: []`` 识别为未发布：不写行、不报错，且记录在 not_published 中。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=make_payload([]))

    client = make_client(weather_settings, weather_database, handler)
    try:
        summary = await ingest_year(
            client,
            weather_database,
            weather_settings,
            stations=["HKO"],
            metrics=["tmax"],
            year=2026,
        )
    finally:
        await client.aclose()

    assert summary.errors == []
    assert summary.upserted == 0
    assert count_daily(weather_database) == 0
    assert summary.not_published == ["HKO/CLMMAXT"]


# ------------------------------------------------------------------ 窗口


def test_window_anchor_uses_last_available_date(weather_database: Database) -> None:
    """窗口锚点 = 官方最后可用日；默认窗口为锚点前 30 天（含锚点）。"""
    days = date_range(date(2026, 9, 1), 30)
    seed_rows(weather_database, [make_record(day) for day in days])

    anchor = default_window_anchor(weather_database)
    assert anchor == date(2026, 9, 30)

    window = resolve_window(start=None, end=None, anchor=anchor)
    assert window.start == date(2026, 9, 1)
    assert window.end == date(2026, 9, 30)
    assert window.anchor == date(2026, 9, 30)
    assert window.requested_days == 30


def test_window_rejects_invalid_parameters() -> None:
    """窗口参数非法时必须报错（起止缺失、起晚于止、区间过大）。"""
    with pytest.raises(WindowParameterError):
        resolve_window(start=date(2026, 9, 1), end=None, anchor=None)
    with pytest.raises(WindowParameterError):
        resolve_window(start=date(2026, 9, 10), end=date(2026, 9, 1), anchor=None)
    with pytest.raises(WindowParameterError):
        resolve_window(start=date(2020, 1, 1), end=date(2026, 1, 1), anchor=None)
    with pytest.raises(WindowParameterError):
        parse_window_dates("2026-13-01", None)


# ------------------------------------------------------------------ 覆盖率与区间


def test_coverage_counts_missing_and_incomplete(weather_database: Database) -> None:
    """覆盖率：缺失日期与不完整日期都要如实统计，不能补 0。"""
    all_days = date_range(date(2026, 9, 1), 30)
    missing = {date(2026, 9, 10), date(2026, 9, 20)}
    records = [
        make_record(day, quality_flag="#" if day == date(2026, 9, 5) else "C")
        for day in all_days
        if day not in missing
    ]
    seed_rows(weather_database, records)

    coverage = compute_coverage(
        records,
        start=date(2026, 9, 1),
        end=date(2026, 9, 30),
        stations=["HKO"],
        metrics=["tmax"],
    )
    assert coverage.days_with_data == 28
    assert coverage.days_missing == 2
    assert coverage.last_available_date == date(2026, 9, 30)
    assert len(coverage.per_station) == 1
    station = coverage.per_station[0]
    assert station.days_with_data == 28
    assert station.first_date == date(2026, 9, 1)
    assert station.last_date == date(2026, 9, 30)
    assert station.missing_dates == [date(2026, 9, 10), date(2026, 9, 20)]
    assert station.incomplete_dates == [date(2026, 9, 5)]


def test_coverage_empty_selection_reports_full_gap() -> None:
    """没有数据时：有效 0 天、缺口 30 天、最后可用日为空。"""
    coverage = compute_coverage(
        [],
        start=date(2026, 9, 1),
        end=date(2026, 9, 30),
        stations=["HKO"],
        metrics=["tmax"],
    )
    assert coverage.days_with_data == 0
    assert coverage.days_missing == 30
    assert coverage.last_available_date is None
    assert coverage.per_station[0].days_with_data == 0


def test_summarize_temperature_bins_cover_all_values() -> None:
    """区间统计：所有有效值都落入某个区间，天数之和等于有效样本量。"""
    days = date_range(date(2026, 9, 1), 30)
    records = [
        make_record(day, value_raw=f"{27.0 + index * 0.2:.1f}") for index, day in enumerate(days)
    ]
    summary = summarize_temperature(records, bin_count=4, requested_days=30)
    assert summary.valid_days == 30
    assert summary.missing_days == 0
    assert len(summary.bins) == 4
    assert sum(item.days for item in summary.bins) == 30
    assert summary.bins[0].lower == pytest.approx(27.0)
    assert summary.bins[-1].upper == pytest.approx(float(records[-1].value_raw))


def test_summarize_temperature_handles_edge_cases() -> None:
    """全相同值只生成一个区间；无数据时返回空区间且缺失天数 = 请求天数。"""
    day = date(2026, 9, 1)
    same = [
        make_record(day, value_raw="30.0"),
        make_record(day + timedelta(days=1), value_raw="30.0"),
    ]
    summary = summarize_temperature(same, bin_count=4, requested_days=30)
    assert len(summary.bins) == 1
    assert summary.bins[0].days == 2
    assert summary.missing_days == 28

    empty = summarize_temperature([], bin_count=4, requested_days=30)
    assert empty.bins == []
    assert empty.valid_days == 0
    assert empty.missing_days == 30
