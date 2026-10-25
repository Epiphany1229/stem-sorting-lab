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
  it("30 根柱全部显示纯数字（水平、无旋转），单位统一显示在画布上方", () => {
    const items = weatherItems(30);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const svg = screen.getByTestId("bar-chart");
    expect(svg).toHaveAttribute("data-bar-count", "30");
    expect(svg).toHaveAttribute("data-label-layout", "horizontal-staggered");
    // 不再有旋转标记。
    expect(svg).not.toHaveAttribute("data-label-rotate");
    // 柱数多时每个槽位仍保留足够宽度，标签因此不会互相压住。
    expect(Number(svg.getAttribute("data-slot-width"))).toBeGreaterThanOrEqual(34);

    // 画布上方统一显示双语单位说明。
    const unitNote = screen.getByTestId("bar-chart-unit");
    expect(unitNote).toHaveTextContent("單位：°C");
    expect(unitNote).toHaveTextContent("Unit: °C");

    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(30);

    for (const bar of bars) {
      const item = items.find((candidate) => candidate.id === bar.getAttribute("data-item-id"));
      expect(item).toBeDefined();

      const value = within(bar).getByTestId("bar-value");
      // 柱顶只显示纯数字，不再逐柱拼 °C。
      expect(value.textContent).toBe(item?.value_raw);
      expect(value.textContent).toMatch(/^\d+\.\d$/);
      expect(value.textContent).not.toContain("°C");
      // 数字保持水平：没有 rotate 属性/transform，text-anchor 居中。
      expect(value).not.toHaveAttribute("data-label-rotate");
      expect(value).not.toHaveAttribute("transform");
      expect(value).toHaveAttribute("text-anchor", "middle");
      expect(["0", "1"]).toContain(value.getAttribute("data-label-stagger"));

      const dateLabel = within(bar).getByTestId("bar-label");
      expect(dateLabel).toHaveTextContent(item?.label?.slice(5) ?? "");
      expect(dateLabel).not.toHaveAttribute("transform");
    }

    // 相邻柱子必定一上一下微错层（奇偶交替），文字仍然水平。
    for (let index = 1; index < bars.length; index += 1) {
      const previous = bars[index - 1].getAttribute("data-label-stagger");
      const current = bars[index].getAttribute("data-label-stagger");
      expect(current).not.toBe(previous);
    }
  });

  it("无障碍与聚焦详情仍带完整 °C（日期、测站、温度、单位）", () => {
    const items = weatherItems(30);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const firstBar = screen.getAllByTestId("bar")[0];
    expect(firstBar).toHaveAttribute("role", "img");
    expect(firstBar).toHaveAttribute("tabindex", "0");
    expect(firstBar.getAttribute("aria-label")).toContain("2026-09-01");
    expect(firstBar.getAttribute("aria-label")).toContain("香港天文台");
    expect(firstBar.getAttribute("aria-label")).toContain("Hong Kong Observatory");
    expect(firstBar.getAttribute("aria-label")).toContain("20.0 °C");
    expect(firstBar.querySelector("title")?.textContent).toContain("20.0 °C");

    fireEvent.focus(firstBar);
    const detail = screen.getByTestId("bar-detail");
    expect(detail).toHaveTextContent("2026-09-01");
    expect(detail).toHaveTextContent("20.0 °C");
    expect(detail).toHaveTextContent("香港天文台");
    expect(detail).toHaveTextContent("Hong Kong Observatory");
    expect(detail).toHaveTextContent("品質標記");
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
  });

  it("柱数较少时同样水平显示纯数字，并有统一单位提示", () => {
    const items = weatherItems(4);
    render(<BarChart items={items} state={stateOf(items)} unit="°C" />);

    const svg = screen.getByTestId("bar-chart");
    expect(svg).toHaveAttribute("data-label-layout", "horizontal");
    expect(screen.getByTestId("bar-chart-unit")).toHaveTextContent("單位：°C");
    for (const value of screen.getAllByTestId("bar-value")) {
      expect(value.textContent).toMatch(/^\d+\.\d$/);
      expect(value).not.toHaveAttribute("transform");
    }
    expect(screen.getAllByTestId("bar-label")).toHaveLength(4);
  });

  it("没有单位（阶段 2 整数轨迹）时不显示单位提示", () => {
    render(
      <BarChart
        items={[
          { id: "a", value: 5 },
          { id: "b", value: 3 },
        ]}
        state={{ state_id: 0, order: ["a", "b"], values: [5, 3] }}
      />,
    );

    expect(screen.queryByTestId("bar-chart-unit")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("bar-value").map((node) => node.textContent)).toEqual([
      "5",
      "3",
    ]);
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
      // 元素身份不变：同一根柱子的数字与日期在交换后仍然严格匹配。
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
});
