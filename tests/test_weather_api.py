"""天气 API 测试：信封字段、模式、覆盖率、区间统计、导入导出、刷新约束。

全部离线：数据库是内存 SQLite；刷新接口通过替换 ``app.state.hko_client_factory``
注入 ``httpx.MockTransport``，不会访问真实网络。
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from datetime import date, datetime, timedelta, timezone
from typing import Any, cast

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    STATE_CIRCUIT_OPEN_UNTIL,
    HkoClient,
    record_refresh_accepted,
    write_state_value,
)
from backend.app.data_sources.hko.limiter import HostRateLimiter
from backend.app.main import create_app
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather
from backend.app.services.hko_ingest import ParsedDailyRow, PendingRow, upsert_daily_rows

FIELDS: list[str] = [
    "年/Year",
    "月/Month",
    "日/Day",
    "數值/Value",
    "數據完整性/data Completeness",
]


@pytest.fixture()
def api_settings() -> Settings:
    """天气 API 测试配置：内存库、无抖动、无真实等待。"""
    return Settings(
        database_url="sqlite://",
        external_fetch_enabled=True,
        demo_mode_enabled=True,
        fetch_min_interval_seconds=0.0,
        fetch_jitter_seconds=0.0,
        fetch_max_retries=1,
        fetch_retry_backoff_seconds=0.0,
        fetch_daily_budget=10,
        fetch_cooldown_seconds=300,
        circuit_breaker_minutes=30.0,
    )


@pytest.fixture()
def api_app(api_settings: Settings) -> FastAPI:
    return create_app(api_settings)


@pytest.fixture()
def api_database(api_app: FastAPI) -> Database:
    database = cast(Database, api_app.state.database)
    database.prepare()
    return database


@pytest.fixture()
def api_client(api_app: FastAPI) -> Iterator[TestClient]:
    client = TestClient(api_app)
    try:
        yield client
    finally:
        client.close()


# ------------------------------------------------------------------ 辅助函数


def date_range(start: date, days: int) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


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


def seed_records(
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


def seed_month(
    database: Database,
    *,
    missing: Sequence[date] = (),
    incomplete: Sequence[date] = (),
) -> None:
    """写入 2026-09 的 30 天数据：HKO tmax/tmin + KP tmax。"""
    missing_set = set(missing)
    incomplete_set = set(incomplete)
    days = [day for day in date_range(date(2026, 9, 1), 30) if day not in missing_set]
    records: list[ParsedDailyRow] = []
    for index, day in enumerate(days):
        flag = "#" if day in incomplete_set else "C"
        records.append(
            make_record(
                day,
                metric="tmax",
                value_raw=f"{30.0 + index * 0.1:.1f}",
                quality_flag=flag,
            )
        )
        records.append(make_record(day, metric="tmin", value_raw=f"{25.0 + index * 0.1:.1f}"))
        records.append(
            make_record(
                day,
                metric="tmax",
                station_id="KP",
                value_raw=f"{29.0 + index * 0.1:.1f}",
            )
        )
    seed_records(database, records)


def count_daily(database: Database, *, mode: str | None = None) -> int:
    statement = select(func.count()).select_from(DailyWeather)
    if mode is not None:
        statement = statement.where(DailyWeather.mode == mode)
    with database.session() as session:
        value = session.execute(statement).scalar()
    return int(value) if isinstance(value, int) else 0


def get_json(client: TestClient, path: str) -> dict[str, Any]:
    response = client.get(path)
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def make_empty_payload() -> dict[str, object]:
    return {"type": ["t", "t"], "fields": FIELDS, "data": [], "legend": []}


def make_payload(data: list[list[str]]) -> dict[str, object]:
    return {
        "type": ["日最高氣溫(攝氏度) - 天文台", "Daily Maximum"],
        "fields": FIELDS,
        "data": data,
        "legend": [],
    }


def make_rows(days: Sequence[date], base: float) -> list[list[str]]:
    return [
        [str(day.year), str(day.month), str(day.day), f"{base + index * 0.1:.1f}", "C"]
        for index, day in enumerate(days)
    ]


# ------------------------------------------------------------------ 基础查询


def test_daily_empty_db_returns_official_empty_with_reason(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """空库：mode=official + 空数据 + reason，绝不回退到演示数据。"""
    body = get_json(api_client, "/api/weather/daily")
    assert body["mode"] == "official"
    assert body["notice"] is None
    assert body["data"] == []
    assert body["reason"] == "no_cache"
    assert body["precision_policy"] == "raw_string"
    assert body["coverage"]["days_with_data"] == 0
    assert body["coverage"]["days_missing"] == body["window"]["requested_days"]
    assert count_daily(api_database) == 0


def test_daily_preserves_raw_string_precision(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """逐日接口必须返回官方原始字符串（"34.4" 不能变成 34）。"""
    seed_records(
        api_database,
        [
            make_record(date(2026, 9, 1), value_raw="34.4"),
            make_record(date(2026, 9, 2), value_raw="30.0"),
        ],
    )
    body = get_json(api_client, "/api/weather/daily?stations=HKO&metrics=tmax")
    assert body["mode"] == "official"
    assert body["notice"] is None
    assert body["window"]["anchor"] == "2026-09-02"
    assert len(body["data"]) == 2
    first = body["data"][0]
    assert first == {
        "obs_date": "2026-09-01",
        "station_id": "HKO",
        "metric": "tmax",
        "value_raw": "34.4",
        "value": 34.4,
        "unit": "°C",
        "quality_flag": "C",
    }
    assert isinstance(first["value_raw"], str)
    assert body["coverage"]["days_with_data"] == 2


def test_coverage_reports_gap_dates(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """覆盖率必须给出缺口日期与不完整日期，而不是补 0。"""
    missing = [date(2026, 9, 10), date(2026, 9, 20)]
    seed_month(api_database, missing=missing, incomplete=[date(2026, 9, 5)])
    body = get_json(
        api_client,
        "/api/weather/coverage?start=2026-09-01&end=2026-09-30&stations=HKO&metrics=tmax",
    )
    assert body["mode"] == "official"
    assert body["reason"] is None
    coverage = body["coverage"]
    assert coverage["days_with_data"] == 28
    assert coverage["days_missing"] == 2
    assert coverage["last_available_date"] == "2026-09-30"
    station = coverage["per_station"][0]
    assert station["station_id"] == "HKO"
    assert station["metric"] == "tmax"
    assert station["days_with_data"] == 28
    assert station["missing_dates"] == ["2026-09-10", "2026-09-20"]
    assert station["incomplete_dates"] == ["2026-09-05"]


def test_stations_lists_official_registry_with_availability(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """39 站字典 + 各站可用天数/起止日/指标。"""
    seed_month(api_database)
    body = get_json(api_client, "/api/weather/stations")
    stations = body["stations"]
    assert len(stations) == 39
    by_id = {station["id"]: station for station in stations}
    hko = by_id["HKO"]
    assert hko["name_en"] == "Hong Kong Observatory"
    assert hko["name_zh_hant"] == "香港天文台"
    assert hko["start_year"] == 1884
    assert hko["available_days"] == 30
    assert hko["first_date"] == "2026-09-01"
    assert hko["last_date"] == "2026-09-30"
    assert hko["metrics"] == ["tmax", "tmin"]
    assert by_id["SHA"]["available_days"] == 0
    assert by_id["SHA"]["metrics"] == []


def test_summary_bins_and_bilingual_threshold_note(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """区间统计：天数之和 = 有效样本量，且注明"非官方标准"。"""
    seed_month(api_database)
    body = get_json(
        api_client, "/api/weather/summary?station=HKO&metric=tmax&bins=4"
    )
    assert body["station_id"] == "HKO"
    assert body["metric"] == "tmax"
    assert body["valid_days"] == 30
    assert body["missing_days"] == 0
    assert len(body["bins"]) == 4
    assert sum(bin_item["days"] for bin_item in body["bins"]) == 30
    assert all("°C" in bin_item["label_zh_hant"] for bin_item in body["bins"])
    note = body["threshold_note"]
    assert set(note) == {"zh-Hant", "en"}
    assert "非官方" in note["zh-Hant"]
    assert "not an official" in note["en"]


# ------------------------------------------------------------------ CSV 导入 / 导出


def test_import_canonical_csv_reports_errors(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """规范 6 列 CSV：好行入库、坏行报错，导入数据用 imported 模式读取。"""
    csv_text = (
        "obs_date,station_id,metric,value_raw,unit,quality_flag\n"
        "2026-09-01,HKO,tmax,34.4,°C,C\n"
        "2026-09-02,ZZZ,tmax,30.0,°C,C\n"
        "2026-09-03,HKO,tmax,abc,°C,C\n"
    )
    response = api_client.post(
        "/api/weather/import",
        files={"file": ("weather.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["detected_format"] == "canonical_csv"
    assert report["mode"] == "imported"
    assert report["accepted_rows"] == 1
    assert {item["reason"] for item in report["errors"]} == {"unknown_station", "invalid_value"}
    assert count_daily(api_database, mode="imported") == 1

    body = get_json(api_client, "/api/weather/daily?mode=imported&stations=HKO&metrics=tmax")
    assert body["mode"] == "imported"
    assert body["notice"] is not None
    assert len(body["data"]) == 1
    assert body["data"][0]["value_raw"] == "34.4"


def test_import_official_csv_format(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """官方 rformat=csv 原始格式：双语标题 + 字段行 + 数据 + legend，BOM 也要处理。"""
    lines = [
        '"日最高氣溫(攝氏度) - 天文台",'
        '"Daily Maximum Temperature (°C) at the Hong Kong Observatory"',
        '"年/Year","月/Month","日/Day","數值/Value","數據完整性/data Completeness"',
        "2026,9,1,34.4,C",
        "2026,9,2,***,***",
        "2026,9,3,33.1,#",
        '"*** 沒有數據/unavailable","# 數據不完整/data incomplete","C 數據完整/data Complete"',
    ]
    csv_text = "\ufeff" + "\n".join(lines) + "\n"
    response = api_client.post(
        "/api/weather/import",
        files={"file": ("official.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["detected_format"] == "official_csv"
    assert report["accepted_rows"] == 2
    assert report["skipped_rows"] == 1
    assert report["errors"] == []

    body = get_json(
        api_client,
        "/api/weather/daily?mode=imported&start=2026-09-01&end=2026-09-03&stations=HKO&metrics=tmax",
    )
    rows = {row["obs_date"]: row for row in body["data"]}
    assert rows["2026-09-01"]["value_raw"] == "34.4"
    assert rows["2026-09-03"]["quality_flag"] == "#"


def test_import_official_csv_unknown_station(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """官方 CSV 标题里的站名无法匹配 39 站时，必须报 unknown_station。"""
    lines = [
        '"日最高氣溫(攝氏度) - 不存在的站","Nope"',
        '"年/Year","月/Month","日/Day","數值/Value","數據完整性/data Completeness"',
        "2026,9,1,34.4,C",
    ]
    csv_text = "\n".join(lines) + "\n"
    response = api_client.post(
        "/api/weather/import",
        files={"file": ("official.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    report = response.json()
    assert report["accepted_rows"] == 0
    assert report["errors"][0]["reason"] == "unknown_station"


def test_export_csv_has_canonical_columns(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """导出 CSV 必须是规范 6 列，行数 = 数据行 + 表头。"""
    seed_records(
        api_database,
        [make_record(date(2026, 9, 1)), make_record(date(2026, 9, 2))],
    )
    response = api_client.get("/api/weather/export.csv?stations=HKO&metrics=tmax")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.strip().splitlines()
    assert lines[0] == "obs_date,station_id,metric,value_raw,unit,quality_flag"
    assert len(lines) == 3


# ------------------------------------------------------------------ 刷新约束


def test_refresh_returns_cooldown_without_network(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """冷却期内刷新：accepted=false + reason=cooldown + next_allowed_at。"""
    record_refresh_accepted(api_database, datetime.now(timezone.utc))
    response = api_client.post("/api/weather/refresh")
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is False
    assert body["reason"] == "cooldown"
    assert body["next_allowed_at"] is not None
    assert body["requests_made"] == 0
    assert body["rows_upserted"] == 0


def test_refresh_returns_circuit_open(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """熔断期间刷新：accepted=false + reason=circuit_open。"""
    write_state_value(
        api_database,
        STATE_CIRCUIT_OPEN_UNTIL,
        (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat(),
    )
    response = api_client.post("/api/weather/refresh")
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is False
    assert body["reason"] == "circuit_open"


def test_refresh_returns_disabled_when_switch_off(api_settings: Settings) -> None:
    """EXTERNAL_FETCH_ENABLED=false：刷新返回 disabled，不抛 500。"""
    disabled_settings = api_settings.model_copy(update={"external_fetch_enabled": False})
    app = create_app(disabled_settings)
    client = TestClient(app)
    try:
        response = client.post("/api/weather/refresh")
    finally:
        client.close()
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is False
    assert body["reason"] == "disabled"


def test_refresh_accepts_with_offline_transport(
    api_app: FastAPI,
    api_client: TestClient,
    api_database: Database,
) -> None:
    """刷新成功路径：用 MockTransport 抓取并入库，之后 /api/sources 反映统计。"""
    settings = cast(Settings, api_app.state.settings)
    days = date_range(date(2026, 9, 1), 30)
    payloads = {
        "CLMMAXT": make_payload(make_rows(days, 30.0)),
        "CLMMINT": make_payload(make_rows(days, 25.0)),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payloads[request.url.params["dataType"]])

    def factory() -> HkoClient:
        limiter = HostRateLimiter(
            min_interval_seconds=0.0,
            jitter_seconds=0.0,
            jitter_source=lambda: 0.0,
        )
        return HkoClient(
            settings,
            api_database,
            limiter=limiter,
            transport=httpx.MockTransport(handler),
        )

    api_app.state.hko_client_factory = factory
    response = api_client.post(
        "/api/weather/refresh",
        json={"stations": ["HKO"], "metrics": ["tmax", "tmin"], "year": 2026},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["accepted"] is True
    assert body["reason"] is None
    assert body["requests_made"] == 2
    assert body["rows_upserted"] == 60
    assert body["remaining_budget"] == settings.fetch_daily_budget - 2
    assert count_daily(api_database) == 60

    sources = get_json(api_client, "/api/sources")
    datasets = {item["dataset"] for item in sources["sources"]}
    assert {"CLMMAXT", "CLMMINT"} <= datasets
    assert sources["request_stats"]["total"] == 2
    assert sources["last_success_at"] is not None

    # 成功刷新后立即再刷一次：进入冷却
    again = api_client.post("/api/weather/refresh").json()
    assert again["accepted"] is False
    assert again["reason"] == "cooldown"


# ------------------------------------------------------------------ 演示模式


def test_demo_mode_reads_snapshot_without_writing(
    api_client: TestClient,
    api_database: Database,
) -> None:
    """演示模式只读 sample_data，mode=demo 且 notice 非空，不写数据库。"""
    body = get_json(
        api_client,
        "/api/weather/daily?mode=demo&start=2026-09-01&end=2026-09-30&stations=HKO&metrics=tmax",
    )
    assert body["mode"] == "demo"
    assert body["notice"]
    assert len(body["data"]) == 30
    assert body["sources"][0]["dataset"] == "DEMO_SNAPSHOT"
    assert count_daily(api_database) == 0


def test_demo_disabled_returns_disabled_reason(api_settings: Settings) -> None:
    """演示模式被关闭时：仍返回 demo 信封 + notice + reason=disabled，不报 500。"""
    settings = api_settings.model_copy(update={"demo_mode_enabled": False})
    app = create_app(settings)
    client = TestClient(app)
    try:
        response = client.get(
            "/api/weather/daily?mode=demo&stations=HKO&metrics=tmax&start=2026-09-01&end=2026-09-30"
        )
    finally:
        client.close()
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"
    assert body["notice"]
    assert body["data"] == []
    assert body["reason"] == "disabled"


# ------------------------------------------------------------------ 参数校验


def test_invalid_selection_and_dates_are_rejected(api_client: TestClient) -> None:
    """未知站号、未知指标、非法日期都返回 422。"""
    assert api_client.get("/api/weather/daily?stations=ZZZ").status_code == 422
    assert api_client.get("/api/weather/daily?metrics=rainfall").status_code == 422
    assert api_client.get("/api/weather/daily?start=2026-13-01").status_code == 422
    assert (
        api_client.get("/api/weather/summary?station=ZZZ&metric=tmax").status_code == 422
    )
