/**
 * 香港天气数据探索页（阶段 3）。
 *
 * 数据流向：所有内容都来自后端天气接口；本地只保存查询条件（日期 / 测站 / 指标 / mode）。
 * 页面绝不生成或插入任何天气数值：
 * - 非 official 模式由后端信封决定，常驻横幅；
 * - 缺数据时展示后端 reason 的具体双语说明；
 * - 五类图表 + 可访问资料表；降雨/湿度只有阶段 4 的组件入参位置。
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { BilingualText } from "../i18n/BilingualText";
import {
  buildExportCsvUrl,
  DEFAULT_METRICS,
  useWeatherCoverage,
  useWeatherDaily,
  useWeatherStations,
  useWeatherSummary,
  weatherErrorKey,
} from "../features/weather/api";
import type { WeatherQueryParams } from "../features/weather/api";
import { BarChart } from "../features/weather/charts/BarChart";
import { DonutChart } from "../features/weather/charts/DonutChart";
import { Histogram } from "../features/weather/charts/Histogram";
import { LineChart } from "../features/weather/charts/LineChart";
import { ScatterChart } from "../features/weather/charts/ScatterChart";
import { CoveragePanel } from "../features/weather/CoveragePanel";
import { CsvImport } from "../features/weather/CsvImport";
import { DemoBanner } from "../features/weather/DemoBanner";
import { RefreshControl } from "../features/weather/RefreshControl";
import { StationPicker } from "../features/weather/StationPicker";
import type { DailyMetric, DataMode } from "../features/weather/types";
import { WeatherControls } from "../features/weather/WeatherControls";
import { WeatherSortEntryButton } from "../features/weather-sort/WeatherSortEntryButton";

/** summary 接口的区间数：教学页面固定 5 段，后端会在 threshold_note 说明非官方标准。 */
const SUMMARY_BIN_COUNT = 5;

export default function WeatherPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [metrics, setMetrics] = useState<readonly DailyMetric[]>([...DEFAULT_METRICS]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dataMode, setDataMode] = useState<DataMode>("official");
  const autoSelected = useRef(false);

  const stationsQuery = useWeatherStations(dataMode);
  const stations = stationsQuery.data?.stations;
  const selectedStations = useMemo(
    () => (stations ?? []).filter((station) => selected.includes(station.id)),
    [stations, selected],
  );

  // 首次拿到测站清单时默认选第一个有资料的测站，减少一次手动操作。
  useEffect(() => {
    if (autoSelected.current || selected.length > 0 || !stations || stations.length === 0) {
      return;
    }
    const first = stations.find((station) => station.available_days > 0) ?? stations[0];
    autoSelected.current = true;
    setSelected([first.id]);
  }, [stations, selected.length]);

  const dateInvalid =
    (start.length > 0 && end.length === 0) ||
    (start.length === 0 && end.length > 0) ||
    (start.length > 0 && end.length > 0 && start > end);

  const queryParams: WeatherQueryParams = {
    start: start || undefined,
    end: end || undefined,
    stations: selected,
    metrics,
    mode: dataMode,
  };

  const coverageQuery = useWeatherCoverage(
    queryParams,
    selected.length > 0 && !dateInvalid,
  );
  const dailyQuery = useWeatherDaily(
    queryParams,
    selected.length > 0 && metrics.length > 0 && !dateInvalid,
  );
  const primaryStation = selected[0];
  const summaryQuery = useWeatherSummary(
    {
      start: start || undefined,
      end: end || undefined,
      station: primaryStation ?? "",
      metric: "tmax",
      bins: SUMMARY_BIN_COUNT,
      mode: dataMode,
    },
    primaryStation !== undefined && !dateInvalid,
  );

  // 横幅以「响应信封里的 mode/notice」为准，前端不自己判断数据是否演示。
  const envelope = dailyQuery.data ?? coverageQuery.data ?? stationsQuery.data ?? null;
  const bannerMode: DataMode = envelope?.mode ?? "official";
  const bannerNotice = envelope?.notice ?? null;
  const bannerSources =
    dailyQuery.data?.sources ?? coverageQuery.data?.sources ?? [];

  const window = dailyQuery.data?.window ?? coverageQuery.data?.window ?? null;
  const dailyRows = dailyQuery.data?.data ?? [];
  const dailyReason = dailyQuery.data?.reason ?? null;
  const dailyLoading = dailyQuery.isPending;
  const dailyError = dailyQuery.isError ? dailyQuery.error : null;

  const invalidateWeather = () => {
    void queryClient.invalidateQueries({ queryKey: ["weather"] });
  };

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

  const handleToggleMetric = (metric: DailyMetric) => {
    setMetrics((current) => {
      if (current.includes(metric)) {
        // 至少保留一个指标，避免图表全部禁用。
        return current.length > 1 ? current.filter((item) => item !== metric) : current;
      }
      return [...current, metric];
    });
  };

  const handleImported = () => {
    // 导入完成后按契约用 mode=imported 重新读取产品状态。
    setDataMode("imported");
    invalidateWeather();
  };

  const exportHref = buildExportCsvUrl(queryParams);
  const showChartsHint = selected.length === 0;
  // 阶段 4 入口：携带当前主测站、指标与后端返回的真实数据窗口。
  const weatherSortMetric: "tmax" | "tmin" = metrics.includes("tmax") ? "tmax" : "tmin";

  return (
    <div className="page-stack">
      <PageHeader titleKey="weather.title" status="available" leadKey="weather.lead" />

      <WeatherSortEntryButton
        station={selected[0]}
        metric={weatherSortMetric}
        start={window?.start}
        end={window?.end}
      />

      <DemoBanner mode={bannerMode} notice={bannerNotice} sources={bannerSources} />

      <CoveragePanel
        coverage={coverageQuery.data}
        stations={stations ?? []}
        loading={coverageQuery.isPending && selected.length > 0}
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
          <WeatherControls
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
            metrics={metrics}
            onToggleMetric={handleToggleMetric}
            dataMode={dataMode}
            onDemoChange={(enabled) => setDataMode(enabled ? "demo" : "official")}
            onBackToOfficial={() => setDataMode("official")}
            exportHref={exportHref}
            dateInvalid={dateInvalid}
          />

          <RefreshControl onRefreshed={invalidateWeather} />

          <CsvImport onImported={handleImported} />
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
              metrics={metrics}
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
            <ScatterChart
              rows={dailyRows}
              stations={selectedStations}
              window={window}
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
