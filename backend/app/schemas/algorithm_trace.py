"""阶段 5 算法中心 API 模型：算法清单 + 通用轨迹端点。

字段名严格对应 ``docs/algorithms-design.md`` §1.1（算法清单）与 §4（auxiliary_state）；
数值类型统一放宽为 ``int | float``（比较类算法接受整数与一位小数）。
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.schemas.trace import (
    PROTOCOL_VERSION,
    CodeBlock,
    EventMetrics,
    Explanation,
)
from backend.app.trace.recorder import Direction, EventType

# 可用算法 id 与仍在计划中的算法 id。
AvailableAlgorithmId = Literal[
    "bubble", "selection", "insertion", "shell", "merge", "quick", "heap"
]
PlannedAlgorithmId = Literal["counting", "bucket", "radix"]
AlgorithmId = Literal[
    "bubble",
    "selection",
    "insertion",
    "shell",
    "merge",
    "quick",
    "heap",
    "counting",
    "bucket",
    "radix",
]

AlgorithmStatus = Literal["available", "planned"]

# 数值元素：整数与一位小数都合法；保持原始 int/float 类型进行序列化。
Number = int | float


class BilingualText(BaseModel):
    """双语元数据：协议层并列存放繁体中文与英文。"""

    zh_hant: str = Field(serialization_alias="zh-Hant")
    en: str


class AlgorithmMetadata(BaseModel):
    """``GET /api/algorithms`` 中单个算法的元数据（字段顺序即序列化顺序）。"""

    id: AlgorithmId
    name: BilingualText
    tagline: BilingualText
    status: AlgorithmStatus
    time_complexity: BilingualText
    space_complexity: BilingualText
    stable: bool | None
    use_cases: BilingualText
    default_values: list[Number]
    supports_early_exit: bool


class AlgorithmListResponse(BaseModel):
    """``GET /api/algorithms`` 的响应。"""

    protocol_version: int = PROTOCOL_VERSION
    algorithms: list[AlgorithmMetadata]


class AlgorithmTraceOptions(BaseModel):
    """通用轨迹请求参数；无 early_exit 的算法传 ``{}`` 即可。"""

    model_config = ConfigDict(strict=True)

    early_exit: bool = True


class AlgorithmTraceRequest(BaseModel):
    """``POST /api/algorithms/{id}/trace`` 的请求体。"""

    model_config = ConfigDict(strict=True)

    # 长度 2–30；值域 [-1000, 1000]；整数或一位小数（范围与精度由校验器检查）。
    values: Annotated[list[Number], Field(min_length=2, max_length=30)]
    direction: Direction
    options: AlgorithmTraceOptions = Field(default_factory=AlgorithmTraceOptions)

    @field_validator("values")
    @classmethod
    def validate_values(cls, values: list[Number]) -> list[Number]:
        """校验值域与一位小数精度；不合法时返回 422 字段级错误。"""
        for index, value in enumerate(values):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"第 {index + 1} 个元素必须是整数或一位小数")
            if value < -1000 or value > 1000:
                raise ValueError(
                    f"第 {index + 1} 个元素 {value} 超出取值范围 [-1000, 1000]"
                )
            if isinstance(value, float):
                scaled = Decimal(str(value)) * 10
                if scaled != scaled.to_integral_value():
                    raise ValueError(
                        f"第 {index + 1} 个元素 {value} 最多只能有一位小数"
                    )
        return values


class AlgorithmTraceItem(BaseModel):
    """排序输入元素：稳定唯一 id 与数值。"""

    id: str
    value: Number


class AlgorithmArrayState(BaseModel):
    """数组快照：order 与 values 按下标一一对应。

    协议 §3.1 的单空槽约定：插入/希尔抽牌期间某个下标可以为 ``null``，
    此时 order 与 values 的同一位置都序列化为 null，前端据此画显式空槽。
    """

    state_id: int
    order: list[str | None]
    values: list[Number | None]


class AlgorithmComparisonInfo(BaseModel):
    """compare 事件附带的真实比较信息。

    所有算法的 compare 事件都提供 left/right/relation；``will_swap`` 只有
    比较直接决定交换的算法（冒泡）才提供，其余算法省略该字段。
    """

    left: Number
    right: Number
    relation: Literal["gt", "lt", "eq"]
    will_swap: bool | None = None


class AlgorithmAuxiliaryState(BaseModel):
    """通用 auxiliary_state：按设计文档 §4 的固定字段并集建模。

    序列化时使用 ``exclude_none``，因此每个事件只出现该算法规定的字段。
    """

    model_config = ConfigDict(extra="forbid")

    # ---- 冒泡排序（协议 §3.4）
    pass_index: int | None = None
    early_exit_enabled: bool | None = None
    swapped_in_pass: bool | None = None
    comparison: AlgorithmComparisonInfo | None = None
    # ---- 选择排序
    min_index: int | None = None
    scan_from: int | None = None
    scan_to: int | None = None
    finalized_before: list[int] | None = None
    # ---- 插入排序
    key_value: Number | None = None
    key_index: int | None = None
    hole_index: int | None = None
    sorted_to: int | None = None
    shifting: bool | None = None
    # ---- 希尔排序
    gap: int | None = None
    gap_index: int | None = None
    groups: list[list[int]] | None = None
    group_index: int | None = None
    # ---- 归并排序
    left: int | None = None
    mid: int | None = None
    right: int | None = None
    depth: int | None = None
    left_ptr: int | None = None
    right_ptr: int | None = None
    buffer: list[str] | None = None
    buffer_index: int | None = None
    writing_back: bool | None = None
    # ---- 快速排序
    pivot_value: Number | None = None
    pivot_index: int | None = None
    low: int | None = None
    high: int | None = None
    partition_index: int | None = None
    phase: Literal[
        "compare", "partition", "placed", "build", "extract", "sift_down"
    ] | None = None
    # ---- 堆排序
    heap_size: int | None = None
    node_index: int | None = None
    parent_index: int | None = None
    left_child: int | None = None
    right_child: int | None = None


class AlgorithmTraceEvent(BaseModel):
    """一条真实执行事件（解释由后端模板生成）。"""

    step_id: int
    event_type: EventType
    code_line_ids: list[str]
    state_before_id: int
    state_after_id: int
    active_indices: list[int]
    compared_indices: list[int]
    modified_indices: list[int]
    finalized_indices: list[int]
    auxiliary_state: AlgorithmAuxiliaryState
    metrics: EventMetrics
    explanation: Explanation


class AlgorithmTraceSummary(BaseModel):
    """整份轨迹的汇总。"""

    comparisons: int
    swaps: int
    writes: int
    passes: int
    early_exit_triggered: bool
    final_order: list[str]
    final_values: list[Number]
    state_count: int
    event_count: int


class AlgorithmTraceResponse(BaseModel):
    """``POST /api/algorithms/{id}/trace`` 的响应。"""

    protocol_version: int = PROTOCOL_VERSION
    algorithm: AvailableAlgorithmId
    direction: Direction
    # 冒泡排序返回 {"early_exit": ...}；无该选项的算法返回 {}。
    options: dict[str, bool] = Field(default_factory=dict)
    items: list[AlgorithmTraceItem]
    code: CodeBlock
    states: list[AlgorithmArrayState]
    events: list[AlgorithmTraceEvent]
    summary: AlgorithmTraceSummary
