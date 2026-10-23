"""轨迹协议 v1 的 Pydantic 模型：字段名与 docs/trace-protocol.md 完全一致。

请求模型使用 strict 模式，保证 ``values`` 里的元素必须是真正的整数
（``1.5``、``"5"`` 都会被拒绝，返回 422），与协议 §1 的约束一致。
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.trace.recorder import Direction, EventType, Relation

# 协议版本号；新增字段保持兼容，删除或改语义必须升版本。
PROTOCOL_VERSION = 1

AlgorithmName = Literal["bubble"]
LineKind = Literal["normal", "trace"]


class BubbleTraceOptions(BaseModel):
    """算法参数。"""

    model_config = ConfigDict(strict=True)

    # 是否启用“本轮无交换则提前结束”优化，默认开启。
    early_exit: bool = True


class BubbleTraceRequest(BaseModel):
    """``POST /api/algorithms/bubble/trace`` 的请求体。"""

    model_config = ConfigDict(strict=True)

    # 长度 2–30，每个值在 [-1000, 1000]；允许重复、负数、全相同。
    values: Annotated[
        list[Annotated[int, Field(ge=-1000, le=1000)]],
        Field(min_length=2, max_length=30),
    ]
    # 排序方向：升序 asc / 降序 desc。
    direction: Direction
    # 可选参数，缺省时启用提前结束优化。
    options: BubbleTraceOptions = Field(default_factory=BubbleTraceOptions)


class TraceItem(BaseModel):
    """输入元素：稳定唯一 id 与数值。"""

    id: str
    value: int


class CodeLine(BaseModel):
    """源码中的一行；``line_id`` 可以由 ``L{lineno}`` 反解。"""

    line_id: str
    lineno: int
    text: str
    kind: LineKind


class CodeBlock(BaseModel):
    """实际执行源码的逐行表示。"""

    language: Literal["python"] = "python"
    lines: list[CodeLine]


class ArrayState(BaseModel):
    """某一时刻的数组快照，order 与 values 按下标一一对应。"""

    state_id: int
    order: list[str]
    values: list[int]


class ComparisonInfo(BaseModel):
    """compare 事件附带的真实比较结果。"""

    left: int
    right: int
    relation: Relation
    will_swap: bool


class AuxiliaryState(BaseModel):
    """算法专属辅助状态；comparison 只在 compare 事件出现。"""

    pass_index: int
    early_exit_enabled: bool
    swapped_in_pass: bool
    comparison: ComparisonInfo | None = None


class EventMetrics(BaseModel):
    """截至该事件执行完的累计指标。"""

    comparisons: int
    swaps: int
    writes: int


class Explanation(BaseModel):
    """由后端模板生成的双语解释：繁体中文与英文并列存放。"""

    key: str
    # 序列化时使用协议规定的 "zh-Hant" 键名；Python 侧仍用合法标识符 zh_hant。
    zh_hant: str = Field(serialization_alias="zh-Hant")
    en: str


class TraceEvent(BaseModel):
    """一条真实执行事件。"""

    step_id: int
    event_type: EventType
    code_line_ids: list[str]
    state_before_id: int
    state_after_id: int
    active_indices: list[int]
    compared_indices: list[int]
    modified_indices: list[int]
    finalized_indices: list[int]
    auxiliary_state: AuxiliaryState
    metrics: EventMetrics
    explanation: Explanation


class TraceSummary(BaseModel):
    """整份轨迹的汇总信息。"""

    comparisons: int
    swaps: int
    writes: int
    passes: int
    early_exit_triggered: bool
    final_order: list[str]
    final_values: list[int]
    state_count: int
    event_count: int


class TraceResponse(BaseModel):
    """``POST /api/algorithms/bubble/trace`` 的响应体。"""

    protocol_version: int = PROTOCOL_VERSION
    algorithm: AlgorithmName = "bubble"
    direction: Direction
    options: BubbleTraceOptions
    items: list[TraceItem]
    code: CodeBlock
    states: list[ArrayState]
    events: list[TraceEvent]
    summary: TraceSummary
