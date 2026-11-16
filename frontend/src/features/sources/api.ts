/**
 * /sources 动态状态数据层：TanStack Query + 契约校验 + 错误分类。
 *
 * 只读取后端汇总后的来源凭据、许可摘要与请求预算；不展示原始错误分类计数。
 */
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { ApiError, apiGet } from "../../api/client";
import type { RequestStats, SourceRecord, SourcesStatus } from "./types";

export const SOURCES_ENDPOINT = "/sources";

/** 响应不符合预期时抛出；界面显示双语「格式不符」提示。 */
export class SourcesProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcesProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new SourcesProtocolError(message);
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} 必须是非空字符串`);
  }
  return value;
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    fail(`${path} 必须是字符串或 null`);
  }
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} 必须是有限数字`);
  }
  return value;
}

function parseSource(value: unknown, index: number): SourceRecord {
  const path = `sources[${index}]`;
  if (!isRecord(value)) {
    fail(`${path} 必须是对象`);
  }
  const endpoint = asString(value.endpoint, `${path}.endpoint`);
  // 只接受 http(s) 地址；界面会把 host 显示出来，不渲染未知协议。
  if (!/^https?:\/\//i.test(endpoint)) {
    fail(`${path}.endpoint 必须是 http(s) 地址`);
  }
  return {
    dataset: asString(value.dataset, `${path}.dataset`),
    endpoint,
    fetched_at: asString(value.fetched_at, `${path}.fetched_at`),
    last_modified: asNullableString(value.last_modified, `${path}.last_modified`),
    mode: typeof value.mode === "string" ? value.mode : undefined,
  };
}

function parseRequestStats(value: unknown): RequestStats {
  if (!isRecord(value)) {
    fail("request_stats 必须是对象");
  }
  return {
    total: value.total === undefined ? 0 : asNumber(value.total, "request_stats.total"),
    today: asNumber(value.today, "request_stats.today"),
    budget: asNumber(value.budget, "request_stats.budget"),
    budget_remaining: asNumber(
      value.budget_remaining,
      "request_stats.budget_remaining",
    ),
    by_outcome: isRecord(value.by_outcome)
      ? Object.fromEntries(
          Object.entries(value.by_outcome).map(([key, entry]) => [
            key,
            asNumber(entry, `request_stats.by_outcome.${key}`),
          ]),
        )
      : undefined,
  };
}

/** 校验并返回 SourcesStatus；非法响应显式报错，不静默使用半份数据。 */
export function parseSourcesStatus(payload: unknown): SourcesStatus {
  if (!isRecord(payload)) {
    fail("响应必须是 JSON 对象");
  }
  const rawSources = payload.sources;
  if (!Array.isArray(rawSources)) {
    fail("sources 必须是数组");
  }
  const licensesRaw = payload.licenses;
  if (licensesRaw !== undefined && !Array.isArray(licensesRaw)) {
    fail("licenses 必须是数组");
  }

  return {
    mode: typeof payload.mode === "string" && payload.mode.length > 0 ? payload.mode : "official",
    notice: asNullableString(payload.notice, "notice"),
    reason: asNullableString(payload.reason, "reason"),
    sources: rawSources.map((source, index) => parseSource(source, index)),
    licenses: (licensesRaw ?? []).map((license, index) =>
      asString(license, `licenses[${index}]`),
    ),
    circuit_open:
      payload.circuit_open === undefined ? false : payload.circuit_open === true,
    circuit_open_until: asNullableString(
      payload.circuit_open_until,
      "circuit_open_until",
    ),
    request_stats: parseRequestStats(payload.request_stats),
    last_success_at: asNullableString(payload.last_success_at, "last_success_at"),
  };
}

export type SourcesErrorKind = "network" | "server" | "invalidResponse";

export function classifySourcesError(error: unknown): SourcesErrorKind {
  if (error instanceof SourcesProtocolError) {
    return "invalidResponse";
  }
  if (error instanceof ApiError) {
    return "server";
  }
  return "network";
}

export async function fetchSourcesStatus(signal?: AbortSignal): Promise<SourcesStatus> {
  const payload = await apiGet<unknown>(SOURCES_ENDPOINT, signal);
  return parseSourcesStatus(payload);
}

export function useSourcesStatus(): UseQueryResult<SourcesStatus, Error> {
  return useQuery<SourcesStatus, Error>({
    queryKey: ["sources", "status"],
    queryFn: ({ signal }) => fetchSourcesStatus(signal),
    staleTime: 60_000,
    retry: false,
  });
}
