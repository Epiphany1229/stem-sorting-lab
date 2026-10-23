/**
 * 用排序理解最近一个月的真实气温（阶段 4）。
 *
 * 页面只负责查询条件与布局：
 * - 每个指标（tmax / tmin）各自向后端要一份真实天气轨迹，前端不做排序、不推导事件；
 * - 播放器直接复用阶段 2 的 TracePlayer（含 CodePanel / PredictionDialog / 状态机）；
 * - 缺失日期、Top 5、排序前后顺序、STEM 对照数字全部来自后端轨迹；
 * - 切换任何查询条件都会产生新的轨迹对象，播放器随之重置为 idle。
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { BilingualText } from "../i18n/BilingualText";
import { translate } from "../i18n/dictionary";
import { useWeatherCoverage, useWeatherStations } from "../features/weather/api";
import { MissingDatesNotice } from "../features/weather-sort/MissingDatesNotice";
import type { MetricTraceState } from "../features/weather-sort/MissingDatesNotice";
import { isWeatherTraceReady, useWeatherTrace } from "../features/weather-sort/useWeatherTrace";
import { WeatherSortControls } from "../features/weather-sort/WeatherSortControls";
import { WeatherTracePanel } from "../features/weather-sort/WeatherTracePanel";
import { isWeatherMetric, WEATHER_METRICS } from "../features/weather-sort/weatherSortHelpers";
import type { Direction, WeatherMetric } from "../player/types";

export default function WeatherSortPage() {
  const [searchParams] = useSearchParams();

  // 初始条件优先来自 /weather 入口按钮携带的真实窗口。
  const [station, setStation] = useState(() => searchParams.get("station") ?? "");
  const [metric, setMetric] = useState<WeatherMetric>(() => {
    const value = searchParams.get("metric");
    return isWeatherMetric(value) ? value : "tmax";
  });
  const [start, setStart] = useState(() => searchParams.get("start") ?? "");
  const [end, setEnd] = useState(() => searchParams.get("end") ?? "");
  const [direction, setDirection] = useState<Direction>("asc");
  const [earlyExit, setEarlyExit] = useState(true);
  const [guidedMode, setGuidedMode] = useState(false);
  const [parallel, setParallel] = useState(false);

  const stationsQuery = useWeatherStations("official");
  const needsDefaultWindow = start.length === 0 || end.length === 0;
  // 直接打开本页时，用 /weather/coverage 返回的真实窗口作为默认日期，而不是猜日期。
  const coverageQuery = useWeatherCoverage({ mode: "official" }, needsDefaultWindow);

  useEffect(() => {
    if (station.length > 0) {
      return;
    }
    const list = stationsQuery.data?.stations;
    if (!list || list.length === 0) {
      return;
    }
    const first = list.find((item) => item.available_days > 0) ?? list[0];
    setStation(first.id);
  }, [station, stationsQuery.data]);

  useEffect(() => {
    if (!needsDefaultWindow) {
      return;
    }
    const window = coverageQuery.data?.window;
    if (!window) {
      return;
    }
    setStart(window.start);
    setEnd(window.end);
  }, [needsDefaultWindow, coverageQuery.data]);

  const effectiveStart = start || coverageQuery.data?.window.start || "";
  const effectiveEnd = end || coverageQuery.data?.window.end || "";
  const dateInvalid =
    (start.length > 0 && end.length === 0) ||
    (start.length === 0 && end.length > 0) ||
    (start.length > 0 && end.length > 0 && start > end);

  const unit = translate("weatherSort.unitCelsius")["zh-Hant"];

  const paramsFor = (metricValue: WeatherMetric) => ({
    station,
    metric: metricValue,
    start: effectiveStart,
    end: effectiveEnd,
    direction,
    earlyExit,
  });

  const tmaxParams = paramsFor("tmax");
  const tminParams = paramsFor("tmin");
  const ready = !dateInvalid && isWeatherTraceReady(tmaxParams);
  const tmaxQuery = useWeatherTrace(tmaxParams, ready);
  const tminQuery = useWeatherTrace(tminParams, ready);

  const stateFor = (metricValue: WeatherMetric): MetricTraceState => {
    const query = metricValue === "tmax" ? tmaxQuery : tminQuery;
    return {
      metric: metricValue,
      trace: query.data,
      loading: ready && query.isPending,
      error: query.isError ? query.error : null,
    };
  };
  const states = WEATHER_METRICS.map(stateFor);
  const activeQuery = metric === "tmax" ? tmaxQuery : tminQuery;
  const activeState = metric === "tmax" ? states[0] : states[1];

  const notReadyKey = dateInvalid
    ? "weather.controls.dateInvalid"
    : station.length === 0
      ? "weatherSort.stationMissing"
      : "weatherSort.rangeMissing";

  return (
    <div className="page-stack">
      <PageHeader titleKey="weatherSort.title" status="available" leadKey="weatherSort.lead" />

      {ready ? (
        <MissingDatesNotice states={states} />
      ) : (
        <section className="weather-panel" data-testid="weather-sort-not-ready">
          <p>
            <BilingualText tkey={notReadyKey} />
          </p>
        </section>
      )}

      <WeatherSortControls
        stations={stationsQuery.data?.stations}
        stationsLoading={stationsQuery.isPending}
        stationsError={stationsQuery.isError ? stationsQuery.error : null}
        station={station}
        onStationChange={setStation}
        metric={metric}
        onMetricChange={setMetric}
        direction={direction}
        onDirectionChange={setDirection}
        earlyExit={earlyExit}
        onEarlyExitChange={setEarlyExit}
        guidedMode={guidedMode}
        onGuidedModeChange={setGuidedMode}
        parallel={parallel}
        onParallelChange={setParallel}
        start={start}
        end={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        dateInvalid={dateInvalid}
      />

      <div
        className={parallel ? "weather-sort__players weather-sort__players--parallel" : "weather-sort__players"}
        data-testid="weather-sort-players"
      >
        {!ready ? (
          <p className="weather-sort__hint">
            <BilingualText size="xs" tkey={notReadyKey} />
          </p>
        ) : parallel ? (
          WEATHER_METRICS.map((metricValue) => {
            const state = metricValue === "tmax" ? states[0] : states[1];
            const query = metricValue === "tmax" ? tmaxQuery : tminQuery;
            return (
              <WeatherTracePanel
                key={metricValue}
                metric={metricValue}
                trace={state.trace}
                loading={state.loading}
                error={state.error}
                guidedMode={guidedMode}
                unit={unit}
                onRetry={() => {
                  void query.refetch();
                }}
              />
            );
          })
        ) : (
          <WeatherTracePanel
            key={metric}
            metric={metric}
            trace={activeState.trace}
            loading={activeState.loading}
            error={activeState.error}
            guidedMode={guidedMode}
            unit={unit}
            onRetry={() => {
              void activeQuery.refetch();
            }}
          />
        )}
      </div>

      <p className="weather-sort__source-note">
        <BilingualText size="xs" tkey="weatherSort.sourceNote" />
      </p>
    </div>
  );
}
