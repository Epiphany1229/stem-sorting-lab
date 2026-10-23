/**
 * 前端 API 客户端。
 * 浏览器只会请求本项目后端（默认 /api，可用 VITE_API_BASE_URL 覆盖），
 * 绝不直接请求香港天文台或其他官方地址；官方数据由后端统一下载、缓存与限速。
 */
import { QueryClient } from "@tanstack/react-query";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

/** 本项目后端的 base URL，例如 "/api"。 */
export const API_BASE_URL: string = configuredBaseUrl ?? "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 拼出后端请求地址（不处理外部来源，避免误连官方站点）。 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL.replace(/\/+$/, "")}${normalizedPath}`;
}

/** 阶段 2 起供 TanStack Query 使用；现在先提供稳定的默认配置。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    // 错误文案由界面层翻译成双语，这里只保留开发者可读的信息与状态码。
    throw new ApiError(`API request failed with status ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}
