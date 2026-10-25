"""按测站锚定默认 30 天窗口的回归测试（任务 21 修复 A）。

场景（DB 造数）：
- HKO 有 2026-09-01..10-24，KP 只有 2026-09-01..09-30；
- 请求 KP 默认窗口应锚定 09-30（09-01..09-30，30/30），不得被 HKO 的 10 月数据带到 10 月；
- 请求 HKO 应为 09-25..10-24；
- 联合 HKO+KP 应取共同锚点 09-30（两站都不缺尾部）；
- 显式 start/end 行为不变；空库返回空 + reason；summary/weather-trace/export 跟随各自测站。
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from backend.app.core.settings import Settings
from backend.app.main import create_app
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.services.hko_ingest import ParsedDailyRow, PendingRow, upsert_daily_rows

SEP_DAYS = [date(2026, 9, 1) + timedelta(days=offset) for offset in range(30)]
OCT_DAYS = [date(2026, 10, 1) + timedelta(days=offset) for offset in range(24)]


def _seed(
    database: Database,
    station_id: str,
    days: list[date],
    *,
    metrics: tuple[str, ...] = ("tmax", "tmin"),
    value_raw: str = "30.0",
) -> None:
    pending = [
        PendingRow(
            row=ParsedDailyRow(
                station_id=station_id,
                metric=metric,
                obs_date=day,
                value_raw=value_raw,
                value=float(value_raw),
                unit="°C",
                quality_flag="C",
            ),
            source_document_id=None,
            fetched_at=utc_now_naive(),
        )
        for day in days
        for metric in metrics
    ]
    upsert_daily_rows(database, pending, mode="official")


def _make_client(settings: Settings, database: Database) -> TestClient:
    app = create_app(settings, database=database)
    return TestClient(app)


def _get_json(client: TestClient, url: str) -> dict[str, Any]:
    response = client.get(url)
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def _seed_scenario(database: Database) -> None:
    """HKO 有 9 月 + 10 月；KP 只有 9 月。"""
    _seed(database, "HKO", SEP_DAYS + OCT_DAYS)
    _seed(database, "KP", SEP_DAYS)


def test_kp_default_window_uses_own_anchor(
    weather_settings: Settings, weather_database: Database
) -> None:
    """KP 只有 9 月数据：默认窗口必须是 09-01..09-30，而不是 10 月。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=KP&metrics=tmax")

    window = body["window"]
    assert window["start"] == "2026-09-01"
    assert window["end"] == "2026-09-30"
    assert window["anchor"] == "2026-09-30"
    assert window["requested_days"] == 30
    assert body["coverage"]["days_with_data"] == 30
    assert body["coverage"]["days_missing"] == 0
    assert body["coverage"]["last_available_date"] == "2026-09-30"
    assert len(body["data"]) == 30


def test_hko_default_window_uses_own_latest(
    weather_settings: Settings, weather_database: Database
) -> None:
    """HKO 有 10-24：默认窗口锚定 10-24，往前 30 天。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=HKO&metrics=tmax")

    window = body["window"]
    assert window["start"] == "2026-09-25"
    assert window["end"] == "2026-10-24"
    assert window["anchor"] == "2026-10-24"
    assert body["coverage"]["days_with_data"] == 30
    assert body["coverage"]["last_available_date"] == "2026-10-24"


def test_multi_station_uses_common_anchor(
    weather_settings: Settings, weather_database: Database
) -> None:
    """联合 HKO+KP：锚点取两站 max 的 min = 09-30，两站均无尾部缺口。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=HKO,KP&metrics=tmax")

    window = body["window"]
    assert window["start"] == "2026-09-01"
    assert window["end"] == "2026-09-30"
    assert window["anchor"] == "2026-09-30"
    coverage = body["coverage"]
    assert coverage["last_available_date"] == "2026-09-30"
    assert coverage["days_with_data"] == 30
    for station in coverage["per_station"]:
        assert station["days_with_data"] == 30
        assert station["missing_dates"] == []


def test_coverage_endpoint_anchor_matches_last_available(
    weather_settings: Settings, weather_database: Database
) -> None:
    """coverage 接口的 window.anchor 必须与 coverage.last_available_date 一致。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/coverage?stations=HKO,KP&metrics=tmax,tmin")
    assert body["window"]["anchor"] == body["coverage"]["last_available_date"]
    assert body["window"]["anchor"] == "2026-09-30"


def test_empty_database_returns_empty_with_reason(
    weather_settings: Settings, weather_database: Database
) -> None:
    """空库：返回空数据 + reason，不崩溃。"""
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=HKO&metrics=tmax")
    assert body["data"] == []
    assert body["reason"] == "no_cache"
    assert body["coverage"]["days_with_data"] == 0
    assert body["coverage"]["last_available_date"] is None


def test_station_without_data_is_ignored_in_anchor(
    weather_settings: Settings, weather_database: Database
) -> None:
    """只计有数据的测站：HKO 有数据、SHA 空 → 锚点取 HKO 的最大日期。"""
    _seed(weather_database, "HKO", [date(2026, 9, 30)])
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=HKO,SHA&metrics=tmax")
    assert body["window"]["anchor"] == "2026-09-30"
    assert body["window"]["end"] == "2026-09-30"


def test_explicit_window_is_unchanged(
    weather_settings: Settings, weather_database: Database
) -> None:
    """显式 start/end：窗口完全按传入值，不受测站锚点影响。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(
        client,
        "/api/weather/daily?stations=KP&metrics=tmax&start=2026-09-10&end=2026-09-20",
    )
    window = body["window"]
    assert window["start"] == "2026-09-10"
    assert window["end"] == "2026-09-20"
    assert window["requested_days"] == 11
    assert len(body["data"]) == 11


def test_summary_anchor_follows_its_station(
    weather_settings: Settings, weather_database: Database
) -> None:
    """summary 是单站接口：默认窗口锚定该站自己的最新日期。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/summary?station=KP&metric=tmax")
    assert body["window"]["anchor"] == "2026-09-30"
    assert body["window"]["end"] == "2026-09-30"


def test_export_csv_uses_station_anchor(
    weather_settings: Settings, weather_database: Database
) -> None:
    """export.csv 与 daily 共用窗口逻辑：KP 默认窗口只导出 9 月 30 天。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    response = client.get("/api/weather/export.csv?stations=KP&metrics=tmax")
    assert response.status_code == 200
    lines = [line for line in response.text.splitlines() if line.strip()]
    # 1 行表头 + 30 行数据
    assert len(lines) == 31
    assert "2026-09-01" in response.text
    assert "2026-10-01" not in response.text


def test_weather_trace_default_window_follows_station(
    weather_settings: Settings, weather_database: Database
) -> None:
    """weather-trace 省略 start/end 时，默认窗口跟随其 station（KP→9 月，HKO→10 月）。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)

    kp = client.post(
        "/api/algorithms/bubble/weather-trace",
        json={"station": "KP", "metric": "tmax", "direction": "asc", "options": {}},
    )
    assert kp.status_code == 200, kp.text
    kp_body: dict[str, Any] = kp.json()
    assert kp_body["valid_days"] == 30
    assert kp_body["requested_days"] == 30
    kp_dates = [item["label"] for item in kp_body["items"]]
    assert min(kp_dates) == "2026-09-01"
    assert max(kp_dates) == "2026-09-30"

    hko = client.post(
        "/api/algorithms/bubble/weather-trace",
        json={"station": "HKO", "metric": "tmax", "direction": "asc", "options": {}},
    )
    assert hko.status_code == 200, hko.text
    hko_dates = [item["label"] for item in hko.json()["items"]]
    assert min(hko_dates) == "2026-09-25"
    assert max(hko_dates) == "2026-10-24"


def test_weather_trace_rejects_partial_window(
    weather_settings: Settings, weather_database: Database
) -> None:
    """只传 start 或只传 end：422（必须同时提供或都省略）。"""
    _seed_scenario(weather_database)
    client = _make_client(weather_settings, weather_database)
    response = client.post(
        "/api/algorithms/bubble/weather-trace",
        json={
            "station": "KP",
            "metric": "tmax",
            "start": "2026-09-01",
            "direction": "asc",
            "options": {},
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list) and detail


def test_window_anchor_ignores_rainfall_rows(
    weather_settings: Settings, weather_database: Database
) -> None:
    """RYES rainfall 行不得参与锚点：HKO 只有 9 月温度 + 10-22 雨量时锚点仍是 09-30。"""
    _seed(weather_database, "HKO", SEP_DAYS)
    _seed(
        weather_database,
        "HKO",
        [date(2026, 10, 22)],
        metrics=("rainfall",),
        value_raw="0.0",
    )
    client = _make_client(weather_settings, weather_database)
    body = _get_json(client, "/api/weather/daily?stations=HKO&metrics=tmax")
    assert body["window"]["anchor"] == "2026-09-30"
    assert body["window"]["end"] == "2026-09-30"


@pytest.mark.parametrize("station_id", ["HKO", "KP"])
def test_single_station_anchor_direct_query(
    weather_settings: Settings,
    weather_database: Database,
    station_id: str,
) -> None:
    """直接调用 SQL 聚合锚点：单站锚点等于该站 max(obs_date)。"""
    from backend.app.services.hko_ingest import stations_window_anchor

    _seed_scenario(weather_database)
    anchor = stations_window_anchor(
        weather_database,
        stations=[station_id],
        metrics=["tmax", "tmin"],
    )
    expected = date(2026, 10, 24) if station_id == "HKO" else date(2026, 9, 30)
    assert anchor == expected
