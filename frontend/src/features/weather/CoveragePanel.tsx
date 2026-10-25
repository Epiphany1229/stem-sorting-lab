/**
 * 覆盖率面板：真实窗口、有效天数、缺失天数、最后可用日，以及各测站明细。
 *
 * 缺数据时必须给出原因（后端固定 reason 集合），不能留空白或只说「暂无数据」。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation, translate } from "../../i18n/dictionary";
import type { TranslationKey } from "../../i18n/dictionary";
import { DataTable } from "./DataTable";
import type { DataTableColumn, DataTableRow } from "./DataTable";
import type { CoverageResponse, Station } from "./types";
import { weatherErrorKey } from "./api";
import {
  buildCoverageTableRows,
  buildSourceRows,
  formatTimestamp,
  weatherReasonKey,
} from "./transform";

export interface CoveragePanelProps {
  readonly coverage: CoverageResponse | undefined;
  readonly stations: readonly Station[];
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

function Stat({ tkey, value }: { tkey: TranslationKey; value: string }) {
  return (
    <div className="weather-stat">
      <dt className="weather-stat__label">
        <BilingualText size="xs" tkey={tkey} />
      </dt>
      <dd className="weather-stat__value">{value}</dd>
    </div>
  );
}

function ReasonBlock({ reason }: { reason: string }) {
  return (
    <div className="weather-reason" role="note" data-testid="coverage-reason">
      <p className="weather-reason__label">
        <BilingualText size="xs" tkey="weather.coverage.reasonLabel" />
      </p>
      <p className="weather-reason__text">
        <BilingualText size="xs" tkey={weatherReasonKey(reason)} />
      </p>
      <p className="weather-reason__code">
        <BilingualText size="xs" tkey="weather.coverage.reasonCode" />
        {": "}
        <code>{reason}</code>
      </p>
    </div>
  );
}

export function CoveragePanel({
  coverage,
  stations,
  loading,
  error,
  onRetry,
}: CoveragePanelProps) {
  const windowValue = coverage
    ? formatTranslation("weather.coverage.windowValue", {
        start: coverage.window.start,
        end: coverage.window.end,
        days: coverage.window.requested_days,
      })
    : null;

  const coverageRows = coverage
    ? buildCoverageTableRows(coverage.coverage.per_station ?? [], stations)
    : [];

  const stationLabel = translate("weather.table.station");
  const metricLabel = translate("weather.table.metric");
  const daysLabel = translate("weather.table.daysWithData");
  const firstLabel = translate("weather.table.firstDate");
  const lastLabel = translate("weather.table.lastDate");
  const missingLabel = translate("weather.table.missingCount");
  const incompleteLabel = translate("weather.table.incompleteCount");

  const coverageColumns: DataTableColumn[] = [
    { key: "station", zh: stationLabel["zh-Hant"], en: stationLabel.en },
    { key: "metric", zh: metricLabel["zh-Hant"], en: metricLabel.en },
    { key: "days", zh: daysLabel["zh-Hant"], en: daysLabel.en, numeric: true },
    { key: "first", zh: firstLabel["zh-Hant"], en: firstLabel.en },
    { key: "last", zh: lastLabel["zh-Hant"], en: lastLabel.en },
    { key: "missing", zh: missingLabel["zh-Hant"], en: missingLabel.en, numeric: true },
    { key: "incomplete", zh: incompleteLabel["zh-Hant"], en: incompleteLabel.en, numeric: true },
  ];

  const coverageTableRows: DataTableRow[] = coverageRows.map((row) => ({
    key: row.key,
    cells: [
      row.stationNameZh,
      `${row.metricZh} / ${row.metricEn}`,
      String(row.daysWithData),
      row.firstDate,
      row.lastDate,
      String(row.missingCount),
      String(row.incompleteCount),
    ],
  }));

  const sourceRows = coverage ? buildSourceRows(coverage.sources) : [];
  const datasetLabel = translate("weather.table.dataset");
  const endpointLabel = translate("weather.table.endpoint");
  const fetchedLabel = translate("weather.table.fetchedAt");
  const modeLabel = translate("weather.table.mode");
  const sourceColumns: DataTableColumn[] = [
    { key: "dataset", zh: datasetLabel["zh-Hant"], en: datasetLabel.en },
    { key: "endpoint", zh: endpointLabel["zh-Hant"], en: endpointLabel.en },
    { key: "fetched", zh: fetchedLabel["zh-Hant"], en: fetchedLabel.en },
    { key: "mode", zh: modeLabel["zh-Hant"], en: modeLabel.en },
  ];
  const sourceTableRows: DataTableRow[] = sourceRows.map((row) => ({
    key: row.key,
    cells: [row.dataset, row.endpoint, row.fetchedAt, row.mode],
  }));

  return (
    <section className="weather-panel" aria-labelledby="weather-coverage-heading" data-testid="coverage-panel">
      <h2 id="weather-coverage-heading">
        <BilingualText as="span" size="subtitle" tkey="weather.coverage.title" />
      </h2>

      {/* 第一行醒目注明资料来源（用户要求置顶）。 */}
      <p className="weather-coverage__source" data-testid="coverage-source">
        <BilingualText size="sm" tkey="weather.coverage.sourceLine" />
      </p>

      {error ? (
        <div role="alert" className="weather-alert" data-testid="coverage-error">
          <h3>
            <BilingualText as="span" size="sm" tkey="weather.error.title" />
          </h3>
          <p>
            <BilingualText tkey={weatherErrorKey(error)} />
          </p>
          <button type="button" className="btn btn--secondary mt-3" onClick={onRetry}>
            <BilingualText as="span" size="sm" tkey="weather.error.retry" />
          </button>
        </div>
      ) : loading ? (
        <p role="status" data-testid="coverage-loading">
          <BilingualText tkey="weather.coverage.loading" />
        </p>
      ) : coverage ? (
        <>
          <div className="weather-coverage__window">
            <span className="weather-coverage__window-label">
              <BilingualText size="xs" tkey="weather.coverage.windowLabel" />
            </span>
            {windowValue ? (
              <span className="weather-coverage__window-value" data-testid="coverage-window">
                <BilingualText zh={windowValue["zh-Hant"]} en={windowValue.en} />
              </span>
            ) : null}
          </div>

          <dl className="weather-stats">
            <Stat
              tkey="weather.coverage.daysWithData"
              value={String(coverage.coverage.days_with_data)}
            />
            <Stat
              tkey="weather.coverage.daysMissing"
              value={String(coverage.coverage.days_missing)}
            />
            <Stat
              tkey="weather.coverage.lastAvailable"
              value={formatTimestamp(coverage.coverage.last_available_date)}
            />
            <Stat
              tkey="weather.coverage.anchorLabel"
              value={formatTimestamp(coverage.window.anchor)}
            />
          </dl>

          {coverage.reason ? <ReasonBlock reason={coverage.reason} /> : null}
          {coverage.coverage.days_with_data === 0 ? (
            <p className="weather-coverage__none" data-testid="coverage-none">
              <BilingualText tkey="weather.coverage.none" />
            </p>
          ) : null}

          {coverageRows.length > 0 ? (
            <div className="weather-panel__block">
              <h3>
                <BilingualText as="span" size="sm" tkey="weather.coverage.perStationTitle" />
              </h3>
              <DataTable
                testId="coverage-table"
                caption={formatTranslation("weather.table.coverageCaption", {})}
                columns={coverageColumns}
                rows={coverageTableRows}
              />
            </div>
          ) : null}

          {sourceRows.length > 0 ? (
            <div className="weather-panel__block">
              <h3>
                <BilingualText as="span" size="sm" tkey="weather.coverage.sourcesTitle" />
              </h3>
              <DataTable
                testId="coverage-sources"
                caption={formatTranslation("weather.table.sourcesCaption", {})}
                columns={sourceColumns}
                rows={sourceTableRows}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

