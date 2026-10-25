import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "../BarChart";
import type { TraceItem, TraceState } from "../types";

/** 30 天天气柱子：每根都带原始温度、日期与测站元数据。 */
function weatherItems(count: number): TraceItem[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const value = 20 + (index % 11);
    return {
      id: `it-2026-09-${day}`,
      value,
      value_raw: value.toFixed(1),
      label: `2026-09-${day}`,
      station: "HKO",
      station_name_zh_hant: "香港天文台",
      station_name_en: "Hong Kong Observatory",
      quality_flag: "C",
    };
  });
}

function stateOf(items: readonly TraceItem[], order = items.map((item) => item.id)): TraceState {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  return {
    state_id: 0,
    order,
    values: order.map((id) => byId.get(id)?.value ?? 0),
  };
}

function barSnapshot() {
  return screen.getAllByTestId("bar").map((bar) => ({
    itemId: bar.getAttribute("data-item-id") ?? "",
    centerX: Number(bar.getAttribute("data-center-x") ?? "0"),
    value: within(bar).getByTestId("bar-value").textContent ?? "",
    label: within(bar).getByTestId("bar-label").textContent ?? "",
  }));
}

describe("柱状图密集标签布局（30 根柱）", () => {
  it("30 根柱全部显示真实气温 + °C，并改用旋转 + 错层布局", () => {
    const items = weatherItems(30);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const svg = screen.getByTestId("bar-chart");
    expect(svg).toHaveAttribute("data-bar-count", "30");
    expect(svg).toHaveAttribute("data-label-layout", "rotated-staggered");
    expect(svg).toHaveAttribute("data-label-rotate", "-45");
    // 柱数多时每个槽位仍保留足够宽度，标签因此不会互相压住。
    expect(Number(svg.getAttribute("data-slot-width"))).toBeGreaterThanOrEqual(40);

    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(30);

    for (const bar of bars) {
      const item = items.find((candidate) => candidate.id === bar.getAttribute("data-item-id"));
      expect(item).toBeDefined();
      // 必须始终显示真实气温与单位，不得省略。
      const value = within(bar).getByTestId("bar-value");
      expect(value).toHaveTextContent(`${item?.value_raw} °C`);
      expect(value).toHaveAttribute("data-label-rotate", "-45");
      expect(["0", "1"]).toContain(value.getAttribute("data-label-stagger"));

      const dateLabel = within(bar).getByTestId("bar-label");
      expect(dateLabel).toHaveTextContent(item?.label?.slice(5) ?? "");
      expect(dateLabel).toHaveAttribute("data-label-rotate", "-40");
    }

    // 相邻柱子必定一上一下错层（奇偶交替），进一步避免标签重叠。
    for (let index = 1; index < bars.length; index += 1) {
      const previous = bars[index - 1].getAttribute("data-label-stagger");
      const current = bars[index].getAttribute("data-label-stagger");
      expect(current).not.toBe(previous);
    }
  });

  it("宽画布放进可横向滚动的区域，并保留键盘可达性", () => {
    const items = weatherItems(30);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const scroll = screen.getByTestId("bar-chart-scroll");
    expect(scroll).toHaveAttribute("tabindex", "0");
    expect(scroll).toHaveAttribute("role", "group");
    expect(scroll.getAttribute("aria-label")).toContain("柱狀圖");

    const svg = screen.getByTestId("bar-chart");
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(680);
    expect(svg).toHaveAttribute("role", "img");
    expect(svg.getAttribute("aria-label")).toContain("柱狀圖");

    // 每根柱子仍是可聚焦的图片语义节点，读屏可得到完整日期/测站/温度。
    const firstBar = screen.getAllByTestId("bar")[0];
    expect(firstBar).toHaveAttribute("tabindex", "0");
    expect(firstBar).toHaveAttribute("role", "img");
    expect(firstBar.getAttribute("aria-label")).toContain("2026-09-01");
    expect(firstBar.getAttribute("aria-label")).toContain("香港天文台");
    expect(firstBar.getAttribute("aria-label")).toContain("Hong Kong Observatory");
  });

  it("柱数较少时保持水平标签布局（不强制旋转）", () => {
    const items = weatherItems(4);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const svg = screen.getByTestId("bar-chart");
    expect(svg).toHaveAttribute("data-label-layout", "horizontal");
    expect(svg).toHaveAttribute("data-label-rotate", "0");
    for (const value of screen.getAllByTestId("bar-value")) {
      expect(value).toHaveAttribute("data-label-rotate", "0");
      expect(value.textContent).toMatch(/°C$/);
    }
    expect(screen.getAllByTestId("bar-label")).toHaveLength(4);
  });
});

describe("交换时标签与日期稳定跟随（transform 过渡）", () => {
  it("交换前后每根柱子的温度与日期保持配对，位置通过 transform 改变", () => {
    const items = weatherItems(4);
    const before = stateOf(items);
    const swappedOrder = [items[1].id, items[0].id, items[2].id, items[3].id];
    const after = stateOf(items, swappedOrder);

    const { rerender } = render(<BarChart items={items} state={before} unit="°C" />);
    const beforeSnapshot = barSnapshot();
    expect(beforeSnapshot.map((bar) => bar.itemId)).toEqual(before.order);

    rerender(<BarChart items={items} state={after} unit="°C" />);
    const afterSnapshot = barSnapshot();
    expect(afterSnapshot.map((bar) => bar.itemId)).toEqual(swappedOrder);

    const byId = new Map(afterSnapshot.map((bar) => [bar.itemId, bar] as const));
    for (const bar of beforeSnapshot) {
      const moved = byId.get(bar.itemId);
      expect(moved).toBeDefined();
      // 元素身份不变：同一根柱子的温度与日期在交换后仍然严格匹配。
      expect(moved?.value).toBe(bar.value);
      expect(moved?.label).toBe(bar.label);
    }

    // 交换的两根柱子位置互换；另外两根位置不变。
    expect(byId.get(items[0].id)?.centerX).toBe(beforeSnapshot[1].centerX);
    expect(byId.get(items[1].id)?.centerX).toBe(beforeSnapshot[0].centerX);
    expect(byId.get(items[2].id)?.centerX).toBe(beforeSnapshot[2].centerX);

    // 槽位间距稳定：相邻中心点差值一致，不会在交换时挤在一起。
    const gaps = afterSnapshot
      .slice(1)
      .map((bar, index) => Math.round((bar.centerX - afterSnapshot[index].centerX) * 10) / 10);
    expect(new Set(gaps).size).toBe(1);
  });

  it("聚焦柱子时显示完整日期、测站与品质标记", () => {
    const items = weatherItems(4);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    fireEvent.focus(screen.getAllByTestId("bar")[0]);
    const detail = screen.getByTestId("bar-detail");
    expect(detail).toHaveTextContent("2026-09-01");
    expect(detail).toHaveTextContent("20.0 °C");
    expect(detail).toHaveTextContent("香港天文台");
    expect(detail).toHaveTextContent("Hong Kong Observatory");
    expect(detail).toHaveTextContent("C");
  });
});
