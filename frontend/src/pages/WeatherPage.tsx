/**
 * 香港天气数据探索页（阶段 3，阶段 4.7 按用户反馈最终收敛）。
 *
 * 数据流向：所有内容都来自后端天气接口；本地只保存测站选择。
 * - 日期窗口固定使用后端返回的「最近 30 天」，页面始终显示真实起止日期与覆盖率；
 * - 不提供日期范围、指标多选、CSV 导入、抓取/刷新入口或 demo 模式切换；
 *   用户端只读 official 库表，抓取与模式由运维在后端控制；
 * - 四类图表（折线 / 柱状 / 直方 / 环形）+ 可折叠可访问资料表；
 *   若响应信封仍返回非 official 数据，横幅照旧常驻、缺数据展示具体 reason。
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { BilingualText } from "../i18n/BilingualText";
import {
  buildExportCsvUrl,
  useWeatherCoverage,
  useWeatherDaily,
  useWeatherStations,
  useWeatherSummary,
  weatherErrorKey,
} from "../features/weather/api";
import { BarChart } from "../features/weather/charts/BarChart";
import { DonutChart } from "../features/weather/charts/DonutChart";
import { Histogram } from "../features/weather/charts/Histogram";
import { LineChart } from "../features/weather/charts/LineChart";
import { CoveragePanel } from "../features/weather/CoveragePanel";
import { DemoBanner } from "../features/weather/DemoBanner";
import { selectableStations, StationPicker } from "../features/weather/StationPicker";
import type { DailyMetric, DataMode } from "../features/weather/types";
import { WeatherSortEntryButton } from "../features/weather-sort/WeatherSortEntryButton";

/** summary 接口的区间数：教学页面固定 5 段，后端会在 threshold_note 说明非官方标准。 */
const SUMMARY_BIN_COUNT = 5;
/** 页面固定展示的指标：日最高温 / 日最低温（不再让用户多选）。 */
const CHART_METRICS: readonly DailyMetric[] = ["tmax", "tmin"];

export default function WeatherPage() {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const autoSelected = useRef(false);

  const stationsQuery = useWeatherStations("official");
  const stations = stationsQuery.data?.stations;
  const selectedStations = useMemo(
    () => (stations ?? []).filter((station) => selected.includes(station.id)),
    [stations, selected],
  );

  // 首次拿到测站清单时默认选第一个真的有资料的测站，减少一次手动操作。
  useEffect(() => {
    if (autoSelected.current || selected.length > 0 || !stations) {
      return;
    }
    const first = selectableStations(stations)[0];
    if (!first) {
      return;
    }
    autoSelected.current = true;
    setSelected([first.id]);
  }, [stations, selected.length]);

  // 不传日期：后端固定返回锚点前 30 天的真实窗口，页面只展示它。
  const queryParams = { stations: selected, metrics: CHART_METRICS, mode: "official" } as const;

  const coverageQuery = useWeatherCoverage(queryParams);
  const dailyQuery = useWeatherDaily(queryParams, selected.length > 0);
  const primaryStation = selected[0];
  const summaryQuery = useWeatherSummary(
    {
      station: primaryStation ?? "",
      metric: "tmax",
      bins: SUMMARY_BIN_COUNT,
      mode: "official",
    },
    primaryStation !== undefined,
  );

  // 横幅以「响应信封里的 mode/notice」为准，前端不自己判断数据是否演示。
  const envelope = dailyQuery.data ?? coverageQuery.data ?? stationsQuery.data ?? null;
  const bannerMode: DataMode = envelope?.mode ?? "official";
  const bannerNotice = envelope?.notice ?? null;
  const bannerSources = dailyQuery.data?.sources ?? coverageQuery.data?.sources ?? [];

  const window = dailyQuery.data?.window ?? coverageQuery.data?.window ?? null;
  const dailyRows = dailyQuery.data?.data ?? [];
  const dailyReason = dailyQuery.data?.reason ?? null;
  const dailyLoading = dailyQuery.isPending;
  const dailyError = dailyQuery.isError ? dailyQuery.error : null;

  const handleToggleStation = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleSelectAll = (ids: readonly string[]) => {
    setSelected((current) => {
      const merged = new Set(current);
      for (const id of ids) {
        merged.add(id);
      }
      return [...merged];
    });
  };

  const exportHref = buildExportCsvUrl(queryParams);
  const showChartsHint = selected.length === 0;

  return (
    <div className="page-stack">
      <PageHeader titleKey="weather.title" status="available" leadKey="weather.lead" />

      <WeatherSortEntryButton
        station={selected[0]}
        metric="tmax"
        start={window?.start}
        end={window?.end}
      />

      <DemoBanner mode={bannerMode} notice={bannerNotice} sources={bannerSources} />

      <CoveragePanel
        coverage={coverageQuery.data}
        stations={stations ?? []}
        loading={coverageQuery.isPending}
        error={coverageQuery.isError ? coverageQuery.error : null}
        onRetry={() => {
          void coverageQuery.refetch();
        }}
      />

      <div className="weather-layout">
        <StationPicker
          stations={stations}
          loading={stationsQuery.isPending}
          error={stationsQuery.isError ? stationsQuery.error : null}
          onRetry={() => {
            void stationsQuery.refetch();
          }}
          selected={selected}
          onToggle={handleToggleStation}
          onSelectAll={handleSelectAll}
          onClear={() => {
            autoSelected.current = true;
            setSelected([]);
          }}
        />

        <div className="weather-layout__side">
          <section
            className="weather-panel weather-options"
            aria-labelledby="weather-options-heading"
            data-testid="weather-options"
          >
            <h2 id="weather-options-heading">
              <BilingualText as="span" size="subtitle" tkey="weather.options.title" />
            </h2>
            <p className="weather-controls__hint">
              <BilingualText size="xs" tkey="weather.options.hint" />
            </p>
            <a
              className="btn btn--secondary"
              href={exportHref}
              download
              data-testid="export-csv"
            >
              <BilingualText as="span" size="sm" tkey="weather.controls.export" />
            </a>
          </section>
        </div>
      </div>

      <section
        className="weather-charts"
        aria-labelledby="weather-charts-heading"
        data-testid="weather-charts"
      >
        <h2 id="weather-charts-heading">
          <BilingualText as="span" size="subtitle" tkey="weather.page.chartsTitle" />
        </h2>
        <p className="weather-charts__lead">
          <BilingualText size="xs" tkey="weather.page.chartsLead" />
        </p>

        {showChartsHint ? (
          <p className="weather-charts__hint" data-testid="charts-no-selection">
            <BilingualText tkey="weather.page.emptySelection" />
          </p>
        ) : dailyError ? (
          <div role="alert" className="weather-alert" data-testid="charts-error">
            <h3>
              <BilingualText as="span" size="sm" tkey="weather.error.title" />
            </h3>
            <p>
              <BilingualText tkey={weatherErrorKey(dailyError)} />
            </p>
            <button
              type="button"
              className="btn btn--secondary mt-3"
              onClick={() => {
                void dailyQuery.refetch();
              }}
            >
              <BilingualText as="span" size="sm" tkey="weather.error.retry" />
            </button>
          </div>
        ) : (
          <>
            <LineChart
              rows={dailyRows}
              stations={selectedStations}
              metrics={CHART_METRICS}
              window={window}
              reason={dailyReason}
              loading={dailyLoading}
            />
            <BarChart
              rows={dailyRows}
              stations={selectedStations}
              window={window}
              reason={dailyReason}
              loading={dailyLoading}
            />
            <Histogram
              rows={dailyRows}
              stations={selectedStations}
              reason={dailyReason}
              loading={dailyLoading}
            />
            <DonutChart
              summary={summaryQuery.data}
              station={selectedStations[0] ?? null}
              reason={dailyReason}
              loading={summaryQuery.isPending}
              error={summaryQuery.isError ? summaryQuery.error : null}
            />
          </>
        )}
      </section>

      <footer className="weather-page__notes">
        <p>
          <BilingualText size="xs" tkey="weather.page.dataNote" />
        </p>
        <p>
          <BilingualText size="xs" tkey="weather.chart.sourceNote" />
        </p>
      </footer>
    </div>
  );
}
