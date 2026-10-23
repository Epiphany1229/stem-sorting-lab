/**
 * 图 5：环形图——只表达「有效观测日中不同温度区间的天数占比」。
 *
 * 红线：
 * - 不代表「气温数值占比」，标题、说明、备注都写明天数占比语义；
 * - 必须标注区间阈值（图例 + 表格均列出）、有效样本量、缺失天数；
 * - 区间由后端 summary 计算并声明「非官方标准」，前端原样展示 threshold_note。
 */
import type { Data, Layout } from "plotly.js-dist-min";

import { formatTranslation, translate } from "../../../i18n/dictionary";
import { weatherErrorKey } from "../api";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";
import type { Station, SummaryResponse } from "../types";
import { buildDonutRows, metricLabelEn, metricLabelZh } from "../transform";
import { ChartNote } from "./ChartNote";
import { ChartShell } from "./ChartShell";

export interface DonutChartProps {
  readonly summary: SummaryResponse | undefined;
  readonly station?: Station | null;
  /** 有 summary 时的 reason（通常为 null）；没有 summary 时用于空状态说明。 */
  readonly reason?: string | null;
  /** summary 请求失败时展示分类后的双语错误，而不是空白。 */
  readonly error?: unknown;
  readonly loading?: boolean;
}

function bilingualSpan(zh: string, en: string): string {
  return `${zh}<br><span style="font-size:0.82em;font-weight:400;color:#3c4a5e">${en}</span>`;
}

export function DonutChart({
  summary,
  station = null,
  reason = null,
  error = null,
  loading = false,
}: DonutChartProps) {
  const rows = summary ? buildDonutRows(summary.bins, summary.valid_days) : [];
  const hasData =
    summary !== undefined && summary.valid_days > 0 && rows.some((row) => row.days > 0);
  const stationNameZh = station?.name_zh_hant ?? summary?.station_id ?? "—";
  const stationNameEn = station?.name_en ?? summary?.station_id ?? "—";

  const ariaLabel = formatTranslation("weather.chart.donut.aria", {
    station: stationNameZh,
    bins: summary?.bins.length ?? 0,
    valid: summary?.valid_days ?? 0,
    missing: summary?.missing_days ?? 0,
  })["zh-Hant"];

  const labels = rows.map((row) =>
    row.labelZh === row.labelEn ? row.labelZh : `${row.labelZh} / ${row.labelEn}`,
  );
  const hoverTemplate = translate("weather.chart.donut.hover");

  const traces: Data[] = hasData
    ? [
        {
          type: "pie",
          hole: 0.55,
          labels,
          values: rows.map((row) => row.days),
          textinfo: "label+percent",
          textposition: "inside",
          sort: false,
          marker: { line: { color: "#fffdf8", width: 2 } },
          hovertemplate: `${hoverTemplate["zh-Hant"]}<br>${hoverTemplate.en}<extra></extra>`,
        } as Data,
      ]
    : [];

  const centerZh = formatTranslation("weather.chart.donut.center", {
    valid: summary?.valid_days ?? 0,
  })["zh-Hant"];
  const centerEn = formatTranslation("weather.chart.donut.center", {
    valid: summary?.valid_days ?? 0,
  }).en;
  const missingZh = formatTranslation("weather.chart.donut.centerSub", {
    missing: summary?.missing_days ?? 0,
  })["zh-Hant"];
  const missingEn = formatTranslation("weather.chart.donut.centerSub", {
    missing: summary?.missing_days ?? 0,
  }).en;

  const layout: Partial<Layout> = {
    annotations: [
      {
        text: `${bilingualSpan(centerZh, centerEn)}<br>${bilingualSpan(missingZh, missingEn)}`,
        showarrow: false,
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        align: "center",
        font: { size: 12, color: "#12263f" },
      },
    ],
    margin: { l: 16, r: 16, t: 24, b: 16 },
  };

  const rangeLabel = translate("weather.chart.hist.binRange");
  const daysLabel = translate("weather.chart.axisDays");
  const shareLabel = translate("weather.table.share");
  const tableColumns: DataTableColumn[] = [
    { key: "range", zh: rangeLabel["zh-Hant"], en: rangeLabel.en },
    { key: "days", zh: daysLabel["zh-Hant"], en: daysLabel.en, numeric: true },
    { key: "share", zh: shareLabel["zh-Hant"], en: shareLabel.en, numeric: true },
  ];
  const tableRows: DataTableRow[] = rows.map((row, position) => ({
    key: `donut-${row.index}`,
    cells: [labels[position] ?? row.labelZh, String(row.days), row.shareText],
  }));

  const metricLabel = summary
    ? {
        zh: formatTranslation("weather.chart.donut.metricLabel", {
          station: stationNameZh,
          metric: metricLabelZh(summary.metric),
        })["zh-Hant"],
        en: formatTranslation("weather.chart.donut.metricLabel", {
          station: stationNameEn,
          metric: metricLabelEn(summary.metric),
        }).en,
      }
    : null;
  const validMissing = summary
    ? formatTranslation("weather.chart.donut.validMissing", {
        valid: summary.valid_days,
        missing: summary.missing_days,
      })
    : null;
  const errorText = !summary && error ? translate(weatherErrorKey(error)) : null;

  return (
    <ChartShell
      testId="chart-donut"
      titleKey="weather.chart.donut.title"
      descriptionKey="weather.chart.donut.desc"
      note={
        summary ? (
          <div className="weather-chart-card__notes">
            <ChartNote zh={summary.threshold_note["zh-Hant"]} en={summary.threshold_note.en} />
            {validMissing ? (
              <ChartNote zh={validMissing["zh-Hant"]} en={validMissing.en} />
            ) : null}
            {metricLabel ? <ChartNote zh={metricLabel.zh} en={metricLabel.en} /> : null}
          </div>
        ) : errorText ? (
          <ChartNote zh={errorText["zh-Hant"]} en={errorText.en} />
        ) : undefined
      }
      ariaLabel={ariaLabel}
      data={traces}
      layout={layout}
      loading={loading}
      empty={!hasData}
      emptyReason={summary?.reason ?? reason}
      table={
        <DataTable
          testId="chart-donut-table"
          caption={formatTranslation("weather.table.donutCaption", {})}
          columns={tableColumns}
          rows={tableRows}
          emptyReason={summary?.reason ?? reason}
        />
      }
    />
  );
}
