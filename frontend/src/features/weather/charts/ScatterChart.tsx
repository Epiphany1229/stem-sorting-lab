/**
 * 图 4：散点图。
 *
 * 阶段 3 没有湿度历史接口，默认画同日的 tmax（横轴）vs tmean（纵轴），
 * 并在标题说明、备注与悬停里明确写出实际指标，绝不冒充湿度。
 * 组件预留 humiditySeries：只有上游真的拿到湿度时才切换。
 */
import type { Data, Layout } from "plotly.js-dist-min";

import { formatTranslation, translate } from "../../../i18n/dictionary";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";
import type { DailyRow, Station, WeatherWindow } from "../types";
import { buildScatterSeries, type ScatterSeries } from "../transform";
import { ChartNote } from "./ChartNote";
import { ChartShell } from "./ChartShell";
import { axisTitle, bilingualHtml } from "./PlotlyFigure";

const STATION_SYMBOLS = ["circle", "square", "diamond", "triangle-up", "cross", "star"] as const;

export interface ScatterChartProps {
  readonly rows: readonly DailyRow[];
  readonly stations: readonly Station[];
  readonly window: WeatherWindow | null;
  readonly reason?: string | null;
  readonly loading?: boolean;
  /** 阶段 4 预留：只有接口真正返回湿度观测时才由页面传入。 */
  readonly humiditySeries?: readonly ScatterSeries[];
}

export function ScatterChart({
  rows,
  stations,
  window,
  reason = null,
  loading = false,
  humiditySeries,
}: ScatterChartProps) {
  const usingHumidity =
    humiditySeries !== undefined && humiditySeries.some((item) => item.points.length > 0);
  const series = usingHumidity
    ? (humiditySeries ?? [])
    : buildScatterSeries(rows, stations, window);
  const hasData = series.some((item) => item.points.length > 0);

  const ariaLabel = usingHumidity
    ? formatTranslation("weather.chart.scatter.ariaHumidity", {
        stations: stations.length,
      })["zh-Hant"]
    : formatTranslation("weather.chart.scatter.aria", {
        stations: stations.length,
      })["zh-Hant"];

  const hoverTemplate = (stationZh: string, stationEn: string): string => {
    const key = usingHumidity
      ? "weather.chart.scatter.hoverHumidity"
      : "weather.chart.scatter.hoverMean";
    const zh = formatTranslation(key, { station: stationZh })["zh-Hant"];
    const en = formatTranslation(key, { station: stationEn }).en;
    return `${zh}<br>${en}<extra></extra>`;
  };

  const traces: Data[] = series.map(
    (item, index) =>
      ({
        type: "scatter",
        mode: "markers",
        name: bilingualHtml(item.labelZh, item.labelEn),
        x: item.points.map((point) => point.x),
        y: item.points.map((point) => point.y),
        text: item.points.map((point) => point.date),
        customdata: item.points.map((point) => [point.xRaw, point.yRaw]),
        marker: {
          size: 9,
          symbol: STATION_SYMBOLS[index % STATION_SYMBOLS.length],
          opacity: 0.85,
          line: { width: 1, color: "#fffdf8" },
        },
        hovertemplate: hoverTemplate(item.stationNameZh, item.stationNameEn),
      }) as Data,
  );

  const yTitleKey = usingHumidity
    ? "weather.chart.scatter.yTitleHumidity"
    : "weather.chart.scatter.yTitleMean";
  const layout: Partial<Layout> = {
    xaxis: {
      title: { text: axisTitle("weather.chart.scatter.xTitle") },
      automargin: true,
      zeroline: false,
    },
    yaxis: {
      title: { text: axisTitle(yTitleKey) },
      automargin: true,
      zeroline: false,
    },
    hovermode: "closest",
  };

  const dateLabel = translate("weather.table.date");
  const stationLabel = translate("weather.table.station");
  const xLabel = translate("weather.chart.scatter.xTitle");
  const yMetricLabel = usingHumidity
    ? translate("weather.controls.metric.humidity")
    : translate("weather.controls.metric.tmean");

  const tableColumns: DataTableColumn[] = [
    { key: "date", zh: dateLabel["zh-Hant"], en: dateLabel.en },
    { key: "station", zh: stationLabel["zh-Hant"], en: stationLabel.en },
    { key: "x", zh: xLabel["zh-Hant"], en: xLabel.en, numeric: true },
    { key: "y", zh: yMetricLabel["zh-Hant"], en: yMetricLabel.en, numeric: true },
  ];

  const tableRows: DataTableRow[] = series
    .flatMap((item) =>
      item.points.map((point) => ({
        key: `${item.stationId}-${point.date}`,
        cells: [point.date, item.stationNameZh, point.xRaw, point.yRaw],
      })),
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  const note = usingHumidity
    ? translate("weather.chart.scatter.noteHumidity")
    : translate("weather.chart.scatter.noteMean");

  return (
    <ChartShell
      testId="chart-scatter"
      titleKey="weather.chart.scatter.title"
      descriptionKey={
        usingHumidity ? "weather.chart.scatter.descHumidity" : "weather.chart.scatter.descMean"
      }
      note={<ChartNote zh={note["zh-Hant"]} en={note.en} />}
      ariaLabel={ariaLabel}
      data={traces}
      layout={layout}
      loading={loading}
      empty={!hasData}
      emptyReason={reason}
      table={
        <DataTable
          testId="chart-scatter-table"
          caption={formatTranslation(
            usingHumidity
              ? "weather.table.scatterHumidityCaption"
              : "weather.table.scatterCaption",
            {},
          )}
          columns={tableColumns}
          rows={tableRows}
          emptyReason={reason}
        />
      }
    />
  );
}
