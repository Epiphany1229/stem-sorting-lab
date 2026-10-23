/**
 * 天气数据层：TanStack Query hooks + 统一的请求/校验/错误分类。
 *
 * 这里没有任何图表计算：请求参数原样提交，响应经严格契约校验后返回。
 * 所有 GET 请求都支持 mode=demo / mode=imported（§3「通用查询参数」），
 * mode=official 时省略该参数（契约默认值）。
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import { ApiError, apiGet, apiPost, apiPostForm, apiUrl } from "../../api/client";
import type { TranslationKey } from "../../i18n/dictionary";
import {
  parseCoverageResponse,
  parseDailyResponse,
  parseImportResponse,
  parseRefreshResponse,
  parseSourcesResponse,
  parseStationsEnvelope,
  parseSummaryResponse,
  WeatherProtocolError,
} from "./validation";
import type {
  CoverageResponse,
  DailyMetric,
  DailyResponse,
  DataMode,
  ImportResponse,
  RefreshResponse,
  SourcesResponse,
  StationsEnvelope,
  SummaryResponse,
} from "./types";

export const WEATHER_ENDPOINTS = {
  stations: "/weather/stations",
  coverage: "/weather/coverage",
  daily: "/weather/daily",
  summary: "/weather/summary",
  refresh: "/weather/refresh",
  import: "/weather/import",
  exportCsv: "/weather/export.csv",
  sources: "/sources",
} as const;

export interface WeatherQueryParams {
  readonly start?: string;
  readonly end?: string;
  readonly stations?: readonly string[];
  readonly metrics?: readonly DailyMetric[];
  readonly mode: DataMode;
}

export interface SummaryQueryParams {
  readonly start?: string;
  readonly end?: string;
  readonly station: string;
  readonly metric: DailyMetric;
  readonly bins: number;
  readonly mode: DataMode;
}

/** 组装查询字符串；mode=official 时省略，避免把默认值写进 URL。 */
export function buildWeatherQueryString(params: WeatherQueryParams): string {
  const search = new URLSearchParams();
  if (params.start) {
    search.set("start", params.start);
  }
  if (params.end) {
    search.set("end", params.end);
  }
  if (params.stations && params.stations.length > 0) {
    search.set("stations", params.stations.join(","));
  }
  if (params.metrics && params.metrics.length > 0) {
    search.set("metrics", params.metrics.join(","));
  }
  if (params.mode !== "official") {
    search.set("mode", params.mode);
  }
  return search.toString();
}

/** 导出 CSV 的完整地址（直接作为 <a href> 使用）。 */
export function buildExportCsvUrl(params: WeatherQueryParams): string {
  const query = buildWeatherQueryString(params);
  return apiUrl(`${WEATHER_ENDPOINTS.exportCsv}${query ? `?${query}` : ""}`);
}

/** 错误分类：只用于选择双语提示，不改变请求行为（不自动重试）。 */
export type WeatherErrorKind = "network" | "invalidInput" | "server" | "invalidResponse";

export function classifyWeatherError(error: unknown): WeatherErrorKind {
  if (error instanceof WeatherProtocolError) {
    return "invalidResponse";
  }
  if (error instanceof ApiError) {
    return error.status === 422 ? "invalidInput" : "server";
  }
  // fetch 抛出的 TypeError / AbortError：视为连不上后端。
  return "network";
}

const ERROR_KEYS: Record<WeatherErrorKind, TranslationKey> = {
  network: "weather.error.network",
  invalidInput: "weather.error.invalidInput",
  server: "weather.error.server",
  invalidResponse: "weather.error.invalidResponse",
};

export function weatherErrorKey(error: unknown): TranslationKey {
  return ERROR_KEYS[classifyWeatherError(error)];
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

/* ------------------------------------------------------------------ */
/* 请求函数（单独导出，便于单测与复用）                                 */
/* ------------------------------------------------------------------ */

export async function fetchStations(
  mode: DataMode,
  signal?: AbortSignal,
): Promise<StationsEnvelope> {
  const query = buildWeatherQueryString({ mode });
  const payload = await apiGet<unknown>(withQuery(WEATHER_ENDPOINTS.stations, query), signal);
  return parseStationsEnvelope(payload);
}

export async function fetchCoverage(
  params: WeatherQueryParams,
  signal?: AbortSignal,
): Promise<CoverageResponse> {
  const query = buildWeatherQueryString(params);
  const payload = await apiGet<unknown>(withQuery(WEATHER_ENDPOINTS.coverage, query), signal);
  return parseCoverageResponse(payload);
}

export async function fetchDaily(
  params: WeatherQueryParams,
  signal?: AbortSignal,
): Promise<DailyResponse> {
  const query = buildWeatherQueryString(params);
  const payload = await apiGet<unknown>(withQuery(WEATHER_ENDPOINTS.daily, query), signal);
  return parseDailyResponse(payload);
}

export async function fetchSummary(
  params: SummaryQueryParams,
  signal?: AbortSignal,
): Promise<SummaryResponse> {
  const search = new URLSearchParams();
  if (params.start) {
    search.set("start", params.start);
  }
  if (params.end) {
    search.set("end", params.end);
  }
  search.set("station", params.station);
  search.set("metric", params.metric);
  search.set("bins", String(params.bins));
  if (params.mode !== "official") {
    search.set("mode", params.mode);
  }
  const payload = await apiGet<unknown>(
    withQuery(WEATHER_ENDPOINTS.summary, search.toString()),
    signal,
  );
  return parseSummaryResponse(payload);
}

export async function fetchRefresh(signal?: AbortSignal): Promise<RefreshResponse> {
  const payload = await apiPost<unknown>(WEATHER_ENDPOINTS.refresh, {}, signal);
  return parseRefreshResponse(payload);
}

export async function importCsv(file: File, signal?: AbortSignal): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const payload = await apiPostForm<unknown>(WEATHER_ENDPOINTS.import, formData, signal);
  return parseImportResponse(payload);
}

export async function fetchSources(signal?: AbortSignal): Promise<SourcesResponse> {
  const payload = await apiGet<unknown>(WEATHER_ENDPOINTS.sources, signal);
  return parseSourcesResponse(payload);
}

/* ------------------------------------------------------------------ */
/* TanStack Query hooks                                                */
/* ------------------------------------------------------------------ */

function queryKey(params: WeatherQueryParams) {
  return [
    "weather",
    params.start ?? null,
    params.end ?? null,
    params.stations ?? [],
    params.metrics ?? [],
    params.mode,
  ] as const;
}

export function useWeatherStations(mode: DataMode): UseQueryResult<StationsEnvelope, Error> {
  return useQuery<StationsEnvelope, Error>({
    queryKey: ["weather", "stations", mode],
    queryFn: ({ signal }) => fetchStations(mode, signal),
    retry: false,
  });
}

export function useWeatherCoverage(
  params: WeatherQueryParams,
  enabled = true,
): UseQueryResult<CoverageResponse, Error> {
  return useQuery<CoverageResponse, Error>({
    queryKey: ["weather", "coverage", ...queryKey(params)],
    queryFn: ({ signal }) => fetchCoverage(params, signal),
    enabled,
    retry: false,
  });
}

export function useWeatherDaily(
  params: WeatherQueryParams,
  enabled = true,
): UseQueryResult<DailyResponse, Error> {
  const hasSelection = (params.stations?.length ?? 0) > 0 && (params.metrics?.length ?? 0) > 0;
  return useQuery<DailyResponse, Error>({
    queryKey: ["weather", "daily", ...queryKey(params)],
    queryFn: ({ signal }) => fetchDaily(params, signal),
    enabled: enabled && hasSelection,
    retry: false,
  });
}

export function useWeatherSummary(
  params: SummaryQueryParams,
  enabled = true,
): UseQueryResult<SummaryResponse, Error> {
  return useQuery<SummaryResponse, Error>({
    queryKey: [
      "weather",
      "summary",
      params.station,
      params.metric,
      params.bins,
      params.start ?? null,
      params.end ?? null,
      params.mode,
    ],
    queryFn: ({ signal }) => fetchSummary(params, signal),
    enabled: enabled && params.station.length > 0,
    retry: false,
  });
}

export function useWeatherSources(): UseQueryResult<SourcesResponse, Error> {
  return useQuery<SourcesResponse, Error>({
    queryKey: ["weather", "sources"],
    queryFn: ({ signal }) => fetchSources(signal),
    retry: false,
  });
}

/** 重新抓取：成功/失败都原样交给界面显示，不做自动重试。 */
export function useWeatherRefresh(): UseMutationResult<RefreshResponse, Error, void> {
  return useMutation<RefreshResponse, Error, void>({
    mutationFn: () => fetchRefresh(),
    retry: false,
  });
}

/** CSV 导入：multipart 上传，返回逐行校验报告。 */
export function useWeatherImport(): UseMutationResult<ImportResponse, Error, File> {
  return useMutation<ImportResponse, Error, File>({
    mutationFn: (file: File) => importCsv(file),
    retry: false,
  });
}

/** 页面默认选中的指标：阶段 3 只展示可回溯的逐日气温。 */
export const DEFAULT_METRICS: readonly DailyMetric[] = ["tmax", "tmin"];
