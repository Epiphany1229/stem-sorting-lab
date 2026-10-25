"""阶段 5 通用算法轨迹服务：算法清单 + 任意注册算法的真实执行轨迹。

红线继承阶段 2：轨迹只来自真实执行；``code.lines`` 来自实际执行模块的函数源码；
双语解释由固定模板 + 事件参数生成，不联网、不调用大模型。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal

from backend.app.algorithms.registry import (
    ALGORITHM_ORDER,
    ALGORITHMS,
    AlgorithmSpec,
)
from backend.app.schemas.algorithm_trace import (
    AlgorithmArrayState,
    AlgorithmAuxiliaryState,
    AlgorithmComparisonInfo,
    AlgorithmListResponse,
    AlgorithmTraceEvent,
    AlgorithmTraceItem,
    AlgorithmTraceResponse,
    AlgorithmTraceSummary,
    Number,
)
from backend.app.schemas.trace import (
    PROTOCOL_VERSION,
    CodeBlock,
    CodeLine,
    EventMetrics,
    Explanation,
)
from backend.app.services.trace_service import MAX_EVENTS, TraceValidationError
from backend.app.trace.recorder import (
    Direction,
    EventType,
    Item,
    RecordedEvent,
    TraceLimitError,
    TraceRecorder,
)

# 辅助状态里不参与解释文案的字段（其余字段都可能在解释里被引用）。
_RELATION_ZH: dict[str, str] = {"gt": "大於", "lt": "小於", "eq": "等於"}
_RELATION_EN: dict[str, str] = {
    "gt": "is greater than",
    "lt": "is less than",
    "eq": "equals",
}


class UnknownAlgorithmError(LookupError):
    """未知算法 id（含已移除的 id）；由 API 层转换成 404。"""

    def __init__(self, algorithm_id: str) -> None:
        super().__init__(f"未知的算法：{algorithm_id}")
        self.algorithm_id = algorithm_id


def build_algorithm_list() -> AlgorithmListResponse:
    """返回 7 种比较类排序的元数据（全部可用）。"""
    return AlgorithmListResponse(
        protocol_version=PROTOCOL_VERSION,
        algorithms=[ALGORITHMS[algorithm_id].metadata for algorithm_id in ALGORITHM_ORDER],
    )


def _validate_input(
    *,
    values: Sequence[Number],
    direction: str,
    early_exit: bool,
) -> Direction:
    """服务层输入校验（API 层另有 Pydantic 严格类型校验）。"""
    if not isinstance(early_exit, bool):
        raise TraceValidationError("options.early_exit", "early_exit 必须是布尔值")
    if len(values) < 2:
        raise TraceValidationError("values", "至少需要 2 个元素")
    if len(values) > 30:
        raise TraceValidationError("values", "最多支持 30 个元素")
    for index, value in enumerate(values):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TraceValidationError("values", f"第 {index + 1} 个元素必须是整数或一位小数")
        if value < -1000 or value > 1000:
            raise TraceValidationError(
                "values",
                f"第 {index + 1} 个元素 {value} 超出取值范围 [-1000, 1000]",
            )
        if isinstance(value, float):
            scaled = Decimal(str(value)) * 10
            if scaled != scaled.to_integral_value():
                raise TraceValidationError(
                    "values", f"第 {index + 1} 个元素 {value} 最多只能有一位小数"
                )
    if direction == "asc":
        return "asc"
    if direction == "desc":
        return "desc"
    raise TraceValidationError("direction", 'direction 只能是 "asc" 或 "desc"')


def build_algorithm_trace(
    *,
    algorithm_id: str,
    values: Sequence[Number],
    direction: str,
    early_exit: bool,
) -> AlgorithmTraceResponse:
    """真实执行一次指定算法并返回完整轨迹。"""
    spec = ALGORITHMS.get(algorithm_id)
    if spec is None:
        raise UnknownAlgorithmError(algorithm_id)
    direction_value = _validate_input(
        values=values, direction=direction, early_exit=early_exit
    )
    items = [Item(id=f"it-{index}", value=value) for index, value in enumerate(values)]
    recorder = TraceRecorder(
        items,
        direction=direction_value,
        early_exit=early_exit,
        line_groups={},
        site_line_groups=spec.line_map.line_groups,
        max_events=MAX_EVENTS,
    )
    try:
        sorted_result = _execute(spec, values, direction_value, early_exit, recorder)
    except TraceLimitError as exc:
        raise TraceValidationError("values", str(exc)) from exc

    # 防御性一致性检查：轨迹最终状态必须等于算法真实返回值。
    if [float(value) for value in recorder.final_values] != [
        float(value) for value in sorted_result
    ]:
        raise RuntimeError("轨迹最终状态与算法真实返回值不一致")

    states = [
        AlgorithmArrayState(
            state_id=state.state_id,
            order=list(state.order),
            values=list(state.values),
        )
        for state in recorder.states
    ]
    state_values: Mapping[int, tuple[float | None, ...]] = {
        state.state_id: state.values for state in recorder.states
    }
    item_values: Mapping[str, float] = {item.id: item.value for item in items}
    events = [
        _build_event(
            event,
            algorithm_id=algorithm_id,
            spec=spec,
            direction=direction_value,
            state_values=state_values,
            item_values=item_values,
            passes=recorder.passes,
            early_exit_triggered=recorder.early_exit_triggered,
        )
        for event in recorder.events
    ]
    metrics = recorder.metrics
    return AlgorithmTraceResponse(
        protocol_version=PROTOCOL_VERSION,
        algorithm=spec.algorithm_id,
        direction=direction_value,
        options={"early_exit": early_exit} if spec.metadata.supports_early_exit else {},
        items=[AlgorithmTraceItem(id=item.id, value=item.value) for item in items],
        code=CodeBlock(
            lines=[
                CodeLine(
                    line_id=f"L{line.lineno}",
                    lineno=line.lineno,
                    text=line.text,
                    kind=line.kind,
                )
                for line in spec.line_map.lines
            ]
        ),
        states=states,
        events=events,
        summary=AlgorithmTraceSummary(
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


def _execute(
    spec: AlgorithmSpec,
    values: Sequence[Number],
    direction: Direction,
    early_exit: bool,
    recorder: TraceRecorder,
) -> list[float]:
    """按算法签名调用真实实现（冒泡排序额外支持提前结束参数）。"""
    input_values = list(values)
    if spec.metadata.supports_early_exit:
        return spec.function(input_values, direction, early_exit, recorder)
    return spec.function(input_values, direction, recorder)


def _build_event(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    spec: AlgorithmSpec,
    direction: Direction,
    state_values: Mapping[int, tuple[float | None, ...]],
    item_values: Mapping[str, float],
    passes: int,
    early_exit_triggered: bool,
) -> AlgorithmTraceEvent:
    """把记录器事件转换成通用轨迹事件（补双语解释）。"""
    auxiliary = _build_auxiliary(event, spec=spec, algorithm_id=algorithm_id)
    return AlgorithmTraceEvent(
        step_id=event.step_id,
        event_type=event.event_type,
        code_line_ids=list(event.code_line_ids),
        state_before_id=event.state_before_id,
        state_after_id=event.state_after_id,
        active_indices=list(event.active_indices),
        compared_indices=list(event.compared_indices),
        modified_indices=list(event.modified_indices),
        finalized_indices=list(event.finalized_indices),
        auxiliary_state=auxiliary,
        metrics=EventMetrics(
            comparisons=event.metrics.comparisons,
            swaps=event.metrics.swaps,
            writes=event.metrics.writes,
        ),
        explanation=_build_explanation(
            event,
            algorithm_id=algorithm_id,
            direction=direction,
            state_values=state_values,
            item_values=item_values,
            passes=passes,
            early_exit_triggered=early_exit_triggered,
        ),
    )


def _build_auxiliary(
    event: RecordedEvent,
    *,
    spec: AlgorithmSpec,
    algorithm_id: str,
) -> AlgorithmAuxiliaryState:
    """构造 aux：冒泡沿用协议 §3.4 字段，其余算法使用设计文档 §4 的固定字段。"""
    snapshot = event.auxiliary_state
    if algorithm_id == "bubble":
        comparison = snapshot.comparison
        return AlgorithmAuxiliaryState(
            pass_index=snapshot.pass_index,
            early_exit_enabled=snapshot.early_exit_enabled,
            swapped_in_pass=snapshot.swapped_in_pass,
            comparison=None
            if comparison is None
            else AlgorithmComparisonInfo(
                left=comparison.left,
                right=comparison.right,
                relation=comparison.relation,
                will_swap=comparison.will_swap,
            ),
        )
    extra = snapshot.extra
    if extra is None:
        raise RuntimeError(f"{algorithm_id} 事件缺少 auxiliary_state 扩展字段")
    missing = [field for field in spec.aux_fields if field not in extra]
    if missing:
        raise RuntimeError(f"{algorithm_id} 事件缺少 aux 字段：{', '.join(missing)}")
    unexpected = [
        field
        for field in extra
        if field not in spec.aux_fields and field != "comparison"
    ]
    if unexpected:
        raise RuntimeError(f"{algorithm_id} 事件出现未登记 aux 字段：{', '.join(unexpected)}")
    payload = dict(extra)
    comparison = snapshot.comparison
    if event.event_type == "compare" and comparison is not None:
        # 所有算法的 compare 事件都提供比较事实；will_swap 只属于冒泡。
        payload["comparison"] = {
            "left": comparison.left,
            "right": comparison.right,
            "relation": comparison.relation,
        }
    return AlgorithmAuxiliaryState.model_validate(payload)


def _fmt(value: object) -> str:
    """把事件参数格式化成学生可读的数值文本（保持 int/float 原样）。"""
    if value is None:
        return "—"
    return str(value)


def _explain_compare(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    direction: Direction,
) -> Explanation:
    comparison = event.auxiliary_state.comparison
    if comparison is None:
        raise RuntimeError("compare 事件缺少 comparison 辅助信息")
    first, second = event.active_indices[0], event.active_indices[1]
    left_value = comparison.left
    right_value = comparison.right
    relation = comparison.relation
    relation_zh = _RELATION_ZH[relation]
    relation_en = _RELATION_EN[relation]
    order_en = "ascending" if direction == "asc" else "descending"
    return Explanation(
        key=f"{algorithm_id}.compare.{direction}",
        zh_hant=(
            f"比較第 {first + 1} 個（{_fmt(left_value)}）與第 {second + 1} 個"
            f"（{_fmt(right_value)}）元素：{_fmt(left_value)} {relation_zh} "
            f"{_fmt(right_value)}。"
        ),
        en=(
            f"Compare element {first + 1} ({_fmt(left_value)}) with element "
            f"{second + 1} ({_fmt(right_value)}): {_fmt(left_value)} {relation_en} "
            f"{_fmt(right_value)} for {order_en} order."
        ),
    )


def _explain_swap(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    direction: Direction,
    state_values: Mapping[int, tuple[float | None, ...]],
) -> Explanation:
    before = state_values[event.state_before_id]
    after = state_values[event.state_after_id]
    first, second = event.active_indices[0], event.active_indices[1]
    return Explanation(
        key=f"{algorithm_id}.swap.{direction}",
        zh_hant=(
            f"交換第 {first + 1} 個（{_fmt(before[first])}）與第 {second + 1} 個"
            f"（{_fmt(before[second])}）元素；交換後兩個位置的值互換。"
        ),
        en=(
            f"Swap element {first + 1} ({_fmt(before[first])}) with element "
            f"{second + 1} ({_fmt(before[second])}); after the swap, position "
            f"{first + 1} holds {_fmt(after[first])} and position {second + 1} holds "
            f"{_fmt(after[second])}."
        ),
    )


def _explain_write(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    state_values: Mapping[int, tuple[float | None, ...]],
    item_values: Mapping[str, float],
) -> Explanation:
    after = state_values[event.state_after_id]
    if event.modified_indices:
        index = event.modified_indices[0]
        value = _fmt(after[index])
        return Explanation(
            key=f"{algorithm_id}.write",
            zh_hant=f"把第 {index + 1} 個位置寫入 {value}。",
            en=f"Write {value} into position {index + 1}.",
        )
    extra = event.auxiliary_state.extra or {}
    buffer_index = extra.get("buffer_index")
    buffer = extra.get("buffer")
    value_text = "?"
    if isinstance(buffer, list) and isinstance(buffer_index, int) and buffer_index < len(buffer):
        value_text = _fmt(item_values.get(str(buffer[buffer_index]), "?"))
    label = _fmt(buffer_index) if isinstance(buffer_index, int) else "?"
    return Explanation(
        key=f"{algorithm_id}.write.buffer",
        zh_hant=f"把 {value_text} 寫入輔助緩衝區第 {label} 格（從 0 起算）。",
        en=f"Write {value_text} into auxiliary buffer slot {label} (0-based).",
    )


def _explain_select(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    direction: Direction,
) -> Explanation:
    extra = event.auxiliary_state.extra or {}
    min_index = extra.get("min_index", 0)
    index = _fmt(min_index)
    extreme_zh = "最小" if direction == "asc" else "最大"
    extreme_en = "minimum" if direction == "asc" else "maximum"
    return Explanation(
        key=f"{algorithm_id}.select.{direction}",
        zh_hant=f"發現更適合的候選，準備把{extreme_zh}值的位置更新為第 {index} 個元素。",
        en=f"A better candidate is found; update the {extreme_en} position to element {index}.",
    )


def _explain_partition(
    event: RecordedEvent,
    *,
    algorithm_id: str,
) -> Explanation:
    extra = event.auxiliary_state.extra or {}
    partition_index = extra.get("partition_index", 0)
    return Explanation(
        key=f"{algorithm_id}.partition",
        zh_hant=f"分區邊界向前推進，第 {_fmt(partition_index)} 個元素進入樞軸左側區域。",
        en=(
            f"Advance the partition boundary; element {_fmt(partition_index)} joins the "
            "left side of the pivot."
        ),
    )


def _explain_merge(
    event: RecordedEvent,
    *,
    algorithm_id: str,
) -> Explanation:
    extra = event.auxiliary_state.extra or {}
    left = extra.get("left", 0)
    mid = extra.get("mid", 0)
    right = extra.get("right", 0)
    depth = extra.get("depth", 0)
    return Explanation(
        key=f"{algorithm_id}.merge",
        zh_hant=(
            f"合併區間 [第 {_fmt(left)} 個, 第 {_fmt(right)} 個]，中點是第 {_fmt(mid)} 個"
            f"元素，遞迴深度 {_fmt(depth)}。"
        ),
        en=(
            f"Merge the range [element {_fmt(left)}, element {_fmt(right)}] with midpoint "
            f"element {_fmt(mid)} at recursion depth {_fmt(depth)}."
        ),
    )


def _explain_mark_sorted(
    event: RecordedEvent,
    *,
    algorithm_id: str,
) -> Explanation:
    if algorithm_id == "bubble":
        pass_index = event.auxiliary_state.pass_index
    else:
        extra = event.auxiliary_state.extra or {}
        raw_pass = extra.get("pass_index", extra.get("gap_index", 0))
        pass_index = raw_pass if isinstance(raw_pass, int) else 0
    finalized = event.finalized_indices
    if finalized:
        fixed_zh = "、".join(f"第 {index + 1}" for index in finalized)
        fixed_en = ", ".join(str(index + 1) for index in finalized)
        zh_tail = f"已確定最終位置：{fixed_zh} 個位置。"
        en_tail = f"Final positions: {fixed_en}."
    else:
        zh_tail = "尚未有元素進入最終位置。"
        en_tail = "No element has reached its final position yet."
    return Explanation(
        key=f"{algorithm_id}.mark_sorted",
        zh_hant=f"進入第 {pass_index + 1} 輪／段；{zh_tail}",
        en=f"Start round/segment {pass_index + 1}; {en_tail}",
    )


def _explain_done(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    state_values: Mapping[int, tuple[float | None, ...]],
    passes: int,
    early_exit_triggered: bool,
) -> Explanation:
    final_values = state_values[event.state_after_id]
    joined_zh = "、".join(_fmt(value) for value in final_values)
    joined_en = ", ".join(_fmt(value) for value in final_values)
    if early_exit_triggered:
        return Explanation(
            key=f"{algorithm_id}.done.early_exit",
            zh_hant=f"本輪沒有任何交換，代表資料已經排好序，因此提前結束。共執行 {passes} 輪。",
            en=(
                "No swaps happened in this pass, so the data is already sorted and we can "
                f"stop early. Total passes: {passes}."
            ),
        )
    return Explanation(
        key=f"{algorithm_id}.done",
        zh_hant=f"排序完成，共執行 {passes} 輪；最終結果為 {joined_zh}。",
        en=f"Sorting complete after {passes} passes; final result: {joined_en}.",
    )


def _build_explanation(
    event: RecordedEvent,
    *,
    algorithm_id: str,
    direction: Direction,
    state_values: Mapping[int, tuple[float | None, ...]],
    item_values: Mapping[str, float],
    passes: int,
    early_exit_triggered: bool,
) -> Explanation:
    """按事件类型选择固定模板，用真实事件参数填充双语解释。"""
    event_type: EventType = event.event_type
    if event_type == "compare":
        return _explain_compare(event, algorithm_id=algorithm_id, direction=direction)
    if event_type == "swap":
        return _explain_swap(
            event, algorithm_id=algorithm_id, direction=direction, state_values=state_values
        )
    if event_type == "write":
        return _explain_write(
            event,
            algorithm_id=algorithm_id,
            state_values=state_values,
            item_values=item_values,
        )
    if event_type == "select":
        return _explain_select(event, algorithm_id=algorithm_id, direction=direction)
    if event_type == "partition":
        return _explain_partition(event, algorithm_id=algorithm_id)
    if event_type == "merge":
        return _explain_merge(event, algorithm_id=algorithm_id)
    if event_type == "mark_sorted":
        return _explain_mark_sorted(event, algorithm_id=algorithm_id)
    return _explain_done(
        event,
        algorithm_id=algorithm_id,
        state_values=state_values,
        passes=passes,
        early_exit_triggered=early_exit_triggered,
    )
