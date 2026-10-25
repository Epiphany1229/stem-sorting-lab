"""代码行映射：用 ``inspect`` + AST 把插桩调用解析成“插桩行 + 目标语义行”。

映射规则见 docs/trace-protocol.md §5（方向必须与规则表一致）：

- ``emit_compare`` 在比较语句**之前**，映射到**下一条**同块语句（``if``/``while`` 行）；
- ``emit_swap`` / ``emit_write*`` 在赋值**之后**，映射到**上一条**同块语句（赋值行）；
- ``emit_select`` / ``emit_partition`` / ``emit_merge`` 在语义语句之前，映射到**下一条**同块语句；
- ``emit_mark_sorted`` 映射到**最近一层 for/while** 语句行；
- ``emit_done`` 在 ``return`` **之前**，映射到**下一条**语句（``return`` 行）。

阶段 4.8 起，``code.lines`` 只下发**核心循环区段**：以所有插桩行/目标行为基准，
向上扩展到最外层包住这些行的 for/while 头，向下扩展到最后一个插桩/目标行
（含 early_exit 的 if/break），并剔除函数签名、数组复制/长度初始化与 ``return``。
``done`` 的目标行会改映射到范围内最后一个核心语句行，保证所有 ``code_line_ids``
都能在 ``code.lines`` 中解析；任何越界都在导入期抛 ``LineMapError``。
"""

from __future__ import annotations

import ast
import inspect
import io
import tokenize
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from types import ModuleType

from backend.app.algorithms import bubble as bubble_module
from backend.app.schemas.trace import LineKind
from backend.app.trace.recorder import EventType


class LineMapError(RuntimeError):
    """插桩调用无法解析到预期的语义语句行（导入期即失败）。"""


@dataclass(frozen=True)
class SourceLine:
    """实际执行源码中的一行（只包含核心循环区段）。"""

    lineno: int
    text: str
    kind: LineKind


@dataclass(frozen=True)
class LineMapping:
    """一条事件的代码行组：插桩行与目标语义行。"""

    event_type: EventType
    emit_lineno: int
    target_lineno: int
    # 同类型插桩的调用点序号（0 起）：阶段 2 的冒泡每种事件只有一个调用点
    site: int = 0


@dataclass(frozen=True)
class BubbleLineMap:
    """冒泡排序模块的核心循环行与插桩映射（阶段 2 兼容入口）。"""

    lines: tuple[SourceLine, ...]
    mappings: tuple[LineMapping, ...]

    @property
    def line_groups(self) -> dict[EventType, tuple[int, int]]:
        """事件类型 → (插桩行, 目标语义行)，供 TraceRecorder 生成 code_line_ids。"""
        return {
            mapping.event_type: (mapping.emit_lineno, mapping.target_lineno)
            for mapping in self.mappings
        }


@dataclass(frozen=True)
class AlgorithmLineMap:
    """阶段 5 算法函数的核心循环行与插桩映射（行号为模块绝对行号）。"""

    lines: tuple[SourceLine, ...]
    mappings: tuple[LineMapping, ...]

    @property
    def line_groups(self) -> dict[tuple[EventType, int], tuple[int, int]]:
        """(事件类型, 调用点序号) → (插桩行, 目标语义行)。"""
        return {
            (mapping.event_type, mapping.site): (
                mapping.emit_lineno,
                mapping.target_lineno,
            )
            for mapping in self.mappings
        }


# 插桩调用属性名 → 协议事件类型（阶段 5 新增 write 变体 / select / partition / merge）。
_EMIT_EVENT_TYPES: dict[str, EventType] = {
    "emit_compare": "compare",
    "emit_swap": "swap",
    "emit_write": "write",
    "emit_write_shift": "write",
    "emit_write_place": "write",
    "emit_write_buffer": "write",
    "emit_write_assign": "write",
    "emit_select": "select",
    "emit_partition": "partition",
    "emit_merge": "merge",
    "emit_mark_sorted": "mark_sorted",
    "emit_done": "done",
}

# 映射方向：next = 下一条同块语句；prev = 上一条同块语句；loop = 最近的 for/while。
_NEXT_MAPPED_EVENTS: frozenset[EventType] = frozenset(
    {"compare", "select", "partition", "merge", "done"}
)
_PREV_MAPPED_EVENTS: frozenset[EventType] = frozenset({"swap", "write"})
_LOOP_MAPPED_EVENTS: frozenset[EventType] = frozenset({"mark_sorted"})

# 目标语句允许的 AST 节点类型（导入期校验，防止插桩漂移）。
_TARGET_TYPES: dict[EventType, tuple[type[ast.stmt], ...]] = {
    "compare": (ast.If, ast.While),
    "swap": (ast.Assign,),
    "write": (ast.Assign,),
    "select": (ast.Assign,),
    "partition": (ast.AugAssign, ast.Assign),
    "merge": (ast.While, ast.For, ast.If, ast.Assign),
    "mark_sorted": (ast.For, ast.While),
    "done": (ast.Return,),
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


def _load_module_source_lines(module: ModuleType) -> list[str]:
    """读取模块源码（模块级从文件第 1 行开始，保证 AST 行号是绝对行号）。"""
    source_lines, start_lineno = inspect.getsourcelines(module)
    if start_lineno != 0:
        raise LineMapError(f"模块 {module.__name__} 的源码行号偏移异常")
    return [line.rstrip("\n") for line in source_lines]


def _find_top_level_function(tree: ast.Module, function_name: str) -> ast.FunctionDef:
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            return node
    raise LineMapError(f"模块中找不到顶层函数 {function_name}")


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


def _docstring_linenos_in_range(tree: ast.Module, first: int, last: int) -> set[int]:
    """收集函数行范围内所有函数/类文档字符串占用的行号（展示时清空）。"""
    linenos: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        body = node.body
        if not body:
            continue
        first_stmt = body[0]
        if not isinstance(first_stmt, ast.Expr):
            continue
        value = first_stmt.value
        if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
            continue
        start = first_stmt.lineno
        if not first <= start <= last:
            continue
        end = first_stmt.end_lineno or start
        linenos.update(range(start, end + 1))
    return linenos


def _display_text(
    text: str,
    *,
    lineno: int,
    comment_columns: dict[int, int],
    docstring_linenos: set[int],
) -> str:
    """生成学生可见代码文本：去掉文档字符串与注释，只保留可执行代码。"""
    if lineno in docstring_linenos:
        return ""
    column = comment_columns.get(lineno)
    if column is None:
        return text
    return text[:column].rstrip()


class _LineMapBuilder:
    """按规则表遍历函数体，建立插桩映射（先保留 return 等原始目标行）。"""

    def __init__(self) -> None:
        self._mappings: list[LineMapping] = []
        self._site_counters: dict[EventType, int] = {}

    def build(self, function_node: ast.FunctionDef) -> tuple[LineMapping, ...]:
        self._visit_block(function_node.body, enclosing_loop=None)
        return tuple(self._mappings)

    def _visit_block(
        self,
        block: list[ast.stmt],
        *,
        enclosing_loop: ast.For | ast.While | None,
    ) -> None:
        for position, stmt in enumerate(block):
            event_type = _emit_event_type(stmt)
            if event_type is not None:
                self._register(event_type, stmt, block, position, enclosing_loop)
            self._visit_statement(stmt, enclosing_loop=enclosing_loop)

    def _visit_statement(
        self,
        stmt: ast.stmt,
        *,
        enclosing_loop: ast.For | ast.While | None,
    ) -> None:
        inner_loop: ast.For | ast.While | None = (
            stmt if isinstance(stmt, (ast.For, ast.While)) else enclosing_loop
        )
        for field_name in ("body", "orelse", "finalbody"):
            child_block = getattr(stmt, field_name, None)
            if isinstance(child_block, list):
                self._visit_block(child_block, enclosing_loop=inner_loop)

    def _register(
        self,
        event_type: EventType,
        emit_stmt: ast.stmt,
        block: list[ast.stmt],
        position: int,
        enclosing_loop: ast.For | ast.While | None,
    ) -> None:
        if event_type in _LOOP_MAPPED_EVENTS:
            if enclosing_loop is None:
                raise LineMapError(
                    f"{event_type} 插桩（第 {emit_stmt.lineno} 行）必须位于 for/while 循环体内"
                )
            target: ast.stmt = enclosing_loop
        elif event_type in _NEXT_MAPPED_EVENTS:
            if position + 1 >= len(block):
                raise LineMapError(
                    f"{event_type} 插桩（第 {emit_stmt.lineno} 行）缺少下一条同块语句"
                )
            target = block[position + 1]
        else:
            if position == 0:
                raise LineMapError(
                    f"{event_type} 插桩（第 {emit_stmt.lineno} 行）缺少上一条同块语句"
                )
            target = block[position - 1]
        expected_types = _TARGET_TYPES[event_type]
        if not isinstance(target, expected_types):
            expected_names = " / ".join(node_type.__name__ for node_type in expected_types)
            raise LineMapError(
                f"{event_type} 插桩（第 {emit_stmt.lineno} 行）映射到的第 {target.lineno} 行"
                f"应为 {expected_names}，实际为 {type(target).__name__}"
            )
        site = self._site_counters.get(event_type, 0)
        self._site_counters[event_type] = site + 1
        self._mappings.append(
            LineMapping(
                event_type=event_type,
                emit_lineno=emit_stmt.lineno,
                target_lineno=target.lineno,
                site=site,
            )
        )


@dataclass(frozen=True)
class _StmtInfo:
    """函数体内一条语句及其所有外层语句（由外到内，不含自身）。"""

    node: ast.stmt
    ancestors: tuple[ast.stmt, ...]


def _collect_statement_infos(function_node: ast.FunctionDef) -> dict[int, _StmtInfo]:
    """收集函数体内每条语句的 lineno → (节点, 外层语句栈)。"""
    infos: dict[int, _StmtInfo] = {}

    def walk_block(block: Sequence[ast.stmt], ancestors: tuple[ast.stmt, ...]) -> None:
        for stmt in block:
            infos[stmt.lineno] = _StmtInfo(node=stmt, ancestors=ancestors)
            walk_statement(stmt, ancestors + (stmt,))

    def walk_statement(stmt: ast.stmt, ancestors: tuple[ast.stmt, ...]) -> None:
        for field_name in ("body", "orelse", "finalbody"):
            child_block = getattr(stmt, field_name, None)
            if isinstance(child_block, list):
                walk_block(child_block, ancestors)

    walk_block(function_node.body, ())
    return infos


def _contains_early_loop_control(stmt: ast.If) -> bool:
    """该 if 体内是否直接包含 break/continue（用于展示 early_exit 判断行）。"""
    return any(isinstance(node, (ast.Break, ast.Continue)) for node in ast.walk(stmt))


def _compute_display_linenos(
    mappings: Sequence[LineMapping],
    infos: dict[int, _StmtInfo],
) -> tuple[tuple[int, ...], tuple[LineMapping, ...]]:
    """计算核心循环展示行，并把越界的 done 目标行改映射到范围内最后一行。"""
    emit_lines = {mapping.emit_lineno for mapping in mappings}
    target_lines = {mapping.target_lineno for mapping in mappings}
    relevant: set[int] = set(emit_lines)

    for line in emit_lines | target_lines:
        info = infos.get(line)
        if info is None:
            raise LineMapError(f"第 {line} 行不是函数体内的语句，无法计算展示范围")
        for ancestor in info.ancestors:
            if isinstance(ancestor, (ast.For, ast.While, ast.If)):
                relevant.add(ancestor.lineno)

    for line in target_lines:
        node = infos[line].node
        # return 行不展示；done 的映射稍后改到范围内最后一个核心语句行。
        if not isinstance(node, ast.Return):
            relevant.add(line)

    for line, info in infos.items():
        if isinstance(info.node, ast.If) and _contains_early_loop_control(info.node):
            relevant.add(line)
        if isinstance(info.node, (ast.Break, ast.Continue)):
            relevant.add(line)

    display = tuple(sorted(relevant))
    display_set = set(display)
    remapped: list[LineMapping] = []
    for mapping in mappings:
        target = mapping.target_lineno
        if target not in display_set:
            lower = [lineno for lineno in display if lineno < mapping.emit_lineno]
            if not lower:
                raise LineMapError(
                    f"{mapping.event_type} 的目标行 {target} 不在展示范围内，且没有可选替代行"
                )
            target = lower[-1]
        remapped.append(replace(mapping, target_lineno=target))

    for mapping in remapped:
        if mapping.emit_lineno not in display_set or mapping.target_lineno not in display_set:
            raise LineMapError(
                f"{mapping.event_type} 的行映射（第 {mapping.emit_lineno}→"
                f"{mapping.target_lineno} 行）落在展示范围之外"
            )
    return display, tuple(remapped)


def build_line_map(module: ModuleType, function: Callable[..., object]) -> AlgorithmLineMap:
    """为算法模块的顶层函数建立核心循环行映射；失败即抛 LineMapError。"""
    source_lines = _load_module_source_lines(module)
    module_source = "\n".join(source_lines)
    function_name = getattr(function, "__name__", None)
    if not isinstance(function_name, str):
        raise LineMapError("无法取得算法函数名")
    function_lines, function_start = inspect.getsourcelines(function)
    function_end = function_start + len(function_lines) - 1
    if function_start < 1 or function_end < function_start:
        raise LineMapError(f"无法定位函数 {function_name} 的源码行范围")

    tree = ast.parse(module_source)
    function_node = _find_top_level_function(tree, function_name)
    if function_node.lineno != function_start:
        raise LineMapError(
            f"函数 {function_name} 的 AST 起始行 {function_node.lineno} 与 "
            f"inspect 行号 {function_start} 不一致"
        )

    raw_mappings = _LineMapBuilder().build(function_node)
    if not raw_mappings:
        raise LineMapError(f"函数 {function_name} 内没有任何插桩调用，无法建立展示范围")
    infos = _collect_statement_infos(function_node)
    display_linenos, mappings = _compute_display_linenos(raw_mappings, infos)

    for lineno in display_linenos:
        if not function_start <= lineno <= function_end:
            raise LineMapError(f"展示行 {lineno} 落在函数 {function_name} 的行范围之外")

    comment_columns = _comment_columns(module_source)
    docstring_linenos = _docstring_linenos_in_range(tree, function_start, function_end)
    emit_linenos = {mapping.emit_lineno for mapping in mappings}
    lines = tuple(
        SourceLine(
            lineno=lineno,
            text=_display_text(
                source_lines[lineno - 1],
                lineno=lineno,
                comment_columns=comment_columns,
                docstring_linenos=docstring_linenos,
            ),
            kind="trace" if lineno in emit_linenos else "normal",
        )
        for lineno in display_linenos
    )
    return AlgorithmLineMap(lines=lines, mappings=mappings)


def build_bubble_line_map() -> BubbleLineMap:
    """阶段 2 兼容入口：冒泡排序的核心循环行与插桩映射。"""
    generic = build_line_map(bubble_module, bubble_module.bubble_sort)
    mappings = tuple(
        LineMapping(
            event_type=mapping.event_type,
            emit_lineno=mapping.emit_lineno,
            target_lineno=mapping.target_lineno,
            site=mapping.site,
        )
        for mapping in generic.mappings
    )
    return BubbleLineMap(lines=generic.lines, mappings=mappings)


# 导入期建立映射：失败会直接阻止应用启动，而不是带着错误映射运行。
BUBBLE_LINE_MAP = build_bubble_line_map()
