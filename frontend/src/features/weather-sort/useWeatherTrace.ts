/**
 * 天气排序轨迹的数据层：POST /api/algorithms/bubble/weather-trace。
 *
 * 与阶段 2 完全一致的原则：请求参数原样提交，响应经同一份 v1 契约校验后原样返回；
 * 前端不排序、不推导事件，也不从天气日值自行拼轨迹。
 * 阶段 4.8 起不传 start/end：后端固定返回「最近 30 天」的默认窗口。
 */
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { apiPost } from "../../api/client";
import { parseTraceResponse } from "../../player/traceValidation";
import type { BubbleTrace, Direction, WeatherMetric } from "../../player/types";
import { classifyTraceError, traceErrorKey } from "../../player/useTrace";

export const WEATHER_TRACE_ENDPOINT = "/algorithms/bubble/weather-trace";

export interface WeatherTraceParams {
  readonly station: string;
  readonly metric: WeatherMetric;
  /** 可选：不传时由后端使用默认「最近 30 天」窗口。 */
  readonly start?: string;
  readonly end?: string;
  readonly direction: Direction;
  readonly earlyExit: boolean;
}

/** 判断查询参数是否足够发起请求（只需测站；日期窗口交给后端默认值）。 */
export function isWeatherTraceReady(params: WeatherTraceParams): boolean {
  return params.station.length > 0;
}

export async function fetchWeatherTrace(
  params: WeatherTraceParams,
  signal?: AbortSignal,
): Promise<BubbleTrace> {
  const payload = await apiPost<unknown>(
    WEATHER_TRACE_ENDPOINT,
    {
      station: params.station,
      metric: params.metric,
      ...(params.start ? { start: params.start } : {}),
      ...(params.end ? { end: params.end } : {}),
      direction: params.direction,
      options: { early_exit: params.earlyExit },
    },
    signal,
  );
  return parseTraceResponse(payload);
}

/** 读取某个指标的真实天气排序轨迹；窗口由后端决定。 */
export function useWeatherTrace(
  params: WeatherTraceParams,
  enabled = true,
): UseQueryResult<BubbleTrace, Error> {
  return useQuery<BubbleTrace, Error>({
    queryKey: [
      "algorithms",
      "bubble",
      "weather-trace",
      params.station,
      params.metric,
      params.start ?? "default",
      params.end ?? "default",
      params.direction,
      params.earlyExit,
    ],
    queryFn: ({ signal }) => fetchWeatherTrace(params, signal),
    enabled: enabled && isWeatherTraceReady(params),
    staleTime: Infinity,
    retry: false,
  });
}

export { classifyTraceError, traceErrorKey };
