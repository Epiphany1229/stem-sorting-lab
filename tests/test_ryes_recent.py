"""RYES 近期逐日气温：解析、映射、月表优先与幂等测试（全部离线）。"""

from __future__ import annotations

from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import func, select

from backend.app.cli import main
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient
from backend.app.data_sources.hko.ryes_temperature import (
    RYES_TEMPERATURE_PREFIXES,
    RyesTemperatureParseError,
    parse_ryes_temperature_payload,
)
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, SourceDocument
from backend.app.services.recent_ingest import (
    ingest_recent_temperature,
    parse_recent_stations,
)

OPENDATA_URL = "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php"


def _ryes_payload(
    day: date,
    *,
    report_date: date | None = None,
    sha_tin_name: str = "Sha Tin",
    include_sha_tin_temp: bool = True,
) -> dict[str, object]:
    """构造一份与官方 RYES 结构一致的固定样本（多站 + 未映射站）。"""
    report = report_date if report_date is not None else day
    payload: dict[str, object] = {
        "BulletinDate": (day + timedelta(days=1)).strftime("%Y%m%d"),
        "BulletinTime": "0015",
        "ReportTimeInfoDate": report.strftime("%Y%m%d"),
        "HKOReadingsMaxTemp": "31.8",
        "HKOReadingsMinTemp": "26.9",
        "KingsParkLocationName": "King's Park",
        "KingsParkReadingsMaxTemp": "31.4",
        "KingsParkReadingsMinTemp": "25.9",
        "ShaTinLocationName": sha_tin_name,
        "ChekLapKokLocationName": "Chek Lap Kok",
        "ChekLapKokMaxTemp": "32.1",
        "ChekLapKokMinTemp": "26.5",
    }
    if include_sha_tin_temp:
        payload["ShaTinMaxTemp"] = "32.6"
        payload["ShaTinMinTemp"] = "24.4"
    return payload


def test_parse_maps_known_stations_and_preserves_precision() -> None:
    """明确名称的站映射到官方 id；原始字符串精度保持不变。"""
    day = date(2026, 10, 20)
    parsed = parse_ryes_temperature_payload(_ryes_payload(day), requested_date=day)

    assert parsed.skip_reason is None
    rows = {(row.station_id, row.metric): row for row in parsed.rows}
    assert rows[("HKO", "tmax")].value_raw == "31.8"
    assert rows[("HKO", "tmin")].value_raw == "26.9"
    assert rows[("KP", "tmax")].value_raw == "31.4"
    assert rows[("SHA", "tmin")].value_raw == "24.4"
    assert rows[("SHA", "tmax")].obs_date == day
    assert all(row.unit == "°C" and row.quality_flag == "C" for row in parsed.rows)
    # Chek Lap Kok 在官方 39 站里没有同名站：跳过并计数，不猜测。
    assert "ChekLapKokMaxTemp" in parsed.unmapped_keys
    assert all(prefix != "ChekLapKok" for prefix in RYES_TEMPERATURE_PREFIXES)


def test_parse_records_missing_fields_without_writing_zero() -> None:
    """缺失字段只计入 missing_fields，不产生行、不写 0。"""
    day = date(2026, 10, 20)
    parsed = parse_ryes_temperature_payload(
        _ryes_payload(day, include_sha_tin_temp=False), requested_date=day
    )
    assert all(row.station_id != "SHA" for row in parsed.rows)
    assert "ShaTinMaxTemp" in parsed.missing_fields
    assert "ShaTinMinTemp" in parsed.missing_fields


def test_parse_date_mismatch_is_rejected() -> None:
    """ReportTimeInfoDate 与请求日不同：整天跳过，绝不写错日期。"""
    day = date(2026, 10, 20)
    parsed = parse_ryes_temperature_payload(
        _ryes_payload(day, report_date=day + timedelta(days=1)), requested_date=day
    )
    assert parsed.skip_reason == "date_mismatch"
    assert parsed.rows == ()


def test_parse_name_mismatch_skips_station() -> None:
    """LocationName 与官方 name_en 不符的站不得写入。"""
    day = date(2026, 10, 20)
    parsed = parse_ryes_temperature_payload(
        _ryes_payload(day, sha_tin_name="Somewhere Else"), requested_date=day
    )
    assert all(row.station_id != "SHA" for row in parsed.rows)
    assert any(name.startswith("ShaTin:") for name in parsed.name_mismatches)


def test_parse_invalid_temperature_raises() -> None:
    """温度数值无法解析时抛 RyesTemperatureParseError（不静默写错值）。"""
    day = date(2026, 10, 20)
    payload = _ryes_payload(day)
    payload["HKOReadingsMaxTemp"] = "not-a-number"
    with pytest.raises(RyesTemperatureParseError):
        parse_ryes_temperature_payload(payload, requested_date=day)


def _make_client(
    settings: Settings,
    database: Database,
    calls: list[str],
    *,
    report_mismatch: bool = False,
) -> HkoClient:
    """MockTransport 客户端：按 date 参数返回固定 RYES 样本，不联网。"""

    def handler(request: httpx.Request) -> httpx.Response:
        raw = request.url.params.get("date", "")
        calls.append(raw)
        day = date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        payload = _ryes_payload(
            day,
            report_date=day + timedelta(days=1) if report_mismatch else day,
        )
        return httpx.Response(200, json=payload)

    return HkoClient(settings, database, transport=httpx.MockTransport(handler))


def _count_rows(database: Database) -> int:
    with database.session() as session:
        value = session.execute(select(func.count(DailyWeather.id))).scalar()
    return int(value or 0)


def _seed_monthly_row(
    database: Database,
    *,
    station_id: str,
    metric: str,
    day: date,
    value_raw: str,
) -> None:
    """写入一条月表来源的 official 行（用于验证月表优先）。"""
    with database.session() as session:
        document = SourceDocument(
            dataset_key="CLMMAXT",
            endpoint="mock://monthly",
            http_status=200,
            retrieved_at=utc_now_naive(),
            payload_sha256="0" * 64,
        )
        session.add(document)
        session.flush()
        session.add(
            DailyWeather(
                station_id=station_id,
                metric=metric,
                obs_date=day,
                value_raw=value_raw,
                value=float(value_raw),
                unit="°C",
                quality_flag="C",
                source_document_id=document.id,
                fetched_at=utc_now_naive(),
                mode="official",
            )
        )


async def test_ingest_writes_only_requested_stations(
    weather_settings: Settings, weather_database: Database
) -> None:
    """只写请求站点的 tmax/tmin；每请求一天；行可幂等复跑。"""
    settings = weather_settings.model_copy(
        update={"fetch_min_interval_seconds": 0.0, "fetch_jitter_seconds": 0.0}
    )
    calls: list[str] = []
    client = _make_client(settings, weather_database, calls)
    try:
        summary = await ingest_recent_temperature(
            client,
            weather_database,
            settings,
            stations=("HKO", "SHA"),
            end=date(2026, 10, 20),
            days=3,
        )
    finally:
        await client.aclose()

    assert summary.requests == 3
    assert calls == ["20261018", "20261019", "20261020"]
    # 2 站 × 2 指标 × 3 天
    assert summary.rows_written == 12
    assert summary.days_written == 3
    assert _count_rows(weather_database) == 12
    assert summary.errors == []

    # 幂等：同样输入再跑一次，行数不增长。
    client = _make_client(settings, weather_database, [])
    try:
        again = await ingest_recent_temperature(
            client,
            weather_database,
            settings,
            stations=("HKO", "SHA"),
            end=date(2026, 10, 20),
            days=3,
        )
    finally:
        await client.aclose()
    assert again.rows_written == 12
    assert _count_rows(weather_database) == 12


async def test_monthly_table_takes_priority(
    weather_settings: Settings, weather_database: Database
) -> None:
    """已有月表来源的日期不被 RYES 覆盖（月表更权威）；其余日期照常补。"""
    settings = weather_settings.model_copy(
        update={"fetch_min_interval_seconds": 0.0, "fetch_jitter_seconds": 0.0}
    )
    day = date(2026, 10, 20)
    _seed_monthly_row(
        weather_database, station_id="HKO", metric="tmax", day=day, value_raw="99.9"
    )
    client = _make_client(settings, weather_database, [])
    try:
        summary = await ingest_recent_temperature(
            client,
            weather_database,
            settings,
            stations=("HKO", "SHA"),
            end=day,
            days=1,
        )
    finally:
        await client.aclose()

    assert summary.monthly_authoritative_skipped == 1
    # HKO/tmax 保持月表值，不被 RYES 的 31.8 覆盖。
    with weather_database.session() as session:
        row = session.execute(
            select(DailyWeather).where(
                DailyWeather.station_id == "HKO",
                DailyWeather.metric == "tmax",
                DailyWeather.obs_date == day,
            )
        ).scalar_one()
        assert row.value_raw == "99.9"
        assert session.execute(
            select(func.count(DailyWeather.id)).where(DailyWeather.station_id == "SHA")
        ).scalar() == 2


async def test_date_mismatch_day_is_skipped(
    weather_settings: Settings, weather_database: Database
) -> None:
    """ReportTimeInfoDate 不符的日期整天跳过并计数。"""
    settings = weather_settings.model_copy(
        update={"fetch_min_interval_seconds": 0.0, "fetch_jitter_seconds": 0.0}
    )
    client = _make_client(settings, weather_database, [], report_mismatch=True)
    try:
        summary = await ingest_recent_temperature(
            client,
            weather_database,
            settings,
            stations=("HKO",),
            end=date(2026, 10, 20),
            days=2,
        )
    finally:
        await client.aclose()
    assert summary.date_mismatch == 2
    assert summary.rows_written == 0
    assert _count_rows(weather_database) == 0


async def test_unknown_station_is_rejected(
    weather_settings: Settings, weather_database: Database
) -> None:
    """未知站号必须在发出任何请求前拒绝。"""
    settings = weather_settings.model_copy(update={"fetch_min_interval_seconds": 0.0})
    client = _make_client(settings, weather_database, [])
    try:
        with pytest.raises(ValueError):
            await ingest_recent_temperature(
                client,
                weather_database,
                settings,
                stations=("XXX",),
                end=date(2026, 10, 20),
                days=1,
            )
    finally:
        await client.aclose()


def test_parse_recent_stations_validates_registry(weather_settings: Settings) -> None:
    """站号必须来自官方 39 站字典，去重保序。"""
    assert parse_recent_stations("HKO,SHA,HKO", weather_settings) == ("HKO", "SHA")
    with pytest.raises(ValueError):
        parse_recent_stations("HKO,BOGUS", weather_settings)


def test_cli_ingest_recent_dry_run(
    weather_settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    """CLI --dry-run 只打印计划，不联网也不写库。"""
    exit_code = main(
        [
            "ingest-recent",
            "--days",
            "2",
            "--stations",
            "HKO",
            "--end",
            "2026-09-30",
            "--dry-run",
        ]
    )
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "2 次請求" in captured.out
    assert "dataType=RYES" in captured.out
