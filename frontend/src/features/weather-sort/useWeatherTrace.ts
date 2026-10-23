/**
 * 天气排序轨迹的数据层：POST /api/algorithms/bubble/weather-trace。
 *
 * 与阶段 2 完全一致的原则：请求参数原样提交，响应经同一份 v1 契约校验后原样返回；
 * 前端不排序、不推导事件，也不从天气日值自行拼轨迹。
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
  readonly start: string;
  readonly end: string;
  readonly direction: Direction;
  readonly earlyExit: boolean;
}

/** 判断查询参数是否足够发起请求（测站与合法日期范围都必须存在）。 */
export function isWeatherTraceReady(params: WeatherTraceParams): boolean {
  return (
    params.station.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.end) &&
    params.start <= params.end
  );
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
      start: params.start,
      end: params.end,
      direction: params.direction,
      options: { early_exit: params.earlyExit },
    },
    signal,
  );
  return parseTraceResponse(payload);
}

/** 读取某个指标在指定窗口内的真实天气排序轨迹。 */
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
      params.start,
      params.end,
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
