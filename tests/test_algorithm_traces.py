"""阶段 5 六种比较类算法的轨迹测试（服务层，离线）。

覆盖：正确性、确定性、状态链、指标口径、专属 aux 字段、代码行引用、稳定性。
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from itertools import pairwise
from typing import Any

import pytest

from backend.app.algorithms.registry import ALGORITHMS
from backend.app.schemas.algorithm_trace import AlgorithmTraceResponse
from backend.app.services.algorithm_trace_service import build_algorithm_trace

ALGORITHM_IDS = ("bubble", "selection", "insertion", "shell", "merge", "quick", "heap")
NEW_ALGORITHM_IDS = ("selection", "insertion", "shell", "merge", "quick", "heap")

# 设计文档 §3：每种算法产生的事件类型。
_EXPECTED_EVENT_TYPES: dict[str, set[str]] = {
    "bubble": {"compare", "swap", "mark_sorted", "done"},
    "selection": {"compare", "select", "swap", "mark_sorted", "done"},
    "insertion": {"compare", "write", "mark_sorted", "done"},
    "shell": {"compare", "write", "mark_sorted", "done"},
    "merge": {"compare", "write", "merge", "done"},
    "quick": {"compare", "partition", "swap", "mark_sorted", "done"},
    "heap": {"compare", "swap", "mark_sorted", "done"},
}

# 学生可见解释文案不得出现简体字。
_SIMPLIFIED_CHARS = set("选择复归并计数结构过这个们为与图统计稳尔杂")

Number = int | float

_CASES: tuple[tuple[Number, ...], ...] = (
    (2, 1),
    (5, 3, 8, 1, 9, 2),
    (4, 4, 2, 2, 1),
    (1, 2, 3, 4, 5),
    (5, 4, 3, 2, 1),
    (-5, 0, 5, -1000, 1000),
    (7, 7, 7, 7),
    (0, 0),
    (30.2, 29.6, 30.1, 29.6, 30.2, 28.0),
    tuple(range(30)),
)


def _trace(
    algorithm_id: str,
    values: Sequence[Number],
    direction: str = "asc",
    early_exit: bool = True,
) -> AlgorithmTraceResponse:
    return build_algorithm_trace(
        algorithm_id=algorithm_id,
        values=values,
        direction=direction,
        early_exit=early_exit,
    )


# --------------------------------------------------------------------- 正确性


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
@pytest.mark.parametrize("values", _CASES)
def test_ascending_matches_python_sorted(
    algorithm_id: str, values: tuple[Number, ...]
) -> None:
    """升序结果必须与 sorted() 参照一致（sorted 只作参照，不参与轨迹）。"""
    trace = _trace(algorithm_id, values)
    assert trace.summary.final_values == sorted(values)


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
@pytest.mark.parametrize("values", _CASES[:5])
def test_descending_matches_python_sorted(
    algorithm_id: str, values: tuple[Number, ...]
) -> None:
    """降序结果必须与 sorted(reverse=True) 参照一致。"""
    trace = _trace(algorithm_id, values, direction="desc")
    assert trace.summary.final_values == sorted(values, reverse=True)


def test_algorithm_functions_accept_plain_values_without_tracer() -> None:
    """不传 tracer 的纯算法路径仍返回正确结果。"""
    for algorithm_id in NEW_ALGORITHM_IDS:
        spec = ALGORITHMS[algorithm_id]
        assert spec.function([3, 1, 2]) == [1, 2, 3]
        assert spec.function([3, 1, 2], "desc") == [3, 2, 1]


# --------------------------------------------------------------------- 确定性


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_same_input_and_options_produce_identical_trace(algorithm_id: str) -> None:
    """同一输入 + 同一参数 ⇒ 轨迹完全相同（无随机、无时间戳）。"""
    first = _trace(algorithm_id, [5, 3, 8, 1, 9, 2]).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    second = _trace(algorithm_id, [5, 3, 8, 1, 9, 2]).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    assert first == second


# ------------------------------------------------------------- 状态链与元素身份


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
@pytest.mark.parametrize("direction", ["asc", "desc"])
def test_state_chain_and_final_state(algorithm_id: str, direction: str) -> None:
    """states[0] 是输入；事件 state 链自洽；最终结果是输入的多重集合的正确排列。"""
    values: list[Number] = [5, 3, 8, 1, 9, 2]
    trace = _trace(algorithm_id, values, direction=direction)

    assert trace.states[0].values == values
    assert trace.states[0].order == [f"it-{index}" for index in range(len(values))]

    previous_after = trace.states[0].state_id
    for event in trace.events:
        assert event.state_before_id == previous_after, (algorithm_id, event.step_id)
        previous_after = event.state_after_id

    assert trace.states[-1].values == trace.summary.final_values
    assert trace.summary.final_values == sorted(values, reverse=direction == "desc")
    assert Counter(trace.summary.final_values) == Counter(values)
    item_ids = [item.id for item in trace.items]
    assert sorted(trace.summary.final_order) == sorted(item_ids)
    by_id = {item.id: item.value for item in trace.items}
    assert [by_id[item_id] for item_id in trace.summary.final_order] == (
        trace.summary.final_values
    )
    assert trace.events[-1].finalized_indices == list(range(len(values)))
    assert trace.summary.state_count == len(trace.states)
    assert trace.summary.event_count == len(trace.events)


# --------------------------------------------------------------------- 指标口径


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_metrics_are_consistent_with_event_sequence(algorithm_id: str) -> None:
    """comparisons/swaps/writes 与事件序列自洽，且累计值单调不减。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    event_types = [event.event_type for event in trace.events]

    assert trace.summary.comparisons == event_types.count("compare")
    assert trace.summary.swaps == event_types.count("swap")

    if algorithm_id in {"insertion", "shell", "merge"}:
        # 设计文档 §3：插入/希尔/归并的 swaps 必须为 0，写入全部来自 write 事件。
        assert trace.summary.swaps == 0
        assert trace.summary.writes == event_types.count("write")
    else:
        # 只交换不移动：一次交换 = 2 次写入。
        assert trace.summary.writes == 2 * trace.summary.swaps
        assert event_types.count("write") == 0

    last = trace.events[-1].metrics
    assert (last.comparisons, last.swaps, last.writes) == (
        trace.summary.comparisons,
        trace.summary.swaps,
        trace.summary.writes,
    )
    for previous, current in pairwise(trace.events):
        assert current.metrics.comparisons >= previous.metrics.comparisons
        assert current.metrics.swaps >= previous.metrics.swaps
        assert current.metrics.writes >= previous.metrics.writes


def test_merge_writes_include_buffer_and_write_back() -> None:
    """归并排序的 writes 同时包含「写入辅助数组」与「回拷主数组」。"""
    trace = _trace("merge", [5, 3, 8, 1, 9, 2])
    write_events = [event for event in trace.events if event.event_type == "write"]
    assert write_events
    assert trace.summary.writes == len(write_events)

    buffer_writes = [event for event in write_events if event.auxiliary_state.writing_back is False]
    write_backs = [event for event in write_events if event.auxiliary_state.writing_back is True]
    assert buffer_writes
    assert write_backs
    # 写入辅助数组不改变主数组，因此 modified_indices 为空；回拷会改了某个下标。
    assert all(not event.modified_indices for event in buffer_writes)
    assert all(len(event.modified_indices) == 1 for event in write_backs)
    assert all(event.auxiliary_state.buffer for event in buffer_writes)
    item_ids = {item.id for item in trace.items}
    for event in buffer_writes:
        buffer = event.auxiliary_state.buffer or []
        assert buffer
        assert all(isinstance(item_id, str) and item_id for item_id in buffer)
        assert set(buffer) <= item_ids
        # 当前写入的元素必须已在该事件的 buffer 里（前端据此渲染缓冲格）。
        assert len(buffer) == (event.auxiliary_state.buffer_index or 0) + 1


# --------------------------------------------------------------- 专属辅助状态


def _aux_payload(event: Any) -> dict[str, Any]:  # noqa: ANN401 - 测试里读取序列化字典
    payload: dict[str, Any] = event.auxiliary_state.model_dump(exclude_none=True)
    return payload


@pytest.mark.parametrize("algorithm_id", NEW_ALGORITHM_IDS)
def test_every_event_carries_the_full_aux_field_set(algorithm_id: str) -> None:
    """设计文档 §4：每个事件都必须给出该算法的全部固定 aux 字段。

    compare 事件额外带 comparison（补充裁决：所有算法的比较事实都可见，
    但不带 will_swap，除非比较直接决定交换的冒泡排序）。
    """
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    expected = set(ALGORITHMS[algorithm_id].aux_fields)
    for event in trace.events:
        expected_fields = expected | (
            {"comparison"} if event.event_type == "compare" else set()
        )
        assert set(_aux_payload(event)) == expected_fields, (algorithm_id, event.step_id)


@pytest.mark.parametrize("algorithm_id", NEW_ALGORITHM_IDS)
def test_compare_events_carry_comparison_facts(algorithm_id: str) -> None:
    """非冒泡算法的 compare 事件提供 left/right/relation，但不提供 will_swap。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    compares = [event for event in trace.events if event.event_type == "compare"]
    assert compares
    for event in compares:
        comparison = event.auxiliary_state.comparison
        assert comparison is not None
        assert comparison.relation in {"gt", "lt", "eq"}
        assert comparison.will_swap is None
        payload = _aux_payload(event)
        assert "will_swap" not in payload["comparison"]


def test_bubble_compare_keeps_will_swap() -> None:
    """冒泡的比较直接决定是否交换，必须保留 will_swap。"""
    trace = _trace("bubble", [5, 3, 8, 1])
    compares = [event for event in trace.events if event.event_type == "compare"]
    assert compares
    for event in compares:
        comparison = event.auxiliary_state.comparison
        assert comparison is not None
        assert isinstance(comparison.will_swap, bool)


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_order_never_repeats_ids_and_has_at_most_one_hole(algorithm_id: str) -> None:
    """协议 §3.1：同一 order 中 item id 至多一次、空槽至多一个；values 同步为 null。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    for state in trace.states:
        ids = [item_id for item_id in state.order if item_id is not None]
        assert len(ids) == len(set(ids)), (algorithm_id, state.state_id)
        assert len(state.order) - len(ids) <= 1
        for item_id, value in zip(state.order, state.values, strict=True):
            assert (item_id is None) == (value is None)
    assert all(item_id is not None for item_id in trace.states[-1].order)


@pytest.mark.parametrize("algorithm_id", ["insertion", "shell"])
def test_insertion_and_shell_use_a_single_null_hole(algorithm_id: str) -> None:
    """插入/希尔抽牌右移期间必须出现且只出现一个 null 空槽，done 前补全。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    hole_states = [
        state for state in trace.states if any(item_id is None for item_id in state.order)
    ]
    assert hole_states
    for state in hole_states:
        assert sum(1 for item_id in state.order if item_id is None) == 1
    assert all(item_id is not None for item_id in trace.states[-1].order)


@pytest.mark.parametrize("algorithm_id", ["bubble", "selection", "merge", "quick", "heap"])
def test_non_insertion_algorithms_are_always_full_permutations(algorithm_id: str) -> None:
    """除插入/希尔外，主数组主柱图不需要空槽：每一帧都是完整排列。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    for state in trace.states:
        assert all(item_id is not None for item_id in state.order)
        assert len(set(state.order)) == len(state.order)


def test_bubble_aux_keeps_protocol_fields() -> None:
    """冒泡沿用协议 §3.4：三个固定字段 + compare 事件的 comparison。"""
    trace = _trace("bubble", [5, 3, 8, 1])
    for event in trace.events:
        payload = _aux_payload(event)
        assert {"pass_index", "early_exit_enabled", "swapped_in_pass"} <= set(payload)
        if event.event_type == "compare":
            assert payload["comparison"]["relation"] in {"gt", "lt", "eq"}
        else:
            assert "comparison" not in payload


def test_aux_field_values_have_expected_types() -> None:
    """抽查各算法关键字段的类型（前端 AuxPanel 依赖这些字段）。"""
    selection_aux = _aux_payload(_trace("selection", [5, 3, 8, 1]).events[0])
    assert isinstance(selection_aux["min_index"], int)
    assert isinstance(selection_aux["scan_from"], int)
    assert isinstance(selection_aux["scan_to"], int)
    assert isinstance(selection_aux["finalized_before"], list)

    insertion_aux = _aux_payload(_trace("insertion", [5, 3, 8, 1]).events[0])
    assert isinstance(insertion_aux["shifting"], bool)
    assert isinstance(insertion_aux["key_index"], int)
    assert isinstance(insertion_aux["hole_index"], int)
    assert isinstance(insertion_aux["sorted_to"], int)

    shell_aux = _aux_payload(_trace("shell", [5, 3, 8, 1]).events[0])
    assert isinstance(shell_aux["gap"], int)
    assert isinstance(shell_aux["groups"], list)
    assert all(
        isinstance(group, list) and all(isinstance(index, int) for index in group)
        for group in shell_aux["groups"]
    )

    merge_trace = _trace("merge", [5, 3, 8, 1])
    merge_aux = _aux_payload(merge_trace.events[0])
    for field in ("left", "mid", "right", "depth", "left_ptr", "right_ptr", "buffer_index"):
        assert isinstance(merge_aux[field], int)
    assert isinstance(merge_aux["writing_back"], bool)
    assert isinstance(merge_aux["buffer"], list)

    quick_aux = _aux_payload(_trace("quick", [5, 3, 8, 1]).events[0])
    assert quick_aux["phase"] in {"compare", "partition", "placed"}
    assert isinstance(quick_aux["low"], int)
    assert isinstance(quick_aux["high"], int)
    assert isinstance(quick_aux["partition_index"], int)

    heap_trace = _trace("heap", [5, 3, 8, 1])
    heap_phases = {_aux_payload(event)["phase"] for event in heap_trace.events}
    assert "build" in heap_phases
    assert "extract" in heap_phases or "sift_down" in heap_phases
    for event in heap_trace.events:
        payload = _aux_payload(event)
        for field in ("heap_size", "node_index", "parent_index", "left_child", "right_child"):
            assert isinstance(payload[field], int)
        assert payload["phase"] in {"build", "extract", "sift_down"}


# --------------------------------------------------------------------- 事件覆盖


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_expected_event_types_are_covered(algorithm_id: str) -> None:
    """每种算法必须产生设计文档规定的事件类型集合。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    assert {event.event_type for event in trace.events} == _EXPECTED_EVENT_TYPES[algorithm_id]


@pytest.mark.parametrize("algorithm_id", NEW_ALGORITHM_IDS)
def test_rounds_and_finalized_are_reported(algorithm_id: str) -> None:
    """除归并（分治，无轮次概念）外都至少上报 1 轮；末事件 finalized 覆盖全部。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1, 9, 2])
    if algorithm_id == "merge":
        assert trace.summary.passes == 0
    else:
        assert trace.summary.passes >= 1
    assert sorted(trace.events[-1].finalized_indices) == list(range(6))


# --------------------------------------------------------------------- 稳定性


@pytest.mark.parametrize("algorithm_id", ["insertion", "merge"])
def test_stable_algorithms_keep_equal_elements_in_original_order(
    algorithm_id: str,
) -> None:
    """插入/归并稳定：数值相同时，原始下标小的元素必须排在前面。"""
    trace = _trace(algorithm_id, [3, 1, 3, 2, 3, 1])
    final_order = trace.summary.final_order
    final_values = trace.summary.final_values
    original_indices = [int(item_id.split("-")[1]) for item_id in final_order]
    for earlier in range(len(final_values)):
        for later in range(earlier + 1, len(final_values)):
            if final_values[earlier] == final_values[later]:
                assert original_indices[earlier] < original_indices[later]


# ------------------------------------------------------------- 代码行引用与解释


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_code_line_ids_reference_rendered_function_lines(algorithm_id: str) -> None:
    """每个事件的 code_line_ids 必须能在 code.lines 中解析；行号与 line_id 一致。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1])
    known = {line.line_id for line in trace.code.lines}
    for line in trace.code.lines:
        assert line.line_id == f"L{line.lineno}"
        assert "#" not in line.text
    assert trace.code.lines[0].text.lstrip().startswith("def ")
    assert "return" in trace.code.lines[-1].text
    for event in trace.events:
        assert event.code_line_ids
        assert set(event.code_line_ids) <= known


@pytest.mark.parametrize("algorithm_id", ALGORITHM_IDS)
def test_explanations_are_bilingual(algorithm_id: str) -> None:
    """每个事件的解释都必须同时有繁体中文与英文，且模板 key 稳定非空。"""
    trace = _trace(algorithm_id, [5, 3, 8, 1])
    for event in trace.events:
        explanation = event.explanation
        assert explanation.key
        assert explanation.key.startswith(f"{algorithm_id}.")
        assert explanation.zh_hant
        assert explanation.en
        offending = _SIMPLIFIED_CHARS.intersection(explanation.zh_hant)
        assert not offending, (algorithm_id, event.step_id, offending)
