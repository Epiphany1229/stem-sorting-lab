/**
 * 图表数据准备：把后端逐日观测转换成各图表的纯数据形状。
 *
 * 这里不做任何伪造或插值：缺失日期在折线图里是 null（connectgaps=false 断开），
 * 在直方图里直接不参与统计；温度数据永远不会被当作降雨或湿度。
 */
import type { TranslationKey } from "../../i18n/dictionary";
import { translate } from "../../i18n/dictionary";
import { DAILY_METRICS } from "./types";
import type {
  DailyMetric,
  DailyRow,
  PerStationCoverage,
  SourceInfo,
  Station,
  SummaryBin,
  WeatherWindow,
} from "./types";

/** 指标对应的双语字典 key（tmax / tmin / tmean）。 */
const METRIC_KEYS: Record<DailyMetric, TranslationKey> = {
  tmax: "weather.controls.metric.tmax",
  tmin: "weather.controls.metric.tmin",
  tmean: "weather.controls.metric.tmean",
};

export function metricKey(metric: DailyMetric): TranslationKey {
  return METRIC_KEYS[metric];
}

export function metricLabelZh(metric: DailyMetric): string {
  return translate(METRIC_KEYS[metric])["zh-Hant"];
}

export function metricLabelEn(metric: DailyMetric): string {
  return translate(METRIC_KEYS[metric]).en;
}

/** 后端固定 reason 集合 → 双语说明 key；未知代码仍显示通用说明 + 原始代码。 */
export function weatherReasonKey(reason: string | null | undefined): TranslationKey {
  switch (reason) {
    case "not_published":
      return "weather.reason.not_published";
    case "na_no_history":
      return "weather.reason.na_no_history";
    case "cooldown":
      return "weather.reason.cooldown";
    case "circuit_open":
      return "weather.reason.circuit_open";
    case "budget_exhausted":
      return "weather.reason.budget_exhausted";
    case "disabled":
      return "weather.reason.disabled";
    case "no_cache":
      return "weather.reason.no_cache";
    case "station_out_of_range":
      return "weather.reason.station_out_of_range";
    default:
      return "weather.reason.unknown";
  }
}

export function isKnownReason(reason: string | null | undefined): boolean {
  return (
    reason === "not_published" ||
    reason === "na_no_history" ||
    reason === "cooldown" ||
    reason === "circuit_open" ||
    reason === "budget_exhausted" ||
    reason === "disabled" ||
    reason === "no_cache" ||
    reason === "station_out_of_range"
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/**
 * 枚举窗口内的每个自然日（UTC 日期字符串，避免本地时区偏移）。
 * 起止不合法或跨度过大时返回空数组，绝不猜测。
 */
export function enumerateDates(start: string, end: string): string[] {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    return [];
  }
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) {
    return [];
  }
  const dates: string[] = [];
  // 上限 800 天，防止异常窗口导致无限循环。
  while (cursor.getTime() <= last.getTime() && dates.length < 800) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function resolveDates(
  rows: readonly DailyRow[],
  window: WeatherWindow | null,
): readonly string[] {
  if (window) {
    const dates = enumerateDates(window.start, window.end);
    if (dates.length > 0) {
      return dates;
    }
  }
  const unique = new Set(rows.map((row) => row.obs_date));
  return [...unique].sort();
}

export function indexStations(stations: readonly Station[]): ReadonlyMap<string, Station> {
  return new Map(stations.map((station) => [station.id, station] as const));
}

/* ------------------------------------------------------------------ */
/* 折线图 / 柱状图共用的「测站 × 指标 × 日期」序列                      */
/* ------------------------------------------------------------------ */

export interface DailySeries {
  readonly stationId: string;
  readonly stationNameZh: string;
  readonly stationNameEn: string;
  readonly metric: DailyMetric;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly dates: readonly string[];
  /** 与 dates 等长；缺失日期为 null，供 connectgaps=false 断开。 */
  readonly values: readonly (number | null)[];
  /** 与 dates 等长；显示用原文（precision_policy=raw_string）。 */
  readonly rawValues: readonly (string | null)[];
}

export function buildDailySeries(
  rows: readonly DailyRow[],
  stations: readonly Station[],
  metrics: readonly DailyMetric[],
  window: WeatherWindow | null,
): DailySeries[] {
  const dates = resolveDates(rows, window);
  const lookup = new Map<string, DailyRow>();
  for (const row of rows) {
    lookup.set(`${row.station_id}|${row.metric}|${row.obs_date}`, row);
  }

  const series: DailySeries[] = [];
  for (const station of stations) {
    for (const metric of metrics) {
      if (!DAILY_METRICS.includes(metric)) {
        continue;
      }
      const values: (number | null)[] = [];
      const rawValues: (string | null)[] = [];
      for (const date of dates) {
        const row = lookup.get(`${station.id}|${metric}|${date}`);
        values.push(row ? row.value : null);
        rawValues.push(row ? row.value_raw : null);
      }
      series.push({
        stationId: station.id,
        stationNameZh: station.name_zh_hant,
        stationNameEn: station.name_en,
        metric,
        labelZh: `${station.name_zh_hant} · ${metricLabelZh(metric)}`,
        labelEn: `${station.name_en} · ${metricLabelEn(metric)}`,
        dates,
        values,
        rawValues,
      });
    }
  }
  return series;
}

/** 柱状图阶段 3 的指标：所选站日最高温对比（不是降雨）。 */
export function buildTmaxComparisonSeries(
  rows: readonly DailyRow[],
  stations: readonly Station[],
  window: WeatherWindow | null,
): DailySeries[] {
  return buildDailySeries(rows, stations, ["tmax"], window);
}

/** 阶段 4 预留：降雨只有接口真正返回时才绘制，页面绝不自己编造。 */
export interface RainfallObservation {
  readonly date: string;
  readonly value: number;
  readonly valueRaw: string;
  readonly unit: string;
}

export interface RainfallSeries {
  readonly stationId: string;
  readonly stationNameZh: string;
  readonly stationNameEn: string;
  readonly points: readonly RainfallObservation[];
}

/* ------------------------------------------------------------------ */
/* 直方图                                                              */
/* ------------------------------------------------------------------ */

export interface HistogramSeries {
  readonly stationId: string;
  readonly stationNameZh: string;
  readonly stationNameEn: string;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly values: readonly number[];
  readonly rawValues: readonly string[];
}

export function buildHistogramSeries(
  rows: readonly DailyRow[],
  stations: readonly Station[],
  metric: DailyMetric = "tmax",
): HistogramSeries[] {
  return stations.map((station) => {
    const stationRows = rows
      .filter((row) => row.station_id === station.id && row.metric === metric)
      .sort((a, b) => a.obs_date.localeCompare(b.obs_date));
    return {
      stationId: station.id,
      stationNameZh: station.name_zh_hant,
      stationNameEn: station.name_en,
      labelZh: station.name_zh_hant,
      labelEn: station.name_en,
      values: stationRows.map((row) => row.value),
      rawValues: stationRows.map((row) => row.value_raw),
    };
  });
}

export interface HistogramBin {
  readonly index: number;
  readonly lower: number;
  readonly upper: number;
  readonly label: string;
  /** 与 series 顺序一致的各站在此区间的样本数。 */
  readonly counts: readonly number[];
  readonly total: number;
}

export interface HistogramBins {
  readonly start: number;
  readonly end: number;
  readonly size: number;
  readonly bins: readonly HistogramBin[];
  readonly total: number;
}

export function formatTemperature(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

/** 依资料范围等分区间（非官方标准），返回各站计数；没有样本时返回 null。 */
export function computeHistogramBins(
  series: readonly HistogramSeries[],
  binCount = 6,
): HistogramBins | null {
  const allValues = series.flatMap((item) => item.values);
  if (allValues.length === 0) {
    return null;
  }
  const resolvedBinCount = Math.max(1, Math.floor(binCount));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min;
  const size = span > 0 ? span / resolvedBinCount : 1;

  const bins: HistogramBin[] = [];
  for (let index = 0; index < resolvedBinCount; index += 1) {
    const lower = min + size * index;
    const upper = index === resolvedBinCount - 1 ? Math.max(max, lower + size) : min + size * (index + 1);
    const counts = series.map(
      (item) =>
        item.values.filter(
          (value) => value >= lower && (index === resolvedBinCount - 1 ? value <= upper : value < upper),
        ).length,
    );
    const total = counts.reduce((sum, count) => sum + count, 0);
    bins.push({
      index,
      lower,
      upper,
      label: `${formatTemperature(lower)}–${formatTemperature(upper)} °C`,
      counts,
      total,
    });
  }

  return { start: min, end: max, size, bins, total: allValues.length };
}

/* ------------------------------------------------------------------ */
/* 环形图：有效观测日中不同温度区间的天数占比                            */
/* ------------------------------------------------------------------ */

export interface DonutRow {
  readonly index: number;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly days: number;
  readonly share: number;
  readonly shareText: string;
}

export function buildDonutRows(
  bins: readonly SummaryBin[],
  validDays: number,
): DonutRow[] {
  return bins.map((bin) => {
    const share = validDays > 0 ? bin.days / validDays : 0;
    return {
      index: bin.index,
      labelZh: bin.label_zh_hant,
      labelEn: bin.label_en,
      days: bin.days,
      share,
      shareText: `${(share * 100).toFixed(1)}%`,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 覆盖率 / 来源表格                                                    */
/* ------------------------------------------------------------------ */

export interface CoverageTableRow {
  readonly key: string;
  readonly stationId: string;
  readonly stationNameZh: string;
  readonly stationNameEn: string;
  readonly metric: DailyMetric;
  readonly metricZh: string;
  readonly metricEn: string;
  readonly daysWithData: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly missingCount: number;
  readonly incompleteCount: number;
}

export function buildCoverageTableRows(
  perStation: readonly PerStationCoverage[],
  stations: readonly Station[],
): CoverageTableRow[] {
  const index = indexStations(stations);
  return perStation.map((entry) => {
    const station = index.get(entry.station_id);
    return {
      key: `${entry.station_id}-${entry.metric}`,
      stationId: entry.station_id,
      stationNameZh: station?.name_zh_hant ?? entry.station_id,
      stationNameEn: station?.name_en ?? entry.station_id,
      metric: entry.metric,
      metricZh: metricLabelZh(entry.metric),
      metricEn: metricLabelEn(entry.metric),
      daysWithData: entry.days_with_data,
      firstDate: entry.first_date ?? "—",
      lastDate: entry.last_date ?? "—",
      missingCount: entry.missing_dates.length,
      incompleteCount: entry.incomplete_dates.length,
    };
  });
}

export interface SourceTableRow {
  readonly key: string;
  readonly dataset: string;
  readonly endpoint: string;
  readonly fetchedAt: string;
  readonly mode: string;
}

export function buildSourceRows(sources: readonly SourceInfo[]): SourceTableRow[] {
  return sources.map((source, index) => ({
    key: `${source.dataset}-${index}`,
    dataset: source.dataset,
    endpoint: source.endpoint,
    fetchedAt: formatTimestamp(source.fetched_at),
    mode: source.mode ?? "official",
  }));
}

/* ------------------------------------------------------------------ */
/* 时间显示                                                            */
/* ------------------------------------------------------------------ */

const HKT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 固定以香港时区显示，不依赖浏览器 locale；无效值原样返回。 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const parts = HKT_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} HKT`;
}

/** 冷却剩余秒数；无法解析时返回 0。 */
export function secondsUntil(iso: string | null | undefined, nowMs: number): number {
  if (!iso) {
    return 0;
  }
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return 0;
  }
  return Math.max(0, Math.ceil((target - nowMs) / 1000));
}
