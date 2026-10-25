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

function stubListFetch(
  overrides: { status?: number; error?: Error; payload?: unknown } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/algorithms")) {
      if (overrides.error) {
        throw overrides.error;
      }
      if (overrides.status && overrides.status >= 400) {
        return jsonResponse({ detail: "mock error" }, overrides.status);
      }
      return jsonResponse(overrides.payload ?? algorithmListResponse());
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

/** 模拟后端尚未收敛时仍返回 planned 项（前端必须静默忽略，不显示占位）。 */
const LEGACY_PLANNED = [
  {
    id: "counting",
    name: { "zh-Hant": "計數排序", en: "Counting sort" },
    tagline: { "zh-Hant": "統計每個值出現次數再按序輸出。", en: "Count occurrences then output in order." },
    status: "planned",
    time_complexity: { "zh-Hant": "O(n+k)", en: "O(n+k)" },
    space_complexity: { "zh-Hant": "O(k)", en: "O(k)" },
    stable: true,
    use_cases: { "zh-Hant": "整數且範圍小。", en: "Small integer ranges." },
    default_values: [],
    supports_early_exit: false,
  },
  {
    id: "bucket",
    name: { "zh-Hant": "桶排序", en: "Bucket sort" },
    tagline: { "zh-Hant": "按區間分桶。", en: "Distribute into buckets." },
    status: "planned",
    time_complexity: { "zh-Hant": "O(n+k)", en: "O(n+k)" },
    space_complexity: { "zh-Hant": "O(n+k)", en: "O(n+k)" },
    stable: null,
    use_cases: { "zh-Hant": "均勻分佈。", en: "Evenly distributed values." },
    default_values: [],
    supports_early_exit: false,
  },
  {
    id: "radix",
    name: { "zh-Hant": "基數排序", en: "Radix sort" },
    tagline: { "zh-Hant": "逐位穩定分配。", en: "Stable digit distribution." },
    status: "planned",
    time_complexity: { "zh-Hant": "O(d(n+b))", en: "O(d(n+b))" },
    space_complexity: { "zh-Hant": "O(n+b)", en: "O(n+b)" },
    stable: true,
    use_cases: { "zh-Hant": "整數資料。", en: "Integer data." },
    default_values: [],
    supports_early_exit: false,
  },
];

describe("算法中心 /algorithms（产品收敛：仅 7 种比较类排序）", () => {
  it("渲染 7 个入口，全部可用且链接到学习页", async () => {
    stubListFetch();
    renderPage();

    await screen.findByTestId("algorithm-list");

    expect(algorithmListFixture).toHaveLength(7);
    expect(availableAlgorithmIds).toHaveLength(7);
    expect(screen.getAllByTestId(/^algorithm-item-/)).toHaveLength(7);

    for (const metadata of algorithmListFixture) {
      expect(
        screen.getAllByRole("heading", { level: 3, name: metadata.name["zh-Hant"] }),
      ).toHaveLength(1);
    }

    for (const id of availableAlgorithmIds) {
      const item = screen.getByTestId(`algorithm-item-${id}`);
      expect(item).toHaveAttribute("data-status", "available");
      expect(item).toHaveTextContent("可用");
      const link = screen.getByTestId(`algorithm-link-${id}`);
      expect(link).toHaveAttribute("href", `/algorithms/${id}`);
    }

    // 不再出现任何「開發中」占位。
    expect(screen.queryByText(/開發中/)).toBeNull();
  });

  it("后端若仍返回 counting/bucket/radix 的 planned 项，前端静默忽略", async () => {
    stubListFetch({
      payload: {
        protocol_version: 1,
        algorithms: [...algorithmListFixture, ...LEGACY_PLANNED],
      },
    });
    renderPage();
    await screen.findByTestId("algorithm-list");

    expect(screen.getAllByTestId(/^algorithm-item-/)).toHaveLength(7);
    for (const id of ["counting", "bucket", "radix"]) {
      expect(screen.queryByTestId(`algorithm-item-${id}`)).toBeNull();
      expect(screen.queryByTestId(`algorithm-link-${id}`)).toBeNull();
    }
    expect(screen.queryByText(/開發中/)).toBeNull();
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
