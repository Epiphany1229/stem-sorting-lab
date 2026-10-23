/**
 * 手工构造的「真实天气排序轨迹」fixture（严格按 docs/trace-protocol.md v1 +
 * docs/weather-sort-design.md 的可选天气字段）。
 *
 * 用途：前端单测不依赖后端运行。fixture 生成器只是把一份已知的冒泡排序过程
 * 写成轨迹数据；页面运行时仍然只读后端轨迹，不做任何排序。
 */
import type {
  BubbleTrace,
  Direction,
  ExcludedDate,
  TraceEvent,
  TraceItem,
  TraceState,
  WeatherMetric,
} from "../../../player/types";
import { traceFixture } from "../../../player/__tests__/traceFixture";

export interface WeatherInput {
  readonly date: string;
  readonly value: number;
  readonly value_raw: string;
  readonly quality?: string;
}

export interface WeatherTraceFixtureOptions {
  readonly items: readonly WeatherInput[];
  readonly metric?: WeatherMetric;
  readonly direction?: Direction;
  readonly stationId?: string;
  readonly stationZh?: string;
  readonly stationEn?: string;
  readonly excludedDates?: readonly ExcludedDate[];
  readonly requestedDays?: number;
  readonly earlyExit?: boolean;
}

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function zhDate(iso: string): string {
  return `${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日`;
}

function enDate(iso: string): string {
  return `${EN_MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

function directionZh(direction: Direction): string {
  return direction === "asc" ? "升序" : "降序";
}

function directionEn(direction: Direction): string {
  return direction === "asc" ? "ascending" : "descending";
}

/** 生成与后端语义一致的天气轨迹（事件只描述数据，不参与页面运行）。 */
export function buildWeatherTrace(options: WeatherTraceFixtureOptions): BubbleTrace {
  const inputs = options.items;
  const direction = options.direction ?? "asc";
  const earlyExit = options.earlyExit ?? false;
  const metric = options.metric ?? "tmax";
  const stationId = options.stationId ?? "HKO";
  const stationZh = options.stationZh ?? "香港天文台";
  const stationEn = options.stationEn ?? "Hong Kong Observatory";

  const items: TraceItem[] = inputs.map((input) => ({
    id: `it-${input.date}`,
    value: input.value,
    value_raw: input.value_raw,
    label: input.date,
    station: stationId,
    station_name_zh_hant: stationZh,
    station_name_en: stationEn,
    quality_flag: input.quality ?? "C",
    source: {
      dataset: metric === "tmax" ? "CLMMAXT" : "CLMMINT",
      fetched_at: "2026-10-23T12:29:24Z",
      mode: "official",
    },
  }));

  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const rawOf = (itemId: string): string => itemById.get(itemId)?.value_raw ?? String(itemById.get(itemId)?.value ?? 0);
  const dateOf = (itemId: string): string => itemById.get(itemId)?.label ?? itemId;

  const order = items.map((item) => item.id);
  const values = items.map((item) => item.value);
  const states: TraceState[] = [{ state_id: 0, order: [...order], values: [...values] }];
  const events: TraceEvent[] = [];

  let comparisons = 0;
  let swaps = 0;
  let writes = 0;
  let stateId = 0;
  let stepId = 0;
  let passes = 0;

  const pushEvent = (event: Omit<TraceEvent, "step_id">) => {
    events.push({ ...event, step_id: stepId });
    stepId += 1;
  };

  const finalizedBefore = (pass: number): number[] =>
    Array.from({ length: pass }, (_, index) => items.length - 1 - index).sort((a, b) => a - b);

  for (let pass = 0; pass < items.length - 1; pass += 1) {
    passes = pass + 1;
    const finalized = finalizedBefore(pass);
    pushEvent({
      event_type: "mark_sorted",
      code_line_ids: ["L6", "L5"],
      state_before_id: stateId,
      state_after_id: stateId,
      active_indices: [],
      compared_indices: [],
      modified_indices: [],
      finalized_indices: finalized,
      auxiliary_state: { pass_index: pass, early_exit_enabled: earlyExit, swapped_in_pass: false },
      metrics: { comparisons, swaps, writes },
      explanation: {
        key: "weather.mark_sorted.pass",
        "zh-Hant": `進入第 ${pass + 1} 輪：比較相鄰日期的氣溫，把${direction === "asc" ? "較高" : "較低"}的溫度推到後面。`,
        en: `Start pass ${pass + 1}: compare neighbouring dates and push the ${direction === "asc" ? "higher" : "lower"} temperature to the end.`,
      },
    });

    let swappedInPass = false;
    for (let j = 0; j < items.length - 1 - pass; j += 1) {
      const leftId = order[j];
      const rightId = order[j + 1];
      const leftValue = values[j];
      const rightValue = values[j + 1];
      const willSwap = direction === "asc" ? leftValue > rightValue : leftValue < rightValue;
      comparisons += 1;

      pushEvent({
        event_type: "compare",
        code_line_ids: ["L9", "L10"],
        state_before_id: stateId,
        state_after_id: stateId,
        active_indices: [j, j + 1],
        compared_indices: [j, j + 1],
        modified_indices: [],
        finalized_indices: finalized,
        auxiliary_state: {
          pass_index: pass,
          early_exit_enabled: earlyExit,
          swapped_in_pass: swappedInPass,
          comparison: {
            left: leftValue,
            right: rightValue,
            relation: leftValue > rightValue ? "gt" : leftValue < rightValue ? "lt" : "eq",
            will_swap: willSwap,
          },
        },
        metrics: { comparisons, swaps, writes },
        explanation: {
          key: `weather.compare.${direction}.${willSwap ? "swap" : "keep"}`,
          "zh-Hant": `比較 ${zhDate(dateOf(leftId))}的 ${rawOf(leftId)}°C 與 ${zhDate(dateOf(rightId))}的 ${rawOf(rightId)}°C；${directionZh(direction)}排列時${willSwap ? "需要交換" : "不需要交換"}。`,
          en: `Comparing ${rawOf(leftId)}°C on ${enDate(dateOf(leftId))} with ${rawOf(rightId)}°C on ${enDate(dateOf(rightId))}; ${willSwap ? "swap needed" : "no swap needed"} for ${directionEn(direction)} order.`,
        },
      });

      if (!willSwap) {
        continue;
      }

      [order[j], order[j + 1]] = [order[j + 1], order[j]];
      [values[j], values[j + 1]] = [values[j + 1], values[j]];
      swaps += 1;
      writes += 2;
      stateId += 1;
      swappedInPass = true;
      states.push({ state_id: stateId, order: [...order], values: [...values] });

      pushEvent({
        event_type: "swap",
        code_line_ids: ["L12", "L11"],
        state_before_id: stateId - 1,
        state_after_id: stateId,
        active_indices: [j, j + 1],
        compared_indices: [],
        modified_indices: [j, j + 1],
        finalized_indices: finalized,
        auxiliary_state: {
          pass_index: pass,
          early_exit_enabled: earlyExit,
          swapped_in_pass: true,
        },
        metrics: { comparisons, swaps, writes },
        explanation: {
          key: `weather.swap.${direction}`,
          "zh-Hant": `交換 ${zhDate(dateOf(rightId))} 與 ${zhDate(dateOf(leftId))}：${rawOf(rightId)}°C 與 ${rawOf(leftId)}°C 互換位置。`,
          en: `Swap ${enDate(dateOf(rightId))} and ${enDate(dateOf(leftId))}: ${rawOf(rightId)}°C and ${rawOf(leftId)}°C change places.`,
        },
      });
    }

    if (earlyExit && !swappedInPass) {
      break;
    }
  }

  pushEvent({
    event_type: "done",
    code_line_ids: ["L16", "L17"],
    state_before_id: stateId,
    state_after_id: stateId,
    active_indices: [],
    compared_indices: [],
    modified_indices: [],
    finalized_indices: items.map((_, index) => index),
    auxiliary_state: {
      pass_index: Math.max(0, passes - 1),
      early_exit_enabled: earlyExit,
      swapped_in_pass: true,
    },
    metrics: { comparisons, swaps, writes },
    explanation: {
      key: `weather.done.${direction}`,
      "zh-Hant": `排序完成：日期已按${directionZh(direction)}排好，共比較 ${comparisons} 次、交換 ${swaps} 次。`,
      en: `Sorting complete: the dates are in ${directionEn(direction)} order after ${comparisons} comparisons and ${swaps} swaps.`,
    },
  });

  const finalOrder = [...order];
  const finalValues = [...values];
  const byValueDesc = [...inputs].sort((a, b) => b.value - a.value);
  const byValueAsc = [...inputs].sort((a, b) => a.value - b.value);
  const excludedDates = options.excludedDates ?? [];
  const requestedDays = options.requestedDays ?? inputs.length + excludedDates.length;

  return {
    protocol_version: 1,
    algorithm: "bubble",
    direction,
    options: { early_exit: earlyExit },
    items,
    code: traceFixture.code,
    states,
    events,
    summary: {
      comparisons,
      swaps,
      writes,
      passes,
      early_exit_triggered: earlyExit && events[events.length - 2]?.event_type === "mark_sorted",
      final_order: finalOrder,
      final_values: finalValues,
      state_count: states.length,
      event_count: events.length,
    },
    metric,
    valid_days: inputs.length,
    requested_days: requestedDays,
    excluded_dates: excludedDates,
    before_order: items.map((item) => item.id),
    after_order: finalOrder,
    top_hot: byValueDesc.slice(0, 5).map((input) => ({
      date: input.date,
      value: input.value,
      value_raw: input.value_raw,
    })),
    top_cold: byValueAsc.slice(0, 5).map((input) => ({
      date: input.date,
      value: input.value,
      value_raw: input.value_raw,
    })),
    single_scan: { comparisons: Math.max(0, inputs.length - 1), swaps: 0 },
  };
}

/** 默认 tmax fixture：6 个有效日期 + 2 个缺失日期。 */
export const TMAX_INPUTS: readonly WeatherInput[] = [
  { date: "2026-09-01", value: 30.2, value_raw: "30.2" },
  { date: "2026-09-02", value: 27.5, value_raw: "27.5" },
  { date: "2026-09-03", value: 31.0, value_raw: "31.0" },
  { date: "2026-09-04", value: 29.6, value_raw: "29.6" },
  { date: "2026-09-05", value: 33.4, value_raw: "33.4" },
  { date: "2026-09-06", value: 26.8, value_raw: "26.8" },
];

/** tmin fixture：不同的温度与缺失列表，用来验证 tmax/tmin 不串数据。 */
export const TMIN_INPUTS: readonly WeatherInput[] = [
  { date: "2026-09-01", value: 24.1, value_raw: "24.1" },
  { date: "2026-09-02", value: 22.8, value_raw: "22.8" },
  { date: "2026-09-03", value: 25.0, value_raw: "25.0" },
  { date: "2026-09-04", value: 23.4, value_raw: "23.4" },
  { date: "2026-09-05", value: 26.2, value_raw: "26.2" },
  { date: "2026-09-06", value: 21.9, value_raw: "21.9" },
];

export const TMAX_EXCLUDED: readonly ExcludedDate[] = [
  { date: "2026-09-07", reason: "missing" },
  { date: "2026-09-08", reason: "missing" },
];

export const TMIN_EXCLUDED: readonly ExcludedDate[] = [{ date: "2026-09-07", reason: "missing" }];

export function tmaxTrace(direction: Direction = "asc"): BubbleTrace {
  return buildWeatherTrace({
    items: TMAX_INPUTS,
    metric: "tmax",
    direction,
    excludedDates: TMAX_EXCLUDED,
    requestedDays: 8,
  });
}

export function tminTrace(direction: Direction = "asc"): BubbleTrace {
  return buildWeatherTrace({
    items: TMIN_INPUTS,
    metric: "tmin",
    direction,
    excludedDates: TMIN_EXCLUDED,
    requestedDays: 7,
  });
}

/** 负温 + 重复值：验证负值柱与等温日期的稳定顺序。 */
export const negativeTrace: BubbleTrace = buildWeatherTrace({
  items: [
    { date: "2026-01-01", value: -3.5, value_raw: "-3.5" },
    { date: "2026-01-02", value: -1.0, value_raw: "-1.0" },
    { date: "2026-01-03", value: -7.2, value_raw: "-7.2" },
    { date: "2026-01-04", value: -1.0, value_raw: "-1.0" },
  ],
  metric: "tmin",
  requestedDays: 4,
});

/** 全部相同温度：柱高比例为 0 时也必须正常渲染。 */
export const allSameTrace: BubbleTrace = buildWeatherTrace({
  items: [
    { date: "2026-02-01", value: 28.0, value_raw: "28.0" },
    { date: "2026-02-02", value: 28.0, value_raw: "28.0" },
    { date: "2026-02-03", value: 28.0, value_raw: "28.0" },
    { date: "2026-02-04", value: 28.0, value_raw: "28.0" },
  ],
  metric: "tmax",
  requestedDays: 4,
});
