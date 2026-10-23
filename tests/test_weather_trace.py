"""阶段 4 天气轨迹测试：真实天气数据 → 复用冒泡算法 → 天气化双语解释。

全部离线：使用内存 SQLite（conftest 的 ``weather_database``），不访问网络。
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import delete

from backend.app.core.settings import Settings
from backend.app.main import create_app
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather
from backend.app.schemas.weather_trace import WeatherTraceResponse
from backend.app.services.hko_ingest import ParsedDailyRow, PendingRow, upsert_daily_rows
from backend.app.services.trace_service import TraceValidationError
from backend.app.services.weather_trace_service import build_weather_trace
from backend.app.trace.line_map import BUBBLE_LINE_MAP

BASE_DAY = date(2026, 9, 1)
WEATHER_TRACE_ENDPOINT = "/api/algorithms/bubble/weather-trace"


def _raw(value: float) -> str:
    """把温度格式化成官方风格的一位小数字符串。"""
    return f"{value:.1f}"


def _seed(
    database: Database,
    *,
    metric: str = "tmax",
    values: Sequence[float],
    station: str = "HKO",
    start: date = BASE_DAY,
    quality_flag: str = "C",
) -> None:
    """按天写入指定指标的温度序列。"""
    fetched_at = utc_now_naive()
    records = [
        ParsedDailyRow(
            station_id=station,
            metric=metric,
            obs_date=start + timedelta(days=index),
            value_raw=_raw(value),
            value=float(value),
            unit="°C",
            quality_flag=quality_flag,
        )
        for index, value in enumerate(values)
    ]
    pending = [
        PendingRow(row=record, source_document_id=None, fetched_at=fetched_at)
        for record in records
    ]
    upsert_daily_rows(database, pending, mode="official")


def _reset(database: Database) -> None:
    with database.session() as session:
        session.execute(delete(DailyWeather))


def _build(
    database: Database,
    settings: Settings,
    *,
    metric: str = "tmax",
    start: date = BASE_DAY,
    end: date | None = None,
    direction: str = "asc",
    early_exit: bool = True,
) -> WeatherTraceResponse:
    trace = build_weather_trace(
        database,
        settings,
        station="HKO",
        metric=metric,
        start=start,
        end=end if end is not None else start,
        direction=direction,
        early_exit=early_exit,
    )
    assert isinstance(trace, WeatherTraceResponse)
    return trace


@pytest.fixture()
def api_client(weather_settings: Settings, weather_database: Database) -> Iterator[TestClient]:
    """把测试应用绑定到同一个内存数据库，避免污染真实 app.db。"""
    app: FastAPI = create_app(weather_settings, database=weather_database)
    client = TestClient(app)
    try:
        yield client
    finally:
        client.close()


# ------------------------------------------------------------------ 正常路径


def test_builds_trace_with_real_dates_and_values(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """items/before_order/after_order/top 榜单与真实日期、温度一致。"""
    values = [30.2, 29.6, 31.1, 28.8, 32.0]
    _seed(weather_database, values=values)
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=4),
    )

    assert trace.metric == "tmax"
    assert trace.valid_days == 5
    assert trace.requested_days == 5
    assert trace.excluded_dates == []
    assert [item.label for item in trace.items] == [
        (BASE_DAY + timedelta(days=index)).isoformat() for index in range(5)
    ]
    assert [item.value_raw for item in trace.items] == ["30.2", "29.6", "31.1", "28.8", "32.0"]
    assert all(item.id == f"it-{item.label}" for item in trace.items)
    assert all(item.station == "HKO" for item in trace.items)
    assert all(item.station_name_zh_hant == "香港天文台" for item in trace.items)
    assert all(item.station_name_en == "Hong Kong Observatory" for item in trace.items)
    assert all(item.source.dataset == "CLMMAXT" for item in trace.items)
    assert all(item.source.mode == "official" for item in trace.items)

    assert trace.before_order == [item.id for item in trace.items]
    assert trace.after_order == [
        f"it-{(BASE_DAY + timedelta(days=offset)).isoformat()}"
        for offset in (3, 1, 0, 2, 4)
    ]
    assert trace.summary.final_values == [28.8, 29.6, 30.2, 31.1, 32.0]
    assert trace.summary.comparisons == sum(
        1 for event in trace.events if event.event_type == "compare"
    )
    assert trace.summary.swaps == sum(1 for event in trace.events if event.event_type == "swap")
    assert trace.single_scan.comparisons == trace.valid_days - 1
    assert trace.single_scan.swaps == 0

    assert [item.date for item in trace.top_hot] == [
        BASE_DAY + timedelta(days=offset) for offset in (4, 2, 0, 1, 3)
    ]
    assert [item.value_raw for item in trace.top_hot] == ["32.0", "31.1", "30.2", "29.6", "28.8"]
    assert [item.date for item in trace.top_cold] == [
        BASE_DAY + timedelta(days=offset) for offset in (3, 1, 0, 2, 4)
    ]

    # 事件仍复用阶段 2 的代码行映射
    expected_groups = {
        mapping.event_type: (f"L{mapping.emit_lineno}", f"L{mapping.target_lineno}")
        for mapping in BUBBLE_LINE_MAP.mappings
    }
    for event in trace.events:
        assert event.code_line_ids == list(expected_groups[event.event_type])


def test_explanations_use_real_dates_and_temperatures(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """双语解释必须内插真实日期与温度（分别断言中文与英文，不能写死）。"""
    values = [30.2, 29.6, 31.1]
    _seed(weather_database, values=values)
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=2),
    )
    first_compare = next(event for event in trace.events if event.event_type == "compare")
    explanation = first_compare.explanation
    assert explanation.key == "weather.compare.asc.swap"
    assert "9 月 1 日" in explanation.zh_hant
    assert "30.2°C" in explanation.zh_hant
    assert "9 月 2 日" in explanation.zh_hant
    assert "29.6°C" in explanation.zh_hant
    assert "升序" in explanation.zh_hant
    assert "Sep 1" in explanation.en
    assert "30.2°C" in explanation.en
    assert "Sep 2" in explanation.en
    assert "ascending" in explanation.en

    # 每个事件都有非空双语解释
    for event in trace.events:
        assert event.explanation.key
        assert event.explanation.zh_hant
        assert event.explanation.en


def test_stable_order_for_equal_temperatures(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """等温不交换：重复温度日期在排序后保持原有先后顺序。"""
    # 9-01=30.0，9-02=31.0，9-03=30.0，9-04=29.0
    _seed(weather_database, values=[30.0, 31.0, 30.0, 29.0])
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=3),
    )
    expected = [
        f"it-{(BASE_DAY + timedelta(days=offset)).isoformat()}" for offset in (3, 0, 2, 1)
    ]
    assert trace.after_order == expected
    # 每次交换都发生在不同温度之间（等温绝不交换）
    value_by_id = {item.id: item.value for item in trace.items}
    for event in trace.events:
        if event.event_type != "swap":
            continue
        before_state = trace.states[event.state_before_id]
        left, right = event.active_indices
        assert value_by_id[before_state.order[left]] != value_by_id[before_state.order[right]]


def test_missing_dates_are_excluded_and_listed(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """缺失日期不进入排序，只出现在 excluded_dates；有效天数按实际统计。"""
    # 窗口 9-01..9-07，只有 01/02/03/05/07 有数据
    _seed(weather_database, values=[30.0], start=date(2026, 9, 1))
    _seed(weather_database, values=[29.0], start=date(2026, 9, 2))
    _seed(weather_database, values=[31.0], start=date(2026, 9, 3))
    _seed(weather_database, values=[28.0], start=date(2026, 9, 5))
    _seed(weather_database, values=[27.0], start=date(2026, 9, 7))
    trace = _build(
        weather_database,
        weather_settings,
        end=date(2026, 9, 7),
    )
    assert trace.valid_days == 5
    assert trace.requested_days == 7
    assert [(item.date, item.reason) for item in trace.excluded_dates] == [
        (date(2026, 9, 4), "missing"),
        (date(2026, 9, 6), "missing"),
    ]
    assert len(trace.items) == 5


def test_tmax_and_tmin_do_not_mix(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """tmax 与 tmin 各自独立：值、有效天数、来源数据集都不串。"""
    _seed(weather_database, metric="tmax", values=[30.0, 31.0, 32.0])
    _seed(weather_database, metric="tmin", values=[25.0, 24.0, 26.0])
    max_trace = _build(
        weather_database,
        weather_settings,
        metric="tmax",
        end=BASE_DAY + timedelta(days=2),
    )
    min_trace = _build(
        weather_database,
        weather_settings,
        metric="tmin",
        end=BASE_DAY + timedelta(days=2),
    )
    assert [item.value for item in max_trace.items] == [30.0, 31.0, 32.0]
    assert [item.value for item in min_trace.items] == [25.0, 24.0, 26.0]
    assert {item.source.dataset for item in max_trace.items} == {"CLMMAXT"}
    assert {item.source.dataset for item in min_trace.items} == {"CLMMINT"}
    assert max_trace.metric == "tmax"
    assert min_trace.metric == "tmin"
    assert max_trace.after_order != min_trace.after_order


def test_negative_temperatures(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """负温按真实数值排序，解释里出现真实负值。"""
    _seed(weather_database, values=[-2.5, 1.0, -0.5, 3.2])
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=3),
    )
    assert trace.summary.final_values == [-2.5, -0.5, 1.0, 3.2]
    joined = " ".join(event.explanation.zh_hant for event in trace.events)
    assert "-2.5°C" in joined


def test_all_equal_temperatures_keep_dates_and_zero_swaps(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """全部温度相同：不交换、日期顺序不变、提前结束。"""
    _seed(weather_database, values=[30.0, 30.0, 30.0, 30.0])
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=3),
    )
    assert trace.after_order == trace.before_order
    assert trace.summary.swaps == 0
    assert trace.summary.writes == 0
    assert trace.summary.early_exit_triggered is True
    assert trace.events[-1].explanation.key == "weather.done.early_exit"
    assert any(
        event.explanation.key == "weather.compare.eq.keep" for event in trace.events
    )


def test_direction_desc(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """降序：最终值倒序，解释用"降序/descending"。"""
    _seed(weather_database, values=[30.0, 28.0, 32.0])
    trace = _build(
        weather_database,
        weather_settings,
        direction="desc",
        end=BASE_DAY + timedelta(days=2),
    )
    assert trace.summary.final_values == [32.0, 30.0, 28.0]
    first_compare = next(event for event in trace.events if event.event_type == "compare")
    assert "降序" in first_compare.explanation.zh_hant
    assert "descending" in first_compare.explanation.en


def test_two_calls_are_byte_identical(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """同输入同参数 ⇒ 逐字节相同的响应（无随机、无时间戳进入轨迹）。"""
    _seed(weather_database, values=[30.2, 29.6, 31.1, 28.8])
    first = build_weather_trace(
        weather_database,
        weather_settings,
        station="HKO",
        metric="tmax",
        start=BASE_DAY,
        end=BASE_DAY + timedelta(days=3),
        direction="asc",
        early_exit=True,
    )
    second = build_weather_trace(
        weather_database,
        weather_settings,
        station="HKO",
        metric="tmax",
        start=BASE_DAY,
        end=BASE_DAY + timedelta(days=3),
        direction="asc",
        early_exit=True,
    )
    assert first.model_dump_json() == second.model_dump_json()


# ------------------------------------------------------------------ 校验


def test_rejects_too_few_valid_days(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """有效天数 < 2 → TraceValidationError（API 层转 422）。"""
    _seed(weather_database, values=[30.0])
    with pytest.raises(TraceValidationError) as exc_info:
        _build(weather_database, weather_settings, end=date(2026, 9, 5))
    assert "有效天數只有 1 天" in exc_info.value.message
    assert exc_info.value.field == "date_range"


def test_rejects_invalid_parameters(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """未知站号 / 非法指标 / 起晚于止 / 非法方向都必须报错。"""
    _seed(weather_database, values=[30.0, 31.0])
    with pytest.raises(TraceValidationError):
        build_weather_trace(
            weather_database,
            weather_settings,
            station="ZZZ",
            metric="tmax",
            start=BASE_DAY,
            end=BASE_DAY + timedelta(days=1),
            direction="asc",
            early_exit=True,
        )
    with pytest.raises(TraceValidationError):
        build_weather_trace(
            weather_database,
            weather_settings,
            station="HKO",
            metric="rainfall",
            start=BASE_DAY,
            end=BASE_DAY + timedelta(days=1),
            direction="asc",
            early_exit=True,
        )
    with pytest.raises(TraceValidationError):
        _build(
            weather_database,
            weather_settings,
            start=BASE_DAY + timedelta(days=1),
            end=BASE_DAY,
        )
    with pytest.raises(TraceValidationError):
        _build(weather_database, weather_settings, direction="up")


# ------------------------------------------------------------------ 属性测试


@given(
    values=st.lists(
        st.floats(min_value=-15, max_value=45, allow_nan=False, allow_infinity=False),
        min_size=2,
        max_size=12,
    )
)
@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_property_trace_matches_real_sort(
    values: list[float],
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """任意一位小数温度序列：轨迹结果必须等于真实排序结果且各项自洽。"""
    rounded = [round(value, 1) for value in values]
    _reset(weather_database)
    _seed(weather_database, values=rounded)
    trace = _build(
        weather_database,
        weather_settings,
        end=BASE_DAY + timedelta(days=len(rounded) - 1),
    )
    expected = sorted(rounded)
    assert trace.valid_days == len(rounded)
    assert trace.summary.final_values == expected
    value_by_id = {item.id: item.value for item in trace.items}
    assert [value_by_id[item_id] for item_id in trace.after_order] == expected
    assert trace.before_order == [item.id for item in trace.items]
    assert len(trace.states) == trace.summary.state_count
    assert len(trace.events) == trace.summary.event_count
    assert trace.single_scan.comparisons == len(rounded) - 1
    # 等温稳定性：after_order 中同温日期的相对先后 == before_order 中的先后
    before_positions = {item_id: index for index, item_id in enumerate(trace.before_order)}
    for left in range(len(trace.after_order)):
        for right in range(left + 1, len(trace.after_order)):
            left_id = trace.after_order[left]
            right_id = trace.after_order[right]
            if value_by_id[left_id] == value_by_id[right_id]:
                assert before_positions[left_id] < before_positions[right_id]


# ------------------------------------------------------------------ API


def _payload(
    *,
    station: str = "HKO",
    metric: str = "tmax",
    start: date = BASE_DAY,
    end: date | None = None,
    direction: str = "asc",
) -> dict[str, object]:
    return {
        "station": station,
        "metric": metric,
        "start": start.isoformat(),
        "end": (end if end is not None else BASE_DAY + timedelta(days=3)).isoformat(),
        "direction": direction,
        "options": {"early_exit": True},
    }


def test_api_returns_weather_trace(
    api_client: TestClient,
    weather_database: Database,
) -> None:
    """200：响应含天气扩展字段且解释来自真实数据。"""
    _seed(weather_database, values=[30.2, 29.6, 31.1, 28.8])
    response = api_client.post(WEATHER_TRACE_ENDPOINT, json=_payload())
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["protocol_version"] == 1
    assert body["algorithm"] == "bubble"
    assert body["metric"] == "tmax"
    assert body["valid_days"] == 4
    assert body["requested_days"] == 4
    assert body["excluded_dates"] == []
    assert body["before_order"] == [item["id"] for item in body["items"]]
    assert body["single_scan"] == {"comparisons": 3, "swaps": 0}
    assert [item["value_raw"] for item in body["items"]] == ["30.2", "29.6", "31.1", "28.8"]
    assert body["items"][0]["station_name_zh_hant"] == "香港天文台"
    assert body["top_hot"][0]["value_raw"] == "31.1"
    assert body["top_cold"][0]["value_raw"] == "28.8"
    first_compare = next(event for event in body["events"] if event["event_type"] == "compare")
    assert "30.2°C" in first_compare["explanation"]["zh-Hant"]
    assert "Sep 1" in first_compare["explanation"]["en"]
    assert body["summary"]["final_values"] == [28.8, 29.6, 30.2, 31.1]


def test_api_422_cases(
    api_client: TestClient,
    weather_database: Database,
) -> None:
    """422：未知站、非法 metric、start>end、有效天 <2、非法 direction。"""
    _seed(weather_database, values=[30.0])
    assert api_client.post(WEATHER_TRACE_ENDPOINT, json=_payload(station="ZZZ")).status_code == 422
    assert (
        api_client.post(WEATHER_TRACE_ENDPOINT, json=_payload(metric="rainfall")).status_code
        == 422
    )
    assert (
        api_client.post(
            WEATHER_TRACE_ENDPOINT,
            json=_payload(start=date(2026, 9, 5), end=date(2026, 9, 1)),
        ).status_code
        == 422
    )
    # 只有 1 天有效数据
    assert api_client.post(WEATHER_TRACE_ENDPOINT, json=_payload()).status_code == 422
    invalid_direction = _payload()
    invalid_direction["direction"] = "up"
    assert api_client.post(WEATHER_TRACE_ENDPOINT, json=invalid_direction).status_code == 422
