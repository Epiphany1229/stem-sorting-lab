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

const BASE_LAYOUT: Partial<Layout> = {
  autosize: true,
  margin: { l: 56, r: 24, t: 24, b: 56 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: {
    family:
      '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans", system-ui, sans-serif',
    size: 12,
    color: "#12263f",
  },
  colorway: ["#0f6f68", "#a85b00", "#b3264b", "#166534", "#4c5fd5", "#7a3e9d"],
  showlegend: true,
  hovermode: "closest",
  hoverlabel: {
    bgcolor: "#fffdf8",
    bordercolor: "#b9ae99",
    font: {
      family:
        '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans", system-ui, sans-serif',
      size: 12,
      color: "#12263f",
    },
  },
  legend: {
    title: { text: LEGEND_TITLE },
    orientation: "h",
    x: 0,
    xanchor: "left",
    y: 1.02,
    yanchor: "bottom",
    font: { size: 11 },
  },
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
