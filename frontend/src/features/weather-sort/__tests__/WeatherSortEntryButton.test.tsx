import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import WeatherPage from "../../../pages/WeatherPage";
import {
  coverageResponse,
  dailyResponse,
  stationsEnvelope,
  summaryResponse,
} from "../../weather/__tests__/fixtures";
import {
  buildWeatherSortHref,
  WeatherSortEntryButton,
} from "../WeatherSortEntryButton";

// WeatherPage 内含 Plotly 图表；本测试只需要入口按钮，用轻量 stub 避免 canvas/WebGL。
vi.mock("../../weather/charts/plotlyBase", async () => {
  const stub = await import("../../weather/charts/__tests__/plotlyStub");
  return { BasePlot: stub.PlotlyStub };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

describe("天气排序入口按钮", () => {
  it("把当前测站、指标写进 /weather-sort 查询参数（日期窗口交给后端默认值）", () => {
    render(
      <MemoryRouter>
        <WeatherSortEntryButton station="HKO" metric="tmax" />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /用冒泡排序探索這 30 天的氣溫/ });
    expect(link).toHaveAttribute("href", "/weather-sort?station=HKO&metric=tmax");
    expect(link.getAttribute("href")).not.toContain("start=");
    expect(link.getAttribute("href")).not.toContain("end=");
    expect(
      screen.getByText("Explore These 30 Days of Temperatures with Bubble Sort"),
    ).toBeInTheDocument();
  });

  it("缺失的测站参数不会被写成猜测值", () => {
    expect(
      buildWeatherSortHref({
        station: undefined,
        metric: "tmin",
      }),
    ).toBe("/weather-sort?metric=tmin");
  });

  it("/weather 页面顶部真的渲染了入口按钮，并使用后端返回的真实窗口", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/weather/stations")) {
          return jsonResponse(stationsEnvelope());
        }
        if (url.includes("/api/weather/coverage")) {
          return jsonResponse(coverageResponse());
        }
        if (url.includes("/api/weather/daily")) {
          return jsonResponse(dailyResponse());
        }
        if (url.includes("/api/weather/summary")) {
          return jsonResponse(summaryResponse());
        }
        throw new Error(`unexpected request: ${url}`);
      }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <MemoryRouter initialEntries={["/weather"]}>
        <QueryClientProvider client={client}>
          <WeatherPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const entry = await screen.findByTestId("weather-sort-entry");
    const link = within(entry).getByRole("link", {
      name: /用冒泡排序探索這 30 天的氣溫/,
    });
    // 测站要等首轮查询完成后才写进链接；日期窗口不再由前端携带。
    await waitFor(() => {
      const href = link.getAttribute("href") ?? "";
      expect(href).toContain("station=HKO");
      expect(href).not.toContain("start=");
      expect(href).not.toContain("end=");
    });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/weather-sort?");
    expect(href).toContain("metric=tmax");
  });
});
