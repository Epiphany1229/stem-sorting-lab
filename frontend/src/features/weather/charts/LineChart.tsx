/**
 * 图 1：气温趋势折线图（所选测站的日 tmax / tmin / tmean）。
 *
 * 缺口处理：窗口内没有观测的日期补 null，并设 connectgaps=false，折线在缺口处断开，
 * 绝不用直线连接两端；悬停文本用 value_raw 保精度。
 */
import type { Data, Layout } from "plotly.js-dist-min";

import { formatTranslation, translate } from "../../../i18n/dictionary";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";
import type { DailyMetric, DailyRow, Station, WeatherWindow } from "../types";
import {
  buildDailySeries,
  indexStations,
  metricLabelEn,
  metricLabelZh,
  type DailySeries,
} from "../transform";
import { ChartNote, metricNoteText } from "./ChartNote";
import { ChartShell } from "./ChartShell";
import { axisTitle, bilingualHtml } from "./PlotlyFigure";

const METRIC_DASH: Record<DailyMetric, "solid" | "dash" | "dot"> = {
  tmax: "solid",
  tmin: "dash",
  tmean: "dot",
};

const STATION_SYMBOLS = ["circle", "square", "diamond", "triangle-up", "cross", "star"] as const;

export interface LineChartProps {
  readonly rows: readonly DailyRow[];
  readonly stations: readonly Station[];
  readonly metrics: readonly DailyMetric[];
  readonly window: WeatherWindow | null;
  readonly reason?: string | null;
  readonly loading?: boolean;
}

function seriesHasData(series: readonly DailySeries[]): boolean {
  return series.some((item) => item.values.some((value) => value !== null));
}

export function LineChart({
  rows,
  stations,
  metrics,
  window,
  reason = null,
  loading = false,
}: LineChartProps) {
  const series = buildDailySeries(rows, stations, metrics, window);
  const hasData = seriesHasData(series);
  const firstDates = series[0]?.dates;
  const windowStart = window?.start ?? firstDates?.[0] ?? "—";
  const windowEnd = window?.end ?? firstDates?.[firstDates.length - 1] ?? "—";
  const ariaLabel = formatTranslation("weather.chart.line.aria", {
    stations: stations.length,
    start: windowStart,
    end: windowEnd,
  })["zh-Hant"];

  const traces: Data[] = series.map((item, index) => {
    const stationIndex = stations.findIndex((station) => station.id === item.stationId);
    const symbol =
      STATION_SYMBOLS[(stationIndex >= 0 ? stationIndex : index) % STATION_SYMBOLS.length];
    const hoverZh = formatTranslation("weather.chart.line.hover", {
      station: item.stationNameZh,
      metric: metricLabelZh(item.metric),
    })["zh-Hant"];
    const hoverEn = formatTranslation("weather.chart.line.hover", {
      station: item.stationNameEn,
      metric: metricLabelEn(item.metric),
    }).en;

    return {
      type: "scatter",
      mode: "lines+markers",
      name: bilingualHtml(item.labelZh, item.labelEn),
      x: [...item.dates],
      y: [...item.values],
      customdata: [...item.rawValues],
      connectgaps: false,
      line: { dash: METRIC_DASH[item.metric], width: 2 },
      marker: { size: 6, symbol },
      hovertemplate: `${hoverZh}<br>${hoverEn}<extra></extra>`,
    } as Data;
  });

  const layout: Partial<Layout> = {
    xaxis: {
      type: "date",
      title: { text: axisTitle("weather.chart.axisDate") },
      automargin: true,
    },
    yaxis: {
      title: { text: axisTitle("weather.chart.axisTemperature") },
      automargin: true,
      zeroline: false,
    },
    hovermode: "closest",
  };

  const stationIndex = indexStations(stations);
  const dateLabel = translate("weather.table.date");
  const stationLabel = translate("weather.table.station");
  const metricLabel = translate("weather.table.metric");
  const valueLabel = translate("weather.table.value");
  const unitLabel = translate("weather.table.unit");
  const qualityLabel = translate("weather.table.quality");

  const tableColumns: DataTableColumn[] = [
    { key: "date", zh: dateLabel["zh-Hant"], en: dateLabel.en },
    { key: "station", zh: stationLabel["zh-Hant"], en: stationLabel.en },
    { key: "metric", zh: metricLabel["zh-Hant"], en: metricLabel.en },
    { key: "value", zh: valueLabel["zh-Hant"], en: valueLabel.en, numeric: true },
    { key: "unit", zh: unitLabel["zh-Hant"], en: unitLabel.en },
    { key: "quality", zh: qualityLabel["zh-Hant"], en: qualityLabel.en },
  ];

  const tableRows: DataTableRow[] = rows
    .filter((row) => metrics.includes(row.metric) && stationIndex.has(row.station_id))
    .slice()
    .sort(
      (a, b) =>
        a.obs_date.localeCompare(b.obs_date) ||
        a.station_id.localeCompare(b.station_id) ||
        a.metric.localeCompare(b.metric),
    )
    .map((row) => {
      const station = stationIndex.get(row.station_id);
      return {
        key: `${row.station_id}-${row.metric}-${row.obs_date}`,
        cells: [
          row.obs_date,
          station?.name_zh_hant ?? row.station_id,
          metricLabelZh(row.metric),
          row.value_raw,
          row.unit,
          row.quality_flag,
        ],
      };
    });

  const note = metricNoteText(
    `${metricLabelZh("tmax")} / ${metricLabelZh("tmin")}`,
    `${metricLabelEn("tmax")} / ${metricLabelEn("tmin")}`,
  );

  return (
    <ChartShell
      testId="chart-line"
      titleKey="weather.chart.line.title"
      descriptionKey="weather.chart.line.desc"
      note={<ChartNote zh={note.zh} en={note.en} />}
      ariaLabel={ariaLabel}
      data={traces}
      layout={layout}
      loading={loading}
      empty={!hasData}
      emptyReason={reason}
      table={
        <DataTable
          testId="chart-line-table"
          caption={formatTranslation("weather.table.lineCaption", {})}
          columns={tableColumns}
          rows={tableRows}
          emptyReason={reason}
        />
      }
    />
  );
}
