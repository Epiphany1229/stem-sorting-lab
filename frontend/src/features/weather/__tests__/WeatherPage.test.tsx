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
  demoDailyResponse,
  emptyOfficialDailyResponse,
  importedDailyResponse,
  importResponse,
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
      if (mode === "demo") {
        return jsonResponse(demoDailyResponse());
      }
      if (mode === "imported") {
        return jsonResponse(importedDailyResponse());
      }
      return jsonResponse(dailyResponse());
    }
    if (path.endsWith("/weather/summary")) {
      if (options.summary) {
        return jsonResponse(options.summary(mode));
      }
      return jsonResponse(summaryResponse({ mode, notice: officialNotice(mode) }));
    }
    if (path.endsWith("/weather/import")) {
      return jsonResponse(importResponse());
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

async function waitForFiveCharts() {
  await screen.findByTestId("chart-line");
  await waitFor(() => {
    expect(screen.getAllByRole("img")).toHaveLength(5);
  });
}

describe("天气探索页", () => {
  it("加载官方资料：覆盖率、五张图、数据表与导出链接", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitForFiveCharts();

    // 官方模式不显示非官方横幅。
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();

    expect(screen.getByText("2026-09-01 至 2026-09-05，共 5 天")).toBeInTheDocument();

    const lineTable = await screen.findByTestId("chart-line-table");
    expect(within(lineTable).getByText("共 8 列")).toBeInTheDocument();
    expect(within(lineTable).getAllByText("香港天文台").length).toBeGreaterThan(0);

    const exportLink = screen.getByTestId("export-csv");
    expect(exportLink.getAttribute("href")).toContain("/api/weather/export.csv");
    expect(exportLink.getAttribute("href")).toContain("stations=HKO");
    expect(exportLink.getAttribute("href")).toContain("metrics=tmax%2Ctmin");
  });

  it("多选测站后折线图数据表合并两个站", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();
    await waitForFiveCharts();

    fireEvent.click(screen.getByRole("checkbox", { name: /京士柏/ }));

    await waitFor(() => {
      expect(within(screen.getByTestId("chart-line-table")).getByText("共 16 列")).toBeInTheDocument();
    });
  });

  it("打开示範模式后所有 GET 请求带 mode=demo，并按回应信封显示常驻横幅", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForFiveCharts();

    fireEvent.click(screen.getByRole("checkbox", { name: /示範模式/ }));

    const banner = await screen.findByTestId("demo-banner");
    expect(banner).toHaveAttribute("data-mode", "demo");
    expect(banner).toHaveTextContent("示範資料");
    expect(banner).toHaveTextContent("不是官方即時資料");

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("/weather/daily") && url.includes("mode=demo"))).toBe(
      true,
    );
    expect(
      urls.some((url) => url.includes("/weather/coverage") && url.includes("mode=demo")),
    ).toBe(true);
  });

  it("官方无数据时五张图都显示空状态与具体原因，且不静默切演示数据", async () => {
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
      expect(screen.getAllByTestId(/^chart-.*-empty$/)).toHaveLength(5);
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

  it("CSV 导入完成后切到 mode=imported 并显示匯入資料横幅", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForFiveCharts();

    const fileInput = screen.getByLabelText("選擇 CSV 檔案") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["a,b\n"], "hko.csv", { type: "text/csv" })],
      },
    });
    fireEvent.submit(
      screen.getByTestId("import-submit").closest("form") as HTMLFormElement,
    );

    await screen.findByTestId("import-report");
    const banner = await screen.findByTestId("demo-banner");
    await waitFor(() => expect(banner).toHaveAttribute("data-mode", "imported"));
    expect(banner).toHaveTextContent("匯入資料");

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(
      urls.some((url) => url.includes("/weather/daily") && url.includes("mode=imported")),
    ).toBe(true);
  });

  it("日期不成对时提示错误", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    renderPage();

    fireEvent.change(screen.getByLabelText("開始日期"), {
      target: { value: "2026-09-10" },
    });

    expect(screen.getByTestId("date-error")).toHaveTextContent("必須成對填寫");
  });
});
