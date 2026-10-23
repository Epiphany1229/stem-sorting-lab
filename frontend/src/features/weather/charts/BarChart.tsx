/**
 * 图 2：柱状图。
 *
 * 阶段 3 没有任何降雨查询接口，因此默认画「所选站日最高温对比」，并在标题、
 * 说明与悬停里同时写明实际指标——绝不把气温画成降雨。
 * 组件预留 rainfallSeries 入参：只有上游真的拿到降雨指标时才切换成降雨图。
 */
import type { Data, Layout } from "plotly.js-dist-min";

import { formatTranslation, translate } from "../../../i18n/dictionary";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";
import type { DailyRow, Station, WeatherWindow } from "../types";
import {
  buildTmaxComparisonSeries,
  indexStations,
  metricLabelEn,
  metricLabelZh,
  type DailySeries,
  type RainfallSeries,
} from "../transform";
import { ChartNote, metricNoteText } from "./ChartNote";
import { ChartShell } from "./ChartShell";
import { axisTitle, bilingualHtml } from "./PlotlyFigure";

const PATTERNS = ["", "/", "x", "|", "-", "+", "."] as const;

export interface BarChartProps {
  readonly rows: readonly DailyRow[];
  readonly stations: readonly Station[];
  readonly window: WeatherWindow | null;
  readonly reason?: string | null;
  readonly loading?: boolean;
  /** 阶段 4 预留：只有接口返回降雨指标时才由页面传入，否则保持 undefined。 */
  readonly rainfallSeries?: readonly RainfallSeries[];
}

function seriesHasData(series: readonly DailySeries[]): boolean {
  return series.some((item) => item.values.some((value) => value !== null));
}

export function BarChart({
  rows,
  stations,
  window,
  reason = null,
  loading = false,
  rainfallSeries,
}: BarChartProps) {
  const hasRainfall =
    rainfallSeries !== undefined && rainfallSeries.some((item) => item.points.length > 0);
  const comparisonSeries = hasRainfall ? [] : buildTmaxComparisonSeries(rows, stations, window);
  const hasData = hasRainfall
    ? (rainfallSeries ?? []).some((item) => item.points.length > 0)
    : seriesHasData(comparisonSeries);

  const firstDates = comparisonSeries[0]?.dates;
  const windowStart = window?.start ?? firstDates?.[0] ?? "—";
  const windowEnd = window?.end ?? firstDates?.[firstDates.length - 1] ?? "—";

  const ariaLabel = hasRainfall
    ? formatTranslation("weather.chart.bar.ariaRainfall", {
        stations: stations.length,
        start: windowStart,
        end: windowEnd,
      })["zh-Hant"]
    : formatTranslation("weather.chart.bar.ariaFallback", {
        stations: stations.length,
        start: windowStart,
        end: windowEnd,
      })["zh-Hant"];

  const traces: Data[] = hasRainfall
    ? (rainfallSeries ?? []).map(
        (item, index) =>
          ({
            type: "bar",
            name: bilingualHtml(item.stationNameZh, item.stationNameEn),
            x: item.points.map((point) => point.date),
            y: item.points.map((point) => point.value),
            customdata: item.points.map((point) => point.valueRaw),
            marker: { pattern: { shape: PATTERNS[index % PATTERNS.length] } },
            hovertemplate: `${formatTranslation("weather.chart.bar.hoverRainfall", {
              station: item.stationNameZh,
            })["zh-Hant"]}<br>${formatTranslation("weather.chart.bar.hoverRainfall", {
              station: item.stationNameEn,
            }).en}<extra></extra>`,
          }) as Data,
      )
    : comparisonSeries.map(
        (item, index) =>
          ({
            type: "bar",
            name: bilingualHtml(item.labelZh, item.labelEn),
            x: [...item.dates],
            y: [...item.values],
            customdata: [...item.rawValues],
            marker: { pattern: { shape: PATTERNS[index % PATTERNS.length] } },
            hovertemplate: `${formatTranslation("weather.chart.bar.hoverFallback", {
              station: item.stationNameZh,
            })["zh-Hant"]}<br>${formatTranslation("weather.chart.bar.hoverFallback", {
              station: item.stationNameEn,
            }).en}<extra></extra>`,
          }) as Data,
      );

  const layout: Partial<Layout> = {
    barmode: "group",
    bargap: 0.2,
    xaxis: {
      type: "date",
      title: { text: axisTitle("weather.chart.axisDate") },
      automargin: true,
    },
    yaxis: {
      title: {
        text: axisTitle(hasRainfall ? "weather.table.rainfall" : "weather.chart.axisTemperature"),
      },
      automargin: true,
      zeroline: false,
    },
  };

  const stationIndex = indexStations(stations);
  const dateLabel = translate("weather.table.date");
  const stationLabel = translate("weather.table.station");
  const unitLabel = translate("weather.table.unit");
  const qualityLabel = translate("weather.table.quality");

  const fallbackColumns: DataTableColumn[] = [
    { key: "date", zh: dateLabel["zh-Hant"], en: dateLabel.en },
    { key: "station", zh: stationLabel["zh-Hant"], en: stationLabel.en },
    { key: "value", zh: metricLabelZh("tmax"), en: metricLabelEn("tmax"), numeric: true },
    { key: "unit", zh: unitLabel["zh-Hant"], en: unitLabel.en },
    { key: "quality", zh: qualityLabel["zh-Hant"], en: qualityLabel.en },
  ];

  const fallbackRows: DataTableRow[] = rows
    .filter(
      (row) =>
        row.metric === "tmax" &&
        stationIndex.has(row.station_id) &&
        (!window || (row.obs_date >= window.start && row.obs_date <= window.end)),
    )
    .slice()
    .sort(
      (a, b) => a.obs_date.localeCompare(b.obs_date) || a.station_id.localeCompare(b.station_id),
    )
    .map((row) => ({
      key: `${row.station_id}-${row.obs_date}`,
      cells: [
        row.obs_date,
        stationIndex.get(row.station_id)?.name_zh_hant ?? row.station_id,
        row.value_raw,
        row.unit,
        row.quality_flag,
      ],
    }));

  const rainfallLabel = translate("weather.table.rainfall");
  const rainfallColumns: DataTableColumn[] = [
    { key: "date", zh: dateLabel["zh-Hant"], en: dateLabel.en },
    { key: "station", zh: stationLabel["zh-Hant"], en: stationLabel.en },
    { key: "value", zh: rainfallLabel["zh-Hant"], en: rainfallLabel.en, numeric: true },
  ];

  const rainfallRows: DataTableRow[] = (rainfallSeries ?? [])
    .flatMap((item) =>
      item.points.map((point) => ({
        key: `${item.stationId}-${point.date}`,
        cells: [point.date, item.stationNameZh, point.valueRaw],
      })),
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  const note = hasRainfall
    ? {
        zh: translate("weather.chart.bar.noteRainfall")["zh-Hant"],
        en: translate("weather.chart.bar.noteRainfall").en,
      }
    : metricNoteText(metricLabelZh("tmax"), metricLabelEn("tmax"));

  return (
    <ChartShell
      testId="chart-bar"
      titleKey={hasRainfall ? "weather.chart.bar.titleRainfall" : "weather.chart.bar.titleFallback"}
      descriptionKey={
        hasRainfall ? "weather.chart.bar.descRainfall" : "weather.chart.bar.descFallback"
      }
      note={<ChartNote zh={note.zh} en={note.en} />}
      ariaLabel={ariaLabel}
      data={traces}
      layout={layout}
      loading={loading}
      empty={!hasData}
      emptyReason={reason}
      table={
        <DataTable
          testId="chart-bar-table"
          caption={formatTranslation(
            hasRainfall ? "weather.table.barRainfallCaption" : "weather.table.barCaption",
            {},
          )}
          columns={hasRainfall ? rainfallColumns : fallbackColumns}
          rows={hasRainfall ? rainfallRows : fallbackRows}
          emptyReason={reason}
        />
      }
    />
  );
}
