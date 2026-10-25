"""阶段 5 算法轨迹属性测试（Hypothesis）：随机输入下验证真实执行不变量。"""

from __future__ import annotations

from collections import Counter
from itertools import pairwise

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from backend.app.services.algorithm_trace_service import build_algorithm_trace

ALGORITHM_IDS = ("selection", "insertion", "shell", "merge", "quick", "heap")

# 整数与一位小数混合输入；一位小数用“整数 ÷ 10”生成，保证 Decimal 校验可通过。
_NUMBER = st.one_of(
    st.integers(min_value=-1000, max_value=1000),
    st.integers(min_value=-10000, max_value=10000).map(lambda n: n / 10),
)
VALUES = st.lists(_NUMBER, min_size=2, max_size=30)
DIRECTIONS = st.sampled_from(["asc", "desc"])

SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)


def _trace(algorithm_id: str, values: list[int | float], direction: str) -> object:
    return build_algorithm_trace(
        algorithm_id=algorithm_id,
        values=values,
        direction=direction,
        early_exit=True,
    )


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_final_result_is_correct(values: list[int | float], direction: str) -> None:
    """最终结果等于 Python sorted 的同方向结果。"""
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        assert trace.summary.final_values == sorted(values, reverse=direction == "desc")


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_element_multiset_is_preserved(
    values: list[int | float], direction: str
) -> None:
    """排序前后元素多重集合不变，元素 id 唯一且最终顺序是排列。"""
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        assert Counter(trace.summary.final_values) == Counter(values)
        item_ids = [item.id for item in trace.items]
        assert len(item_ids) == len(set(item_ids)) == len(values)
        assert sorted(trace.summary.final_order) == sorted(item_ids)
        by_id = {item.id: item.value for item in trace.items}
        assert [by_id[item_id] for item_id in trace.summary.final_order] == (
            trace.summary.final_values
        )


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_state_chain_is_consistent(values: list[int | float], direction: str) -> None:
    """每个事件的 state_after_id 都是下一个事件的 state_before_id。

    同时验证协议 §3.1 的单空槽约定：item id 至多一次、空槽至多一个、
    values 与 order 的空槽位置一致、done 时必须是完整排列。
    """
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        previous_after = trace.states[0].state_id
        for event in trace.events:
            assert event.state_before_id == previous_after
            previous_after = event.state_after_id
        for state in trace.states:
            ids = [item_id for item_id in state.order if item_id is not None]
            assert len(ids) == len(set(ids))
            assert len(state.order) - len(ids) <= 1
            for item_id, value in zip(state.order, state.values, strict=True):
                assert (item_id is None) == (value is None)
        assert all(item_id is not None for item_id in trace.states[-1].order)
        assert trace.states[0].values == values


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_metrics_are_consistent_and_monotonic(
    values: list[int | float], direction: str
) -> None:
    """指标与事件计数自洽、单调不减；插入/希尔/归并 swaps 恒为 0。"""
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        event_types = [event.event_type for event in trace.events]
        assert trace.summary.comparisons == event_types.count("compare")
        assert trace.summary.swaps == event_types.count("swap")
        if algorithm_id in {"insertion", "shell", "merge"}:
            assert trace.summary.swaps == 0
            assert trace.summary.writes == event_types.count("write")
        else:
            assert trace.summary.writes == 2 * trace.summary.swaps
        for previous, current in pairwise(trace.events):
            assert current.metrics.comparisons >= previous.metrics.comparisons
            assert current.metrics.swaps >= previous.metrics.swaps
            assert current.metrics.writes >= previous.metrics.writes
        last = trace.events[-1].metrics
        assert last.comparisons == trace.summary.comparisons
        assert last.swaps == trace.summary.swaps
        assert last.writes == trace.summary.writes


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_code_line_ids_are_always_resolvable(
    values: list[int | float], direction: str
) -> None:
    """每个事件的 code_line_ids 都能在 code.lines 中解析到。"""
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        known = {line.line_id for line in trace.code.lines}
        for event in trace.events:
            assert event.code_line_ids
            assert set(event.code_line_ids) <= known


@SETTINGS
@given(values=VALUES, direction=DIRECTIONS)
def test_compare_events_carry_comparison_facts(
    values: list[int | float], direction: str
) -> None:
    """所有算法的 compare 事件都带 left/right/relation（非冒泡不带 will_swap）。"""
    for algorithm_id in ALGORITHM_IDS:
        trace = build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=values,
            direction=direction,
            early_exit=True,
        )
        for event in trace.events:
            if event.event_type != "compare":
                continue
            comparison = event.auxiliary_state.comparison
            assert comparison is not None
            expected = (
                "gt"
                if comparison.left > comparison.right
                else "lt"
                if comparison.left < comparison.right
                else "eq"
            )
            assert comparison.relation == expected
            if algorithm_id != "bubble":
                assert comparison.will_swap is None
