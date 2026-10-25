"""冒泡排序轨迹的后端测试：正确性、确定性、链式不变量、指标与代码行映射。"""

from __future__ import annotations

import ast
import inspect
from collections.abc import Sequence
from itertools import pairwise

import pytest

from backend.app.algorithms import bubble as bubble_module
from backend.app.algorithms.bubble import bubble_sort
from backend.app.schemas.trace import TraceResponse
from backend.app.services.trace_service import TraceValidationError, build_bubble_trace
from backend.app.trace.line_map import BUBBLE_LINE_MAP
from backend.app.trace.recorder import EventType, Item, TraceLimitError, TraceRecorder

# 契约 §5 第 3 条 + 阶段 4.8 切片：目标行必须是指定的 AST 节点类型。
# ``done`` 的目标行会被改映射到核心循环展示范围内最后一个语句（不再是 return）。
_EXPECTED_TARGET_NODES: dict[str, type[ast.stmt]] = {
    "compare": ast.If,
    "swap": ast.Assign,
    "mark_sorted": ast.For,
}


def _trace(
    values: Sequence[int],
    direction: str = "asc",
    early_exit: bool = True,
) -> TraceResponse:
    """通过服务层真实执行一次并拿到完整响应。"""
    return build_bubble_trace(values=values, direction=direction, early_exit=early_exit)


def _module_tree() -> ast.Module:
    """独立重新解析实际执行的模块源码，用于核对行映射。"""
    return ast.parse(inspect.getsource(bubble_module))


# --------------------------------------------------------------------- 正确性


@pytest.mark.parametrize(
    "values",
    [
        [2, 1],
        [5, 3, 8, 1],
        [4, 4, 2, 2, 1],
        [1, 2, 3, 4, 5],
        [5, 4, 3, 2, 1],
        [-5, 0, 5, -1000, 1000],
        [7, 7, 7, 7],
        [0, 0],
        [1000, -1000],
        list(range(30)),
    ],
)
def test_ascending_result_matches_python_sorted(values: list[int]) -> None:
    """升序最终结果必须与 sorted() 参照一致（sorted 只作参照，不参与轨迹）。"""
    assert _trace(values).summary.final_values == sorted(values)


@pytest.mark.parametrize("values", [[3, 1, 2], [5, 3, 8, 1], [-2, 0, 0, 9]])
def test_descending_result_matches_python_sorted(values: list[int]) -> None:
    """降序最终结果必须与 sorted(reverse=True) 参照一致。"""
    assert _trace(values, direction="desc").summary.final_values == sorted(values, reverse=True)


def test_algorithm_works_without_tracer() -> None:
    """不传 tracer 时纯算法路径仍然正确，且允许空数组与单元素。"""
    assert bubble_sort([3, 1, 2]) == [1, 2, 3]
    assert bubble_sort([3, 1, 2], direction="desc") == [3, 2, 1]
    assert bubble_sort([]) == []
    assert bubble_sort([5]) == [5]


# --------------------------------------------------------------------- 确定性


def test_same_input_and_options_produce_identical_response() -> None:
    """同一输入 + 同一参数必须得到完全相同的响应（无随机、无时间戳）。"""
    first = _trace([5, 3, 8, 1]).model_dump(mode="json", by_alias=True, exclude_none=True)
    second = _trace([5, 3, 8, 1]).model_dump(mode="json", by_alias=True, exclude_none=True)
    assert first == second


# --------------------------------------------------------------- 快照与链式不变量


@pytest.mark.parametrize(
    ("values", "direction"),
    [
        ([5, 3, 8, 1], "asc"),
        ([5, 3, 8, 1], "desc"),
        ([1, 2, 3], "asc"),
        ([2, 1, 3, 2], "desc"),
        ([2, 1], "asc"),
    ],
)
def test_state_chain_is_consistent(values: list[int], direction: str) -> None:
    """states[0] 是输入；相邻事件 state_after_id 链自洽；交换必须能还原前后状态。"""
    trace = _trace(values, direction=direction)

    assert trace.states[0].order == [f"it-{index}" for index in range(len(values))]
    assert trace.states[0].values == values
    assert trace.states[-1].values == trace.summary.final_values
    assert trace.states[-1].values == sorted(values, reverse=direction == "desc")

    for previous, current in pairwise(trace.events):
        assert current.state_before_id == previous.state_after_id

    for event in trace.events:
        before = trace.states[event.state_before_id].values
        after = trace.states[event.state_after_id].values
        if event.event_type == "compare":
            assert before == after
        elif event.event_type == "swap":
            assert before != after
            assert len(event.modified_indices) == 2

    assert trace.summary.state_count == len(trace.states)
    assert trace.summary.event_count == len(trace.events)
    assert trace.events[-1].finalized_indices == list(range(len(values)))


# --------------------------------------------------------------------- 指标


def test_metrics_match_event_counts() -> None:
    """comparisons/swaps/writes 必须与事件序列自洽，且单调不减。"""
    trace = _trace([5, 3, 8, 1])
    comparisons = sum(1 for event in trace.events if event.event_type == "compare")
    swaps = sum(1 for event in trace.events if event.event_type == "swap")
    assert trace.summary.comparisons == comparisons
    assert trace.summary.swaps == swaps
    assert trace.summary.writes == 2 * swaps

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


# --------------------------------------------------------------- 提前结束优化


def test_early_exit_stops_after_one_pass_for_sorted_input() -> None:
    """已排序输入开启 early_exit 时只跑一轮，且只做 n-1 次比较。"""
    trace = _trace([1, 2, 3, 4, 5], early_exit=True)
    assert trace.summary.passes == 1
    assert trace.summary.comparisons == 4
    assert trace.summary.swaps == 0
    assert trace.summary.early_exit_triggered is True
    assert [event.event_type for event in trace.events] == [
        "mark_sorted",
        "compare",
        "compare",
        "compare",
        "compare",
        "done",
    ]


def test_without_early_exit_runs_all_passes() -> None:
    """关闭 early_exit 时已排序输入仍跑满 n-1 轮。"""
    trace = _trace([1, 2, 3, 4, 5], early_exit=False)
    assert trace.summary.passes == 4
    assert trace.summary.comparisons == 10
    assert trace.summary.early_exit_triggered is False


def test_all_bubble_event_types_are_covered() -> None:
    """冒泡排序会产生的 4 种事件类型都要在真实轨迹中出现。"""
    trace = _trace([3, 1, 2])
    assert {event.event_type for event in trace.events} == {
        "compare",
        "swap",
        "mark_sorted",
        "done",
    }


def test_mark_sorted_finalized_excludes_current_pass() -> None:
    """进入第 i+1 轮时，finalized_indices 只包含前 i 轮已就位的末尾元素。"""
    values = [5, 3, 8, 1, 2]
    trace = _trace(values, early_exit=False)
    marks = [event for event in trace.events if event.event_type == "mark_sorted"]
    assert len(marks) == len(values) - 1
    for index, mark in enumerate(marks):
        assert mark.finalized_indices == list(range(len(values) - index, len(values)))


# ------------------------------------------------------------ 比较辅助状态


@pytest.mark.parametrize(("direction", "expected_swap_when"), [("asc", "gt"), ("desc", "lt")])
def test_compare_auxiliary_matches_real_comparison(
    direction: str,
    expected_swap_when: str,
) -> None:
    """relation / will_swap 必须由真实比较得出，并与下一个事件（是否交换）一致。"""
    trace = _trace([4, 2, 3, 1], direction=direction, early_exit=False)
    for index, event in enumerate(trace.events):
        if event.event_type != "compare":
            continue
        comparison = event.auxiliary_state.comparison
        assert comparison is not None
        values = trace.states[event.state_before_id].values
        left = values[event.active_indices[0]]
        right = values[event.active_indices[1]]
        assert (comparison.left, comparison.right) == (left, right)
        expected_relation = "gt" if left > right else "lt" if left < right else "eq"
        assert comparison.relation == expected_relation
        assert comparison.will_swap == (expected_relation == expected_swap_when)
        next_event = trace.events[index + 1]
        if comparison.will_swap:
            assert next_event.event_type == "swap"
            assert next_event.active_indices == event.active_indices


# --------------------------------------------------------------------- 解释文案


def test_explanations_are_bilingual_with_stable_keys() -> None:
    """每个事件的 key / zh-Hant / en 都非空，且模板键覆盖各分支。"""
    trace = _trace([5, 3, 8, 1])
    keys = set()
    for event in trace.events:
        assert event.explanation.key
        assert event.explanation.zh_hant
        assert event.explanation.en
        keys.add(event.explanation.key)
    assert keys == {
        "bubble.compare.asc.swap",
        "bubble.compare.asc.keep",
        "bubble.swap.asc",
        "bubble.mark_sorted.start",
        "bubble.mark_sorted.progress",
        "bubble.done.complete",
    }

    first_compare = next(event for event in trace.events if event.event_type == "compare")
    comparison = first_compare.auxiliary_state.comparison
    assert comparison is not None
    assert str(comparison.left) in first_compare.explanation.zh_hant
    assert str(comparison.right) in first_compare.explanation.en


def test_early_exit_uses_early_exit_explanation() -> None:
    trace = _trace([1, 2, 3], early_exit=True)
    done = trace.events[-1]
    assert done.explanation.key == "bubble.done.early_exit"
    assert "1" in done.explanation.zh_hant
    assert "Total passes: 1" in done.explanation.en


def test_descending_compare_explanations_use_desc_keys() -> None:
    trace = _trace([1, 3, 2, 4], direction="desc")
    compare_keys = {
        event.explanation.key for event in trace.events if event.event_type == "compare"
    }
    assert compare_keys
    assert all(key.startswith("bubble.compare.desc.") for key in compare_keys)


# --------------------------------------------------------------------- 代码行映射


def test_line_map_targets_have_expected_ast_nodes() -> None:
    """独立校验：compare→If、swap→Assign、mark_sorted→For；done 不再映射到 return。"""
    tree = _module_tree()
    statements = [node for node in ast.walk(tree) if isinstance(node, ast.stmt)]
    event_types = {mapping.event_type for mapping in BUBBLE_LINE_MAP.mappings}
    assert event_types == _EXPECTED_TARGET_NODES.keys() | {"done"}
    for mapping in BUBBLE_LINE_MAP.mappings:
        matching = [node for node in statements if node.lineno == mapping.target_lineno]
        if mapping.event_type == "done":
            assert not any(isinstance(node, ast.Return) for node in matching), mapping
            assert any(
                line.lineno == mapping.target_lineno for line in BUBBLE_LINE_MAP.lines
            )
            continue
        expected = _EXPECTED_TARGET_NODES[mapping.event_type]
        assert any(isinstance(node, expected) for node in matching), mapping


def test_line_map_fails_fast_when_instrumentation_drifts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """源码里没有插桩时必须在建图阶段抛 LineMapError，而不是带着空映射运行。"""
    import backend.app.trace.line_map as line_map_module

    monkeypatch.setattr(
        line_map_module,
        "_load_module_source_lines",
        lambda module: ["def broken():\n", "    return 1\n"],
    )
    with pytest.raises(line_map_module.LineMapError):
        line_map_module.build_bubble_line_map()


def test_swap_target_is_the_swap_assignment_not_the_flag_assignment() -> None:
    """swap 的目标行必须是元组解包交换赋值，而不是紧随其后的 swapped = True。"""
    tree = _module_tree()
    swap_mapping = next(
        mapping for mapping in BUBBLE_LINE_MAP.mappings if mapping.event_type == "swap"
    )
    assignments = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign) and node.lineno == swap_mapping.target_lineno
    ]
    assert len(assignments) == 1
    assert isinstance(assignments[0].targets[0], ast.Tuple)


def test_code_lines_come_from_real_executed_function_source() -> None:
    """code.lines 只展示核心循环切片，且去掉注释/文档字符串（学生界面不允许简体）。

    阶段 4.8：不下发函数签名、数组复制/长度初始化与 return；冒泡目标约 8–10 行。
    但行号仍是模块绝对行号，事件 ``code_line_ids`` 必须仍能解析。
    """
    trace = _trace([3, 1, 2])
    module_lines = inspect.getsource(bubble_module).splitlines()

    # 冒泡核心循环切片：外层 for、内层 for、if 比较、交换、early_exit 判断、
    # 各 emit 行与 done 行（trace 行可折叠）。
    assert 8 <= len(trace.code.lines) <= 10
    first = trace.code.lines[0]
    last = trace.code.lines[-1]
    assert first.text.lstrip().startswith("for i in range(n - 1):")
    assert last.text.lstrip().startswith("recorder.emit_done(")
    assert last.kind == "trace"
    assert not any(line.text.lstrip().startswith("def ") for line in trace.code.lines)
    assert not any("return" in line.text for line in trace.code.lines)
    assert not any(
        line.text.lstrip().startswith("arr = list(values)") for line in trace.code.lines
    )

    line_ids = set()
    for line in trace.code.lines:
        assert line.line_id == f"L{line.lineno}"
        # 不含注释与文档字符串
        assert "#" not in line.text
        assert '"""' not in line.text
        # 可执行部分必须与真实源码一致（去掉注释后）
        original = module_lines[line.lineno - 1]
        if line.text.strip():
            assert original.startswith(line.text.rstrip())
        line_ids.add(line.line_id)

    trace_linenos = {line.lineno for line in trace.code.lines if line.kind == "trace"}
    assert trace_linenos == {mapping.emit_lineno for mapping in BUBBLE_LINE_MAP.mappings}

    expected_groups = {
        mapping.event_type: (f"L{mapping.emit_lineno}", f"L{mapping.target_lineno}")
        for mapping in BUBBLE_LINE_MAP.mappings
    }
    for event in trace.events:
        assert event.code_line_ids == list(expected_groups[event.event_type])
        assert all(line_id in line_ids for line_id in event.code_line_ids)


# --------------------------------------------------------------------- 记录器


def test_recorder_write_event_counts_as_write_not_swap() -> None:
    """write 事件只增加 writes，不增加 swaps（协议 §3.2）。"""
    line_groups: dict[EventType, tuple[int, int]] = {
        "mark_sorted": (1, 2),
        "write": (3, 4),
    }
    recorder = TraceRecorder(
        [Item(id="it-0", value=3), Item(id="it-1", value=1)],
        direction="asc",
        early_exit=True,
        line_groups=line_groups,
    )
    recorder.emit_mark_sorted(pass_index=0)
    recorder.emit_write(index=0, item_id="it-1", pass_index=0)

    assert [event.event_type for event in recorder.events] == ["mark_sorted", "write"]
    write_event = recorder.events[-1]
    assert write_event.metrics.writes == 1
    assert write_event.metrics.swaps == 0
    assert write_event.modified_indices == (0,)
    assert recorder.final_order == ("it-1", "it-0")


def test_recorder_raises_when_event_limit_exceeded() -> None:
    """事件总数超过上限时抛 TraceLimitError，而不是悄悄截断。"""
    line_groups: dict[EventType, tuple[int, int]] = {"compare": (1, 2)}
    recorder = TraceRecorder(
        [Item(id="it-0", value=2), Item(id="it-1", value=1)],
        direction="asc",
        early_exit=True,
        line_groups=line_groups,
        max_events=1,
    )
    recorder.emit_compare(i=0, j=1, pass_index=0)
    with pytest.raises(TraceLimitError):
        recorder.emit_compare(i=0, j=1, pass_index=0)


# --------------------------------------------------------------- 服务层校验


def test_service_rejects_invalid_values() -> None:
    """服务层自身也做输入校验（不依赖 API 层的 Pydantic）。"""
    with pytest.raises(TraceValidationError):
        build_bubble_trace(values=[1], direction="asc", early_exit=True)
    with pytest.raises(TraceValidationError):
        build_bubble_trace(values=[1001, 0], direction="asc", early_exit=True)
    with pytest.raises(TraceValidationError):
        build_bubble_trace(values=[1, 2], direction="up", early_exit=True)
