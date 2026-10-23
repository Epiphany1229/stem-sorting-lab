"""冒泡排序轨迹的属性测试（Hypothesis）。

目的：用随机输入验证「轨迹 = 真实执行」的不变量，而不是只测固定样例。
断言的都是需求文件第六节要求的不变量：可重复、状态链自洽、元素不丢失、
指标与事件一致、代码行引用真实存在、提前结束优化真的生效。
"""

from __future__ import annotations

from collections import Counter

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from backend.app.services.trace_service import build_bubble_trace

VALUES = st.lists(
    st.integers(min_value=-1000, max_value=1000),
    min_size=2,
    max_size=30,
)
DIRECTIONS = st.sampled_from(["asc", "desc"])

SETTINGS = settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_result_equals_python_sorted(values: list[int], direction: str, early_exit: bool) -> None:
    """最终结果必须等于 Python sorted 的结果（同元素、同方向）。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    expected = sorted(values, reverse=direction == "desc")
    assert trace.summary.final_values == expected


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_element_multiset_is_preserved(
    values: list[int], direction: str, early_exit: bool
) -> None:
    """排序前后元素多重集合不变，且每个元素 ID 唯一、能追回原始位置。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    assert Counter(trace.summary.final_values) == Counter(values)
    ids = [item.id for item in trace.items]
    assert len(ids) == len(set(ids)) == len(values)
    final_ids = trace.summary.final_order
    assert sorted(final_ids) == sorted(ids)
    by_id = {item.id: item.value for item in trace.items}
    assert [by_id[item_id] for item_id in final_ids] == trace.summary.final_values


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_state_chain_and_metrics_are_consistent(
    values: list[int], direction: str, early_exit: bool
) -> None:
    """状态链首尾相接；指标与事件计数一致；写入 = 2 × 交换。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    assert trace.states[0].values == values

    previous_after = trace.states[0].state_id
    for event in trace.events:
        assert event.state_before_id == previous_after
        previous_after = event.state_after_id

    event_types = [event.event_type for event in trace.events]
    assert trace.summary.comparisons == sum(1 for kind in event_types if kind == "compare")
    assert trace.summary.swaps == sum(1 for kind in event_types if kind == "swap")
    assert trace.summary.writes == 2 * trace.summary.swaps
    assert trace.summary.event_count == len(trace.events)
    assert trace.summary.state_count == len(trace.states)

    # 指标单调不减，且最后一次累计等于汇总
    last_metrics = trace.events[-1].metrics
    assert last_metrics.comparisons == trace.summary.comparisons
    assert last_metrics.swaps == trace.summary.swaps
    assert last_metrics.writes == trace.summary.writes


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_code_line_ids_reference_existing_lines(
    values: list[int], direction: str, early_exit: bool
) -> None:
    """每个事件的 code_line_ids 都必须能在 code.lines 中解析到（C2 行映射）。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    known = {line.line_id for line in trace.code.lines}
    for event in trace.events:
        assert event.code_line_ids
        assert set(event.code_line_ids) <= known


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_trace_is_reproducible(values: list[int], direction: str, early_exit: bool) -> None:
    """同输入 + 同参数 ⇒ 轨迹逐字段相同（可重复性）。"""
    first = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    second = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    assert first.model_dump() == second.model_dump()


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_early_exit_stops_after_first_clean_pass(values: list[int], direction: str) -> None:
    """输入已是目标顺序且启用提前结束 ⇒ 只跑一轮、比较 n-1 次、零交换。

    注意 n == 2 的边界：只存在一轮，没有"提前"可节省，因此
    `early_exit_triggered` 只在确实少跑了轮次时为真。
    """
    ordered = sorted(values, reverse=direction == "desc")
    trace = build_bubble_trace(values=ordered, direction=direction, early_exit=True)
    assert trace.summary.passes == 1
    assert trace.summary.comparisons == len(ordered) - 1
    assert trace.summary.swaps == 0
    assert trace.summary.early_exit_triggered == (trace.summary.passes < len(ordered) - 1)


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_without_early_exit_all_passes_run(values: list[int], direction: str) -> None:
    """关闭提前结束后必须跑满 n-1 轮（不被"看起来已排好"提前截断）。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=False)
    assert trace.summary.passes == len(values) - 1
    assert trace.summary.early_exit_triggered is False


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_finalized_indices_eventually_cover_all(
    values: list[int], direction: str, early_exit: bool
) -> None:
    """排序结束时 finalized_indices 必须覆盖全部下标（每轮都有元素就位）。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    done_events = [event for event in trace.events if event.event_type == "done"]
    assert len(done_events) == 1
    assert sorted(done_events[0].finalized_indices) == list(range(len(values)))


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS, early_exit=st.booleans())
def test_compare_events_carry_comparison_metadata(
    values: list[int], direction: str, early_exit: bool
) -> None:
    """compare 事件必须带 comparison，且 will_swap 与真实关系一致（前端预测题只读它）。"""
    trace = build_bubble_trace(values=values, direction=direction, early_exit=early_exit)
    for event in trace.events:
        if event.event_type != "compare":
            continue
        comparison = event.auxiliary_state.comparison
        assert comparison is not None
        left, right = comparison.left, comparison.right
        assert comparison.relation == ("gt" if left > right else "lt" if left < right else "eq")
        should_swap = left > right if direction == "asc" else left < right
        assert comparison.will_swap is should_swap


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_permuted_input_produces_same_final_values(values: list[int], direction: str) -> None:
    """同一多重集合的不同排列，最终排序结果必须一致。"""
    reversed_values = list(reversed(values))
    first = build_bubble_trace(values=values, direction=direction, early_exit=True)
    second = build_bubble_trace(values=reversed_values, direction=direction, early_exit=True)
    assert first.summary.final_values == second.summary.final_values
