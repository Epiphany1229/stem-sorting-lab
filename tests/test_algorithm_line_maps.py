"""阶段 5 算法行映射测试：只展示函数本体、去注释/文档串、目标行 AST 类型。"""

from __future__ import annotations

import ast
import inspect
from types import ModuleType

import pytest

from backend.app.algorithms.registry import ALGORITHMS, AlgorithmSpec
from backend.app.trace.line_map import LineMapError, build_line_map

# 设计文档 §2：每种事件的目标行允许的 AST 节点类型。
_EXPECTED_TARGET_TYPES: dict[str, tuple[type[ast.stmt], ...]] = {
    "compare": (ast.If, ast.While),
    "swap": (ast.Assign,),
    "write": (ast.Assign,),
    "select": (ast.Assign,),
    "partition": (ast.AugAssign, ast.Assign),
    "merge": (ast.While, ast.For, ast.If, ast.Assign),
    "mark_sorted": (ast.For, ast.While),
    "done": (ast.Return,),
}


def _specs() -> list[AlgorithmSpec]:
    return list(ALGORITHMS.values())


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_line_map_only_contains_function_body(algorithm_id: str) -> None:
    """code.lines 只含函数本体、去注释/文档串、行号是模块绝对行号。"""
    spec = ALGORITHMS[algorithm_id]
    lines = spec.line_map.lines
    function_lines, function_start = inspect.getsourcelines(spec.function)
    function_end = function_start + len(function_lines) - 1

    assert lines[0].lineno == function_start
    assert lines[-1].lineno == function_end
    assert [line.lineno for line in lines] == list(
        range(function_start, function_end + 1)
    )
    assert lines[0].text.lstrip().startswith("def ")

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
    for mapping in spec.line_map.mappings:
        expected = _EXPECTED_TARGET_TYPES[mapping.event_type]
        matching = [node for node in statements if node.lineno == mapping.target_lineno]
        assert any(isinstance(node, expected) for node in matching), mapping
        emit_nodes = [node for node in statements if node.lineno == mapping.emit_lineno]
        assert any(isinstance(node, ast.Expr) for node in emit_nodes), mapping


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_line_map_sites_and_groups_are_consistent(algorithm_id: str) -> None:
    """同类型插桩的调用点序号唯一，且插桩行与目标行不同。"""
    spec = ALGORITHMS[algorithm_id]
    groups = spec.line_map.line_groups
    assert len(groups) == len(spec.line_map.mappings)
    for (event_type, site), group in groups.items():
        assert isinstance(event_type, str) and event_type
        assert site >= 0
        assert len(group) == 2
        assert group[0] != group[1]


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
