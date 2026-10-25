"""轨迹记录器：只记录算法真实执行时发生的事件与数组快照。

设计要点（对应 docs/trace-protocol.md 的 §3 字段语义）：

- 事件通过 ``state_before_id`` / ``state_after_id`` 引用快照，不重复内联整份数组；
- ``metrics`` 是累计值，由记录器统一累加，算法本身不维护计数器；
- 快照中的元素顺序由记录器镜像算法刚刚完成的真实交换得到，不推导、不补全；
- 所有对外结构都是不可变元组，避免调用方意外修改历史轨迹影响确定性。
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal, Protocol

# 排序方向、事件类型与比较关系：与协议 v1 的字符串取值一一对应。
Direction = Literal["asc", "desc"]
EventType = Literal[
    "compare",
    "swap",
    "write",
    "select",
    "partition",
    "merge",
    "mark_sorted",
    "done",
]
Relation = Literal["gt", "lt", "eq"]

# 事件总数上限（协议 §4：超过则拒绝，不得截断后返回）。
MAX_EVENTS = 20000

# 代码行组：插桩行行号与目标语义行行号。
LineGroup = tuple[int, int]


class TraceLimitError(RuntimeError):
    """轨迹事件数超过协议上限；由服务层转换为 422。"""


@dataclass(frozen=True)
class Item:
    """输入元素：稳定唯一 id 与数值解耦，重复数值也能被区分。

    数值类型标注为 ``float``：阶段 2 的整数输入仍然合法（int 是 float 的子类型，
    运行时保持整数对象不变）；阶段 4 的天气轨迹传入一位小数温度。
    """

    id: str
    value: float


@dataclass(frozen=True)
class ComparisonSnapshot:
    """compare 事件附带的真实比较结果。"""

    left: float
    right: float
    relation: Relation
    will_swap: bool


@dataclass(frozen=True)
class AuxiliarySnapshot:
    """算法专属辅助状态。

    冒泡排序沿用 ``pass_index`` / ``early_exit_enabled`` / ``swapped_in_pass`` /
    ``comparison``；阶段 5 的其余算法把设计文档 §4 规定的固定字段放进 ``extra``
    （键名与取值由算法在插桩调用处给出，单一来源）。
    """

    pass_index: int
    early_exit_enabled: bool
    swapped_in_pass: bool
    comparison: ComparisonSnapshot | None = None
    extra: Mapping[str, object] | None = None


@dataclass(frozen=True)
class MetricsSnapshot:
    """截至某个事件执行完的累计指标。"""

    comparisons: int
    swaps: int
    writes: int


@dataclass(frozen=True)
class RecordedState:
    """某一时刻的数组快照：order 与 values 按下标一一对应。

    ``order`` 中允许出现 ``None`` 表示单空槽（插入/希尔抽牌右移期间），
    协议 §3.1 约束：item id 至多出现一次、空槽至多一个；done 前必须补全。
    """

    state_id: int
    order: tuple[str | None, ...]
    values: tuple[float | None, ...]

    def complete_order(self) -> tuple[str, ...]:
        """返回不含空槽的完整 order；仍有空槽说明实现错误。"""
        if any(item is None for item in self.order):
            raise RuntimeError("状态 order 仍有空槽，排序尚未完成")
        return tuple(item for item in self.order if item is not None)

    def numeric_values(self) -> tuple[float, ...]:
        """返回不含空槽的数值序列；仍有空槽说明实现错误。"""
        if any(value is None for value in self.values):
            raise RuntimeError("状态 values 仍有空槽，排序尚未完成")
        return tuple(value for value in self.values if value is not None)


@dataclass(frozen=True)
class RecordedEvent:
    """一条真实执行事件（explanation 由服务层或解释工厂补全）。"""

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
    # 可选解释负载：阶段 4 由注入的解释工厂生成（阶段 2 保持 None，行为不变）
    explanation: object | None = None


# 解释工厂：拿到"刚记录的事件 + 当时的全部快照"，返回任意解释负载。
# 记录器本身不依赖任何具体解释格式，天气服务在调用方把返回值转成双语结构。
ExplanationFactory = Callable[[RecordedEvent, Sequence[RecordedState]], object]


class Tracer(Protocol):
    """算法源码只依赖这个插桩协议，便于在无追踪路径下替换为空实现。

    阶段 2 的冒泡排序只使用 ``pass_index`` 形态；阶段 5 的算法通过 ``aux``
    传入设计文档 §4 规定的固定字段，通过 ``site`` 区分同类型插桩的多个调用点。
    """

    def emit_compare(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
        left_value: float | None = None,
        right_value: float | None = None,
    ) -> None: ...

    def emit_swap(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_mark_sorted(
        self,
        *,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_done(
        self,
        *,
        pass_index: int = 0,
        triggered: bool = False,
        finalized: Sequence[int] = (),
        aux: Mapping[str, object] | None = None,
        site: int = 0,
    ) -> None: ...

    def emit_select(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        compared: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_partition(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_merge(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_write_shift(
        self,
        *,
        source: int,
        target: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_write_place(
        self,
        *,
        index: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_write_buffer(
        self,
        *,
        aux: Mapping[str, object],
        buffer: Sequence[str] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def emit_write_assign(
        self,
        *,
        index: int,
        item_id: str,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None: ...

    def item_id_at(self, position: int) -> str: ...


class NullRecorder:
    """全部 no-op 的接收器：纯算法调用与性能路径不产生任何轨迹开销。"""

    def emit_compare(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
        left_value: float | None = None,
        right_value: float | None = None,
    ) -> None:
        """忽略比较事件。"""

    def emit_swap(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略交换事件。"""

    def emit_mark_sorted(
        self,
        *,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略“进入新一轮”事件。"""

    def emit_done(
        self,
        *,
        pass_index: int = 0,
        triggered: bool = False,
        finalized: Sequence[int] = (),
        aux: Mapping[str, object] | None = None,
        site: int = 0,
    ) -> None:
        """忽略排序结束事件。"""

    def emit_select(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        compared: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略选择候选更新事件。"""

    def emit_partition(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略分区边界推进事件。"""

    def emit_merge(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略合并区间事件。"""

    def emit_write_shift(
        self,
        *,
        source: int,
        target: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略右移写入事件。"""

    def emit_write_place(
        self,
        *,
        index: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略插入写入事件。"""

    def emit_write_buffer(
        self,
        *,
        aux: Mapping[str, object],
        buffer: Sequence[str] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略辅助缓冲区写入事件。"""

    def emit_write_assign(
        self,
        *,
        index: int,
        item_id: str,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """忽略回拷写入事件。"""

    def item_id_at(self, position: int) -> str:
        """无追踪路径不提供元素身份（返回空串，仅用于算法内部镜像）。"""
        return ""


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
        explanation_factory: ExplanationFactory | None = None,
        site_line_groups: Mapping[tuple[EventType, int], LineGroup] | None = None,
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
        self._site_line_groups = (
            dict(site_line_groups) if site_line_groups is not None else None
        )
        self._max_events = max_events
        # 可选解释工厂：不传时行为与阶段 2 完全一致（事件不带 explanation 负载）
        self._explanation_factory = explanation_factory

        self._all_ids: tuple[str, ...] = tuple(item_ids)
        self._order: list[str | None] = list(item_ids)
        self._values: dict[str, float] = {item.id: item.value for item in items}
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
        # 阶段 5：最近一次 mark_sorted 声明的已就位下标集合
        self._finalized_current: tuple[int, ...] = ()
        # 插入/希尔抽牌期间被持有的元素 id（对应 order 里的单空槽）
        self._held_id: str | None = None

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
        """最终状态的元素 id 顺序（必须是不含空槽的完整排列）。"""
        return self._states[-1].complete_order()

    @property
    def final_values(self) -> tuple[float, ...]:
        """最终状态的数值顺序（必须不含空槽）。"""
        return self._states[-1].numeric_values()

    # ------------------------------------------------------------------ 插桩入口

    def emit_compare(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
        left_value: float | None = None,
        right_value: float | None = None,
    ) -> None:
        """记录一次比较：调用位置在比较语句之前，事件状态为比较前。

        ``aux`` 为 None 时沿用阶段 2 的冒泡口径（自动计算 comparison 等字段）；
        阶段 5 的算法把设计文档 §4 的固定字段放进 ``aux``，并显式传入
        ``left_value`` / ``right_value`` 让记录器生成 ``comparison``
        （仅含 left/right/relation；will_swap 只属于冒泡）。
        """
        if aux is not None:
            self._comparisons += 1
            state_id = self._current_state_id()
            comparison = self._make_comparison(left_value, right_value)
            self._record(
                event_type="compare",
                state_before_id=state_id,
                state_after_id=state_id,
                active_indices=tuple(active) if active is not None else (i, j),
                compared_indices=(i, j),
                modified_indices=(),
                finalized_indices=self._resolve_finalized(finalized),
                auxiliary_state=self._generic_aux(aux, comparison=comparison),
                site=site,
            )
            return
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

    def emit_swap(
        self,
        *,
        i: int,
        j: int,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录一次交换：调用位置在交换赋值之后，因此能拿到真实的前后状态。"""
        before_id = self._current_state_id()
        self._swap_positions(i, j)
        after = self._append_snapshot()
        self._swaps += 1
        self._writes += 2
        self._swapped_in_pass = True
        if aux is not None:
            self._record(
                event_type="swap",
                state_before_id=before_id,
                state_after_id=after.state_id,
                active_indices=(i, j),
                compared_indices=(),
                modified_indices=tuple(sorted((i, j))),
                finalized_indices=self._resolve_finalized(finalized),
                auxiliary_state=self._generic_aux(aux),
                site=site,
            )
            return
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

    def emit_mark_sorted(
        self,
        *,
        pass_index: int = 0,
        aux: Mapping[str, object] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录“进入新一轮/新一段”：上一轮/上一段已就位的元素集合。"""
        self._passes += 1
        self._swapped_in_pass = False
        state_id = self._current_state_id()
        if aux is not None:
            resolved = self._resolve_finalized(finalized)
            self._finalized_current = resolved
            self._record(
                event_type="mark_sorted",
                state_before_id=state_id,
                state_after_id=state_id,
                active_indices=(),
                compared_indices=(),
                modified_indices=(),
                finalized_indices=resolved,
                auxiliary_state=self._generic_aux(aux),
                site=site,
            )
            return
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
        pass_index: int = 0,
        triggered: bool = False,
        finalized: Sequence[int] = (),
        aux: Mapping[str, object] | None = None,
        site: int = 0,
    ) -> None:
        """记录排序结束；``triggered`` 表示是否因提前结束而退出。"""
        self._early_exit_triggered = triggered
        state_id = self._current_state_id()
        if aux is not None:
            if any(item is None for item in self._order):
                raise RuntimeError("done 之前 order 仍有空槽，排序尚未完成")
            resolved = self._resolve_finalized(finalized)
            self._finalized_current = resolved
            self._record(
                event_type="done",
                state_before_id=state_id,
                state_after_id=state_id,
                active_indices=(),
                compared_indices=(),
                modified_indices=(),
                finalized_indices=resolved,
                auxiliary_state=self._generic_aux(aux),
                site=site,
            )
            return
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

    # ---------------------------------------------- 阶段 5 通用插桩入口（aux 显式）

    def emit_select(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        compared: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录“发现更优候选、即将更新最小值/最大值下标”。"""
        state_id = self._current_state_id()
        self._record(
            event_type="select",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=tuple(active) if active is not None else (),
            compared_indices=tuple(compared) if compared is not None else (),
            modified_indices=(),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def emit_partition(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录“分区边界即将推进”。"""
        state_id = self._current_state_id()
        self._record(
            event_type="partition",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=tuple(active) if active is not None else (),
            compared_indices=(),
            modified_indices=(),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def emit_merge(
        self,
        *,
        aux: Mapping[str, object],
        site: int = 0,
        active: Sequence[int] | None = None,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录“开始合并某个区间”。"""
        state_id = self._current_state_id()
        self._record(
            event_type="merge",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=tuple(active) if active is not None else (),
            compared_indices=(),
            modified_indices=(),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def emit_write_shift(
        self,
        *,
        source: int,
        target: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录一次右移：元素从 ``source`` 移到 ``target``，``source`` 变成空槽。

        首次右移会顶掉目标位置上的待插入 key：该 key 的 id 被记录器持有，
        对应协议 §3.1 的“单空槽 + 持有元素”表示。
        """
        if not 0 <= source < len(self._order) or not 0 <= target < len(self._order):
            raise IndexError(f"右移下标越界：source={source}, target={target}")
        if source == target:
            raise ValueError("右移的 source 与 target 必须不同")
        before_id = self._current_state_id()
        displaced = self._order[target]
        self._order[target] = self._order[source]
        self._order[source] = None
        if displaced is not None:
            if self._held_id is not None:
                raise RuntimeError("状态中出现了第二个被持有的元素，违反单空槽约定")
            self._held_id = displaced
        after = self._append_snapshot()
        self._writes += 1
        self._record(
            event_type="write",
            state_before_id=before_id,
            state_after_id=after.state_id,
            active_indices=(source, target),
            compared_indices=(),
            modified_indices=(target,),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def emit_write_place(
        self,
        *,
        index: int,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录一次“把持有的 key 插回数组”：用被持有的元素 id 填回空槽。"""
        if not 0 <= index < len(self._order):
            raise IndexError(f"插入下标越界：{index}")
        held_id = self._require_held_id()
        before_id = self._current_state_id()
        self._order[index] = held_id
        self._held_id = None
        after = self._append_snapshot()
        self._writes += 1
        self._record(
            event_type="write",
            state_before_id=before_id,
            state_after_id=after.state_id,
            active_indices=(index,),
            compared_indices=(),
            modified_indices=(index,),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def emit_write_buffer(
        self,
        *,
        aux: Mapping[str, object],
        buffer: Sequence[str] | None = None,
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录一次辅助缓冲区写入：主数组不变，变化体现在 aux 的 buffer 字段。"""
        state_id = self._current_state_id()
        self._writes += 1
        payload = dict(aux)
        if buffer is not None:
            payload["buffer"] = list(buffer)
        self._record(
            event_type="write",
            state_before_id=state_id,
            state_after_id=state_id,
            active_indices=(),
            compared_indices=(),
            modified_indices=(),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(payload),
            site=site,
        )

    def emit_write_assign(
        self,
        *,
        index: int,
        item_id: str,
        aux: Mapping[str, object],
        site: int = 0,
        finalized: Sequence[int] | None = None,
    ) -> None:
        """记录一次回拷：把 ``item_id`` 放到 ``index`` 位置。

        为了保持主数组始终是输入 id 的排列（协议 §3.1 禁止重复 id），
        回拷按“与目标位置交换”实现：目标位置原本的元素被换到 ``item_id``
        原来的位置。若元素已经在目标位置，则不会有状态变化，此时不产生事件
        （避免 before == after 的空写入）。
        """
        if item_id not in self._values:
            raise ValueError(f"未知的元素 id：{item_id}")
        if not 0 <= index < len(self._order):
            raise IndexError(f"回拷下标越界：{index}")
        if self._order[index] == item_id:
            return
        try:
            current_position = self._order.index(item_id)
        except ValueError as exc:
            raise RuntimeError(f"回拷的元素 id 不在主数组中：{item_id}") from exc
        before_id = self._current_state_id()
        displaced = self._order[index]
        self._order[index] = item_id
        self._order[current_position] = displaced
        after = self._append_snapshot()
        self._writes += 1
        self._record(
            event_type="write",
            state_before_id=before_id,
            state_after_id=after.state_id,
            active_indices=(index, current_position),
            compared_indices=(),
            modified_indices=(index,),
            finalized_indices=self._resolve_finalized(finalized),
            auxiliary_state=self._generic_aux(aux),
            site=site,
        )

    def item_id_at(self, position: int) -> str:
        """返回某个下标上的元素 id（供归并排序在 aux 中镜像 buffer 的 id 列表）。"""
        if not 0 <= position < len(self._order):
            raise IndexError(f"下标 {position} 超出数组范围")
        item_id = self._order[position]
        if item_id is None:
            raise RuntimeError(f"下标 {position} 当前是空槽，没有元素 id")
        return item_id

    # ------------------------------------------------------------------ 内部工具

    def _build_snapshot(self) -> RecordedState:
        """按当前顺序生成一份新快照（state_id 就是它在 states 中的下标）。"""
        self._validate_order()
        return RecordedState(
            state_id=len(self._states),
            order=tuple(self._order),
            values=tuple(
                None if item_id is None else self._values[item_id]
                for item_id in self._order
            ),
        )

    def _validate_order(self) -> None:
        """协议 §3.1：item id 至多出现一次、空槽至多一个（禁止重复 id）。"""
        seen: set[str] = set()
        holes = 0
        for item_id in self._order:
            if item_id is None:
                holes += 1
                continue
            if item_id in seen:
                raise RuntimeError(f"状态 order 出现重复 id：{item_id}")
            seen.add(item_id)
        if holes > 1:
            raise RuntimeError(f"状态 order 出现 {holes} 个空槽，协议只允许单空槽")

    def _append_snapshot(self) -> RecordedState:
        snapshot = self._build_snapshot()
        self._states.append(snapshot)
        return snapshot

    def _current_state_id(self) -> int:
        return self._states[-1].state_id

    def _value_at(self, index: int) -> float:
        if not 0 <= index < len(self._order):
            raise IndexError(f"下标 {index} 超出数组范围")
        item_id = self._order[index]
        if item_id is None:
            raise RuntimeError(f"下标 {index} 当前是空槽，没有数值")
        return self._values[item_id]

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

    def _resolve_finalized(self, finalized: Sequence[int] | None) -> tuple[int, ...]:
        """显式传入的 finalized 优先，否则沿用最近一次 mark_sorted 的集合。"""
        if finalized is None:
            return self._finalized_current
        return tuple(finalized)

    def _generic_aux(
        self,
        aux: Mapping[str, object],
        *,
        comparison: ComparisonSnapshot | None = None,
    ) -> AuxiliarySnapshot:
        """把算法现场给出的固定字段包装成通用辅助状态（保持插入顺序）。"""
        return AuxiliarySnapshot(
            pass_index=self._passes,
            early_exit_enabled=self._early_exit,
            swapped_in_pass=False,
            comparison=comparison,
            extra=dict(aux),
        )

    def _make_comparison(
        self,
        left_value: float | None,
        right_value: float | None,
    ) -> ComparisonSnapshot | None:
        """由算法显式给出的左右数值生成 comparison（只有冒泡带 will_swap）。"""
        if left_value is None or right_value is None:
            return None
        relation: Relation
        if left_value > right_value:
            relation = "gt"
        elif left_value < right_value:
            relation = "lt"
        else:
            relation = "eq"
        return ComparisonSnapshot(
            left=left_value,
            right=right_value,
            relation=relation,
            will_swap=False,
        )

    def _require_held_id(self) -> str:
        if self._held_id is None:
            raise RuntimeError("当前没有持有的元素，无法执行插入写入")
        return self._held_id

    def _line_ids(self, event_type: EventType, site: int = 0) -> tuple[str, str]:
        if self._site_line_groups is not None:
            site_group = self._site_line_groups.get((event_type, site))
            if site_group is not None:
                return (f"L{site_group[0]}", f"L{site_group[1]}")
        group = self._line_groups.get(event_type)
        if group is None:
            raise RuntimeError(
                f"缺少事件 {event_type}（site={site}）的代码行映射，无法生成 code_line_ids"
            )
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
        site: int = 0,
    ) -> None:
        if len(self._events) >= self._max_events:
            raise TraceLimitError(
                f"轨迹事件数超过上限 {self._max_events}，请缩小输入规模或关闭提前结束优化"
            )
        event = RecordedEvent(
            step_id=len(self._events),
            event_type=event_type,
            code_line_ids=self._line_ids(event_type, site),
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
        if self._explanation_factory is not None:
            # 把"刚记录的事件 + 当时的全部快照"交给工厂，由调用方决定解释格式
            explanation = self._explanation_factory(event, tuple(self._states))
            event = replace(event, explanation=explanation)
        self._events.append(event)
