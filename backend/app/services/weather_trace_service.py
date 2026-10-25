"""阶段 4 天气轨迹服务：把真实逐日气温交给冒泡排序并生成天气化双语解释。

红线（见 ``docs/weather-sort-design.md`` 与 task-10）：

- **不重写排序**：直接调用 ``bubble_sort`` + ``TraceRecorder``，代码行映射沿用
  阶段 2 的 ``BUBBLE_LINE_MAP``；
- 解释由注入 ``TraceRecorder`` 的**解释工厂**按固定模板 + 真实日期/温度生成，
  不联网、不调用大模型；
- 缺失日期（``***`` 或库里没有记录）不进入排序，只列入 ``excluded_dates``；
- 等温不交换（算法使用 ``>``），因此等温日期保持原有先后顺序。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select

from backend.app.algorithms.bubble import bubble_sort
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.registry import StationRecord, find_station
from backend.app.models.base import to_utc_iso
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather
from backend.app.schemas.trace import (
    PROTOCOL_VERSION,
    BubbleTraceOptions,
    CodeBlock,
    CodeLine,
    EventMetrics,
    Explanation,
)
from backend.app.schemas.weather_trace import (
    ExcludedDate,
    SingleScan,
    TopTemperature,
    WeatherArrayState,
    WeatherAuxiliaryState,
    WeatherComparisonInfo,
    WeatherMetric,
    WeatherSourceInfo,
    WeatherTraceEvent,
    WeatherTraceItem,
    WeatherTraceResponse,
    WeatherTraceSummary,
)
from backend.app.services.hko_ingest import MAX_WINDOW_DAYS, METRIC_TO_DATATYPE
from backend.app.services.trace_service import MAX_EVENTS, TraceValidationError
from backend.app.trace.line_map import BUBBLE_LINE_MAP
from backend.app.trace.recorder import (
    Direction,
    ExplanationFactory,
    Item,
    RecordedEvent,
    RecordedState,
    TraceLimitError,
    TraceRecorder,
)

# 榜单默认取前 5 名（设计文档 §3：Top 5 最热/最冷）
TOP_LIMIT = 5
# 英文月份缩写（解释文案用；固定常量保证确定性）
_MONTHS_EN: tuple[str, ...] = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


@dataclass(frozen=True)
class WeatherPoint:
    """一个有效观测日：排序元素 + 展示所需的全部元数据。"""

    item_id: str
    obs_date: date
    value: float
    value_raw: str
    quality_flag: str
    source: WeatherSourceInfo


def _normalise_direction(direction: str) -> Direction:
    """把方向字符串收窄为协议字面量类型。"""
    if direction == "asc":
        return "asc"
    if direction == "desc":
        return "desc"
    raise TraceValidationError("direction", 'direction 只能是 "asc" 或 "desc"')


def _normalise_metric(metric: str) -> WeatherMetric:
    """天气轨迹只支持 tmax / tmin。"""
    if metric == "tmax":
        return "tmax"
    if metric == "tmin":
        return "tmin"
    raise TraceValidationError("metric", 'metric 只能是 "tmax" 或 "tmin"')


def _load_points(
    database: Database,
    *,
    station_id: str,
    metric: WeatherMetric,
    start: date,
    end: date,
) -> list[WeatherPoint]:
    """读取窗口内官方逐日数据，按日期升序返回有效观测点。"""
    dataset_key = METRIC_TO_DATATYPE[metric]
    with database.session() as session:
        statement = (
            select(DailyWeather)
            .where(
                DailyWeather.mode == "official",
                DailyWeather.station_id == station_id,
                DailyWeather.metric == metric,
                DailyWeather.obs_date >= start,
                DailyWeather.obs_date <= end,
            )
            .order_by(DailyWeather.obs_date)
        )
        rows = session.execute(statement).scalars().all()
        points: list[WeatherPoint] = []
        for row in rows:
            # 防御：*** 理论上不入库；若历史库存在，也绝不参与排序
            if row.value_raw == "***" or row.quality_flag == "***":
                continue
            points.append(
                WeatherPoint(
                    item_id=f"it-{row.obs_date.isoformat()}",
                    obs_date=row.obs_date,
                    value=float(row.value),
                    value_raw=row.value_raw,
                    quality_flag=row.quality_flag,
                    source=WeatherSourceInfo(
                        dataset=dataset_key,
                        fetched_at=to_utc_iso(row.fetched_at),
                        mode=row.mode,
                    ),
                )
            )
    return points


def _excluded_dates(start: date, end: date, observed: set[date]) -> list[ExcludedDate]:
    """窗口内没有有效观测的日期：只进 excluded_dates，不参与排序。"""
    requested_days = (end - start).days + 1
    return [
        ExcludedDate(date=day, reason="missing")
        for day in (start + timedelta(days=offset) for offset in range(requested_days))
        if day not in observed
    ]


# ------------------------------------------------------------------ 解释文案


def _zh_date(day: date) -> str:
    """繁体中文日期：9 月 12 日。"""
    return f"{day.month} 月 {day.day} 日"


def _en_date(day: date) -> str:
    """英文日期：Sep 12。"""
    return f"{_MONTHS_EN[day.month - 1]} {day.day}"


def _degree(point: WeatherPoint) -> str:
    """展示温度：保留官方原始字符串并补单位。"""
    return f"{point.value_raw}°C"


def _point_at(
    order: Sequence[str],
    position: int,
    points_by_id: Mapping[str, WeatherPoint],
) -> WeatherPoint:
    """按当前数组顺序取某个位置上的天气点。"""
    return points_by_id[order[position]]


def _order_words(direction: Direction) -> tuple[str, str]:
    """排序方向的双语措辞。"""
    if direction == "asc":
        return "升序", "ascending"
    return "降序", "descending"


def _explain_compare(
    event: RecordedEvent,
    *,
    before: RecordedState,
    points_by_id: Mapping[str, WeatherPoint],
    direction: Direction,
) -> Explanation:
    """compare 事件：用真实日期与温度说明"是否需要交换"。"""
    comparison = event.auxiliary_state.comparison
    if comparison is None:  # pragma: no cover - compare 事件必然带 comparison
        raise RuntimeError("compare 事件缺少 comparison 辅助信息")
    left_position, right_position = event.active_indices
    left_point = _point_at(before.complete_order(), left_position, points_by_id)
    right_point = _point_at(before.complete_order(), right_position, points_by_id)
    order_zh, order_en = _order_words(direction)
    left_zh = f"{_zh_date(left_point.obs_date)}的 {_degree(left_point)}"
    right_zh = f"{_zh_date(right_point.obs_date)}的 {_degree(right_point)}"
    left_en = f"{left_point.value_raw}°C on {_en_date(left_point.obs_date)}"
    right_en = f"{right_point.value_raw}°C on {_en_date(right_point.obs_date)}"
    if comparison.will_swap:
        return Explanation(
            key=f"weather.compare.{direction}.swap",
            zh_hant=f"比較 {left_zh} 與 {right_zh}；{order_zh}排列時需要交換。",
            en=(
                f"Comparing {left_en} with {right_en}; "
                f"swap needed for {order_en} order."
            ),
        )
    if comparison.relation == "eq":
        return Explanation(
            key="weather.compare.eq.keep",
            zh_hant=(
                f"比較 {left_zh} 與 {right_zh}；兩天溫度相同，"
                "保持原來的日期先後，不需要交換。"
            ),
            en=(
                f"Comparing {left_en} with {right_en}; the temperatures are equal, "
                "so the earlier date keeps its position and no swap is needed."
            ),
        )
    return Explanation(
        key=f"weather.compare.{direction}.keep",
        zh_hant=f"比較 {left_zh} 與 {right_zh}；{order_zh}排列時不需要交換。",
        en=(
            f"Comparing {left_en} with {right_en}; "
            f"no swap needed for {order_en} order."
        ),
    )


def _explain_swap(
    event: RecordedEvent,
    *,
    before: RecordedState,
    points_by_id: Mapping[str, WeatherPoint],
    direction: Direction,
) -> Explanation:
    """swap 事件：说明哪两天的位置被交换、哪个温度被往前移。"""
    left_position, right_position = event.active_indices
    left_point = _point_at(before.complete_order(), left_position, points_by_id)
    right_point = _point_at(before.complete_order(), right_position, points_by_id)
    order_zh, order_en = _order_words(direction)
    if direction == "asc":
        moved = right_point if right_point.value < left_point.value else left_point
        moved_zh, moved_en = "較低溫", "cooler"
    else:
        moved = right_point if right_point.value > left_point.value else left_point
        moved_zh, moved_en = "較高溫", "warmer"
    return Explanation(
        key=f"weather.swap.{direction}",
        zh_hant=(
            f"交換 {_zh_date(left_point.obs_date)}（{_degree(left_point)}）與 "
            f"{_zh_date(right_point.obs_date)}（{_degree(right_point)}）的位置；"
            f"{order_zh}排列要把{moved_zh}的 {_zh_date(moved.obs_date)} 往前移。"
        ),
        en=(
            f"Swap {left_point.value_raw}°C on {_en_date(left_point.obs_date)} with "
            f"{right_point.value_raw}°C on {_en_date(right_point.obs_date)}; "
            f"{order_en} order moves the {moved_en} day ({_en_date(moved.obs_date)}) forward."
        ),
    )


def _explain_mark_sorted(
    event: RecordedEvent,
    *,
    before: RecordedState,
    points_by_id: Mapping[str, WeatherPoint],
    direction: Direction,
    total_days: int,
) -> Explanation:
    """mark_sorted 事件：进入新一轮时，说明哪个日期已确定最终位置。"""
    pass_index = event.auxiliary_state.pass_index
    if pass_index == 0:
        return Explanation(
            key="weather.mark_sorted.start",
            zh_hant="開始第 1 輪冒泡：由左至右兩兩比較相鄰日子的氣溫。",
            en="Start pass 1: compare adjacent days from left to right.",
        )
    finalized_position = total_days - pass_index
    finalized = _point_at(before.complete_order(), finalized_position, points_by_id)
    extreme_zh = "最高" if direction == "asc" else "最低"
    extreme_en = "highest" if direction == "asc" else "lowest"
    return Explanation(
        key="weather.mark_sorted.progress",
        zh_hant=(
            f"開始第 {pass_index + 1} 輪冒泡：{_zh_date(finalized.obs_date)}的 "
            f"{_degree(finalized)} 已確定為{extreme_zh}溫，位置固定。"
        ),
        en=(
            f"Start pass {pass_index + 1}: {finalized.value_raw}°C on "
            f"{_en_date(finalized.obs_date)} is confirmed as the {extreme_en} "
            "temperature and is now in its final place."
        ),
    )


def _explain_done(
    event: RecordedEvent,
    *,
    states: Sequence[RecordedState],
    points_by_id: Mapping[str, WeatherPoint],
    direction: Direction,
    total_days: int,
) -> Explanation:
    """done 事件：说明是否提前结束，以及排序后最热/最冷的一天。"""
    passes = event.auxiliary_state.pass_index + 1
    if passes < total_days - 1:
        return Explanation(
            key="weather.done.early_exit",
            zh_hant=(
                f"本輪沒有任何交換，表示這 {total_days} 天的氣溫已排好序，因此提前結束；"
                f"共執行 {passes} 輪。"
            ),
            en=(
                "No swaps happened in this pass, so the temperatures of these "
                f"{total_days} days are already sorted and we can stop early. "
                f"Total passes: {passes}."
            ),
        )
    final_state = states[event.state_after_id]
    final_order = final_state.complete_order()
    tail = _point_at(final_order, len(final_order) - 1, points_by_id)
    hottest = direction == "asc"
    return Explanation(
        key="weather.done.complete",
        zh_hant=(
            f"排序完成：共執行 {passes} 輪冒泡。{_order_words(direction)[0]}排列後，"
            f"最{'熱' if hottest else '冷'}的一天是 {_zh_date(tail.obs_date)}的 "
            f"{_degree(tail)}。"
        ),
        en=(
            f"Sorting complete after {passes} passes. After {_order_words(direction)[1]} "
            f"order, the {'hottest' if hottest else 'coldest'} day is "
            f"{_en_date(tail.obs_date)} at {tail.value_raw}°C."
        ),
    )


def _make_explanation_factory(
    points_by_id: Mapping[str, WeatherPoint],
    *,
    direction: Direction,
    total_days: int,
) -> ExplanationFactory:
    """构造注入 ``TraceRecorder`` 的天气解释工厂（固定模板 + 真实参数）。"""

    def factory(event: RecordedEvent, states: Sequence[RecordedState]) -> object:
        state_by_id = {state.state_id: state for state in states}
        before = state_by_id[event.state_before_id]
        if event.event_type == "compare":
            return _explain_compare(
                event, before=before, points_by_id=points_by_id, direction=direction
            )
        if event.event_type == "swap":
            return _explain_swap(
                event, before=before, points_by_id=points_by_id, direction=direction
            )
        if event.event_type == "mark_sorted":
            return _explain_mark_sorted(
                event,
                before=before,
                points_by_id=points_by_id,
                direction=direction,
                total_days=total_days,
            )
        if event.event_type == "done":
            return _explain_done(
                event,
                states=states,
                points_by_id=points_by_id,
                direction=direction,
                total_days=total_days,
            )
        raise RuntimeError(f"天气轨迹暂不支持的事件类型：{event.event_type}")

    return factory


def _require_explanation(event: RecordedEvent) -> Explanation:
    """从记录事件里取回解释工厂生成的解释，缺失即视为实现错误。"""
    payload = event.explanation
    if not isinstance(payload, Explanation):
        raise RuntimeError(f"事件 {event.step_id} 缺少解释负载")
    return payload


def _build_event(event: RecordedEvent) -> WeatherTraceEvent:
    """把记录器事件转换为天气轨迹事件模型（含双语解释）。"""
    auxiliary = event.auxiliary_state
    comparison = auxiliary.comparison
    return WeatherTraceEvent(
        step_id=event.step_id,
        event_type=event.event_type,
        code_line_ids=list(event.code_line_ids),
        state_before_id=event.state_before_id,
        state_after_id=event.state_after_id,
        active_indices=list(event.active_indices),
        compared_indices=list(event.compared_indices),
        modified_indices=list(event.modified_indices),
        finalized_indices=list(event.finalized_indices),
        auxiliary_state=WeatherAuxiliaryState(
            pass_index=auxiliary.pass_index,
            early_exit_enabled=auxiliary.early_exit_enabled,
            swapped_in_pass=auxiliary.swapped_in_pass,
            comparison=None
            if comparison is None
            else WeatherComparisonInfo(
                left=comparison.left,
                right=comparison.right,
                relation=comparison.relation,
                will_swap=comparison.will_swap,
            ),
        ),
        metrics=EventMetrics(
            comparisons=event.metrics.comparisons,
            swaps=event.metrics.swaps,
            writes=event.metrics.writes,
        ),
        explanation=_require_explanation(event),
    )


def _top_lists(points: Sequence[WeatherPoint]) -> tuple[list[TopTemperature], list[TopTemperature]]:
    """按温度取 Top 5 最热/最冷；同温时较早日期在前（确定性）。"""
    hot = sorted(points, key=lambda point: (-point.value, point.obs_date))[:TOP_LIMIT]
    cold = sorted(points, key=lambda point: (point.value, point.obs_date))[:TOP_LIMIT]
    return (
        [
            TopTemperature(date=point.obs_date, value=point.value, value_raw=point.value_raw)
            for point in hot
        ],
        [
            TopTemperature(date=point.obs_date, value=point.value, value_raw=point.value_raw)
            for point in cold
        ],
    )


def _code_block() -> CodeBlock:
    """沿用阶段 2 的代码行映射：学生看到的仍是实际执行的冒泡排序源码。"""
    return CodeBlock(
        lines=[
            CodeLine(
                line_id=f"L{line.lineno}",
                lineno=line.lineno,
                text=line.text,
                kind=line.kind,
            )
            for line in BUBBLE_LINE_MAP.lines
        ]
    )


def _station_or_raise(station_id: str, settings: Settings) -> StationRecord:
    """校验站号必须在官方 39 站名单内。"""
    record = find_station(station_id, settings)
    if record is None:
        raise TraceValidationError("station", f"未知站號：{station_id}（必須是官方 39 站之一）")
    return record


def build_weather_trace(
    database: Database,
    settings: Settings,
    *,
    station: str,
    metric: str,
    start: date,
    end: date,
    direction: str,
    early_exit: bool,
) -> WeatherTraceResponse:
    """真实读取天气数据并执行冒泡排序，返回带天气解释的协议轨迹。"""
    direction_value = _normalise_direction(direction)
    metric_value = _normalise_metric(metric)
    if not isinstance(early_exit, bool):
        raise TraceValidationError("options.early_exit", "early_exit 必须是布尔值")
    station_record = _station_or_raise(station, settings)
    if start > end:
        raise TraceValidationError("start", "start 不能晚于 end")
    requested_days = (end - start).days + 1
    if requested_days > MAX_WINDOW_DAYS:
        raise TraceValidationError("start", f"查詢區間不能超過 {MAX_WINDOW_DAYS} 天")

    points = _load_points(
        database,
        station_id=station,
        metric=metric_value,
        start=start,
        end=end,
    )
    observed = {point.obs_date for point in points}
    excluded = _excluded_dates(start, end, observed)
    valid_days = len(points)
    if valid_days < 2:
        raise TraceValidationError(
            "date_range",
            f"窗口內有效天數只有 {valid_days} 天（至少需要 2 天）；"
            f"已排除 {len(excluded)} 天缺失資料。",
        )

    points_by_id: dict[str, WeatherPoint] = {point.item_id: point for point in points}
    items = [Item(id=point.item_id, value=point.value) for point in points]
    recorder = TraceRecorder(
        items,
        direction=direction_value,
        early_exit=early_exit,
        line_groups=BUBBLE_LINE_MAP.line_groups,
        max_events=MAX_EVENTS,
        explanation_factory=_make_explanation_factory(
            points_by_id,
            direction=direction_value,
            total_days=valid_days,
        ),
    )
    try:
        sorted_values = bubble_sort(
            [point.value for point in points],
            direction=direction_value,
            early_exit=early_exit,
            tracer=recorder,
        )
    except TraceLimitError as exc:
        raise TraceValidationError("date_range", str(exc)) from exc

    # 防御性一致性检查：轨迹最终状态必须等于算法真实返回值
    recorded_final = [float(value) for value in recorder.final_values]
    returned_final = [float(value) for value in sorted_values]
    if recorded_final != returned_final:
        raise RuntimeError("轨迹最终状态与算法真实返回值不一致")

    hot, cold = _top_lists(points)
    metrics = recorder.metrics
    return WeatherTraceResponse(
        protocol_version=PROTOCOL_VERSION,
        algorithm="bubble",
        direction=direction_value,
        options=BubbleTraceOptions(early_exit=early_exit),
        items=[
            WeatherTraceItem(
                id=point.item_id,
                value=point.value,
                value_raw=point.value_raw,
                label=point.obs_date.isoformat(),
                station=station_record.id,
                station_name_zh_hant=station_record.name_zh_hant,
                station_name_en=station_record.name_en,
                quality_flag=point.quality_flag,
                source=point.source,
            )
            for point in points
        ],
        code=_code_block(),
        states=[
            WeatherArrayState(
                state_id=state.state_id,
                order=list(state.complete_order()),
                values=[float(value) for value in state.numeric_values()],
            )
            for state in recorder.states
        ],
        events=[_build_event(event) for event in recorder.events],
        summary=WeatherTraceSummary(
            comparisons=metrics.comparisons,
            swaps=metrics.swaps,
            writes=metrics.writes,
            passes=recorder.passes,
            early_exit_triggered=recorder.early_exit_triggered,
            final_order=[str(item_id) for item_id in recorder.final_order],
            final_values=[float(value) for value in recorder.final_values],
            state_count=len(recorder.states),
            event_count=len(recorder.events),
        ),
        metric=metric_value,
        valid_days=valid_days,
        requested_days=requested_days,
        excluded_dates=excluded,
        before_order=[point.item_id for point in points],
        after_order=[str(item_id) for item_id in recorder.final_order],
        top_hot=hot,
        top_cold=cold,
        single_scan=SingleScan(comparisons=max(valid_days - 1, 0), swaps=0),
    )
