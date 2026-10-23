"""冒泡排序轨迹服务：校验输入、驱动真实执行、组装协议响应与双语解释。

本模块不调用大模型、不联网；``explanation`` 全部由固定模板 + 事件参数生成，
因此同一输入与参数必然得到逐字节相同的响应。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from backend.app.algorithms.bubble import bubble_sort
from backend.app.schemas.trace import (
    PROTOCOL_VERSION,
    ArrayState,
    AuxiliaryState,
    BubbleTraceOptions,
    CodeBlock,
    CodeLine,
    ComparisonInfo,
    EventMetrics,
    Explanation,
    TraceEvent,
    TraceItem,
    TraceResponse,
    TraceSummary,
)
from backend.app.trace.line_map import BUBBLE_LINE_MAP
from backend.app.trace.recorder import (
    Direction,
    Item,
    RecordedEvent,
    Relation,
    TraceLimitError,
    TraceRecorder,
)

# 与协议 §4 一致：事件总数超过上限直接拒绝，不截断返回。
MAX_EVENTS = 20000

# 比较关系的双语措辞。
_RELATION_ZH: dict[Relation, str] = {"gt": "大於", "lt": "小於", "eq": "等於"}
_RELATION_EN: dict[Relation, str] = {
    "gt": "is greater than",
    "lt": "is less than",
    "eq": "equals",
}


class TraceValidationError(ValueError):
    """输入不满足协议约束；由 API 层转换成 422 与字段级错误数组。"""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def build_bubble_trace(
    *,
    values: Sequence[int],
    direction: str,
    early_exit: bool,
) -> TraceResponse:
    """真实执行一次冒泡排序，并返回完整的协议 v1 轨迹响应。"""
    _validate_input(values=values, direction=direction, early_exit=early_exit)
    direction_value = _normalise_direction(direction)

    items = [Item(id=f"it-{index}", value=value) for index, value in enumerate(values)]
    recorder = TraceRecorder(
        items,
        direction=direction_value,
        early_exit=early_exit,
        line_groups=BUBBLE_LINE_MAP.line_groups,
        max_events=MAX_EVENTS,
    )
    try:
        sorted_values = bubble_sort(
            list(values),
            direction=direction_value,
            early_exit=early_exit,
            tracer=recorder,
        )
    except TraceLimitError as exc:
        raise TraceValidationError("values", str(exc)) from exc

    # 防御性一致性检查：轨迹最终状态必须等于算法真实返回值，否则说明插桩/记录漂移。
    if list(recorder.final_values) != sorted_values:
        raise RuntimeError("轨迹最终状态与算法真实返回值不一致")

    states = [
        ArrayState(
            state_id=state.state_id,
            order=list(state.order),
            values=list(state.values),
        )
        for state in recorder.states
    ]
    state_values: Mapping[int, tuple[int, ...]] = {
        state.state_id: state.values for state in recorder.states
    }
    events = [
        _build_event(
            event,
            state_values=state_values,
            direction=direction_value,
            item_count=len(items),
            passes=recorder.passes,
            early_exit_triggered=recorder.early_exit_triggered,
        )
        for event in recorder.events
    ]

    metrics = recorder.metrics
    return TraceResponse(
        protocol_version=PROTOCOL_VERSION,
        algorithm="bubble",
        direction=direction_value,
        options=BubbleTraceOptions(early_exit=early_exit),
        items=[TraceItem(id=item.id, value=item.value) for item in items],
        code=CodeBlock(
            lines=[
                CodeLine(
                    line_id=f"L{line.lineno}",
                    lineno=line.lineno,
                    text=line.text,
                    kind=line.kind,
                )
                for line in BUBBLE_LINE_MAP.lines
            ]
        ),
        states=states,
        events=events,
        summary=TraceSummary(
            comparisons=metrics.comparisons,
            swaps=metrics.swaps,
            writes=metrics.writes,
            passes=recorder.passes,
            early_exit_triggered=recorder.early_exit_triggered,
            final_order=list(recorder.final_order),
            final_values=list(recorder.final_values),
            state_count=len(states),
            event_count=len(events),
        ),
    )


def _validate_input(*, values: Sequence[int], direction: str, early_exit: bool) -> None:
    """服务层输入校验（API 层另有 Pydantic 严格类型校验作为第一道门）。"""
    if not isinstance(early_exit, bool):
        raise TraceValidationError("options.early_exit", "early_exit 必须是布尔值")
    if len(values) < 2:
        raise TraceValidationError("values", "至少需要 2 个元素")
    if len(values) > 30:
        raise TraceValidationError("values", "最多支持 30 个元素")
    for index, value in enumerate(values):
        if not isinstance(value, int) or isinstance(value, bool):
            raise TraceValidationError("values", f"第 {index + 1} 个元素必须是整数")
        if value < -1000 or value > 1000:
            raise TraceValidationError(
                "values",
                f"第 {index + 1} 个元素 {value} 超出取值范围 [-1000, 1000]",
            )
    if direction not in ("asc", "desc"):
        raise TraceValidationError("direction", 'direction 只能是 "asc" 或 "desc"')


def _normalise_direction(direction: str) -> Direction:
    """把已校验的方向字符串收窄为枚举字面量类型。"""
    if direction == "asc":
        return "asc"
    if direction == "desc":
        return "desc"
    raise TraceValidationError("direction", 'direction 只能是 "asc" 或 "desc"')


def _build_event(
    event: RecordedEvent,
    *,
    state_values: Mapping[int, tuple[int, ...]],
    direction: Direction,
    item_count: int,
    passes: int,
    early_exit_triggered: bool,
) -> TraceEvent:
    """把记录器产出的原始事件转换成协议响应模型（补上双语解释）。"""
    auxiliary = event.auxiliary_state
    comparison = auxiliary.comparison
    return TraceEvent(
        step_id=event.step_id,
        event_type=event.event_type,
        code_line_ids=list(event.code_line_ids),
        state_before_id=event.state_before_id,
        state_after_id=event.state_after_id,
        active_indices=list(event.active_indices),
        compared_indices=list(event.compared_indices),
        modified_indices=list(event.modified_indices),
        finalized_indices=list(event.finalized_indices),
        auxiliary_state=AuxiliaryState(
            pass_index=auxiliary.pass_index,
            early_exit_enabled=auxiliary.early_exit_enabled,
            swapped_in_pass=auxiliary.swapped_in_pass,
            comparison=None
            if comparison is None
            else ComparisonInfo(
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
        explanation=_build_explanation(
            event,
            state_values=state_values,
            direction=direction,
            item_count=item_count,
            passes=passes,
            early_exit_triggered=early_exit_triggered,
        ),
    )


def _build_explanation(
    event: RecordedEvent,
    *,
    state_values: Mapping[int, tuple[int, ...]],
    direction: Direction,
    item_count: int,
    passes: int,
    early_exit_triggered: bool,
) -> Explanation:
    """按事件类型选择固定模板，用事件参数填充繁体中文与英文文案。"""
    if event.event_type == "compare":
        return _explain_compare(event, direction=direction)
    if event.event_type == "swap":
        return _explain_swap(event, state_values=state_values, direction=direction)
    if event.event_type == "mark_sorted":
        return _explain_mark_sorted(event, state_values=state_values, item_count=item_count)
    if event.event_type == "done":
        return _explain_done(
            event,
            state_values=state_values,
            passes=passes,
            early_exit_triggered=early_exit_triggered,
        )
    raise RuntimeError(f"暂不支持的事件类型：{event.event_type}")


def _explain_compare(event: RecordedEvent, *, direction: Direction) -> Explanation:
    comparison = event.auxiliary_state.comparison
    if comparison is None:
        raise RuntimeError("compare 事件缺少 comparison 辅助信息")
    left_position, right_position = event.active_indices
    left_label = left_position + 1
    right_label = right_position + 1
    left_value = comparison.left
    right_value = comparison.right
    relation_zh = _RELATION_ZH[comparison.relation]
    relation_en = _RELATION_EN[comparison.relation]
    order_zh = "升序" if direction == "asc" else "降序"
    order_en = "ascending" if direction == "asc" else "descending"

    if comparison.will_swap:
        return Explanation(
            key=f"bubble.compare.{direction}.swap",
            zh_hant=(
                f"比較第 {left_label} 個（{left_value}）與第 {right_label} 個（{right_value}）"
                f"元素：{left_value} {relation_zh} {right_value}，{order_zh}排列需要交換。"
            ),
            en=(
                f"Compare element {left_label} ({left_value}) with element "
                f"{right_label} ({right_value}): {left_value} {relation_en} {right_value}, "
                f"so they must be swapped for {order_en} order."
            ),
        )
    if comparison.relation == "eq":
        return Explanation(
            key=f"bubble.compare.{direction}.keep",
            zh_hant=(
                f"比較第 {left_label} 個（{left_value}）與第 {right_label} 個（{right_value}）"
                "元素：兩者相等，不需要交換。"
            ),
            en=(
                f"Compare element {left_label} ({left_value}) with element "
                f"{right_label} ({right_value}): they are equal, so no swap is needed."
            ),
        )
    return Explanation(
        key=f"bubble.compare.{direction}.keep",
        zh_hant=(
            f"比較第 {left_label} 個（{left_value}）與第 {right_label} 個（{right_value}）"
            f"元素：{left_value} {relation_zh} {right_value}，{order_zh}排列不需要交換。"
        ),
        en=(
            f"Compare element {left_label} ({left_value}) with element "
            f"{right_label} ({right_value}): {left_value} {relation_en} {right_value}, "
            f"so no swap is needed for {order_en} order."
        ),
    )


def _explain_swap(
    event: RecordedEvent,
    *,
    state_values: Mapping[int, tuple[int, ...]],
    direction: Direction,
) -> Explanation:
    left_position, right_position = event.active_indices
    before = state_values[event.state_before_id]
    after = state_values[event.state_after_id]
    left_label = left_position + 1
    right_label = right_position + 1
    return Explanation(
        key=f"bubble.swap.{direction}",
        zh_hant=(
            f"交換第 {left_label} 個（{before[left_position]}）與第 {right_label} 個"
            f"（{before[right_position]}）元素；交換後第 {left_label} 個為 "
            f"{after[left_position]}，第 {right_label} 個為 {after[right_position]}。"
        ),
        en=(
            f"Swap element {left_label} ({before[left_position]}) with element "
            f"{right_label} ({before[right_position]}); after the swap, position {left_label} "
            f"holds {after[left_position]} and position {right_label} holds "
            f"{after[right_position]}."
        ),
    )


def _explain_mark_sorted(
    event: RecordedEvent,
    *,
    state_values: Mapping[int, tuple[int, ...]],
    item_count: int,
) -> Explanation:
    pass_index = event.auxiliary_state.pass_index
    if pass_index == 0:
        return Explanation(
            key="bubble.mark_sorted.start",
            zh_hant="開始第 1 輪冒泡：由左至右逐一比較相鄰元素。",
            en="Start pass 1: compare adjacent elements from left to right.",
        )
    index = item_count - pass_index
    value = state_values[event.state_before_id][index]
    return Explanation(
        key="bubble.mark_sorted.progress",
        zh_hant=(
            f"開始第 {pass_index + 1} 輪冒泡：第 {index + 1} 個位置（{value}）已確定最終位置。"
        ),
        en=(
            f"Start pass {pass_index + 1}: position {index + 1} ({value}) is now in its final "
            "place."
        ),
    )


def _explain_done(
    event: RecordedEvent,
    *,
    state_values: Mapping[int, tuple[int, ...]],
    passes: int,
    early_exit_triggered: bool,
) -> Explanation:
    final_values = state_values[event.state_after_id]
    if early_exit_triggered:
        return Explanation(
            key="bubble.done.early_exit",
            zh_hant=(
                f"本輪沒有任何交換，代表陣列已經排好序，因此提前結束。共執行 {passes} 輪。"
            ),
            en=(
                "No swaps happened in this pass, so the array is already sorted and we can stop "
                f"early. Total passes: {passes}."
            ),
        )
    joined_zh = "、".join(str(value) for value in final_values)
    joined_en = ", ".join(str(value) for value in final_values)
    return Explanation(
        key="bubble.done.complete",
        zh_hant=f"所有輪次已完成，排序結束。共執行 {passes} 輪，最終結果為 {joined_zh}。",
        en=f"All passes are complete. Total passes: {passes}. Final result: {joined_en}.",
    )
