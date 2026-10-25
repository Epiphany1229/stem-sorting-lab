import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plotly 的 jsdom 测试替身：只记录配置，不加载真实 plotly bundle。
vi.mock("../plotlyBase", async () => {
  const stub = await import("./plotlyStub");
  return { BasePlot: stub.PlotlyStub };
});

import { BarChart } from "../BarChart";
import { DonutChart } from "../DonutChart";
import { Histogram } from "../Histogram";
import { LineChart } from "../LineChart";
import type { RainfallSeries } from "../../transform";
import {
  buildDailyRows,
  HKO,
  KP,
  summaryResponse,
  WINDOW,
} from "../../__tests__/fixtures";
import { capturedFigures, lastFigure, resetCapturedFigures } from "./plotlyStub";

const rows = buildDailyRows();
const stations = [HKO, KP];

function trace(index: number): Record<string, unknown> {
  return lastFigure()?.data[index] ?? {};
}

function layout(): Record<string, unknown> {
  return lastFigure()?.layout ?? {};
}

function config(): Record<string, unknown> {
  return lastFigure()?.config ?? {};
}

/** 悬停文本必须包含繁中与英文两行（<br> 分隔）。 */
function expectBilingualHover(template: unknown): void {
  expect(typeof template).toBe("string");
  const text = String(template);
  const [zhLine, enLine] = text.split("<br>");
  expect(zhLine.trim().length).toBeGreaterThan(0);
  expect(enLine.trim().length).toBeGreaterThan(0);
  expect(/[\u4e00-\u9fff]/.test(zhLine)).toBe(true);
  expect(/[A-Za-z]/.test(enLine)).toBe(true);
}

beforeEach(() => {
  resetCapturedFigures();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("图 1 折线图", () => {
  it("按站 × 指标画线，缺口断开且悬停双语", () => {
    render(
      <LineChart rows={rows} stations={stations} metrics={["tmax", "tmin"]} window={WINDOW} />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("折線圖"),
    );
    expect(capturedFigures).toHaveLength(1);
    expect(lastFigure()?.data).toHaveLength(4); // 2 站 × 2 指标

    const hkoTmax = trace(0);
    expect(hkoTmax.type).toBe("scatter");
    expect(hkoTmax.connectgaps).toBe(false);
    expect((hkoTmax.y as (number | null)[])[3]).toBeNull(); // 2026-09-04 缺口
    expectBilingualHover(hkoTmax.hovertemplate);
    expect(String(hkoTmax.hovertemplate)).toContain("香港天文台");
    expect(String(hkoTmax.hovertemplate)).toContain("Hong Kong Observatory");
    expect(String(hkoTmax.name)).toContain("香港天文台");
    expect(String(hkoTmax.name)).toContain("Hong Kong Observatory");

    expect(layout().showlegend).toBe(true);
    expect(JSON.stringify(layout().legend)).toContain("圖例");
    expect(JSON.stringify(layout().legend)).toContain("Legend");
    expect(config().locale).toBe("en");

    const table = screen.getByTestId("chart-line-table");
    expect(within(table).getByText("氣溫折線圖的可存取資料表")).toBeInTheDocument();
    expect(within(table).getByText(/共 16 列/)).toBeInTheDocument();
    // 超过 5 行的表格默认折叠，可展开。
    expect(within(table).getByTestId("chart-line-table-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("没有数据时显示空状态与后端原因，不渲染画布", () => {
    render(
      <LineChart
        rows={[]}
        stations={stations}
        metrics={["tmax"]}
        window={WINDOW}
        reason="no_cache"
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-line-empty")).toBeInTheDocument();
    // 原因同时出现在图表空状态与下方数据表。
    expect(screen.getAllByText(/本機沒有可用的快取資料/).length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("chart-line-table")).getByText("暫無可用資料")).toBeInTheDocument();
  });
});

describe("图 2 柱状图", () => {
  it("没有降雨接口时画日最高温对比，并明确说明不是降雨", () => {
    render(<BarChart rows={rows} stations={stations} window={WINDOW} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "所選測站日最高溫對比" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/這不是降雨資料/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("非降雨資料"),
    );

    const first = trace(0);
    expect(first.type).toBe("bar");
    expect(first.barmode).toBeUndefined();
    expectBilingualHover(first.hovertemplate);
    expect(String(first.hovertemplate)).toContain("°C");

    const table = screen.getByTestId("chart-bar-table");
    expect(within(table).getByText(/不是降雨資料/)).toBeInTheDocument();
    expect(within(table).getByText(/共 8 列/)).toBeInTheDocument();
    expect(screen.queryByText("每日降雨量柱狀圖")).not.toBeInTheDocument();
  });

  it("只有真的拿到降雨序列时才切换成降雨图", () => {
    const rainfall: RainfallSeries[] = [
      {
        stationId: "HKO",
        stationNameZh: "香港天文台",
        stationNameEn: "Hong Kong Observatory",
        points: [
          { date: "2026-09-01", value: 0.4, valueRaw: "0.4", unit: "mm" },
          { date: "2026-09-02", value: 12.8, valueRaw: "12.8", unit: "mm" },
        ],
      },
    ];

    render(
      <BarChart rows={rows} stations={stations} window={WINDOW} rainfallSeries={rainfall} />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "每日降雨量柱狀圖" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/已累積的每日降雨量/)).toBeInTheDocument();
    expectBilingualHover(trace(0).hovertemplate);
    expect(String(trace(0).hovertemplate)).toContain("毫米");
    expect(within(screen.getByTestId("chart-bar-table")).getByText(/每日降雨量的可存取資料表/)).toBeInTheDocument();
  });
});

describe("图 3 直方图", () => {
  it("按站叠加，xbins 与资料表区间一致", () => {
    render(<Histogram rows={rows} stations={stations} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("分布直方圖"),
    );
    expect(screen.getByText("有效樣本：8 個")).toBeInTheDocument();
    expect(trace(0).type).toBe("histogram");
    expect(trace(0).xbins).toBeDefined();
    expectBilingualHover(trace(0).hovertemplate);

    const table = screen.getByTestId("chart-histogram-table");
    expect(within(table).getByText("日最高溫分布的可存取資料表")).toBeInTheDocument();
    expect(within(table).getByText(/共 6 列/)).toBeInTheDocument();
    expect(layout().barmode).toBe("overlay");
  });

  it("没有数据时显示空状态", () => {
    render(<Histogram rows={[]} stations={stations} reason="not_published" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-histogram-empty")).toBeInTheDocument();
    expect(screen.getAllByText(/官方當月月表尚未發布/).length).toBeGreaterThan(0);
  });
});

describe("图 4 环形图", () => {
  it("只表达有效观测日的温度区间天数占比，并标注阈值/样本/缺失", () => {
    const summary = summaryResponse();
    render(<DonutChart summary={summary} station={HKO} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("環形圖"),
    );
    const donut = trace(0);
    expect(donut.type).toBe("pie");
    expect(donut.hole).toBe(0.55);
    expect(donut.values).toEqual([1, 2, 1]);
    expectBilingualHover(donut.hovertemplate);

    const noteText = document.body.textContent ?? "";
    expect(noteText).toContain("區間由教學程式依資料範圍等分，非官方標準");
    expect(noteText).toContain("Bins are computed by the teaching app, not an official standard");
    expect(noteText).toContain("有效樣本 4 天｜缺失 1 天");
    expect(noteText).toContain("29–30.2°C");

    const table = screen.getByTestId("chart-donut-table");
    expect(within(table).getByText("溫度區間天數與佔比的可存取資料表")).toBeInTheDocument();
    expect(within(table).getByText("共 3 列")).toBeInTheDocument();
    expect(within(table).getAllByText("25.0%").length).toBeGreaterThan(0);
  });

  it("没有 summary 时显示空状态与原因", () => {
    render(<DonutChart summary={undefined} reason="na_no_history" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-donut-empty")).toBeInTheDocument();
    expect(screen.getAllByText(/這個指標沒有官方歷史介面/).length).toBeGreaterThan(0);
  });
});

describe("Plotly 通用外壳", () => {
  it("prefers-reduced-motion 时把过渡时长设为 0，并暴露 data 属性", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(
      <LineChart rows={rows} stations={stations} metrics={["tmax"]} window={WINDOW} />,
    );

    expect(screen.getByTestId("chart-line-plot")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    const transition = layout().transition as { duration?: number };
    expect(transition.duration).toBe(0);
  });

  it("图表画布有 role=img 与繁中摘要，颜色之外还有线型/符号/图案编码", () => {
    render(
      <LineChart rows={rows} stations={stations} metrics={["tmax", "tmin"]} window={WINDOW} />,
    );

    const plot = screen.getByTestId("chart-line-plot");
    expect(plot).toHaveAttribute("role", "img");
    expect(plot.getAttribute("aria-label")).toContain("2026-09-01");
    // 不同指标使用不同线型，避免只靠颜色区分。
    expect((trace(0).line as { dash?: string }).dash).toBe("solid");
    expect((trace(1).line as { dash?: string }).dash).toBe("dash");
  });
});
