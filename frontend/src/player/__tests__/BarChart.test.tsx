import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "../BarChart";
import { eventByStep, traceFixture } from "./traceFixture";

describe("BarChart SVG 柱状图", () => {
  it("按 state.order 渲染柱子、数值标签与多通道状态（颜色 + 图案 + 图标）", () => {
    const state = traceFixture.states[2];
    const swapEvent = eventByStep(5);
    render(<BarChart items={traceFixture.items} state={state} event={swapEvent} />);

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(4);
    expect(bars.map((bar) => bar.getAttribute("data-item-id"))).toEqual([...state.order]);

    const labels = bars.map((bar) => Number(within(bar).getByTestId("bar-value").textContent));
    expect(labels).toEqual([...state.values]);

    // 交换事件涉及的两个下标是「正在交换」，其余仍是待处理。
    expect(bars.map((bar) => bar.getAttribute("data-state"))).toEqual([
      "pending",
      "pending",
      "swap",
      "swap",
    ]);

    // 图标与图案通道（不只靠颜色）。
    expect(within(bars[2]).getByTestId("bar-glyph")).toHaveTextContent("↔");
    expect(bars[2].querySelector(".bar-chart__pattern-overlay")).not.toBeNull();

    // 图例是繁体中文在上、英文在下。
    expect(screen.getByText("正在交換")).toBeInTheDocument();
    expect(screen.getByText("Being swapped")).toBeInTheDocument();
    expect(screen.getByTestId("legend-swatch-sorted")).toHaveTextContent("✓");
  });

  it("比较中的柱子带 ? 标记，已就位的柱子带 ✓ 与排線图案", () => {
    const compareEvent = eventByStep(8);
    render(
      <BarChart
        items={traceFixture.items}
        state={traceFixture.states[2]}
        event={compareEvent}
      />,
    );

    const bars = screen.getAllByTestId("bar");
    expect(bars.map((bar) => bar.getAttribute("data-state"))).toEqual([
      "pending",
      "compare",
      "compare",
      "sorted",
    ]);
    expect(within(bars[1]).getByTestId("bar-glyph")).toHaveTextContent("?");
    expect(within(bars[3]).getByTestId("bar-glyph")).toHaveTextContent("✓");
    expect(bars[3].querySelector(".bar-chart__pattern-overlay")).not.toBeNull();
  });

  it("负值从零基线向下画，标签仍在柱体旁边", () => {
    render(
      <BarChart
        items={[
          { id: "a", value: -5 },
          { id: "b", value: 0 },
          { id: "c", value: 7 },
        ]}
        state={{ state_id: 0, order: ["a", "b", "c"], values: [-5, 0, 7] }}
      />,
    );

    const bars = screen.getAllByTestId("bar");
    const negativeShape = within(bars[0]).getByTestId("bar-shape");
    const positiveShape = within(bars[2]).getByTestId("bar-shape");
    const negativeY = Number(negativeShape.getAttribute("y"));
    const positiveY = Number(positiveShape.getAttribute("y"));

    // 负值柱从基线向下：y 比正值柱更靠下（数值更大），且高度不为零。
    expect(negativeY).toBeGreaterThan(positiveY);
    expect(Number(negativeShape.getAttribute("height"))).toBeGreaterThan(0);
    expect(Number(positiveShape.getAttribute("height"))).toBeGreaterThan(0);
    expect(within(bars[0]).getByTestId("bar-value")).toHaveTextContent("-5");
    expect(within(bars[1]).getByTestId("bar-value")).toHaveTextContent("0");
  });

  it("全相同值也渲染可见柱（不会出现零高度柱）", () => {
    render(
      <BarChart
        items={[
          { id: "a", value: 7 },
          { id: "b", value: 7 },
          { id: "c", value: 7 },
        ]}
        state={{ state_id: 0, order: ["a", "b", "c"], values: [7, 7, 7] }}
      />,
    );

    const shapes = screen.getAllByTestId("bar-shape");
    expect(shapes).toHaveLength(3);
    for (const shape of shapes) {
      expect(Number(shape.getAttribute("height"))).toBeGreaterThanOrEqual(8);
    }
    for (const value of screen.getAllByTestId("bar-value")) {
      expect(value).toHaveTextContent("7");
    }
  });

  it("全部为 0 时同样有最小高度，不崩溃", () => {
    render(
      <BarChart
        items={[
          { id: "a", value: 0 },
          { id: "b", value: 0 },
        ]}
        state={{ state_id: 0, order: ["a", "b"], values: [0, 0] }}
      />,
    );

    for (const shape of screen.getAllByTestId("bar-shape")) {
      expect(Number(shape.getAttribute("height"))).toBeGreaterThanOrEqual(8);
    }
  });
});
