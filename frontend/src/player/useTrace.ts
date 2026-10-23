/**
 * 轨迹数据层：TanStack Query 调用后端，负责加载/错误/空数据三种状态的数据侧。
 *
 * 这里没有、也不允许有任何排序逻辑：请求参数原样提交，响应经契约校验后原样返回。
 */
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { ApiError, apiPost } from "../api/client";
import type { TranslationKey } from "../i18n/dictionary";
import { TraceProtocolError, parseTraceResponse } from "./traceValidation";
import type { BubbleTrace, Direction, TraceRequest } from "./types";

export interface TraceParams {
  readonly values: readonly number[];
  readonly direction: Direction;
  readonly earlyExit: boolean;
}

/** 错误分类：只用于选择双语提示，不用于重试逻辑（重试由用户显式触发）。 */
export type TraceErrorKind =
  | "network"
  | "invalidInput"
  | "notFound"
  | "server"
  | "invalidResponse";

/** 分类一个查询错误。 */
export function classifyTraceError(error: unknown): TraceErrorKind {
  if (error instanceof TraceProtocolError) {
    return "invalidResponse";
  }
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return "invalidInput";
    }
    if (error.status === 404) {
      return "notFound";
    }
    return "server";
  }
  // fetch 抛出的 TypeError / AbortError 等：视为连不上后端。
  return "network";
}

const ERROR_KEYS: Record<TraceErrorKind, TranslationKey> = {
  network: "trace.error.network",
  invalidInput: "trace.error.invalidInput",
  notFound: "trace.error.notFound",
  server: "trace.error.server",
  invalidResponse: "trace.error.invalidResponse",
};

/** 错误对应的双语提示 key（组件用 BilingualText 渲染）。 */
export function traceErrorKey(error: unknown): TranslationKey {
  return ERROR_KEYS[classifyTraceError(error)];
}

export const TRACE_ENDPOINT = "/algorithms/bubble/trace";

/** 真正发请求的函数；单独导出便于测试与将来复用。 */
export async function fetchTrace(
  request: TraceRequest,
  signal?: AbortSignal,
): Promise<BubbleTrace> {
  const payload = await apiPost<unknown>(TRACE_ENDPOINT, request, signal);
  return parseTraceResponse(payload);
}

/**
 * 读取冒泡排序轨迹。
 *
 * - 只有 2–30 个整数时才发请求（与契约 §4 一致）；
 * - 不做自动重试：后端未启动时立刻显示明确的双语错误，用户可点「重新载入」；
 * - 同一组输入 + 方向 + 选项使用同一 cache key，切换参数会产生新的轨迹对象，
 *   播放器据此重置为 idle。
 */
export function useTrace(params: TraceParams): UseQueryResult<BubbleTrace, Error> {
  const { values, direction, earlyExit } = params;
  const normalizedValues = [...values];

  return useQuery<BubbleTrace, Error>({
    queryKey: ["algorithms", "bubble", "trace", normalizedValues, direction, earlyExit],
    queryFn: ({ signal }) =>
      fetchTrace({ values: normalizedValues, direction, options: { early_exit: earlyExit } }, signal),
    enabled: normalizedValues.length >= 2 && normalizedValues.length <= 30,
    staleTime: Infinity,
    retry: false,
  });
}
