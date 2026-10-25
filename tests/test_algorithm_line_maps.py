"""阶段 4.8 算法行映射测试：只展示核心循环区段、去注释/文档串、目标行 AST 类型。"""

from __future__ import annotations

import ast
import inspect
from types import ModuleType

import pytest

from backend.app.algorithms.registry import ALGORITHMS, AlgorithmSpec
from backend.app.trace.line_map import LineMapError, build_line_map

# 设计文档 §2：每种事件的目标行允许的 AST 节点类型（done 的目标行会被改映射到
# 展示范围内的最后一个核心语句行，因此单独校验）。
_EXPECTED_TARGET_TYPES: dict[str, tuple[type[ast.stmt], ...]] = {
    "compare": (ast.If, ast.While),
    "swap": (ast.Assign,),
    "write": (ast.Assign,),
    "select": (ast.Assign,),
    "partition": (ast.AugAssign, ast.Assign),
    "merge": (ast.While, ast.For, ast.If, ast.Assign),
    "mark_sorted": (ast.For, ast.While),
}

# 核心循环切片后的期望行数区间（含 trace 行；冒泡目标 8–10 行）。
_EXPECTED_LINE_COUNTS: dict[str, tuple[int, int]] = {
    "bubble": (8, 12),
    "selection": (8, 16),
    "insertion": (8, 16),
    "shell": (9, 18),
    "merge": (8, 16),
    "quick": (9, 20),
    "heap": (9, 20),
}


def _specs() -> list[AlgorithmSpec]:
    return list(ALGORITHMS.values())


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_code_lines_only_contain_core_loop_slice(algorithm_id: str) -> None:
    """code.lines 只含核心循环区段：不含 def/return，首行是循环语句。"""
    spec = ALGORITHMS[algorithm_id]
    lines = spec.line_map.lines
    function_lines, function_start = inspect.getsourcelines(spec.function)
    function_end = function_start + len(function_lines) - 1

    assert lines
    linenos = [line.lineno for line in lines]
    assert linenos == sorted(set(linenos))
    assert all(function_start < lineno <= function_end for lineno in linenos)
    assert not any(line.text.lstrip().startswith("def ") for line in lines)
    assert not any("return" in line.text for line in lines)
    assert lines[0].text.lstrip().startswith(("for ", "while "))
    assert lines[-1].text.lstrip().startswith("recorder.emit_done(")
    assert lines[-1].kind == "trace"

    minimum, maximum = _EXPECTED_LINE_COUNTS[algorithm_id]
    assert minimum <= len(lines) <= maximum, (algorithm_id, len(lines))

    for line in lines:
        # 学生界面不允许出现源码注释（内部注释是简体中文）
        assert "#" not in line.text
        assert '"""' not in line.text
        assert not line.text.lstrip().startswith(("from ", "import "))
        assert line.kind in {"normal", "trace"}
    assert any(line.kind == "trace" for line in lines)


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_line_map_text_matches_real_module_source(algorithm_id: str) -> None:
    """展示文本必须是真实模块源码去掉注释后的前缀（不允许第二份手写源码）。"""
    spec = ALGORITHMS[algorithm_id]
    module_lines = inspect.getsource(spec.module).splitlines()
    for line in spec.line_map.lines:
        if not line.text.strip():
            continue
        original = module_lines[line.lineno - 1]
        assert original.startswith(line.text.rstrip()), (line.lineno, line.text, original)


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_line_map_targets_have_expected_ast_types(algorithm_id: str) -> None:
    """独立重新解析模块源码，按设计文档 §2 校验目标行的 AST 节点类型。"""
    spec = ALGORITHMS[algorithm_id]
    tree = ast.parse(inspect.getsource(spec.module))
    statements = [node for node in ast.walk(tree) if isinstance(node, ast.stmt)]
    line_linenos = {line.lineno for line in spec.line_map.lines}
    for mapping in spec.line_map.mappings:
        matching = [node for node in statements if node.lineno == mapping.target_lineno]
        emit_nodes = [node for node in statements if node.lineno == mapping.emit_lineno]
        if mapping.event_type == "done":
            # done 的目标行被改映射到展示范围内最后一个核心语句（非 return）。
            assert mapping.target_lineno in line_linenos
            assert mapping.target_lineno < mapping.emit_lineno
            assert not any(isinstance(node, ast.Return) for node in matching)
        else:
            expected = _EXPECTED_TARGET_TYPES[mapping.event_type]
            assert any(isinstance(node, expected) for node in matching), mapping
        assert any(isinstance(node, ast.Expr) for node in emit_nodes), mapping


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_line_map_sites_and_groups_are_consistent(algorithm_id: str) -> None:
    """同类型插桩的调用点序号唯一；所有引用行都落在展示范围内。"""
    spec = ALGORITHMS[algorithm_id]
    groups = spec.line_map.line_groups
    assert len(groups) == len(spec.line_map.mappings)
    line_linenos = {line.lineno for line in spec.line_map.lines}
    for (event_type, site), group in groups.items():
        assert isinstance(event_type, str) and event_type
        assert site >= 0
        assert len(group) == 2
        assert group[0] != group[1]
        assert set(group) <= line_linenos


def test_build_line_map_fails_fast_when_emit_has_no_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """插桩调用找不到目标语句时，建图阶段必须抛 LineMapError（导入期失败）。"""
    import backend.app.trace.line_map as line_map_module

    source_lines = [
        "def broken(x):\n",
        "    recorder.emit_compare(i=0, j=1)\n",
    ]

    def _fake_getsourcelines(obj: object) -> tuple[list[str], int]:
        return list(source_lines), 1

    def _fake_load_source(module: ModuleType) -> list[str]:
        return [line.rstrip("\n") for line in source_lines]

    def broken(x: int) -> int:
        return x

    monkeypatch.setattr(inspect, "getsourcelines", _fake_getsourcelines)
    monkeypatch.setattr(line_map_module, "_load_module_source_lines", _fake_load_source)
    fake_module = ModuleType("fake_broken_module")

    with pytest.raises(LineMapError):
        build_line_map(fake_module, broken)


def test_build_line_map_fails_fast_when_function_has_no_instrumentation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """函数内完全没有插桩时也必须导入期失败，而不是下发空代码面板。"""
    import backend.app.trace.line_map as line_map_module

    source_lines = [
        "def broken(x):\n",
        "    total = x + 1\n",
        "    return total\n",
    ]

    def _fake_getsourcelines(obj: object) -> tuple[list[str], int]:
        return list(source_lines), 1

    def _fake_load_source(module: ModuleType) -> list[str]:
        return [line.rstrip("\n") for line in source_lines]

    def broken(x: int) -> int:
        return x

    monkeypatch.setattr(inspect, "getsourcelines", _fake_getsourcelines)
    monkeypatch.setattr(line_map_module, "_load_module_source_lines", _fake_load_source)
    fake_module = ModuleType("fake_empty_module")

    with pytest.raises(LineMapError):
        build_line_map(fake_module, broken)
