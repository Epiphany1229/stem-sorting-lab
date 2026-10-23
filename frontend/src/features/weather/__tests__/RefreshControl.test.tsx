import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RefreshControl } from "../RefreshControl";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubRefresh(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: status < 400,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderControl(onRefreshed = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<RefreshControl onRefreshed={onRefreshed} />, { wrapper });
  return onRefreshed;
}

function cooldownPayload() {
  return {
    accepted: false,
    reason: "cooldown",
    next_allowed_at: new Date(Date.now() + 120_000).toISOString(),
    remaining_budget: 494,
    requests_made: 0,
    rows_upserted: 0,
    message: null,
  };
}

describe("重新抓取控件", () => {
  it("冷却中显示剩余秒数、禁用按钮并给出原因", async () => {
    const fetchMock = stubRefresh(cooldownPayload());
    const onRefreshed = renderControl();

    fireEvent.click(screen.getByRole("button", { name: /請求重新抓取/ }));

    const result = await screen.findByTestId("refresh-result");
    expect(result).toHaveTextContent("這次重新抓取沒有執行");
    expect(result).toHaveTextContent("冷卻中");

    const cooldown = await screen.findByTestId("refresh-cooldown");
    expect(cooldown).toHaveTextContent(/冷卻中，還剩 \d+ 秒/);
    expect(screen.getByRole("button", { name: /請求重新抓取/ })).toBeDisabled();
    expect(onRefreshed).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/weather/refresh");
    expect(init.method).toBe("POST");
  });

  it("接受后显示请求数/写入列数，并通知页面刷新查询", async () => {
    stubRefresh({
      accepted: true,
      reason: null,
      next_allowed_at: new Date(Date.now() + 60_000).toISOString(),
      remaining_budget: 490,
      requests_made: 2,
      rows_upserted: 120,
      message: null,
    });
    const onRefreshed = renderControl();

    fireEvent.click(screen.getByRole("button", { name: /請求重新抓取/ }));

    const result = await screen.findByTestId("refresh-result");
    expect(result).toHaveTextContent("已接受：送出 2 個請求，寫入 120 列");
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it("请求失败时显示分类后的双语错误", async () => {
    stubRefresh({ message: "boom" }, 500);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: /請求重新抓取/ }));

    const error = await screen.findByTestId("refresh-error");
    expect(error).toHaveTextContent("重新抓取請求失敗");
    expect(error).toHaveTextContent("後端發生錯誤");
  });
});
