/**
 * 阶段 5A 数据层：GET /api/algorithms 与 POST /api/algorithms/{id}/trace。
 *
 * 前端只提交输入参数并消费后端轨迹/元数据；这里没有任何排序逻辑。
 * 复用阶段 2 的错误分类（网络 / 422 / 404 / 5xx / 契约不符）。
 */
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { apiGet, apiPost } from "../../api/client";
import type { BubbleTrace, Direction } from "../../player/types";
import { parseAlgorithmListResponse, parseAlgorithmTraceResponse } from "./validation";
import type {
  AlgorithmListResponse,
  AlgorithmTrace,
  AlgorithmTraceRequest,
  ImplementedAlgorithmId,
} from "./types";

export const ALGORITHM_LIST_ENDPOINT = "/algorithms";

export function algorithmTraceEndpoint(id: ImplementedAlgorithmId): string {
  return `/algorithms/${id}/trace`;
}

/** GET /api/algorithms：十项元数据（含 planned）。 */
export async function fetchAlgorithmList(signal?: AbortSignal): Promise<AlgorithmListResponse> {
  const payload = await apiGet<unknown>(ALGORITHM_LIST_ENDPOINT, signal);
  return parseAlgorithmListResponse(payload);
}

/** POST /api/algorithms/{id}/trace：通用轨迹端点。 */
export async function fetchAlgorithmTrace(
  id: ImplementedAlgorithmId,
  request: AlgorithmTraceRequest,
  signal?: AbortSignal,
): Promise<AlgorithmTrace> {
  const payload = await apiPost<unknown>(algorithmTraceEndpoint(id), request, signal);
  return parseAlgorithmTraceResponse(payload, id);
}

export function useAlgorithmList(): UseQueryResult<AlgorithmListResponse, Error> {
  return useQuery<AlgorithmListResponse, Error>({
    queryKey: ["algorithms", "list"],
    queryFn: ({ signal }) => fetchAlgorithmList(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface AlgorithmTraceParams {
  readonly values: readonly number[];
  readonly direction: Direction;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * 读取某个算法的真实轨迹。
 * 参数（输入/方向/选项）变化会产生新 cache key，播放器据此重置为 idle。
 */
export function useAlgorithmTrace(
  id: ImplementedAlgorithmId,
  params: AlgorithmTraceParams,
  enabled: boolean,
): UseQueryResult<AlgorithmTrace, Error> {
  const { direction, options } = params;
  const values = [...params.values];

  return useQuery<AlgorithmTrace, Error>({
    queryKey: ["algorithms", id, "trace", values, direction, options],
    queryFn: ({ signal }) =>
      fetchAlgorithmTrace(id, { values, direction, options }, signal),
    enabled: enabled && values.length >= 2 && values.length <= 30,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * 把通用算法轨迹交给阶段 2 的 TracePlayer。
 *
 * 播放器只消费 events/states/items/code 四个字段；`algorithm` 与 `options`
 * 是既有组件类型里的必备标签，不参与任何播放逻辑，因此这里做一次显式适配，
 * 不修改 player/ 的公共类型，也不复制播放器代码。
 */
export function toPlayerTrace(trace: AlgorithmTrace): BubbleTrace {
  return {
    protocol_version: 1,
    algorithm: "bubble",
    direction: trace.direction,
    options: { early_exit: trace.options.early_exit === true },
    items: trace.items,
    code: trace.code,
    states: trace.states,
    events: trace.events as unknown as BubbleTrace["events"],
    summary: trace.summary,
  };
}
