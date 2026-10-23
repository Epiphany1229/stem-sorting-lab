/**
 * 天气接口的运行时契约校验。
 *
 * 与阶段 2 的轨迹校验思路一致：字段缺失、类型错误或非官方模式缺少 notice 时直接
 * 抛出 WeatherProtocolError，由界面显示「回應格式不符合契約」；绝不带着半份数据渲染。
 */
import {
  DAILY_METRICS,
  DATA_MODES,
  type BilingualMessage,
  type CoverageResponse,
  type CoverageSummary,
  type DailyMetric,
  type DailyResponse,
  type DailyRow,
  type DataMode,
  type ImportResponse,
  type ImportedFormat,
  type PerStationCoverage,
  type RefreshResponse,
  type SourceInfo,
  type SourcesResponse,
  type Station,
  type StationsEnvelope,
  type SummaryBin,
  type SummaryResponse,
  type WeatherWindow,
} from "./types";

export class WeatherProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherProtocolError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, detail: string): never {
  throw new WeatherProtocolError(`${path} ${detail}`);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, "必須是物件");
  }
  return value;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "必須是陣列");
  }
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(path, "必須是字串");
  }
  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "必須是有限數值");
  }
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, path);
}

function readIsoDate(value: unknown, path: string): string {
  const text = readString(value, path);
  if (!ISO_DATE.test(text)) {
    fail(path, "必須是 YYYY-MM-DD 日期");
  }
  return text;
}

function readNullableIsoDate(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return readIsoDate(value, path);
}

function readMode(value: unknown, path: string): DataMode {
  const text = readString(value, path);
  if (!DATA_MODES.includes(text as DataMode)) {
    fail(path, "必須是 official / demo / imported");
  }
  return text as DataMode;
}

function readMetric(value: unknown, path: string): DailyMetric {
  const text = readString(value, path);
  if (!DAILY_METRICS.includes(text as DailyMetric)) {
    fail(path, "必須是 tmax / tmin / tmean");
  }
  return text as DailyMetric;
}

function readStringArray(value: unknown, path: string): readonly string[] {
  return readArray(value, path).map((item, index) => readString(item, `${path}[${index}]`));
}

/**
 * 非 official 模式必须带 notice（§3：非 official 时必填，前端必须显示）。
 * 缺 notice 视为契约违规，避免横幅消失后学生误以为看到官方数据。
 */
function readNotice(value: unknown, mode: DataMode, path: string): string | null {
  const notice = readNullableString(value, path);
  if (mode !== "official" && (notice === null || notice.trim().length === 0)) {
    fail(path, `在 mode=${mode} 時不得為空`);
  }
  return notice;
}

function readWindow(value: unknown, path: string): WeatherWindow {
  const record = readRecord(value, path);
  return {
    start: readIsoDate(record.start, `${path}.start`),
    end: readIsoDate(record.end, `${path}.end`),
    anchor: readNullableIsoDate(record.anchor, `${path}.anchor`),
    requested_days: readNumber(record.requested_days, `${path}.requested_days`),
  };
}

function readPerStationCoverage(value: unknown, path: string): PerStationCoverage {
  const record = readRecord(value, path);
  return {
    station_id: readString(record.station_id, `${path}.station_id`),
    metric: readMetric(record.metric, `${path}.metric`),
    days_with_data: readNumber(record.days_with_data, `${path}.days_with_data`),
    first_date: readNullableIsoDate(record.first_date, `${path}.first_date`),
    last_date: readNullableIsoDate(record.last_date, `${path}.last_date`),
    missing_dates: readStringArray(record.missing_dates, `${path}.missing_dates`).map((date, index) => {
      if (!ISO_DATE.test(date)) {
        fail(`${path}.missing_dates[${index}]`, "必須是 YYYY-MM-DD 日期");
      }
      return date;
    }),
    incomplete_dates: readStringArray(record.incomplete_dates, `${path}.incomplete_dates`).map(
      (date, index) => {
        if (!ISO_DATE.test(date)) {
          fail(`${path}.incomplete_dates[${index}]`, "必須是 YYYY-MM-DD 日期");
        }
        return date;
      },
    ),
  };
}

function readCoverage(value: unknown, path: string): CoverageSummary {
  const record = readRecord(value, path);
  const perStation = record.per_station;
  return {
    days_with_data: readNumber(record.days_with_data, `${path}.days_with_data`),
    days_missing: readNumber(record.days_missing, `${path}.days_missing`),
    last_available_date: readNullableIsoDate(record.last_available_date, `${path}.last_available_date`),
    ...(perStation === undefined
      ? {}
      : {
          per_station: readArray(perStation, `${path}.per_station`).map((item, index) =>
            readPerStationCoverage(item, `${path}.per_station[${index}]`),
          ),
        }),
  };
}

function readSources(value: unknown, path: string): readonly SourceInfo[] {
  return readArray(value, path).map((item, index) => {
    const record = readRecord(item, `${path}[${index}]`);
    return {
      dataset: readString(record.dataset, `${path}[${index}].dataset`),
      endpoint: readString(record.endpoint, `${path}[${index}].endpoint`),
      fetched_at: readString(record.fetched_at, `${path}[${index}].fetched_at`),
      last_modified:
        record.last_modified === undefined
          ? null
          : readNullableString(record.last_modified, `${path}[${index}].last_modified`),
      ...(record.mode === undefined
        ? {}
        : { mode: readMode(record.mode, `${path}[${index}].mode`) }),
    };
  });
}

function readReason(value: unknown, path: string): string | null {
  // 原因集合固定，但为了将来扩展保留兜底：未知代码原样显示，不静默丢弃。
  if (value === undefined || value === null) {
    return null;
  }
  const text = readString(value, path);
  return text.length > 0 ? text : null;
}

export function parseStationsEnvelope(payload: unknown): StationsEnvelope {
  const record = readRecord(payload, "stations");
  const mode = readMode(record.mode, "stations.mode");
  const stations = readArray(record.stations, "stations.stations").map((item, index) => {
    const station = readRecord(item, `stations.stations[${index}]`);
    const metrics = readArray(station.metrics, `stations.stations[${index}].metrics`).map(
      (metric, metricIndex) =>
        readMetric(metric, `stations.stations[${index}].metrics[${metricIndex}]`),
    );
    return {
      id: readString(station.id, `stations.stations[${index}].id`),
      name_en: readString(station.name_en, `stations.stations[${index}].name_en`),
      name_zh_hant: readString(station.name_zh_hant, `stations.stations[${index}].name_zh_hant`),
      start_year: readNumber(station.start_year, `stations.stations[${index}].start_year`),
      available_days: readNumber(
        station.available_days,
        `stations.stations[${index}].available_days`,
      ),
      first_date: readNullableIsoDate(station.first_date, `stations.stations[${index}].first_date`),
      last_date: readNullableIsoDate(station.last_date, `stations.stations[${index}].last_date`),
      metrics,
    } satisfies Station;
  });

  return { mode, notice: readNotice(record.notice, mode, "stations.notice"), stations };
}

export function parseCoverageResponse(payload: unknown): CoverageResponse {
  const record = readRecord(payload, "coverage");
  const mode = readMode(record.mode, "coverage.mode");
  return {
    mode,
    notice: readNotice(record.notice, mode, "coverage.notice"),
    window: readWindow(record.window, "coverage.window"),
    coverage: readCoverage(record.coverage, "coverage.coverage"),
    reason: readReason(record.reason, "coverage.reason"),
    sources: readSources(record.sources, "coverage.sources"),
  };
}

function readDailyRow(value: unknown, path: string): DailyRow {
  const record = readRecord(value, path);
  return {
    obs_date: readIsoDate(record.obs_date, `${path}.obs_date`),
    station_id: readString(record.station_id, `${path}.station_id`),
    metric: readMetric(record.metric, `${path}.metric`),
    value_raw: readString(record.value_raw, `${path}.value_raw`),
    value: readNumber(record.value, `${path}.value`),
    unit: readString(record.unit, `${path}.unit`),
    quality_flag: readString(record.quality_flag, `${path}.quality_flag`),
  };
}

export function parseDailyResponse(payload: unknown): DailyResponse {
  const record = readRecord(payload, "daily");
  const mode = readMode(record.mode, "daily.mode");
  const precisionPolicy = readString(record.precision_policy, "daily.precision_policy");
  if (precisionPolicy !== "raw_string") {
    fail("daily.precision_policy", '必須是 "raw_string"');
  }

  return {
    mode,
    notice: readNotice(record.notice, mode, "daily.notice"),
    window: readWindow(record.window, "daily.window"),
    coverage: readCoverage(record.coverage, "daily.coverage"),
    reason: readReason(record.reason, "daily.reason"),
    precision_policy: "raw_string",
    data: readArray(record.data, "daily.data").map((item, index) =>
      readDailyRow(item, `daily.data[${index}]`),
    ),
    sources: readSources(record.sources, "daily.sources"),
  };
}

function readBilingualMessage(value: unknown, path: string): BilingualMessage {
  const record = readRecord(value, path);
  return {
    "zh-Hant": readString(record["zh-Hant"], `${path}["zh-Hant"]`),
    en: readString(record.en, `${path}.en`),
  };
}

function readSummaryBin(value: unknown, path: string): SummaryBin {
  const record = readRecord(value, path);
  return {
    index: readNumber(record.index, `${path}.index`),
    lower: readNumber(record.lower, `${path}.lower`),
    upper: readNumber(record.upper, `${path}.upper`),
    label_zh_hant: readString(record.label_zh_hant, `${path}.label_zh_hant`),
    label_en: readString(record.label_en, `${path}.label_en`),
    days: readNumber(record.days, `${path}.days`),
  };
}

export function parseSummaryResponse(payload: unknown): SummaryResponse {
  const record = readRecord(payload, "summary");
  const mode = readMode(record.mode, "summary.mode");
  return {
    mode,
    notice: readNotice(record.notice, mode, "summary.notice"),
    window: readWindow(record.window, "summary.window"),
    station_id: readString(record.station_id, "summary.station_id"),
    metric: readMetric(record.metric, "summary.metric"),
    bins: readArray(record.bins, "summary.bins").map((item, index) =>
      readSummaryBin(item, `summary.bins[${index}]`),
    ),
    valid_days: readNumber(record.valid_days, "summary.valid_days"),
    missing_days: readNumber(record.missing_days, "summary.missing_days"),
    threshold_note: readBilingualMessage(record.threshold_note, "summary.threshold_note"),
    ...(record.reason === undefined ? {} : { reason: readReason(record.reason, "summary.reason") }),
    ...(record.sources === undefined
      ? {}
      : { sources: readSources(record.sources, "summary.sources") }),
  };
}

export function parseRefreshResponse(payload: unknown): RefreshResponse {
  const record = readRecord(payload, "refresh");
  if (typeof record.accepted !== "boolean") {
    fail("refresh.accepted", "必須是布林值");
  }
  return {
    accepted: record.accepted,
    reason: readReason(record.reason, "refresh.reason"),
    next_allowed_at: readNullableString(record.next_allowed_at, "refresh.next_allowed_at"),
    remaining_budget: readNumber(record.remaining_budget, "refresh.remaining_budget"),
    requests_made: readNumber(record.requests_made, "refresh.requests_made"),
    rows_upserted: readNumber(record.rows_upserted, "refresh.rows_upserted"),
    message: readNullableString(record.message, "refresh.message"),
  };
}

function readImportedFormat(value: unknown, path: string): ImportedFormat {
  const text = readString(value, path);
  if (text !== "official_csv" && text !== "canonical_csv") {
    fail(path, '必須是 "official_csv" 或 "canonical_csv"');
  }
  return text;
}

export function parseImportResponse(payload: unknown): ImportResponse {
  const record = readRecord(payload, "import");
  const mode = readMode(record.mode, "import.mode");
  if (mode !== "imported") {
    fail("import.mode", '必須是 "imported"');
  }
  return {
    mode: "imported",
    accepted_rows: readNumber(record.accepted_rows, "import.accepted_rows"),
    skipped_rows: readNumber(record.skipped_rows, "import.skipped_rows"),
    errors: readArray(record.errors, "import.errors").map((item, index) => {
      const error = readRecord(item, `import.errors[${index}]`);
      return {
        line: readNumber(error.line, `import.errors[${index}].line`),
        reason: readString(error.reason, `import.errors[${index}].reason`),
        detail: readNullableString(error.detail, `import.errors[${index}].detail`),
      };
    }),
    detected_format: readImportedFormat(record.detected_format, "import.detected_format"),
  };
}

/** /api/sources 只做最小校验：sources 必须是数组，其余字段原样保留。 */
export function parseSourcesResponse(payload: unknown): SourcesResponse {
  const record = readRecord(payload, "sources");
  return {
    ...record,
    sources: readSources(record.sources, "sources.sources"),
    ...(record.mode === undefined ? {} : { mode: readMode(record.mode, "sources.mode") }),
    ...(record.notice === undefined
      ? {}
      : { notice: readNullableString(record.notice, "sources.notice") }),
    ...(record.last_success_at === undefined
      ? {}
      : { last_success_at: readNullableString(record.last_success_at, "sources.last_success_at") }),
    ...(record.circuit_open_until === undefined
      ? {}
      : {
          circuit_open_until: readNullableString(
            record.circuit_open_until,
            "sources.circuit_open_until",
          ),
        }),
  } as SourcesResponse;
}
