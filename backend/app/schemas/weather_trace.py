"""阶段 4 天气轨迹的 Pydantic 模型（协议 v1 的可选扩展，向后兼容）。

设计依据 ``docs/weather-sort-design.md`` §1：
- ``items[]`` 在阶段 2 的 ``id/value`` 基础上增加天气元数据；
- 顶层新增 ``metric`` / ``valid_days`` / ``requested_days`` / ``excluded_dates`` /
  ``before_order`` / ``after_order`` / ``top_hot`` / ``top_cold`` / ``single_scan``；
- 既有字段（``protocol_version`` / ``algorithm`` / ``direction`` / ``options`` /
  ``code`` / ``states`` / ``events`` / ``summary``）语义不变，只把数值类型放宽到 float。
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from backend.app.schemas.trace import (
    PROTOCOL_VERSION,
    BubbleTraceOptions,
    CodeBlock,
    EventMetrics,
    Explanation,
)
from backend.app.trace.recorder import Direction, EventType, Relation

# 天气轨迹只支持逐日最高温与最低温两个指标
WeatherMetric = Literal["tmax", "tmin"]


class WeatherSourceInfo(BaseModel):
    """单个数据项的来源：数据集、抓取时间与数据模式。"""

    dataset: str
    fetched_at: str | None = None
    mode: str


class WeatherTraceItem(BaseModel):
    """一个待排序的"日子"：稳定 id + 数值 + 官方原始字符串 + 双语站名。"""

    id: str
    value: float
    # 官方原始字符串，保留一位小数精度（如 "30.2"）
    value_raw: str
    # 展示标签，固定为 ISO 日期（YYYY-MM-DD）
    label: str
    station: str
    station_name_zh_hant: str
    station_name_en: str
    quality_flag: str
    source: WeatherSourceInfo


class WeatherArrayState(BaseModel):
    """数组快照：order 与 values 按下标一一对应（数值为温度，±0.1 精度）。"""

    state_id: int
    order: list[str]
    values: list[float]


class WeatherComparisonInfo(BaseModel):
    """compare 事件附带的真实比较结果（温度可含一位小数）。"""

    left: float
    right: float
    relation: Relation
    will_swap: bool


class WeatherAuxiliaryState(BaseModel):
    """算法专属辅助状态；comparison 只在 compare 事件出现。"""

    pass_index: int
    early_exit_enabled: bool
    swapped_in_pass: bool
    comparison: WeatherComparisonInfo | None = None


class WeatherTraceEvent(BaseModel):
    """一条真实执行事件（解释已由解释工厂按天气模板生成）。"""

    step_id: int
    event_type: EventType
    code_line_ids: list[str]
    state_before_id: int
    state_after_id: int
    active_indices: list[int]
    compared_indices: list[int]
    modified_indices: list[int]
    finalized_indices: list[int]
    auxiliary_state: WeatherAuxiliaryState
    metrics: EventMetrics
    explanation: Explanation


class WeatherTraceSummary(BaseModel):
    """与协议 summary 一致，仅把 final_values 放宽为 float。"""

    comparisons: int
    swaps: int
    writes: int
    passes: int
    early_exit_triggered: bool
    final_order: list[str]
    final_values: list[float]
    state_count: int
    event_count: int


class ExcludedDate(BaseModel):
    """被排除出排序的日期与原因（目前只有"缺失"一种）。"""

    date: date
    reason: str


class TopTemperature(BaseModel):
    """最热/最冷榜单的一项。"""

    date: date
    value: float
    value_raw: str


class SingleScan(BaseModel):
    """单次扫描找极值的对照数据（STEM 教学对比，O(n)）。"""

    comparisons: int
    swaps: int


class WeatherTraceRequest(BaseModel):
    """``POST /api/algorithms/bubble/weather-trace`` 请求体。"""

    # 必须在官方 39 站名单内（服务层用 stations.json 校验）
    station: str = Field(min_length=2, max_length=8)
    metric: WeatherMetric
    # 省略 start/end 时，服务层按该站自身最新温度数据锚定默认 30 天窗口
    start: date | None = None
    end: date | None = None
    direction: Direction
    options: BubbleTraceOptions = Field(default_factory=BubbleTraceOptions)


class WeatherTraceResponse(BaseModel):
    """天气轨迹响应：协议 v1 全字段 + 阶段 4 天气扩展字段。"""

    protocol_version: int = PROTOCOL_VERSION
    algorithm: Literal["bubble"] = "bubble"
    direction: Direction
    options: BubbleTraceOptions
    items: list[WeatherTraceItem]
    code: CodeBlock
    states: list[WeatherArrayState]
    events: list[WeatherTraceEvent]
    summary: WeatherTraceSummary
    # ---- 以下为阶段 4 新增（可选扩展，阶段 2 客户端可忽略） ----
    metric: WeatherMetric
    valid_days: int
    requested_days: int
    excluded_dates: list[ExcludedDate]
    before_order: list[str]
    after_order: list[str]
    top_hot: list[TopTemperature]
    top_cold: list[TopTemperature]
    single_scan: SingleScan
