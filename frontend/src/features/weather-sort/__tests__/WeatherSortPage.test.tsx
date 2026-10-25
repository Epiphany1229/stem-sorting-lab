import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import WeatherSortPage from "../../../pages/WeatherSortPage";
import type { BubbleTrace } from "../../../player/types";
import { coverageResponse, stationsEnvelope } from "../../weather/__tests__/fixtures";
import {
  allSameTrace,
  negativeTrace,
  tmaxTrace,
  tminTrace,
} from "./weatherTraceFixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface TraceOverride {
  readonly status?: number;
  readonly transform?: (trace: BubbleTrace) => BubbleTrace;
  readonly error?: Error;
}

interface MockOptions {
  readonly tmax?: TraceOverride;
  readonly tmin?: TraceOverride;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function createFetchMock(options: MockOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/weather/stations")) {
      return jsonResponse(stationsEnvelope());
    }
    if (url.includes("/api/weather/coverage")) {
      return jsonResponse(coverageResponse());
    }
    if (url.includes("/api/algorithms/bubble/weather-trace")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        metric?: string;
        direction?: string;
      };
      const direction = body.direction === "desc" ? "desc" : "asc";
      const override = body.metric === "tmin" ? options.tmin : options.tmax;
      if (override?.error) {
        throw override.error;
      }
      if (override?.status && override.status >= 400) {
        return jsonResponse({ detail: "mock error" }, override.status);
      }
      const base = body.metric === "tmin" ? tminTrace(direction) : tmaxTrace(direction);
      const trace = override?.transform ? override.transform(base) : base;
      return jsonResponse(trace);
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

function renderPage(path = "/weather-sort?station=HKO&metric=tmax&start=2026-09-01&end=2026-09-08") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <WeatherSortPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function nextButton(): HTMLElement {
  return screen.getByRole("button", { name: "下一步" });
}

describe("天气排序页：复用阶段 2 播放器", () => {
  it("直接复用 TracePlayer/CodePanel/BarChart，并渲染温度与日期标签", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();

    const player = await screen.findByTestId("trace-player");
    expect(player).toBeInTheDocument();
    // 复用性：阶段 2 的 testid 必须出现，证明没有另写一套播放器。
    expect(screen.getByTestId("code-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 0 /");
    expect(
      screen.getByRole("heading", { level: 3, name: "日最高溫 播放器" }),
    ).toBeInTheDocument();

    const trace = tmaxTrace();
    const itemById = new Map(trace.items.map((item) => [item.id, item] as const));
    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(6);

    for (const bar of bars) {
      const item = itemById.get(bar.getAttribute("data-item-id") ?? "");
      expect(item).toBeDefined();
      expect(within(bar).getByTestId("bar-value")).toHaveTextContent(`${item?.value_raw} °C`);
      expect(within(bar).getByTestId("bar-label")).toHaveTextContent(item?.label?.slice(5) ?? "");
      const title = bar.querySelector("title")?.textContent ?? "";
      expect(title).toContain(item?.label ?? "");
      expect(title).toContain("香港天文台");
      expect(title).toContain("Hong Kong Observatory");
      expect(title).toContain("品質標記");
    }

    // 键盘聚焦柱子时显示完整日期、测站中英文与品质标记。
    fireEvent.focus(bars[0]);
    const detail = screen.getByTestId("bar-detail");
    expect(detail).toHaveTextContent("2026-09-01");
    expect(detail).toHaveTextContent("30.2 °C");
    expect(detail).toHaveTextContent("香港天文台");
    expect(detail).toHaveTextContent("Hong Kong Observatory");
    expect(detail).toHaveTextContent("C");
  });

  it("逐步播放时温度标签与日期严格跟随元素交换", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    const trace = tmaxTrace();
    const itemById = new Map(trace.items.map((item) => [item.id, item] as const));

    for (let step = 1; step <= trace.events.length; step += 1) {
      fireEvent.click(nextButton());
      const event = trace.events[step - 1];
      const state = trace.states.find((candidate) => candidate.state_id === event.state_after_id);
      expect(state).toBeDefined();
      const bars = screen.getAllByTestId("bar");

      expect(bars.map((bar) => bar.getAttribute("data-item-id"))).toEqual([
        ...(state?.order ?? []),
      ]);
      bars.forEach((bar, index) => {
        const item = itemById.get(state?.order[index] ?? "");
        expect(item).toBeDefined();
        expect(within(bar).getByTestId("bar-value")).toHaveTextContent(`${item?.value_raw} °C`);
        expect(within(bar).getByTestId("bar-label")).toHaveTextContent(item?.label?.slice(5) ?? "");
      });
    }
  }, 20000);

  it("切换指标与方向都会把播放器重置到 idle", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 2 /");

    // 切换方向：新轨迹对象 → 重置为 idle。
    fireEvent.click(screen.getByRole("radio", { name: "降序" }));
    await waitFor(() => {
      expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 0 /");
    });

    // 切换指标：卸载并重新挂载对应指标的播放器。
    fireEvent.click(screen.getByRole("radio", { name: "日最低溫" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "日最低溫 播放器" })).toBeInTheDocument();
      expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 0 /");
    });
    await waitFor(() => {
      const bars = screen.getAllByTestId("bar");
      expect(within(bars[0]).getByTestId("bar-value")).toHaveTextContent("24.1 °C");
    });
  });

  it("并排比较显示两个独立播放器", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    fireEvent.click(screen.getByRole("checkbox", { name: /並排比較/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId("trace-player")).toHaveLength(2);
    });
    const tmaxPanel = screen.getByTestId("weather-sort-panel-tmax");
    const tminPanel = screen.getByTestId("weather-sort-panel-tmin");
    expect(within(tmaxPanel).getByTestId("bar-chart")).toBeInTheDocument();
    expect(within(tminPanel).getByTestId("bar-chart")).toBeInTheDocument();

    fireEvent.click(within(tmaxPanel).getByRole("button", { name: "下一步" }));
    expect(within(tmaxPanel).getByTestId("step-progress")).toHaveTextContent("已播放 1 /");
    expect(within(tminPanel).getByTestId("step-progress")).toHaveTextContent("已播放 0 /");
  });

  it("引导模式直接复用阶段 2 的教学预测弹窗", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    fireEvent.click(screen.getByRole("radio", { name: "引導模式" }));
    fireEvent.click(nextButton()); // mark_sorted，不弹窗
    expect(screen.queryByTestId("prediction-dialog")).not.toBeInTheDocument();
    fireEvent.click(nextButton()); // 即将执行 compare，弹预测

    expect(screen.getByTestId("prediction-dialog")).toBeInTheDocument();
    expect(screen.getByText("下一步這兩個數需要交換嗎？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "需要" })).toBeInTheDocument();
  });

  it("直接打开本页时用 coverage 返回的真实窗口作为默认日期", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderPage("/weather-sort?station=HKO&metric=tmax");

    await screen.findByTestId("trace-player");

    const traceCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/algorithms/bubble/weather-trace"),
    );
    expect(traceCalls.length).toBeGreaterThan(0);
    for (const [, init] of traceCalls) {
      const body = JSON.parse(String((init as RequestInit).body)) as {
        start: string;
        end: string;
      };
      expect(body.start).toBe("2026-09-01");
      expect(body.end).toBe("2026-09-05");
    }
  });
});

describe("天气排序页：缺失日期与结果区", () => {
  it("两个指标各自显示有效天数与缺失日期，互不串数据", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    const notice = screen.getByTestId("missing-dates");
    const tmax = within(notice).getByTestId("missing-tmax");
    expect(tmax).toHaveTextContent("當前有效天數 6 天");
    expect(tmax).toHaveTextContent("請求 8 天");
    expect(tmax).toHaveTextContent("2026-09-07、2026-09-08");

    const tmin = within(notice).getByTestId("missing-tmin");
    expect(tmin).toHaveTextContent("當前有效天數 6 天");
    expect(tmin).toHaveTextContent("請求 7 天");
    expect(tmin).toHaveTextContent("2026-09-07");
    expect(tmin).not.toHaveTextContent("2026-09-08");
  });

  it("Top 5、排序前后、比较/交换/轮次与 STEM 数值全部来自轨迹", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    const trace = tmaxTrace();
    const results = await screen.findByTestId("results-tmax");

    const hot = within(results).getByTestId("top-hot");
    expect(within(hot).getAllByRole("listitem")).toHaveLength(5);
    expect(within(hot).getAllByRole("listitem")[0]).toHaveTextContent("2026-09-05");
    expect(within(hot).getAllByRole("listitem")[0]).toHaveTextContent("33.4 °C");

    const cold = within(results).getByTestId("top-cold");
    expect(within(cold).getAllByRole("listitem")).toHaveLength(5);
    expect(within(cold).getAllByRole("listitem")[0]).toHaveTextContent("2026-09-06");
    expect(within(cold).getAllByRole("listitem")[0]).toHaveTextContent("26.8 °C");

    const summary = within(results).getByTestId("result-summary");
    expect(summary).toHaveTextContent(`比較 ${trace.summary.comparisons} 次`);
    expect(summary).toHaveTextContent(`交換 ${trace.summary.swaps} 次`);
    expect(summary).toHaveTextContent(`${trace.summary.passes} 輪`);

    const before = within(results).getByTestId("before-order");
    expect(within(before).getAllByRole("listitem")[0]).toHaveTextContent("2026-09-01");
    const after = within(results).getByTestId("after-order");
    expect(within(after).getAllByRole("listitem")[0]).toHaveTextContent("2026-09-06");
    expect(within(after).getAllByRole("listitem")[0]).toHaveTextContent("26.8 °C");

    expect(within(results).getByTestId("stem-bubble")).toHaveTextContent(
      `${trace.summary.comparisons} 次比較`,
    );
    expect(within(results).getByTestId("stem-scan")).toHaveTextContent(
      `${trace.single_scan?.comparisons} 次比較`,
    );
  });

  it("STEM 与统计数字随轨迹数据变化，不是写死的", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        tmax: {
          transform: (trace) => ({
            ...trace,
            summary: { ...trace.summary, comparisons: 12, swaps: 7, passes: 5 },
            single_scan: { comparisons: 5, swaps: 0 },
          }),
        },
      }),
    );
    renderPage();
    await screen.findByTestId("trace-player");

    const results = screen.getByTestId("results-tmax");
    const summary = within(results).getByTestId("result-summary");
    expect(summary).toHaveTextContent("比較 12 次");
    expect(summary).toHaveTextContent("交換 7 次");
    expect(summary).toHaveTextContent("5 輪");
    expect(within(results).getByTestId("stem-bubble")).toHaveTextContent("12 次比較");
    expect(within(results).getByTestId("stem-scan")).toHaveTextContent("5 次比較");
  });

  it("负温与全相同温度都不会崩溃", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    const { unmount } = renderPage();
    await screen.findByTestId("trace-player");
    unmount();

    vi.stubGlobal(
      "fetch",
      createFetchMock({ tmax: { transform: () => negativeTrace } }),
    );
    const { unmount: unmountNegative } = renderPage();
    await screen.findByTestId("trace-player");
    const negativeValues = screen
      .getAllByTestId("bar-value")
      .map((node) => node.textContent);
    expect(negativeValues).toContain("-3.5 °C");
    expect(negativeValues).toContain("-7.2 °C");
    for (const shape of screen.getAllByTestId("bar-shape")) {
      expect(Number(shape.getAttribute("height"))).toBeGreaterThan(0);
    }
    unmountNegative();

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", createFetchMock({ tmax: { transform: () => allSameTrace } }));
    renderPage();
    await screen.findByTestId("trace-player");
    for (const value of screen.getAllByTestId("bar-value")) {
      expect(value).toHaveTextContent("28.0 °C");
    }
    for (const shape of screen.getAllByTestId("bar-shape")) {
      expect(Number(shape.getAttribute("height"))).toBeGreaterThanOrEqual(8);
    }
    // 等温不交换：排序前后顺序保持日期升序。
    const after = within(screen.getByTestId("results-tmax")).getByTestId("after-order");
    const afterItems = within(after).getAllByRole("listitem");
    expect(afterItems.map((item) => item.textContent)).toEqual([
      "2026-02-01｜28.0 °C2026-02-01 | 28.0 °C",
      "2026-02-02｜28.0 °C2026-02-02 | 28.0 °C",
      "2026-02-03｜28.0 °C2026-02-03 | 28.0 °C",
      "2026-02-04｜28.0 °C2026-02-04 | 28.0 °C",
    ]);
  });
});

describe("天气排序页：错误与日期校验", () => {
  it("422 显示有效日期不足，可重试", async () => {
    vi.stubGlobal("fetch", createFetchMock({ tmax: { status: 422 } }));
    renderPage();

    const error = await screen.findByTestId("trace-error-tmax");
    expect(error).toHaveTextContent("少於 2 天");
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
    expect(screen.queryByTestId("trace-player")).not.toBeInTheDocument();
  });

  it("5xx 与网络错误分类正确", async () => {
    vi.stubGlobal("fetch", createFetchMock({ tmax: { status: 500 } }));
    const { unmount } = renderPage();
    expect(await screen.findByTestId("trace-error-tmax")).toHaveTextContent("後端發生錯誤");
    unmount();

    vi.stubGlobal("fetch", createFetchMock({ tmax: { error: new TypeError("Failed to fetch") } }));
    renderPage();
    expect(await screen.findByTestId("trace-error-tmax")).toHaveTextContent("連不上後端伺服器");
  });

  it("日期不成对/顺序错误时禁用查询并提示", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await screen.findByTestId("trace-player");

    fireEvent.change(screen.getByLabelText("開始日期"), {
      target: { value: "2026-10-01" },
    });

    expect(screen.getByTestId("sort-date-error")).toHaveTextContent(
      "開始日期不能晚於結束日期",
    );
    expect(screen.getByTestId("weather-sort-not-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-player")).not.toBeInTheDocument();
  });
});
