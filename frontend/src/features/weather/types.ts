/**
 * 阶段 3 天气接口类型：严格对齐 docs/weather-data-design.md §3 / §3.1。
 *
 * 约定：
 * - 字段名、取值集合不得在前端改写或放宽；后端返回什么就按什么渲染；
 * - 显示精度使用 value_raw（precision_policy = "raw_string"），value 只用于绘图/排序；
 * - 没有数据时后端返回固定 reason 集合中的一项，前端必须展示对应双语原因。
 */

/** 数据模式：official 官方 / demo 固定快照 / imported 用户导入的官方 CSV。 */
export type DataMode = "official" | "demo" | "imported";

export const DATA_MODES: readonly DataMode[] = ["official", "demo", "imported"];

/** 阶段 3 只有逐日气温有历史接口。 */
export type DailyMetric = "tmax" | "tmin" | "tmean";

export const DAILY_METRICS: readonly DailyMetric[] = ["tmax", "tmin", "tmean"];

/** 空数据时的固定原因集合（§3）。 */
export const WEATHER_REASONS = [
  "not_published",
  "na_no_history",
  "cooldown",
  "circuit_open",
  "budget_exhausted",
  "disabled",
  "no_cache",
  "station_out_of_range",
] as const;

export type WeatherReason = (typeof WEATHER_REASONS)[number];

/** 接口里可能出现的双语文案（例如 summary 的 threshold_note）。 */
export interface BilingualMessage {
  readonly "zh-Hant": string;
  readonly en: string;
}

export interface WeatherWindow {
  readonly start: string;
  readonly end: string;
  readonly anchor: string | null;
  readonly requested_days: number;
}

/** 每个测站 × 指标的覆盖明细。 */
export interface PerStationCoverage {
  readonly station_id: string;
  readonly metric: DailyMetric;
  readonly days_with_data: number;
  readonly first_date: string | null;
  readonly last_date: string | null;
  readonly missing_dates: readonly string[];
  readonly incomplete_dates: readonly string[];
}

export interface CoverageSummary {
  readonly days_with_data: number;
  readonly days_missing: number;
  readonly last_available_date: string | null;
  readonly per_station?: readonly PerStationCoverage[];
}

export interface SourceInfo {
  readonly dataset: string;
  readonly endpoint: string;
  readonly fetched_at: string;
  readonly last_modified?: string | null;
  readonly mode?: DataMode;
}

/** 39 站字典中的一项。 */
export interface Station {
  readonly id: string;
  readonly name_en: string;
  readonly name_zh_hant: string;
  readonly start_year: number;
  readonly available_days: number;
  readonly first_date: string | null;
  readonly last_date: string | null;
  readonly metrics: readonly DailyMetric[];
}

/** 逐日观测：value_raw 保精度用于显示，value 仅用于绘图。 */
export interface DailyRow {
  readonly obs_date: string;
  readonly station_id: string;
  readonly metric: DailyMetric;
  readonly value_raw: string;
  readonly value: number;
  readonly unit: string;
  readonly quality_flag: string;
}

/** GET /api/weather/stations */
export interface StationsEnvelope {
  readonly mode: DataMode;
  readonly notice: string | null;
  readonly stations: readonly Station[];
}

/** GET /api/weather/coverage */
export interface CoverageResponse {
  readonly mode: DataMode;
  readonly notice: string | null;
  readonly window: WeatherWindow;
  readonly coverage: CoverageSummary;
  readonly reason: string | null;
  readonly sources: readonly SourceInfo[];
}

/** GET /api/weather/daily */
export interface DailyResponse {
  readonly mode: DataMode;
  readonly notice: string | null;
  readonly window: WeatherWindow;
  readonly coverage: CoverageSummary;
  readonly reason: string | null;
  readonly precision_policy: "raw_string";
  readonly data: readonly DailyRow[];
  readonly sources: readonly SourceInfo[];
}

export interface SummaryBin {
  readonly index: number;
  readonly lower: number;
  readonly upper: number;
  readonly label_zh_hant: string;
  readonly label_en: string;
  readonly days: number;
}

/** GET /api/weather/summary */
export interface SummaryResponse {
  readonly mode: DataMode;
  readonly notice: string | null;
  readonly window: WeatherWindow;
  readonly station_id: string;
  readonly metric: DailyMetric;
  readonly bins: readonly SummaryBin[];
  readonly valid_days: number;
  readonly missing_days: number;
  readonly threshold_note: BilingualMessage;
  readonly reason?: string | null;
  readonly sources?: readonly SourceInfo[];
}

/** POST /api/weather/refresh */
export interface RefreshResponse {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly next_allowed_at: string | null;
  readonly remaining_budget: number;
  readonly requests_made: number;
  readonly rows_upserted: number;
  readonly message: string | null;
}

export interface ImportError {
  readonly line: number;
  readonly reason: string;
  readonly detail: string | null;
}

export type ImportedFormat = "official_csv" | "canonical_csv";

/** POST /api/weather/import（multipart，字段名 file） */
export interface ImportResponse {
  readonly mode: "imported";
  readonly accepted_rows: number;
  readonly skipped_rows: number;
  readonly errors: readonly ImportError[];
  readonly detected_format: ImportedFormat;
}

/**
 * GET /api/sources 的信封在 §3 未给出精确形状，只保证可以读到 sources 列表；
 * 其余字段原样保留，前端不猜测语义。
 */
export interface SourcesResponse {
  readonly sources: readonly SourceInfo[];
  readonly mode?: DataMode;
  readonly notice?: string | null;
  readonly last_success_at?: string | null;
  readonly circuit_open_until?: string | null;
  readonly [key: string]: unknown;
}
