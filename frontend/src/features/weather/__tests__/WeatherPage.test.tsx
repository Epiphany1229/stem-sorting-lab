import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Plotly 的 jsdom 测试替身：不加载真实 plotly bundle。
vi.mock("../charts/plotlyBase", async () => {
  const stub = await import("../charts/__tests__/plotlyStub");
  return { BasePlot: stub.PlotlyStub };
});

import WeatherPage from "../../../pages/WeatherPage";
import type { DailyResponse, DataMode, SummaryResponse } from "../types";
import {
  coverageResponse,
  dailyResponse,
  emptyOfficialDailyResponse,
  stationsEnvelope,
  summaryResponse,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface FetchOptions {
  readonly daily?: (mode: DataMode) => DailyResponse;
  readonly summary?: (mode: DataMode) => SummaryResponse;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function officialNotice(mode: DataMode): string | null {
  return mode === "official" ? null : `非官方資料（${mode}）`;
}

function createFetchMock(options: FetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const raw = String(input);
    const url = new URL(raw, "http://localhost");
    const mode = (url.searchParams.get("mode") ?? "official") as DataMode;
    const path = url.pathname;

    if (path.endsWith("/weather/stations")) {
      return jsonResponse(stationsEnvelope({ mode, notice: officialNotice(mode) }));
    }
    if (path.endsWith("/weather/coverage")) {
      return jsonResponse(coverageResponse({ mode, notice: officialNotice(mode) }));
    }
    if (path.endsWith("/weather/daily")) {
      if (options.daily) {
        return jsonResponse(options.daily(mode));
      }
      return jsonResponse(dailyResponse());
    }
    if (path.endsWith("/weather/summary")) {
      if (options.summary) {
        return jsonResponse(options.summary(mode));
      }
      return jsonResponse(summaryResponse({ mode, notice: officialNotice(mode) }));
    }
    if (path.endsWith("/weather/refresh")) {
      return jsonResponse({
        accepted: true,
        reason: null,
        next_allowed_at: "2026-10-23T20:05:00+08:00",
        remaining_budget: 494,
        requests_made: 2,
        rows_upserted: 120,
        message: null,
      });
    }
    throw new Error(`unexpected request: ${raw}`);
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WeatherPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function waitForFourCharts() {
  await screen.findByTestId("chart-line");
  await waitFor(() => {
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });
}

describe("天气探索页", () => {
  it("固定显示后端 30 天窗口、四张图与可折叠数据表；不再有查询条件/CSV/散点图", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitForFourCharts();

    // 官方模式不显示非官方横幅。
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    // 真实起止日期来自后端 coverage/daily 信封，不是前端写死或让用户选。
    expect(screen.getByText("2026-09-01 至 2026-09-05，共 5 天")).toBeInTheDocument();

    expect(screen.getByTestId("chart-line")).toBeInTheDocument();
    expect(screen.getByTestId("chart-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chart-histogram")).toBeInTheDocument();
    expect(screen.getByTestId("chart-donut")).toBeInTheDocument();
    // 散点图已删除。
    expect(screen.queryByTestId("chart-scatter")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart-scatter-table")).not.toBeInTheDocument();

    // 查询条件与 CSV 导入已删除。
    expect(screen.queryByTestId("weather-controls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("csv-import")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("開始日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("結束日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("選擇 CSV 檔案")).not.toBeInTheDocument();

    const lineTable = await screen.findByTestId("chart-line-table");
    // 8 行 > 5，默认折叠：行数说明与展开按钮都存在。
    expect(within(lineTable).getByText(/共 8 列/)).toBeInTheDocument();
    const lineToggle = within(lineTable).getByTestId("chart-line-table-toggle");
    expect(lineToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(lineTable).getAllByRole("row")).toHaveLength(6); // 表头 + 前 5 行
    fireEvent.click(lineToggle);
    expect(lineToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(lineTable).getAllByRole("row")).toHaveLength(9); // 表头 + 全部 8 行

    const exportLink = screen.getByTestId("export-csv");
    expect(exportLink.getAttribute("href")).toContain("/api/weather/export.csv");
    expect(exportLink.getAttribute("href")).toContain("stations=HKO");
    expect(exportLink.getAttribute("href")).toContain("metrics=tmax%2Ctmin");
    // 请求不再带日期参数：窗口由后端决定。
    const dailyUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("/weather/daily"));
    expect(dailyUrl).toBeDefined();
    expect(dailyUrl).not.toContain("start=");
    expect(dailyUrl).not.toContain("end=");
  });

  it("测站选择器过滤没有资料的测站（TPO 类）", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await waitForFourCharts();

    expect(screen.getByRole("checkbox", { name: /香港天文台/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /京士柏/ })).toBeInTheDocument();
    // 夹具中的 VP1 available_days=0，不应出现在选择器里。
    expect(screen.queryByRole("checkbox", { name: /山頂/ })).not.toBeInTheDocument();
    expect(screen.getByText("已選 1 / 2 站")).toBeInTheDocument();
  });

  it("多选测站后折线图数据表合并两个站", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await waitForFourCharts();

    fireEvent.click(screen.getByRole("checkbox", { name: /京士柏/ }));

    await waitFor(() => {
      expect(
        within(screen.getByTestId("chart-line-table")).getByText(/共 16 列/),
      ).toBeInTheDocument();
    });
  });

  it("不暴露任何抓取或模式切换入口，只保留 CSV 导出", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForFourCharts();

    // 不再有 demo 开关、重新抓取按钮或任何抓取相关控件。
    expect(screen.queryByRole("checkbox", { name: /示範模式/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重新抓取/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("refresh-control")).not.toBeInTheDocument();
    const options = screen.getByTestId("weather-options");
    expect(within(options).queryAllByRole("button")).toHaveLength(0);
    expect(within(options).getByTestId("export-csv")).toBeInTheDocument();

    // 所有请求固定为 official（不带 mode 参数），也不会调用 /refresh。
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("mode="))).toBe(false);
    expect(urls.some((url) => url.includes("/weather/refresh"))).toBe(false);
  });

  it("官方无数据时四张图都显示空状态与具体原因，且不静默切演示数据", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        daily: () => emptyOfficialDailyResponse(),
        summary: () =>
          summaryResponse({
            valid_days: 0,
            missing_days: 5,
            bins: [],
            notice: null,
          }),
      }),
    );

    renderPage();
    await screen.findByTestId("chart-line");
    await waitFor(() => {
      expect(screen.getAllByTestId(/^chart-.*-empty$/)).toHaveLength(4);
    });

    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    expect(screen.getAllByText(/官方當月月表尚未發布/).length).toBeGreaterThan(0);
  });

  it("后端连不上时显示网络错误，不渲染假图表", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const error = await screen.findByTestId("stations-error");
    expect(error).toHaveTextContent("連不上後端伺服器");
    expect(screen.getByTestId("charts-no-selection")).toBeInTheDocument();
  });
});
