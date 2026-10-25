"""代码行映射：用 ``inspect`` + AST 把插桩调用解析成“插桩行 + 目标语义行”。

映射规则见 docs/trace-protocol.md §5（方向必须与规则表一致）：

- ``emit_compare`` 在比较语句**之前**，映射到**下一条**同块语句（``if`` 行）；
- ``emit_swap`` 在交换赋值**之后**，映射到**上一条**同块语句（交换赋值行）；
- ``emit_mark_sorted`` 是每轮循环体第一句，映射到**所在 for 语句**行；
- ``emit_done`` 在 ``return`` **之前**，映射到**下一条**语句（``return`` 行）。

映射在模块导入期建立：任何一处插桩漂移都会立刻抛 ``LineMapError``，
避免服务带着错误的行映射启动。
"""

from __future__ import annotations

import ast
import inspect
import io
import tokenize
from dataclasses import dataclass

from backend.app.algorithms import bubble as bubble_module
from backend.app.schemas.trace import LineKind
from backend.app.trace.recorder import EventType

# 插桩调用属性名 → 协议事件类型。
_EMIT_EVENT_TYPES: dict[str, EventType] = {
    "emit_compare": "compare",
    "emit_swap": "swap",
    "emit_mark_sorted": "mark_sorted",
    "emit_done": "done",
}

# 每种事件映射到的目标语句必须符合的 AST 节点类型（契约 §5 第 3 条）。
_EXPECTED_TARGETS: dict[EventType, type[ast.stmt]] = {
    "compare": ast.If,
    "swap": ast.Assign,
    "mark_sorted": ast.For,
    "done": ast.Return,
}

# 固定的输出顺序，保证同一份源码每次得到完全一致的映射元组。
_EVENT_ORDER: tuple[EventType, ...] = ("compare", "swap", "mark_sorted", "done")


class LineMapError(RuntimeError):
    """插桩调用无法解析到预期的语义语句行（导入期即失败）。"""


@dataclass(frozen=True)
class SourceLine:
    """实际执行源码中的一行。"""

    lineno: int
    text: str
    kind: LineKind


@dataclass(frozen=True)
class LineMapping:
    """一条事件的代码行组：插桩行与目标语义行。"""

    event_type: EventType
    emit_lineno: int
    target_lineno: int


@dataclass(frozen=True)
class BubbleLineMap:
    """冒泡排序模块的所有源码行与插桩映射。"""

    lines: tuple[SourceLine, ...]
    mappings: tuple[LineMapping, ...]

    @property
    def line_groups(self) -> dict[EventType, tuple[int, int]]:
        """事件类型 → (插桩行, 目标语义行)，供 TraceRecorder 生成 code_line_ids。"""
        return {
            mapping.event_type: (mapping.emit_lineno, mapping.target_lineno)
            for mapping in self.mappings
        }


def _emit_event_type(stmt: ast.stmt) -> EventType | None:
    """若语句是 ``recorder.emit_*`` 调用，返回对应事件类型。"""
    if not isinstance(stmt, ast.Expr):
        return None
    call = stmt.value
    if not isinstance(call, ast.Call):
        return None
    func = call.func
    if not isinstance(func, ast.Attribute):
        return None
    return _EMIT_EVENT_TYPES.get(func.attr)


class _LineMapBuilder:
    """遍历 AST，按契约 §5 的规则表建立插桩映射。"""

    def __init__(self) -> None:
        self._mappings: dict[EventType, LineMapping] = {}

    def build(self, tree: ast.Module) -> tuple[LineMapping, ...]:
        self._visit_block(tree.body, enclosing_for=None)
        missing = [event_type for event_type in _EVENT_ORDER if event_type not in self._mappings]
        if missing:
            raise LineMapError(f"插桩映射不完整，缺少：{', '.join(missing)}")
        return tuple(self._mappings[event_type] for event_type in _EVENT_ORDER)

    def _visit_block(self, block: list[ast.stmt], *, enclosing_for: ast.For | None) -> None:
        for position, stmt in enumerate(block):
            event_type = _emit_event_type(stmt)
            if event_type is not None:
                self._register(
                    event_type=event_type,
                    emit_stmt=stmt,
                    block=block,
                    position=position,
                    enclosing_for=enclosing_for,
                )
            self._visit_statement(stmt, enclosing_for=enclosing_for)

    def _visit_statement(self, stmt: ast.stmt, *, enclosing_for: ast.For | None) -> None:
        inner_for = stmt if isinstance(stmt, ast.For) else enclosing_for
        # 只递归语句块字段；handlers 等非 stmt 列表与教学算法无关。
        for field_name in ("body", "orelse", "finalbody"):
            child_block = getattr(stmt, field_name, None)
            if isinstance(child_block, list):
                self._visit_block(child_block, enclosing_for=inner_for)

    def _register(
        self,
        *,
        event_type: EventType,
        emit_stmt: ast.stmt,
        block: list[ast.stmt],
        position: int,
        enclosing_for: ast.For | None,
    ) -> None:
        if event_type in self._mappings:
            raise LineMapError(f"{event_type} 存在重复插桩调用（第 {emit_stmt.lineno} 行）")
        if event_type == "mark_sorted":
            if enclosing_for is None:
                raise LineMapError("emit_mark_sorted 必须位于 for 循环体内")
            target: ast.stmt = enclosing_for
        elif event_type in ("compare", "done"):
            if position + 1 >= len(block):
                raise LineMapError(
                    f"{event_type} 插桩（第 {emit_stmt.lineno} 行）缺少下一条同块语句"
                )
            target = block[position + 1]
        else:
            if position == 0:
                raise LineMapError(
                    f"swap 插桩（第 {emit_stmt.lineno} 行）缺少上一条同块语句"
                )
            target = block[position - 1]
        expected = _EXPECTED_TARGETS[event_type]
        if not isinstance(target, expected):
            raise LineMapError(
                f"{event_type} 插桩（第 {emit_stmt.lineno} 行）映射到的第 {target.lineno} 行"
                f"应为 {expected.__name__}，实际为 {type(target).__name__}"
            )
        self._mappings[event_type] = LineMapping(
            event_type=event_type,
            emit_lineno=emit_stmt.lineno,
            target_lineno=target.lineno,
        )


def _load_source_lines() -> list[str]:
    """读取实际执行的冒泡排序模块源码（模块级从文件第 1 行开始，用于 AST 绝对行号）。"""
    source_lines, start_lineno = inspect.getsourcelines(bubble_module)
    if start_lineno != 0:
        raise LineMapError("冒泡排序模块的源码行号偏移异常，无法按模块行号建立映射")
    return [line.rstrip("\n") for line in source_lines]


def _load_function_line_range() -> tuple[int, int]:
    """返回 ``bubble_sort`` 函数在模块中的行号范围（闭区间）。

    学生只需要看到"被演示的这段算法函数"，不需要模块级 import/docstring。
    这里仍保留**模块绝对行号**，因此事件的 ``code_line_ids`` 与插桩映射不受影响。
    """
    function_lines, start_lineno = inspect.getsourcelines(bubble_module.bubble_sort)
    if start_lineno < 1 or not function_lines:
        raise LineMapError("无法定位冒泡排序函数的源码行范围")
    return start_lineno, start_lineno + len(function_lines) - 1


def _docstring_linenos(module_source: str) -> set[int]:
    """返回 ``bubble_sort`` 文档字符串占用的行号集合（展示时清空）。"""
    tree = ast.parse(module_source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "bubble_sort":
            body = node.body
            if body and isinstance(body[0], ast.Expr):
                value = body[0].value
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    start = body[0].lineno
                    end = getattr(body[0], "end_lineno", start) or start
                    return set(range(start, end + 1))
    return set()


def _comment_columns(module_source: str) -> dict[int, int]:
    """返回每一行行内注释的起始列（整行注释为 0）。"""
    columns: dict[int, int] = {}
    try:
        for token in tokenize.generate_tokens(io.StringIO(module_source).readline):
            if token.type == tokenize.COMMENT:
                columns[token.start[0]] = token.start[1]
    except tokenize.TokenError:
        return {}
    return columns


def _display_text(
    text: str,
    *,
    lineno: int,
    comment_columns: dict[int, int],
    docstring_linenos: set[int],
) -> str:
    """生成学生可见代码文本：去掉文档字符串与注释，只保留可执行代码。

    源码内部注释按项目约定使用简体中文；学生界面不允许出现简体，
    因此这里不展示注释，教学说明由后端的双语 ``explanation`` 承担。
    行号与行映射保持不变。
    """
    if lineno in docstring_linenos:
        return ""
    column = comment_columns.get(lineno)
    if column is None:
        return text
    return text[:column].rstrip()


def build_bubble_line_map() -> BubbleLineMap:
    """建立冒泡排序的源码行与插桩映射；失败即抛 LineMapError。"""
    source_lines = _load_source_lines()
    module_source = "\n".join(source_lines)
    tree = ast.parse(module_source)
    mappings = _LineMapBuilder().build(tree)
    emit_linenos = {mapping.emit_lineno for mapping in mappings}
    first_lineno, last_lineno = _load_function_line_range()
    comment_columns = _comment_columns(module_source)
    docstring_linenos = _docstring_linenos(module_source)
    lines = tuple(
        SourceLine(
            lineno=lineno,
            text=_display_text(
                text,
                lineno=lineno,
                comment_columns=comment_columns,
                docstring_linenos=docstring_linenos,
            ),
            kind="trace" if lineno in emit_linenos else "normal",
        )
        for lineno, text in enumerate(source_lines, start=1)
        if first_lineno <= lineno <= last_lineno
    )
    for mapping in mappings:
        for lineno in (mapping.emit_lineno, mapping.target_lineno):
            if not first_lineno <= lineno <= last_lineno:
                raise LineMapError(
                    f"{mapping.event_type} 的行映射（第 {lineno} 行）落在展示函数范围之外"
                )
    return BubbleLineMap(lines=lines, mappings=mappings)


# 导入期建立映射：失败会直接阻止应用启动，而不是带着错误映射运行。
BUBBLE_LINE_MAP = build_bubble_line_map()
