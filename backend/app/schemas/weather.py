"""天气 API 的 Pydantic 模型：字段名与 docs/weather-data-design.md §3 / §3.1 严格一致。

注意：
- 统一信封包含 ``mode`` / ``notice`` / ``window`` / ``coverage`` / ``reason`` / ``sources``；
- ``notice`` 在非 official 模式下必须非空，由 service 层保证；
- 日期字段用 ``date``，FastAPI 会序列化成 ``YYYY-MM-DD``。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# 数据模式：official=官方抓取，demo=官方快照演示，imported=用户导入
ModeCode = Literal["official", "demo", "imported"]
# 无数据时的原因码；取值集合由 Lead 冻结，前端据此显示可理解原因
ReasonCode = Literal[
    "not_published",
    "na_no_history",
    "cooldown",
    "circuit_open",
    "budget_exhausted",
    "disabled",
    "no_cache",
    "station_out_of_range",
]
# 指标
MetricCode = Literal["tmax", "tmin", "tmean"]
# 精度策略：始终返回官方原始字符串，前端按字符串显示
PrecisionPolicy = Literal["raw_string"]


class SourceInfo(BaseModel):
    """一条数据来源说明。"""

    dataset: str
    endpoint: str
    fetched_at: str | None = None
    last_modified: str | None = None
    mode: str


class WindowInfo(BaseModel):
    """本次查询窗口（真实起止日期 + 锚点 + 天数）。"""

    start: date
    end: date
    anchor: date
    requested_days: int


class StationInfo(BaseModel):
    """测站概览（39 站字典 + 已入库数据的可用范围）。"""

    id: str
    name_en: str
    name_zh_hant: str
    start_year: int
    available_days: int
    first_date: date | None
    last_date: date | None
    metrics: list[str]


class PerStationCoverage(BaseModel):
    """某站某指标在窗口内的真实覆盖情况。"""

    station_id: str
    metric: str
    days_with_data: int
    first_date: date | None
    last_date: date | None
    missing_dates: list[date]
    incomplete_dates: list[date]


class CoverageInfo(BaseModel):
    """窗口覆盖率：有效天数、缺失天数、最后可用日与逐站明细。"""

    days_with_data: int
    days_missing: int
    last_available_date: date | None
    per_station: list[PerStationCoverage]


class StationsResponse(BaseModel):
    """GET /api/weather/stations 响应。"""

    mode: ModeCode
    notice: str | None = None
    reason: ReasonCode | None = None
    stations: list[StationInfo]
    sources: list[SourceInfo] = Field(default_factory=list)


class CoverageResponse(BaseModel):
    """GET /api/weather/coverage 响应。"""

    mode: ModeCode
    notice: str | None = None
    window: WindowInfo
    coverage: CoverageInfo
    reason: ReasonCode | None = None
    sources: list[SourceInfo] = Field(default_factory=list)


class DailyRow(BaseModel):
    """逐日一行；``value_raw`` 是官方原始字符串，``value`` 仅供计算。"""

    obs_date: date
    station_id: str
    metric: str
    value_raw: str
    value: float
    unit: str
    quality_flag: str


class DailyResponse(BaseModel):
    """GET /api/weather/daily 响应。"""

    mode: ModeCode
    notice: str | None = None
    window: WindowInfo
    coverage: CoverageInfo
    reason: ReasonCode | None = None
    precision_policy: PrecisionPolicy = "raw_string"
    data: list[DailyRow]
    sources: list[SourceInfo] = Field(default_factory=list)


class SummaryBin(BaseModel):
    """温度区间统计的一档。"""

    index: int
    lower: float
    upper: float
    label_zh_hant: str
    label_en: str
    days: int


class ThresholdNote(BaseModel):
    """区间口径说明（双语）；必须声明"非官方标准"。"""

    zh_hant: str = Field(serialization_alias="zh-Hant")
    en: str


class SummaryResponse(BaseModel):
    """GET /api/weather/summary 响应。"""

    mode: ModeCode
    notice: str | None = None
    window: WindowInfo
    coverage: CoverageInfo
    reason: ReasonCode | None = None
    station_id: str
    metric: str
    bins: list[SummaryBin]
    valid_days: int
    missing_days: int
    threshold_note: ThresholdNote
    sources: list[SourceInfo] = Field(default_factory=list)


class RefreshRequest(BaseModel):
    """POST /api/weather/refresh 的可选请求体；省略时按库内已有站点/指标刷新。"""

    stations: list[str] | None = None
    metrics: list[str] | None = None
    year: int | None = None


class RefreshResponse(BaseModel):
    """POST /api/weather/refresh 响应；失败也返回 200 + accepted=false。"""

    accepted: bool
    reason: str | None = None
    next_allowed_at: datetime | None = None
    remaining_budget: int
    requests_made: int
    rows_upserted: int
    message: str | None = None


class ImportErrorItem(BaseModel):
    """CSV 校验报告中的一条错误/跳过记录。"""

    line: int
    reason: str
    detail: str


class ImportResponse(BaseModel):
    """POST /api/weather/import 响应。"""

    mode: Literal["imported"] = "imported"
    accepted_rows: int
    skipped_rows: int
    errors: list[ImportErrorItem] = Field(default_factory=list)
    detected_format: str
    skipped: list[ImportErrorItem] = Field(default_factory=list)


class RequestStats(BaseModel):
    """上游请求统计（按结果分类）。"""

    total: int
    today: int
    budget: int
    budget_remaining: int
    by_outcome: dict[str, int]


class SourcesResponse(BaseModel):
    """GET /api/sources 响应：来源、许可、熔断状态与请求统计。"""

    mode: ModeCode = "official"
    notice: str | None = None
    reason: ReasonCode | None = None
    sources: list[SourceInfo]
    licenses: list[str]
    circuit_open: bool
    circuit_open_until: datetime | None
    request_stats: RequestStats
    last_success_at: datetime | None
