/**
 * SVG 柱状图：只按轨迹里的 state.order + state.values 渲染当前快照。
 *
 * 布局要点（阶段 4.5 UI 优化）：
 * - 柱数多时自动加大画布宽度（超过容器则横向滚动），保证每根柱子都有足够间隙；
 * - 温度标签始终显示（value_raw + 单位），柱数 > 8 时改为 -45° 旋转 + 奇偶错层，
 *   不再互相遮挡；日期标签同理；
 * - 位置变化使用 CSS transform 过渡（按 item id 保持 DOM 节点），
 *   相邻交换时柱子与数字沿着同一路径平移，不会重排跳动；
 * - 状态区分仍使用颜色、图案、图标、描边多通道，不只靠颜色。
 */
import { useId, useState } from "react";

import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation } from "../i18n/dictionary";
import type { TraceEvent, TraceItem, TraceState } from "./types";

interface BarChartProps {
  readonly items: readonly TraceItem[];
  readonly state: TraceState;
  readonly event?: TraceEvent | null;
  readonly reducedMotion?: boolean;
  /** 天气轨迹的数值单位（例如 "°C"）；阶段 2 的整数轨迹不传。 */
  readonly unit?: string;
}

type BarState = "pending" | "compare" | "swap" | "sorted";

const GLYPHS: Record<BarState, string> = {
  pending: "·",
  compare: "?",
  swap: "↔",
  sorted: "✓",
};

/** 天气轨迹柱子的完整元数据；阶段 2 的元素没有 label 时返回 null。 */
interface BarItemDetail {
  readonly dateLabel: string;
  readonly stationZh: string;
  readonly stationEn: string;
  readonly valueText: string;
  readonly quality: string;
}

const UNKNOWN_DETAIL = "—";

function formatItemValue(item: TraceItem, fallbackValue: number, unit?: string): string {
  const raw = item.value_raw ?? String(fallbackValue);
  return unit ? `${raw} ${unit}` : raw;
}

/** 柱子底部显示短日期标签（完整日期在悬停与聚焦详情里）。 */
function shortDateLabel(label: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label.slice(5) : label;
}

function detailOfItem(item: TraceItem | undefined, unit?: string): BarItemDetail | null {
  if (!item || item.label === undefined) {
    return null;
  }
  return {
    dateLabel: item.label,
    stationZh: item.station_name_zh_hant ?? item.station ?? UNKNOWN_DETAIL,
    stationEn: item.station_name_en ?? item.station ?? UNKNOWN_DETAIL,
    valueText: formatItemValue(item, item.value, unit),
    quality: item.quality_flag ?? UNKNOWN_DETAIL,
  };
}

const LEGEND_STATES: readonly BarState[] = ["pending", "compare", "swap", "sorted"];

/* ---------- 画布几何 ---------- */
const VIEW_HEIGHT = 420;
const MARGIN_LEFT = 24;
const MARGIN_RIGHT = 32;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 96;
const BASE_WIDTH = 680;
/** 柱数超过该阈值时进入紧凑模式：水平标签 + 奇偶微小错层。 */
const DENSE_THRESHOLD = 8;
const DENSE_MIN_SLOT = 36;
const DEFAULT_MIN_SLOT = 26;
const STAGGER_STEP = 6;
const DATE_STAGGER_STEP = 8;
const MIN_BAR_HEIGHT = 8;
/** 空槽固定高度：order 为 null 时必须保留位置并让空槽可见（契约 §3.1）。 */
const EMPTY_SLOT_HEIGHT = 56;

interface BarGeometry {
  readonly itemId: string | null;
  readonly value: number;
  readonly displayIndex: number;
  readonly state: BarState;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly y: number;
  readonly labelY: number;
  readonly dateY: number;
  readonly stagger: number;
  /** 契约 §3.1 的空槽：order 为 null，必须保留位置并画成显式空槽。 */
  readonly empty: boolean;
}

interface ChartGeometry {
  readonly bars: BarGeometry[];
  readonly baselineY: number;
  readonly plotBottom: number;
  readonly viewWidth: number;
  readonly slotWidth: number;
  readonly dense: boolean;
}

/**
 * 把当前快照换算成柱子几何。
 *
 * - 负值从零基线向下延伸；全相同值（包括全 0）用最小高度兜底；
 * - 柱数多时画布变宽，柱宽与间隙按柱数自适应；
 * - 数字标签始终水平；柱数多时奇偶上下错开几像素，避免轻微贴边，但绝不旋转。
 */
function buildGeometry(
  items: readonly TraceItem[],
  state: TraceState,
  event: TraceEvent | null,
): ChartGeometry {
  const count = Math.max(state.order.length, 1);
  const itemById = new Map(items.map((item) => [item.id, item] as const));
  // 空槽位置（order 为 null）不参与数值 domain，避免把 0 当成学生数据。
  const values = state.order.map((itemId, index) => {
    if (itemId === null) {
      return 0;
    }
    return state.values[index] ?? itemById.get(itemId)?.value ?? 0;
  });
  const domainMin = Math.min(0, ...values);
  const domainMaxRaw = Math.max(0, ...values);
  // 全相同值时 domain 会退化，用 1 做兜底，避免除零与零高度柱。
  const domainMax = domainMaxRaw === domainMin ? domainMin + 1 : domainMaxRaw;

  const dense = count > DENSE_THRESHOLD;
  const marginTop = MARGIN_TOP;
  const marginRight = MARGIN_RIGHT;
  const minSlot = dense ? DENSE_MIN_SLOT : DEFAULT_MIN_SLOT;
  const availableWidth = BASE_WIDTH - MARGIN_LEFT - marginRight;
  const contentWidth = Math.max(availableWidth, count * minSlot);
  const viewWidth = MARGIN_LEFT + marginRight + contentWidth;
  const slotWidth = contentWidth / count;

  const plotHeight = VIEW_HEIGHT - marginTop - MARGIN_BOTTOM;
  const scale = plotHeight / (domainMax - domainMin);
  const baselineY = marginTop + domainMax * scale;
  const plotBottom = VIEW_HEIGHT - MARGIN_BOTTOM;
  const hasDateLabels = items.some((item) => item.label !== undefined);
  const barWidthCap = hasDateLabels ? 46 : 64;
  const barWidth = Math.min(barWidthCap, slotWidth * 0.58);

  const compared = new Set(event?.compared_indices ?? []);
  const modified = new Set(event?.modified_indices ?? []);
  const finalized = new Set(event?.finalized_indices ?? []);

  const bars = state.order.map((itemId, displayIndex) => {
    const empty = itemId === null;
    const value = empty
      ? 0
      : (state.values[displayIndex] ?? itemById.get(itemId)?.value ?? 0);

    let stateOfBar: BarState = "pending";
    if (modified.has(displayIndex)) {
      stateOfBar = "swap";
    } else if (compared.has(displayIndex)) {
      stateOfBar = "compare";
    } else if (finalized.has(displayIndex)) {
      stateOfBar = "sorted";
    }

    const magnitude = Math.abs(value) * scale;
    // 空槽给固定可见高度，保证「保留位置」且不会被误认为零值柱子。
    const height = empty ? EMPTY_SLOT_HEIGHT : Math.max(magnitude, MIN_BAR_HEIGHT);
    const centerX = MARGIN_LEFT + slotWidth * (displayIndex + 0.5);
    const y = value < 0 ? baselineY : baselineY - height;
    // 奇偶错层：只上下错开几像素，文字仍然水平。
    const stagger = dense && displayIndex % 2 === 1 ? STAGGER_STEP : 0;
    // 正数标签在柱顶上方（错层向上），负数标签在柱底下方。
    const labelY =
      value < 0
        ? Math.min(y + height + 20 - stagger, plotBottom + 44)
        : Math.max(y - 12 - stagger, marginTop - 6);
    const dateY = VIEW_HEIGHT - 14 - (dense && displayIndex % 2 === 1 ? DATE_STAGGER_STEP : 0);

    return {
      itemId,
      value,
      displayIndex,
      state: stateOfBar,
      width: barWidth,
      height,
      centerX,
      y,
      labelY,
      dateY,
      stagger,
      empty,
    };
  });

  return { bars, baselineY, plotBottom, viewWidth, slotWidth, dense };
}

export function BarChart({
  items,
  state,
  event = null,
  reducedMotion = false,
  unit,
}: BarChartProps) {
  const patternPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dotsPatternId = `${patternPrefix}-dots`;
  const crossPatternId = `${patternPrefix}-cross`;
  const hatchPatternId = `${patternPrefix}-hatch`;
  const geometry = buildGeometry(items, state, event ?? null);
  const { bars, baselineY, plotBottom, viewWidth, slotWidth, dense } = geometry;
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const hasWeatherDetails = items.some((item) => detailOfItem(item, unit) !== null);
  const focusedItem = focusedItemId === null ? undefined : itemById.get(focusedItemId);
  const focusedDetail = detailOfItem(focusedItem, unit);
  const labelLayout = dense ? "horizontal-staggered" : "horizontal";
  const scrollLabel = formatTranslation("player.chart.scrollLabel", {})["zh-Hant"];
  const unitText = unit
    ? formatTranslation("player.chart.unit", { unit })
    : null;

  // 比较/交换标记画在图表底部：虚线括号 + 图案 + 图标 + 颜色共同区分。
  const comparedIndices = event?.compared_indices ?? [];
  const modifiedIndices = event?.modified_indices ?? [];
  const bracketFor = (indices: readonly number[], y: number) => {
    if (indices.length < 2) {
      return null;
    }
    const positions = indices
      .map((index) => bars.find((bar) => bar.displayIndex === index))
      .filter((bar): bar is BarGeometry => bar !== undefined)
      .sort((a, b) => a.displayIndex - b.displayIndex);
    if (positions.length < 2) {
      return null;
    }
    const first = positions[0];
    const last = positions[positions.length - 1];
    const left = first.centerX;
    const right = last.centerX;
    return (
      <g aria-hidden="true" data-testid={y > plotBottom + 20 ? "swap-bracket" : "compare-bracket"}>
        <path
          className={y > plotBottom + 20 ? "bar-chart__bracket bar-chart__bracket--swap" : "bar-chart__bracket bar-chart__bracket--compare"}
          d={`M ${left} ${y - 6} L ${left} ${y} L ${right} ${y} L ${right} ${y - 6}`}
        />
      </g>
    );
  };

  return (
    <figure className="m-0">
      {unitText ? (
        <p className="bar-chart__unit" data-testid="bar-chart-unit">
          <BilingualText size="xs" zh={unitText["zh-Hant"]} en={unitText.en} />
        </p>
      ) : null}
      <div
        className="bar-chart__scroll"
        data-testid="bar-chart-scroll"
        role="group"
        aria-label={scrollLabel}
        tabIndex={0}
      >
        <svg
          className={dense ? "bar-chart bar-chart--compact" : "bar-chart"}
          viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
          width={viewWidth}
          role="img"
          aria-label={formatTranslation("player.chart.label", { count: bars.length })["zh-Hant"]}
          data-testid="bar-chart"
          data-reduced-motion={reducedMotion ? "true" : "false"}
          data-bar-count={bars.length}
          data-slot-width={Math.round(slotWidth * 10) / 10}
          data-label-layout={labelLayout}
          data-unit={unit ?? ""}
        >
          <defs>
            <pattern id={dotsPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" className="bar-chart__pattern-dot" />
            </pattern>
            <pattern id={crossPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 8 L8 0 M0 0 L8 8" className="bar-chart__pattern-cross" />
            </pattern>
            <pattern id={hatchPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 8 L8 0" className="bar-chart__pattern-hatch" />
            </pattern>
          </defs>

          {/* 零基线：负值在下方，正值在上方。 */}
          <line
            className="bar-chart__baseline"
            x1={MARGIN_LEFT}
            y1={baselineY}
            x2={viewWidth - MARGIN_RIGHT}
            y2={baselineY}
          />
          <line
            className="bar-chart__plot-bottom"
            x1={MARGIN_LEFT}
            y1={plotBottom}
            x2={viewWidth - MARGIN_RIGHT}
            y2={plotBottom}
          />

          {bars.map((bar) => {
            const emptySlot = bar.empty;
            const patternId = emptySlot
              ? null
              : bar.state === "compare"
                ? dotsPatternId
                : bar.state === "swap"
                  ? crossPatternId
                  : bar.state === "sorted"
                    ? hatchPatternId
                    : null;
            const glyphY = bar.height >= 26 ? bar.y + Math.min(bar.height / 2 + 5, bar.height - 6) : bar.y - 4;
            const item = bar.itemId === null ? undefined : itemById.get(bar.itemId);
            const detail = detailOfItem(item, unit);
            // 柱顶只显示纯数字：单位统一放在画布上方的「單位：°C」提示里。
            const displayValue = item?.value_raw ?? String(bar.value);
            const dateLabel = detail ? shortDateLabel(detail.dateLabel) : null;

            return (
              <g
                key={`${bar.displayIndex}-${bar.itemId ?? "hole"}`}
                className={`bar-chart__bar-group bar-chart__bar-group--${bar.state}`}
                data-testid="bar"
                data-item-id={bar.itemId ?? ""}
                data-empty={emptySlot ? "true" : "false"}
                data-display-index={bar.displayIndex}
                data-state={bar.state}
                data-center-x={Math.round(bar.centerX * 10) / 10}
                data-label-stagger={bar.stagger > 0 ? "1" : "0"}
                style={{ transform: `translateX(${bar.centerX}px)` }}
                tabIndex={detail ? 0 : undefined}
                role={emptySlot || detail ? "img" : undefined}
                aria-label={
                  emptySlot
                    ? "空槽 / Hole"
                    : detail
                      ? `${detail.dateLabel}｜${detail.stationZh} / ${detail.stationEn}｜${detail.valueText}｜${detail.quality}`
                      : undefined
                }
                onFocus={detail ? () => setFocusedItemId(bar.itemId) : undefined}
                onBlur={
                  detail
                    ? () =>
                        setFocusedItemId((current) => (current === bar.itemId ? null : current))
                    : undefined
                }
                onMouseEnter={detail ? () => setFocusedItemId(bar.itemId) : undefined}
                onMouseLeave={
                  detail
                    ? () =>
                        setFocusedItemId((current) => (current === bar.itemId ? null : current))
                    : undefined
                }
              >
                <title>
                  {(() => {
                    // 契约 §3.1：空槽必须显式呈现，不跳过、不伪造数值。
                    if (emptySlot) {
                      return "空槽 / Hole";
                    }
                    // SVG <title> 只能是一条字符串：繁中在上、英文在下一行，保持双语。
                    if (detail) {
                      const zhTitle = formatTranslation("weatherSort.bar.title", {
                        date: detail.dateLabel,
                        station: detail.stationZh,
                        value: detail.valueText,
                        quality: detail.quality,
                      })["zh-Hant"];
                      const enTitle = formatTranslation("weatherSort.bar.title", {
                        date: detail.dateLabel,
                        station: detail.stationEn,
                        value: detail.valueText,
                        quality: detail.quality,
                      }).en;
                      return `${zhTitle}\n${enTitle}`;
                    }
                    const title = formatTranslation("player.bar.title", {
                      id: bar.itemId ?? "",
                      value: bar.value,
                    });
                    return `${title["zh-Hant"]}\n${title.en}`;
                  })()}
                </title>
                <rect
                  data-testid="bar-shape"
                  className={emptySlot ? "bar-chart__bar bar-chart__bar--empty" : "bar-chart__bar"}
                  x={-bar.width / 2}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={7}
                  style={emptySlot ? { fill: "none", strokeDasharray: "6 4" } : undefined}
                />
                {patternId ? (
                  <rect
                    className="bar-chart__pattern-overlay"
                    x={-bar.width / 2}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx={7}
                    fill={`url(#${patternId})`}
                  />
                ) : null}
                {!emptySlot && bar.height >= 26 ? (
                  <text
                    className="bar-chart__glyph"
                    data-testid="bar-glyph"
                    x={0}
                    y={glyphY}
                    aria-hidden="true"
                  >
                    {GLYPHS[bar.state]}
                  </text>
                ) : null}
                <text
                  className="bar-chart__value"
                  data-testid="bar-value"
                  data-label-stagger={bar.stagger > 0 ? "1" : "0"}
                  x={0}
                  y={bar.labelY}
                  textAnchor="middle"
                >
                  {emptySlot ? "__" : displayValue}
                </text>
                {dateLabel ? (
                  <text
                    className="bar-chart__date"
                    data-testid="bar-label"
                    data-label-stagger={bar.stagger > 0 ? "1" : "0"}
                    x={0}
                    y={bar.dateY}
                    textAnchor="middle"
                    aria-hidden="true"
                  >
                    {dateLabel}
                  </text>
                ) : null}
              </g>
            );
          })}

          {bracketFor(comparedIndices, plotBottom + 22)}
          {bracketFor(modifiedIndices, plotBottom + 42)}
        </svg>
      </div>

      {hasWeatherDetails ? (
        <div
          className="bar-chart__detail"
          data-testid="bar-detail"
          role="status"
          aria-live="polite"
        >
          <p className="bar-chart__detail-title">
            <BilingualText size="xs" tkey="weatherSort.bar.detailTitle" />
          </p>
          {focusedDetail ? (
            <dl className="bar-chart__detail-grid">
              <div>
                <dt>
                  <BilingualText size="xs" tkey="weatherSort.bar.date" />
                </dt>
                <dd>{focusedDetail.dateLabel}</dd>
              </div>
              <div>
                <dt>
                  <BilingualText size="xs" tkey="weatherSort.bar.station" />
                </dt>
                <dd>
                  <BilingualText
                    size="xs"
                    zh={focusedDetail.stationZh}
                    en={focusedDetail.stationEn}
                  />
                </dd>
              </div>
              <div>
                <dt>
                  <BilingualText size="xs" tkey="weatherSort.bar.value" />
                </dt>
                <dd>{focusedDetail.valueText}</dd>
              </div>
              <div>
                <dt>
                  <BilingualText size="xs" tkey="weatherSort.bar.quality" />
                </dt>
                <dd>{focusedDetail.quality}</dd>
              </div>
            </dl>
          ) : (
            <p className="bar-chart__detail-hint">
              <BilingualText size="xs" tkey="weatherSort.bar.detailHint" />
            </p>
          )}
        </div>
      ) : null}

      <figcaption className="mt-3">
        <span className="sr-only">
          <BilingualText tkey="player.legend.title" />
        </span>
        <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={formatTranslation("player.legend.title", {})["zh-Hant"]}>
          {LEGEND_STATES.map((legendState) => (
            <li key={legendState} className="flex items-center gap-2">
              <span
                className={`legend-swatch legend-swatch--${legendState}`}
                aria-hidden="true"
                data-testid={`legend-swatch-${legendState}`}
              >
                {GLYPHS[legendState]}
              </span>
              <BilingualText
                size="xs"
                tkey={
                  legendState === "pending"
                    ? "player.legend.pending"
                    : legendState === "compare"
                      ? "player.legend.compare"
                      : legendState === "swap"
                        ? "player.legend.swap"
                        : "player.legend.sorted"
                }
              />
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
