/**
 * 图 3：日最高温分布直方图（按测站叠加）。
 *
 * Plotly 的 xbins 与下方数据表使用同一组等分区间，保证图表与表格数字一致；
 * 区间不是官方标准这一点写在说明与备注里。
 */
import type { Data, Layout } from "plotly.js-dist-min";

import { formatTranslation, translate } from "../../../i18n/dictionary";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";
import type { DailyRow, Station } from "../types";
import { buildHistogramSeries, computeHistogramBins, metricLabelEn, metricLabelZh } from "../transform";
import { ChartNote, metricNoteText } from "./ChartNote";
import { ChartShell } from "./ChartShell";
import { axisTitle, bilingualHtml } from "./PlotlyFigure";

export interface HistogramProps {
  readonly rows: readonly DailyRow[];
  readonly stations: readonly Station[];
  readonly reason?: string | null;
  readonly loading?: boolean;
}

export function Histogram({ rows, stations, reason = null, loading = false }: HistogramProps) {
  const series = buildHistogramSeries(rows, stations, "tmax");
  const bins = computeHistogramBins(series, 6);
  const hasData = bins !== null && bins.total > 0;

  const ariaLabel = formatTranslation("weather.chart.hist.aria", {
    stations: stations.length,
    samples: bins?.total ?? 0,
  })["zh-Hant"];

  const traces: Data[] = series.map(
    (item) =>
      ({
        type: "histogram",
        name: bilingualHtml(item.labelZh, item.labelEn),
        x: [...item.values],
        xbins: bins ? { start: bins.start, end: bins.end, size: bins.size } : undefined,
        opacity: 0.82,
        marker: { line: { width: 1, color: "#fffdf8" } },
        hovertemplate: `${formatTranslation("weather.chart.hist.hover", {
          station: item.stationNameZh,
        })["zh-Hant"]}<br>${formatTranslation("weather.chart.hist.hover", {
          station: item.stationNameEn,
        }).en}<extra></extra>`,
      }) as Data,
  );

  const layout: Partial<Layout> = {
    barmode: "overlay",
    bargap: 0.05,
    xaxis: {
      title: { text: axisTitle("weather.chart.axisTemperature") },
      automargin: true,
    },
    yaxis: {
      title: { text: axisTitle("weather.chart.axisDays") },
      automargin: true,
      zeroline: false,
    },
  };

  const binRangeLabel = translate("weather.chart.hist.binRange");
  const totalLabel = translate("weather.table.total");
  const tableColumns: DataTableColumn[] = [
    { key: "range", zh: binRangeLabel["zh-Hant"], en: binRangeLabel.en },
    ...series.map((item) => ({
      key: item.stationId,
      zh: item.stationNameZh,
      en: item.stationNameEn,
      numeric: true,
    })),
    { key: "total", zh: totalLabel["zh-Hant"], en: totalLabel.en, numeric: true },
  ];

  const tableRows: DataTableRow[] = (bins?.bins ?? []).map((bin) => ({
    key: `bin-${bin.index}`,
    cells: [bin.label, ...bin.counts.map(String), String(bin.total)],
  }));

  const samplesNote = formatTranslation("weather.chart.samples", { count: bins?.total ?? 0 });
  const note = metricNoteText(metricLabelZh("tmax"), metricLabelEn("tmax"));

  return (
    <ChartShell
      testId="chart-histogram"
      titleKey="weather.chart.hist.title"
      descriptionKey="weather.chart.hist.desc"
      note={
        <div className="weather-chart-card__notes">
          <ChartNote zh={note.zh} en={note.en} />
          <ChartNote zh={samplesNote["zh-Hant"]} en={samplesNote.en} />
        </div>
      }
      ariaLabel={ariaLabel}
      data={traces}
      layout={layout}
      loading={loading}
      empty={!hasData}
      emptyReason={reason}
      table={
        <DataTable
          testId="chart-histogram-table"
          caption={formatTranslation("weather.table.histCaption", {})}
          columns={tableColumns}
          rows={tableRows}
          emptyReason={reason}
        />
      }
    />
  );
}
