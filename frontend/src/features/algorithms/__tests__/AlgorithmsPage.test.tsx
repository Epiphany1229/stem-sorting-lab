import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import AlgorithmsPage from "../../../pages/AlgorithmsPage";
import {
  algorithmListFixture,
  algorithmListResponse,
  availableAlgorithmIds,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function stubListFetch(overrides: { status?: number; error?: Error } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/algorithms")) {
      if (overrides.error) {
        throw overrides.error;
      }
      if (overrides.status && overrides.status >= 400) {
        return jsonResponse({ detail: "mock error" }, overrides.status);
      }
      return jsonResponse(algorithmListResponse());
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/algorithms"]}>
      <QueryClientProvider client={client}>
        <AlgorithmsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("算法中心 /algorithms", () => {
  it("从后端元数据渲染 10 个入口，并标出可用与开发中", async () => {
    stubListFetch();
    renderPage();

    await screen.findByTestId("algorithm-list");

    // 10 个 h3，名称与后端元数据一致。
    for (const metadata of algorithmListFixture) {
      expect(
        screen.getAllByRole("heading", { level: 3, name: metadata.name["zh-Hant"] }),
      ).toHaveLength(1);
    }

    // 七个可用项：可点击、链接到 /algorithms/{id}。
    for (const id of availableAlgorithmIds) {
      const item = screen.getByTestId(`algorithm-item-${id}`);
      expect(item).toHaveAttribute("data-status", "available");
      expect(item).toHaveTextContent("可用");
      const link = screen.getByTestId(`algorithm-link-${id}`);
      expect(link).toHaveAttribute("href", `/algorithms/${id}`);
    }

    // 三个开发中项：可见、有徽标、不可点击（不是链接）。
    for (const id of ["counting", "bucket", "radix"]) {
      const item = screen.getByTestId(`algorithm-item-${id}`);
      expect(item).toHaveAttribute("data-status", "planned");
      expect(item).toHaveTextContent("開發中");
      expect(item.querySelector("a")).toBeNull();
      expect(screen.queryByTestId(`algorithm-link-${id}`)).toBeNull();
    }
  });

  it("始终列出全部 10 项，不隐藏未完成算法", async () => {
    stubListFetch();
    renderPage();
    await screen.findByTestId("algorithm-list");

    const items = screen.getAllByTestId(/^algorithm-item-/);
    expect(items).toHaveLength(10);
  });

  it("加载中显示双语状态，失败时显示错误与重试", async () => {
    const fetchMock = stubListFetch({ error: new TypeError("Failed to fetch") });
    renderPage();

    const error = await screen.findByTestId("algorithms-error");
    expect(error).toHaveTextContent("無法載入演算法清單");
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
    expect(screen.queryByTestId("algorithm-list")).toBeNull();

    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
