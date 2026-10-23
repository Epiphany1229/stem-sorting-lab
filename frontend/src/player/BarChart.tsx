/**
 * SVG 柱状图：只按轨迹里的 state.order + state.values 渲染当前快照。
 *
 * 状态区分使用多通道：颜色、图案、图标、描边，不只靠颜色。
 * 数值标签的坐标由当前快照直接算出，柱体几何没有过渡动画，
 * 因此标签在播放时不会与柱子错位。
 */
import { useId } from "react";

import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation } from "../i18n/dictionary";
import type { TraceEvent, TraceItem, TraceState } from "./types";

interface BarChartProps {
  readonly items: readonly TraceItem[];
  readonly state: TraceState;
  readonly event?: TraceEvent | null;
  readonly reducedMotion?: boolean;
}

type BarState = "pending" | "compare" | "swap" | "sorted";

const GLYPHS: Record<BarState, string> = {
  pending: "·",
  compare: "?",
  swap: "↔",
  sorted: "✓",
};

const LEGEND_STATES: readonly BarState[] = ["pending", "compare", "swap", "sorted"];

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 400;
const MARGIN_X = 16;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 92;
const MIN_BAR_HEIGHT = 8;

interface BarGeometry {
  readonly itemId: string;
  readonly value: number;
  readonly displayIndex: number;
  readonly state: BarState;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly labelY: number;
}

/**
 * 把当前快照换算成柱子几何。
 * 负值从零基线向下延伸；全相同值（包括全 0）用最小高度兜底，避免零高度柱。
 */
function buildGeometry(
  items: readonly TraceItem[],
  state: TraceState,
  event: TraceEvent | null,
): { bars: BarGeometry[]; baselineY: number; plotBottom: number; scale: number } {
  const count = state.order.length;
  const values = state.order.map((_, index) => state.values[index] ?? 0);
  const domainMin = Math.min(0, ...values);
  const domainMaxRaw = Math.max(0, ...values);
  // 全相同值时 domain 会退化，用 1 做兜底，避免除零与零高度柱。
  const domainMax = domainMaxRaw === domainMin ? domainMin + 1 : domainMaxRaw;
  const plotHeight = VIEW_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const scale = plotHeight / (domainMax - domainMin);
  const baselineY = MARGIN_TOP + domainMax * scale;
  const plotBottom = VIEW_HEIGHT - MARGIN_BOTTOM;
  const slotWidth = (VIEW_WIDTH - MARGIN_X * 2) / Math.max(count, 1);
  const barWidth = Math.min(64, slotWidth * 0.62);

  const compared = new Set(event?.compared_indices ?? []);
  const modified = new Set(event?.modified_indices ?? []);
  const finalized = new Set(event?.finalized_indices ?? []);

  const itemById = new Map(items.map((item) => [item.id, item] as const));

  const bars = state.order.map((itemId, displayIndex) => {
    const value = state.values[displayIndex] ?? itemById.get(itemId)?.value ?? 0;

    let stateOfBar: BarState = "pending";
    if (modified.has(displayIndex)) {
      stateOfBar = "swap";
    } else if (compared.has(displayIndex)) {
      stateOfBar = "compare";
    } else if (finalized.has(displayIndex)) {
      stateOfBar = "sorted";
    }

    const magnitude = Math.abs(value) * scale;
    const height = Math.max(magnitude, MIN_BAR_HEIGHT);
    const x = MARGIN_X + displayIndex * slotWidth + (slotWidth - barWidth) / 2;
    const y = value < 0 ? baselineY : baselineY - height;
    const centerX = x + barWidth / 2;
    // 正数标签在柱顶上方，负数标签在柱底下方；紧贴几何位置计算，避免错位。
    const labelY = value < 0 ? Math.min(y + height + 18, plotBottom + 56) : y - 10;

    return {
      itemId,
      value,
      displayIndex,
      state: stateOfBar,
      x,
      y,
      width: barWidth,
      height,
      centerX,
      labelY,
    };
  });

  return { bars, baselineY, plotBottom, scale };
}

export function BarChart({ items, state, event = null, reducedMotion = false }: BarChartProps) {
  const patternPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dotsPatternId = `${patternPrefix}-dots`;
  const crossPatternId = `${patternPrefix}-cross`;
  const hatchPatternId = `${patternPrefix}-hatch`;
  const { bars, baselineY, plotBottom } = buildGeometry(items, state, event ?? null);

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
      <svg
        className="bar-chart"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={formatTranslation("player.chart.label", { count: bars.length })["zh-Hant"]}
        data-testid="bar-chart"
        data-reduced-motion={reducedMotion ? "true" : "false"}
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
          x1={MARGIN_X}
          y1={baselineY}
          x2={VIEW_WIDTH - MARGIN_X}
          y2={baselineY}
        />
        <line
          className="bar-chart__plot-bottom"
          x1={MARGIN_X}
          y1={plotBottom}
          x2={VIEW_WIDTH - MARGIN_X}
          y2={plotBottom}
        />

        {bars.map((bar) => {
          const patternId =
            bar.state === "compare"
              ? dotsPatternId
              : bar.state === "swap"
                ? crossPatternId
                : bar.state === "sorted"
                  ? hatchPatternId
                  : null;
          const glyphY = bar.height >= 26 ? bar.y + Math.min(bar.height / 2 + 5, bar.height - 6) : bar.y - 4;

          return (
            <g
              key={bar.itemId}
              className={`bar-chart__bar-group bar-chart__bar-group--${bar.state}`}
              data-testid="bar"
              data-item-id={bar.itemId}
              data-display-index={bar.displayIndex}
              data-state={bar.state}
            >
              <title>
                {(() => {
                  // SVG <title> 只能是一条字符串：繁中在上、英文在下一行，保持双语。
                  const title = formatTranslation("player.bar.title", {
                    id: bar.itemId,
                    value: bar.value,
                  });
                  return `${title["zh-Hant"]}\n${title.en}`;
                })()}
              </title>
              <rect
                data-testid="bar-shape"
                className="bar-chart__bar"
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={6}
              />
              {patternId ? (
                <rect
                  className="bar-chart__pattern-overlay"
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={6}
                  fill={`url(#${patternId})`}
                />
              ) : null}
              {bar.height >= 26 ? (
                <text
                  className="bar-chart__glyph"
                  data-testid="bar-glyph"
                  x={bar.centerX}
                  y={glyphY}
                  aria-hidden="true"
                >
                  {GLYPHS[bar.state]}
                </text>
              ) : null}
              <text
                className="bar-chart__value"
                data-testid="bar-value"
                x={bar.centerX}
                y={bar.labelY}
              >
                {bar.value}
              </text>
            </g>
          );
        })}

        {bracketFor(comparedIndices, plotBottom + 22)}
        {bracketFor(modifiedIndices, plotBottom + 42)}
      </svg>

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
