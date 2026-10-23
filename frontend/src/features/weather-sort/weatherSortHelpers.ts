/**
 * 天气排序页的纯展示辅助：只读取轨迹里的数据，不做排序或数值推导。
 */
import { translate } from "../../i18n/dictionary";
import type { BubbleTrace, TopTemperature, TraceItem, WeatherMetric } from "../../player/types";

export const WEATHER_METRICS: readonly WeatherMetric[] = ["tmax", "tmin"];

export function isWeatherMetric(value: string | null | undefined): value is WeatherMetric {
  return value === "tmax" || value === "tmin";
}

export function metricLabelZh(metric: WeatherMetric): string {
  return translate(metric === "tmax" ? "weather.controls.metric.tmax" : "weather.controls.metric.tmin")[
    "zh-Hant"
  ];
}

export function metricLabelEn(metric: WeatherMetric): string {
  return translate(metric === "tmax" ? "weather.controls.metric.tmax" : "weather.controls.metric.tmin")
    .en;
}

export function itemsById(trace: BubbleTrace): ReadonlyMap<string, TraceItem> {
  return new Map(trace.items.map((item) => [item.id, item] as const));
}

/** 轨迹里的原始温度字符串（保精度）；没有 value_raw 时退回数值。 */
export function rawValueOf(item: TraceItem): string {
  return item.value_raw ?? String(item.value);
}

export interface OrderEntry {
  readonly itemId: string;
  readonly date: string;
  readonly valueRaw: string;
}

/** 按轨迹给出的 before_order / after_order 顺序列出日期与原始温度。 */
export function orderEntries(
  trace: BubbleTrace,
  order: readonly string[] | undefined,
): readonly OrderEntry[] {
  if (!order) {
    return [];
  }
  const index = itemsById(trace);
  return order
    .map((itemId) => {
      const item = index.get(itemId);
      if (!item) {
        return null;
      }
      return { itemId, date: item.label ?? item.id, valueRaw: rawValueOf(item) };
    })
    .filter((entry): entry is OrderEntry => entry !== null);
}

export interface TopEntry {
  readonly date: string;
  readonly valueRaw: string;
}

export function topEntries(entries: readonly TopTemperature[] | undefined): readonly TopEntry[] {
  return (entries ?? []).map((entry) => ({ date: entry.date, valueRaw: entry.value_raw }));
}
