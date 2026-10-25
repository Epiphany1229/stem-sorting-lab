/**
 * Plotly 图表的统一外壳：无障碍摘要、双语悬停、图例、减少动态。
 *
 * - role="img" + aria-label：屏幕阅读器得到一句繁体中文摘要，详细数据在下方表格；
 * - 悬停文本由各图表用字典模板拼成「繁中一行 + 英文一行」，不依赖浏览器 locale；
 * - prefers-reduced-motion 时把 layout.transition.duration 设为 0。
 */
import type { Config, Data, Layout } from "plotly.js-dist-min";

import { translate } from "../../../i18n/dictionary";
import { usePrefersReducedMotion } from "../../../player/usePrefersReducedMotion";
import { BasePlot } from "./plotlyBase";

export interface PlotlyFigureProps {
  readonly testId: string;
  /** 繁中摘要（aria-label）。 */
  readonly ariaLabel: string;
  readonly data: readonly Data[];
  readonly layout?: Partial<Layout>;
  readonly config?: Partial<Config>;
}

/**
 * 把「繁中在上、英文在下」放进 Plotly 只接受字符串的位置（轴标题、图例标题）。
 * Plotly 的文本字段支持有限 HTML，这里用 <br> + 略小字号模拟双语层级。
 */
export function bilingualHtml(zhText: string, enText: string): string {
  return `${zhText}<br><span style="font-size:0.82em;font-weight:400;color:#3c4a5e">${enText}</span>`;
}

/** 轴标题：从字典取双语，固定「繁中在上、英文在下」。 */
export function axisTitle(zhKey: Parameters<typeof translate>[0]): string {
  const entry = translate(zhKey);
  return bilingualHtml(entry["zh-Hant"], entry.en);
}

const LEGEND_TITLE = bilingualHtml(translate("weather.chart.legendTitle")["zh-Hant"], translate("weather.chart.legendTitle").en);

const AXIS_BASE: NonNullable<Partial<Layout>["xaxis"]> = {
  automargin: true,
  gridcolor: "rgba(205, 196, 180, 0.45)",
  zeroline: false,
  linecolor: "rgba(205, 196, 180, 0.8)",
  tickfont: { size: 10.5, color: "#6e7b8e" },
};

const BASE_LAYOUT: Partial<Layout> = {
  autosize: true,
  margin: { l: 52, r: 22, t: 18, b: 52 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: {
    family:
      '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans", system-ui, sans-serif',
    size: 11.5,
    color: "#46536a",
  },
  colorway: ["#0d6a62", "#9a5b0a", "#a82c4c", "#1c6b3a", "#4c5fd5", "#7a3e9d"],
  showlegend: true,
  hovermode: "closest",
  hoverlabel: {
    bgcolor: "#ffffff",
    bordercolor: "#e7e0d3",
    font: {
      family:
        '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans", system-ui, sans-serif',
      size: 11.5,
      color: "#1a2a41",
    },
  },
  legend: {
    title: { text: LEGEND_TITLE, font: { size: 10.5, color: "#6e7b8e" } },
    orientation: "h",
    x: 0,
    xanchor: "left",
    y: 1.04,
    yanchor: "bottom",
    font: { size: 10.5 },
  },
  xaxis: AXIS_BASE,
  yaxis: AXIS_BASE,
};

export function PlotlyFigure({
  testId,
  ariaLabel,
  data,
  layout,
  config,
}: PlotlyFigureProps) {
  const reducedMotion = usePrefersReducedMotion();

  const mergedLayout: Partial<Layout> = {
    ...BASE_LAYOUT,
    ...layout,
    xaxis: { ...AXIS_BASE, ...layout?.xaxis },
    yaxis: { ...AXIS_BASE, ...layout?.yaxis },
    legend: { ...BASE_LAYOUT.legend, ...layout?.legend },
    hoverlabel: { ...BASE_LAYOUT.hoverlabel, ...layout?.hoverlabel },
    // 减少动态时禁用过渡；普通情况也只用很短的过渡。
    transition: { duration: reducedMotion ? 0 : 250, easing: "cubic-in-out" },
  };

  // locale 显式固定为 en：本页所有可见文本都来自字典或数据，绝不根据浏览器语言"猜"。
  const mergedConfig: Partial<Config> = {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,
    locale: "en",
    ...config,
  };

  return (
    <div
      className="weather-plot"
      role="img"
      aria-label={ariaLabel}
      data-testid={`${testId}-plot`}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <BasePlot
        data={[...data]}
        layout={mergedLayout}
        config={mergedConfig}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
