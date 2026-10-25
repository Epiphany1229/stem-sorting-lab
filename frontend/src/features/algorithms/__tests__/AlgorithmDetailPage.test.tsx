import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../../App";
import type { AlgorithmTrace } from "../types";
import {
  algorithmListResponse,
  bubbleTraceFixture,
  heapTraceFixture,
  mergeTraceFixture,
  selectionTraceFixture,
  withDirection,
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

interface MockOptions {
  readonly selectionTrace?: AlgorithmTrace;
  readonly heapTrace?: AlgorithmTrace;
  readonly mergeTrace?: AlgorithmTrace;
  readonly bubbleTrace?: AlgorithmTrace;
  readonly listError?: Error;
}

function createFetchMock(options: MockOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/algorithms")) {
      if (options.listError) {
        throw options.listError;
      }
      return jsonResponse(algorithmListResponse());
    }
    if (url.includes("/algorithms/selection/trace")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { direction?: string };
      const base = options.selectionTrace ?? selectionTraceFixture;
      return jsonResponse(body.direction === "desc" ? withDirection(base, "desc") : base);
    }
    if (url.includes("/algorithms/heap/trace")) {
      return jsonResponse(options.heapTrace ?? heapTraceFixture);
    }
    if (url.includes("/algorithms/merge/trace")) {
      return jsonResponse(options.mergeTrace ?? mergeTraceFixture);
    }
    if (url.includes("/algorithms/bubble/trace")) {
      return jsonResponse(options.bubbleTrace ?? bubbleTraceFixture);
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

function renderRoute(path = "/algorithms/selection") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // 用真实路由表渲染，确保 useParams（:id）与返回列表的导航都按线上行为工作。
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <AppRoutes />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function progress(): string {
  return screen.getByTestId("step-progress").textContent ?? "";
}

describe("算法学习页 /algorithms/:id", () => {
  it("复用阶段 2 播放器/代码面板/内联比较区，并渲染元数据与专属视觉", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute();

    const player = await screen.findByTestId("trace-player");
    expect(player).toBeInTheDocument();
    // 复用性断言：阶段 2 的 testid 必须出现。
    expect(screen.getByTestId("code-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("inline-compare")).toBeInTheDocument();
    expect(progress()).toContain("已播放 0 /");

    // 元数据来自后端：复杂度 / 稳定性 / 适用条件。
    const meta = screen.getByTestId("algorithm-meta");
    expect(within(meta).getByTestId("meta-time")).toHaveTextContent("O(n²)");
    expect(within(meta).getByTestId("meta-space")).toHaveTextContent("O(1)");
    expect(within(meta).getByTestId("meta-stable")).toHaveTextContent("不穩定");
    expect(within(meta).getByTestId("meta-use-cases")).toHaveTextContent("交換次數少");

    // 专属视觉区：选择排序的 aux 面板与练习都渲染。
    expect(screen.getByTestId("aux-panel-selection")).toBeInTheDocument();
    expect(screen.getByTestId("aux-selection-idle")).toBeInTheDocument();
    expect(screen.getByTestId("algorithm-practice")).toBeInTheDocument();
    expect(screen.getByTestId("practice-question")).toHaveTextContent("不穩定");

    // 推进一步后，辅助视觉读取当前事件的 auxiliary_state。
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(progress()).toContain("已播放 1 / 9 步");
    const minFact = await screen.findByTestId("aux-selection-fact-min");
    expect(minFact).toHaveTextContent("下標 0");
  });

  it("逐步播放时柱子与数值标签按 item id 严格匹配（交换后不错位）", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute();
    await screen.findByTestId("trace-player");

    const itemById = new Map(
      selectionTraceFixture.items.map((item) => [item.id, item.value] as const),
    );

    for (let step = 1; step <= selectionTraceFixture.events.length; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "下一步" }));
      const event = selectionTraceFixture.events[step - 1];
      const state = selectionTraceFixture.states.find(
        (candidate) => candidate.state_id === event.state_after_id,
      );
      expect(state).toBeDefined();

      const bars = screen.getAllByTestId("bar");
      expect(bars.map((bar) => bar.getAttribute("data-item-id"))).toEqual([...(state?.order ?? [])]);
      bars.forEach((bar) => {
        const itemId = bar.getAttribute("data-item-id") ?? "";
        expect(within(bar).getByTestId("bar-value")).toHaveTextContent(
          String(itemById.get(itemId)),
        );
      });
    }
  });

  it("内联比较区在 compare 事件出题，答后反馈，且不阻塞播放", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute();
    await screen.findByTestId("trace-player");

    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByTestId("inline-compare-question")).toBeInTheDocument();
    expect(screen.getByText("這兩個數需要交換嗎？")).toBeInTheDocument();

    // 该 compare 的 will_swap=false，所以「不需要」是正确答案。
    fireEvent.click(screen.getByRole("button", { name: "不需要" }));
    const feedback = screen.getByTestId("inline-compare-feedback");
    expect(feedback).toHaveTextContent("答對了");
    expect(screen.getByTestId("inline-compare-answer")).toHaveTextContent("不需要交換");
    // 答题不阻塞播放：进度不变，仍可继续下一步。
    expect(progress()).toContain("已播放 2 / 9 步");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(progress()).toContain("已播放 3 / 9 步");
  });

  it("切换方向会产生新轨迹并把播放器重置到 idle", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderRoute();
    await screen.findByTestId("trace-player");

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(progress()).toContain("已播放 2 / 9 步");

    fireEvent.click(screen.getByRole("radio", { name: "降序" }));
    await waitFor(() => {
      expect(progress()).toContain("已播放 0 / 9 步");
    });

    const traceCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/algorithms/selection/trace"),
    );
    const lastBody = JSON.parse(
      String((traceCalls[traceCalls.length - 1][1] as RequestInit).body),
    ) as { direction: string };
    expect(lastBody.direction).toBe("desc");
  });

  it("切换算法（返回列表再进入另一算法）会重新挂载播放器并重置", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute();
    await screen.findByTestId("trace-player");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(progress()).toContain("已播放 2 / 9 步");

    fireEvent.click(screen.getByRole("link", { name: "返回演算法中心" }));
    const heapLink = await screen.findByRole("link", { name: /堆積排序/ });
    fireEvent.click(heapLink);

    await screen.findByTestId("aux-panel-heap");
    expect(screen.getByTestId("trace-player")).toBeInTheDocument();
    expect(progress()).toContain("已播放 0 / 2 步");
  });

  it("其他六种比较类算法允许一位小数，并原样提交给后端", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderRoute("/algorithms/selection");
    await screen.findByTestId("trace-player");

    expect(screen.getByTestId("input-mode-hint")).toHaveTextContent("一位小數");

    fireEvent.change(screen.getByLabelText(/自訂數列/), {
      target: { value: "1.5, 2.5, 0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "套用數列" }));
    expect(screen.queryByTestId("values-error")).toBeNull();

    await waitFor(() => {
      const traceCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("/algorithms/selection/trace"),
      );
      const lastBody = JSON.parse(
        String((traceCalls[traceCalls.length - 1][1] as RequestInit).body),
      ) as { values: number[] };
      expect(lastBody.values).toEqual([1.5, 2.5, 0]);
    });
  });

  it("归并排序的「輪次」改为「合併段數」，按 merge 事件累计", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute("/algorithms/merge");
    await screen.findByTestId("trace-player");

    // 尚未推进时没有可累计的 merge 事件。
    expect(screen.getByText("合併段數")).toBeInTheDocument();
    expect(screen.getByTestId("metric-pass")).toHaveTextContent("—");

    fireEvent.click(screen.getByRole("button", { name: "下一步" })); // compare
    expect(screen.getByTestId("metric-pass")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "下一步" })); // merge 1
    expect(screen.getByTestId("metric-pass")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "下一步" })); // merge 2
    expect(screen.getByTestId("metric-pass")).toHaveTextContent("2");
  });

  it("没有 will_swap 的 compare 只展示事实性比较，不显示作答选项", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderRoute("/algorithms/merge");
    await screen.findByTestId("trace-player");

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    const facts = screen.getByTestId("inline-compare-facts");
    // 显示左右值与关系符号 + 后端 explanation，不猜测 will_swap。
    expect(facts).toHaveTextContent("3");
    expect(facts).toHaveTextContent(">");
    expect(facts).toHaveTextContent("1");
    expect(facts).toHaveTextContent(mergeTraceFixture.events[0].explanation["zh-Hant"]);
    expect(screen.queryByRole("button", { name: "需要" })).toBeNull();
    expect(screen.queryByRole("button", { name: "不需要" })).toBeNull();
  });

  it("冒泡页只接受整数：小数输入给出双语提示，并出 will_swap 预测题", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderRoute("/algorithms/bubble");
    await screen.findByTestId("trace-player");

    // 输入区明确说明：冒泡用整数、其他算法支持一位小数。
    const hint = screen.getByTestId("input-mode-hint");
    expect(hint).toHaveTextContent("冒泡頁使用整數入門資料");
    expect(hint).toHaveTextContent("其他比較類算法支援一位小數");

    fireEvent.change(screen.getByLabelText(/自訂數列/), {
      target: { value: "1.5, 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "套用數列" }));

    const error = screen.getByTestId("values-error");
    expect(error).toHaveTextContent("冒泡排序頁只接受整數");
    expect(error).toHaveTextContent("accepts whole numbers only");
    // 当前数列保持不变，且没有发出带小数的轨迹请求（不会出现 422 无提示）。
    expect(screen.getByTestId("current-values")).toHaveTextContent("目前數列：5, 3, 8, 1, 9, 2");
    const decimalCalls = fetchMock.mock.calls.filter(([, init]) => {
      const body = String((init as RequestInit | undefined)?.body ?? "");
      return body.includes("1.5");
    });
    expect(decimalCalls).toHaveLength(0);

    // 冒泡 compare 事件带 will_swap → 内联区出预测题。
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByTestId("inline-compare-question")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-compare-facts")).toBeNull();
  });

  it("未知 id（含已移除的 counting/bucket/radix）→ 404，不显示開發中", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    for (const id of ["counting", "bucket", "radix", "not-a-real-algorithm"]) {
      const { unmount } = renderRoute(`/algorithms/${id}`);
      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找不到頁面");
      });
      expect(screen.queryByTestId("trace-player")).toBeNull();
      expect(screen.queryByTestId("algorithm-planned")).toBeNull();
      expect(screen.queryByText(/開發中/)).toBeNull();
      unmount();
    }
  });

  it("元数据加载失败时显示错误而不是播放器", async () => {
    vi.stubGlobal("fetch", createFetchMock({ listError: new TypeError("Failed to fetch") }));
    renderRoute();

    expect(await screen.findByText("無法載入演算法資料，請確認後端已啟動，然後重試。")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-player")).toBeNull();
  });
});
