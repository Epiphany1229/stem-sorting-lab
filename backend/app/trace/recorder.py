"""轨迹记录器：只记录算法真实执行时发生的事件与数组快照。

设计要点（对应 docs/trace-protocol.md 的 §3 字段语义）：

- 事件通过 ``state_before_id`` / ``state_after_id`` 引用快照，不重复内联整份数组；
- ``metrics`` 是累计值，由记录器统一累加，算法本身不维护计数器；
- 快照中的元素顺序由记录器镜像算法刚刚完成的真实交换得到，不推导、不补全；
- 所有对外结构都是不可变元组，避免调用方意外修改历史轨迹影响确定性。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

# 排序方向、事件类型与比较关系：与协议 v1 的字符串取值一一对应。
Direction = Literal["asc", "desc"]
EventType = Literal["compare", "swap", "write", "mark_sorted", "done"]
Relation = Literal["gt", "lt", "eq"]

# 事件总数上限（协议 §4：超过则拒绝，不得截断后返回）。
MAX_EVENTS = 20000

# 代码行组：插桩行行号与目标语义行行号。
LineGroup = tuple[int, int]


class TraceLimitError(RuntimeError):
    """轨迹事件数超过协议上限；由服务层转换为 422。"""


@dataclass(frozen=True)
class Item:
    """输入元素：稳定唯一 id 与数值解耦，重复数值也能被区分。"""

    id: str
    value: int


@dataclass(frozen=True)
class ComparisonSnapshot:
    """compare 事件附带的真实比较结果。"""

    left: int
    right: int
    relation: Relation
    will_swap: bool


@dataclass(frozen=True)
class AuxiliarySnapshot:
    """算法专属辅助状态。"""

    pass_index: int
    early_exit_enabled: bool
    swapped_in_pass: bool
    comparison: ComparisonSnapshot | None = None


@dataclass(frozen=True)
class MetricsSnapshot:
    """截至某个事件执行完的累计指标。"""

    comparisons: int
    swaps: int
    writes: int


@dataclass(frozen=True)
class RecordedState:
    """某一时刻的数组快照：order 与 values 按下标一一对应。"""

    state_id: int
    order: tuple[str, ...]
    values: tuple[int, ...]


@dataclass(frozen=True)
class RecordedEvent:
    """一条真实执行事件（explanation 由服务层按模板补全）。"""

    step_id: int
    event_type: EventType
    code_line_ids: tuple[str, str]
    state_before_id: int
    state_after_id: int
    active_indices: tuple[int, ...]
    compared_indices: tuple[int, ...]
    modified_indices: tuple[int, ...]
    finalized_indices: tuple[int, ...]
    auxiliary_state: AuxiliarySnapshot
    metrics: MetricsSnapshot


class Tracer(Protocol):
    """算法源码只依赖这个最小插桩协议，便于在无追踪路径下替换为空实现。"""

    def emit_compare(self, *, i: int, j: int, pass_index: int) -> None: ...

    def emit_swap(self, *, i: int, j: int, pass_index: int) -> None: ...

    def emit_mark_sorted(self, *, pass_index: int) -> None: ...

    def emit_done(
        self,
        *,
        pass_index: int,
        triggered: bool,
        finalized: Sequence[int],
    ) -> None: ...


class NullRecorder:
    """全部 no-op 的接收器：纯算法调用与性能路径不产生任何轨迹开销。"""

    def emit_compare(self, *, i: int, j: int, pass_index: int) -> None:
        """忽略比较事件。"""

    def emit_swap(self, *, i: int, j: int, pass_index: int) -> None:
        """忽略交换事件。"""

    def emit_mark_sorted(self, *, pass_index: int) -> None:
        """忽略“进入新一轮”事件。"""

    def emit_done(
        self,
        *,
        pass_index: int,
        triggered: bool,
        finalized: Sequence[int],
    ) -> None:
        """忽略排序结束事件。"""


class TraceRecorder:
    """收集真实执行事件、数组快照与累计指标。

    用法：构造时传入初始元素；算法执行过程中调用 ``emit_*``；
    执行结束后通过 ``states`` / ``events`` / ``metrics`` 等属性读取结果。
    """

    def __init__(
        self,
        items: Sequence[Item],
        *,
        direction: Direction,
        early_exit: bool,
        line_groups: Mapping[EventType, LineGroup],
        max_events: int = MAX_EVENTS,
    ) -> None:
        if not items:
            raise ValueError("轨迹记录器至少需要 1 个输入元素")
        item_ids = [item.id for item in items]
        if len(set(item_ids)) != len(item_ids):
            raise ValueError("输入元素的 id 必须唯一")
        if max_events <= 0:
            raise ValueError("max_events 必须为正整数")

        self._direction = direction
        self._early_exit = early_exit
        self._line_groups = dict(line_groups)
        self._max_events = max_events

        self._order: list[str] = [item.id for item in items]
        self._values: dict[str, int] = {item.id: item.value for item in items}
        self._states: list[RecordedState] = []
        # 状态 0 固定为输入初始状态。
        self._states.append(self._build_snapshot())
        self._events: list[RecordedEvent] = []
        self._comparisons = 0
        self._swaps = 0
        self._writes = 0
        self._passes = 0
        self._swapped_in_pass = False
        self._early_exit_triggered = False

    # ------------------------------------------------------------------ 只读视图

    @property
    def states(self) -> tuple[RecordedState, ...]:
        """所有数组快照，``states[0]`` 是输入初始状态。"""
        return tuple(self._states)

    @property
    def events(self) -> tuple[RecordedEvent, ...]:
        """按真实执行顺序排列的事件。"""
        return tuple(self._events)

    @property
    def metrics(self) -> MetricsSnapshot:
        """最后一个事件之后的累计指标。"""
        return MetricsSnapshot(
            comparisons=self._comparisons,
            swaps=self._swaps,
            writes=self._writes,
        )

    @property
    def passes(self) -> int:
        """实际执行的轮数（等于 mark_sorted 事件数）。"""
        return self._passes

    @property
    def early_exit_triggered(self) -> bool:
        """是否因为本轮无交换而提前结束。"""
        return self._early_exit_triggered

    @property
    def final_order(self) -> tuple[str, ...]:
        """最终状态的元素 id 顺序。"""
        return tuple(self._states[-1].order)

    @property
    def final_values(self) -> tuple[int, ...]:
        """最终状态的数值顺序。"""
        return tuple(self._states[-1].values)

    # ------------------------------------------------------------------ 插桩入口

    def emit_compare(self, *, i: int, j: int, pass_index: int) -> None:
        """记录一次比较：调用位置在比较语句之前，事件状态为比较前。"""
        left = self._value_at(i)
        right = self._value_at(j)
        relation: Relation
        if left > right:
            relation = "gt"
        elif left < right:
            relation = "lt"
        else:
            relation = "eq"
        will_swap = relation == "gt" if self._direction == "asc" else relation == "lt"
        self._comparisons += 1
        state_id = self._current_state_id()
        self._record(
            event_type="compare",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=(i, j),
            compared_indices=(i, j),
            modified_indices=(),
            finalized_indices=self._finalized(pass_index),
            auxiliary_state=AuxiliarySnapshot(
                pass_index=pass_index,
                early_exit_enabled=self._early_exit,
                swapped_in_pass=self._swapped_in_pass,
                comparison=ComparisonSnapshot(
                    left=left,
                    right=right,
                    relation=relation,
                    will_swap=will_swap,
                ),
            ),
        )

    def emit_swap(self, *, i: int, j: int, pass_index: int) -> None:
        """记录一次交换：调用位置在交换赋值之后，因此能拿到真实的前后状态。"""
        before_id = self._current_state_id()
        self._swap_positions(i, j)
        after = self._append_snapshot()
        self._swaps += 1
        self._writes += 2
        self._swapped_in_pass = True
        self._record(
            event_type="swap",
            state_before_id=before_id,
            state_after_id=after.state_id,
            active_indices=(i, j),
            compared_indices=(),
            modified_indices=tuple(sorted((i, j))),
            finalized_indices=self._finalized(pass_index),
            auxiliary_state=AuxiliarySnapshot(
                pass_index=pass_index,
                early_exit_enabled=self._early_exit,
                swapped_in_pass=self._swapped_in_pass,
            ),
        )

    def emit_mark_sorted(self, *, pass_index: int) -> None:
        """记录“进入新一轮”：前几轮冒泡到末尾的元素已经确定最终位置。"""
        self._passes += 1
        self._swapped_in_pass = False
        state_id = self._current_state_id()
        self._record(
            event_type="mark_sorted",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=(),
            compared_indices=(),
            modified_indices=(),
            finalized_indices=self._finalized(pass_index),
            auxiliary_state=AuxiliarySnapshot(
                pass_index=pass_index,
                early_exit_enabled=self._early_exit,
                swapped_in_pass=False,
            ),
        )

    def emit_done(
        self,
        *,
        pass_index: int,
        triggered: bool,
        finalized: Sequence[int],
    ) -> None:
        """记录排序结束；``triggered`` 表示是否因提前结束而退出。"""
        self._early_exit_triggered = triggered
        state_id = self._current_state_id()
        self._record(
            event_type="done",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=(),
            compared_indices=(),
            modified_indices=(),
            finalized_indices=tuple(finalized),
            auxiliary_state=AuxiliarySnapshot(
                pass_index=pass_index,
                early_exit_enabled=self._early_exit,
                swapped_in_pass=self._swapped_in_pass,
            ),
        )

    def emit_write(self, *, index: int, item_id: str, pass_index: int) -> None:
        """记录一次单点写入/移动（非交换），供后续算法复用。

        语义：把 ``item_id`` 这个元素移动到下标 ``index``，只计 ``writes += 1``，
        不计 ``swaps``。冒泡排序不会触发它，但协议 §3.2 要求事件类型可用。
        """
        if item_id not in self._values:
            raise ValueError(f"未知的元素 id：{item_id}")
        if not 0 <= index < len(self._order):
            raise IndexError(f"下标 {index} 超出数组范围")
        before_id = self._current_state_id()
        self._order.remove(item_id)
        self._order.insert(index, item_id)
        after = self._append_snapshot()
        self._writes += 1
        self._record(
            event_type="write",
            state_before_id=before_id,
            state_after_id=after.state_id,
            active_indices=(index,),
            compared_indices=(),
            modified_indices=(index,),
            finalized_indices=self._finalized(pass_index),
            auxiliary_state=AuxiliarySnapshot(
                pass_index=pass_index,
                early_exit_enabled=self._early_exit,
                swapped_in_pass=self._swapped_in_pass,
            ),
        )

    # ------------------------------------------------------------------ 内部工具

    def _build_snapshot(self) -> RecordedState:
        """按当前顺序生成一份新快照（state_id 就是它在 states 中的下标）。"""
        return RecordedState(
            state_id=len(self._states),
            order=tuple(self._order),
            values=tuple(self._values[item_id] for item_id in self._order),
        )

    def _append_snapshot(self) -> RecordedState:
        snapshot = self._build_snapshot()
        self._states.append(snapshot)
        return snapshot

    def _current_state_id(self) -> int:
        return self._states[-1].state_id

    def _value_at(self, index: int) -> int:
        if not 0 <= index < len(self._order):
            raise IndexError(f"下标 {index} 超出数组范围")
        return self._values[self._order[index]]

    def _swap_positions(self, i: int, j: int) -> None:
        if i == j:
            raise ValueError("交换的两个下标必须不同")
        if not 0 <= i < len(self._order) or not 0 <= j < len(self._order):
            raise IndexError(f"交换下标越界：i={i}, j={j}")
        self._order[i], self._order[j] = self._order[j], self._order[i]

    def _finalized(self, pass_index: int) -> tuple[int, ...]:
        """进入第 ``pass_index + 1`` 轮时，前几轮已冒泡到末尾的元素下标。"""
        if pass_index <= 0:
            return ()
        size = len(self._order)
        return tuple(range(max(size - pass_index, 0), size))

    def _line_ids(self, event_type: EventType) -> tuple[str, str]:
        group = self._line_groups.get(event_type)
        if group is None:
            raise RuntimeError(f"缺少事件 {event_type} 的代码行映射，无法生成 code_line_ids")
        return (f"L{group[0]}", f"L{group[1]}")

    def _record(
        self,
        *,
        event_type: EventType,
        state_before_id: int,
        state_after_id: int,
        active_indices: tuple[int, ...],
        compared_indices: tuple[int, ...],
        modified_indices: tuple[int, ...],
        finalized_indices: tuple[int, ...],
        auxiliary_state: AuxiliarySnapshot,
    ) -> None:
        if len(self._events) >= self._max_events:
            raise TraceLimitError(
                f"轨迹事件数超过上限 {self._max_events}，请缩小输入规模或关闭提前结束优化"
            )
        self._events.append(
            RecordedEvent(
                step_id=len(self._events),
                event_type=event_type,
                code_line_ids=self._line_ids(event_type),
                state_before_id=state_before_id,
                state_after_id=state_after_id,
                active_indices=active_indices,
                compared_indices=compared_indices,
                modified_indices=modified_indices,
                finalized_indices=finalized_indices,
                auxiliary_state=auxiliary_state,
                metrics=MetricsSnapshot(
                    comparisons=self._comparisons,
                    swaps=self._swaps,
                    writes=self._writes,
                ),
            )
        )
