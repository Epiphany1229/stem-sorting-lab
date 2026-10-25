import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AuxAlgorithmId } from "../types";
import { HeapAux } from "../auxiliary/HeapAux";
import { InsertionAux } from "../auxiliary/InsertionAux";
import { MergeAux } from "../auxiliary/MergeAux";
import { QuickAux } from "../auxiliary/QuickAux";
import { SelectionAux } from "../auxiliary/SelectionAux";
import { ShellAux } from "../auxiliary/ShellAux";
import { auxAuxiliaryStates, auxEvent, auxItems, auxState } from "./fixtures";

const cases: ReadonlyArray<{
  readonly id: AuxAlgorithmId;
  readonly testId: string;
  readonly Component: typeof SelectionAux;
}> = [
  { id: "selection", testId: "aux-selection", Component: SelectionAux },
  { id: "insertion", testId: "aux-insertion", Component: InsertionAux },
  { id: "shell", testId: "aux-shell", Component: ShellAux },
  { id: "merge", testId: "aux-merge", Component: MergeAux },
  { id: "quick", testId: "aux-quick", Component: QuickAux },
  { id: "heap", testId: "aux-heap", Component: HeapAux },
];

function renderAux(
  _id: AuxAlgorithmId,
  Component: (typeof cases)[number]["Component"],
  event: ReturnType<typeof auxEvent> | null,
) {
  return render(<Component event={event} state={auxState} items={auxItems} />);
}

describe("六个算法专属辅助视觉：有数据时渲染关键元素", () => {
  it("选择：最小值候选、扫描区间、已排定前缀", () => {
    renderAux("selection", SelectionAux, auxEvent(auxAuxiliaryStates.selection));

    expect(screen.getByTestId("aux-selection")).toHaveTextContent("選擇追蹤");
    expect(screen.getByTestId("aux-selection-fact-min")).toHaveTextContent("下標 2");
    expect(screen.getByTestId("aux-selection-fact-min")).toHaveTextContent("數值 8");
    expect(screen.getByTestId("aux-selection-fact-scan")).toHaveTextContent("1 到 4");
    expect(screen.getByTestId("aux-selection-fact-finalized")).toHaveTextContent("1 個位置");
    expect(screen.getAllByTestId(/^selection-cell-/)).toHaveLength(6);
    expect(screen.getByTestId("selection-cell-2")).toHaveAttribute("data-tone", "candidate");
    expect(screen.getByTestId("selection-cell-0")).toHaveAttribute("data-tone", "settled");
    const figure = screen.getByTestId("aux-selection-figure");
    expect(figure).toHaveAttribute("role", "img");
    expect(figure.getAttribute("aria-label")).toContain("最小值候選");
    expect(figure).toHaveAttribute("tabindex", "0");
  });

  it("插入：持牌槽位、空洞、已排序区与右移状态", () => {
    renderAux("insertion", InsertionAux, auxEvent(auxAuxiliaryStates.insertion));

    expect(screen.getByTestId("aux-insertion-held")).toHaveTextContent("持牌");
    expect(screen.getByTestId("aux-insertion-held")).toHaveTextContent("8");
    expect(screen.getByTestId("aux-insertion-held")).toHaveTextContent("2 → 1");
    expect(screen.getByTestId("aux-insertion-fact-status")).toHaveTextContent("右移中");
    expect(screen.getByTestId("insertion-cell-1")).toHaveAttribute("data-tone", "hole");
    expect(screen.getByTestId("insertion-cell-0")).toHaveAttribute("data-tone", "settled");
    expect(screen.getByTestId("aux-insertion-figure")).toHaveAttribute("role", "img");
  });

  it("希尔：gap 数值与分组连线", () => {
    renderAux("shell", ShellAux, auxEvent(auxAuxiliaryStates.shell));

    expect(screen.getByTestId("aux-shell-fact-gap")).toHaveTextContent("3");
    expect(screen.getByTestId("aux-shell-fact-group-count")).toHaveTextContent("3");
    const groups = screen.getAllByTestId("aux-shell-group");
    expect(groups).toHaveLength(3);
    expect(groups[1]).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("aux-shell-svg")).toHaveAttribute("role", "img");
    expect(screen.getByTestId("aux-shell-svg").getAttribute("aria-label")).toContain("gap 為 3");
    expect(screen.getByTestId("aux-shell-held")).toHaveTextContent("8");
  });

  it("归并：区间层级、左右指针与辅助 buffer", () => {
    renderAux("merge", MergeAux, auxEvent(auxAuxiliaryStates.merge));

    expect(screen.getByTestId("aux-merge-fact-range")).toHaveTextContent("左 1、中 3、右 5");
    expect(screen.getByTestId("aux-merge-bracket")).toHaveTextContent("[1, 3, 5]");
    expect(screen.getByTestId("merge-cell-1")).toHaveTextContent("L");
    expect(screen.getByTestId("merge-cell-4")).toHaveTextContent("R");
    expect(screen.getAllByTestId(/^merge-buffer-cell-/)).toHaveLength(3);
    expect(screen.getByTestId("merge-buffer-cell-2")).toHaveTextContent("▼");
    expect(screen.getByTestId("aux-merge-fact-writing")).toHaveTextContent("尚未回拷");
    expect(screen.getByTestId("aux-merge-figure").getAttribute("aria-label")).toContain(
      "[1, 3, 5]",
    );
  });

  it("快速：枢轴、区间、左右指针与分区位置", () => {
    renderAux("quick", QuickAux, auxEvent(auxAuxiliaryStates.quick));

    expect(screen.getByTestId("aux-quick-fact-pivot")).toHaveTextContent("下標 0");
    expect(screen.getByTestId("aux-quick-fact-pivot")).toHaveTextContent("數值 5");
    expect(screen.getByTestId("aux-quick-fact-range")).toHaveTextContent("0 到 5");
    expect(screen.getByTestId("aux-quick-fact-partition")).toHaveTextContent("2");
    expect(screen.getByTestId("aux-quick-fact-phase")).toHaveTextContent("分區中");
    expect(screen.getByTestId("quick-cell-0")).toHaveAttribute("data-tone", "pivot");
    expect(screen.getByTestId("quick-cell-1")).toHaveTextContent("L");
    expect(screen.getByTestId("quick-cell-4")).toHaveTextContent("R");
  });

  it("堆：数组与二叉堆 SVG 联动，节点数等于数组长度", () => {
    renderAux("heap", HeapAux, auxEvent(auxAuxiliaryStates.heap));

    const nodes = screen.getAllByTestId("heap-node");
    expect(nodes).toHaveLength(auxState.order.length);
    expect(nodes.map((node) => node.getAttribute("data-index"))).toEqual(
      auxState.order.map((_, index) => String(index)),
    );

    // 当前节点与数组单元格同步。
    expect(nodes[1]).toHaveAttribute("data-state", "current");
    expect(screen.getByTestId("heap-array-cell-1")).toHaveAttribute("data-tone", "candidate");
    expect(screen.getByTestId("aux-heap-fact-size")).toHaveTextContent("5");
    expect(screen.getByTestId("aux-heap-fact-phase")).toHaveTextContent("下沉");
    expect(screen.getByTestId("aux-heap-svg")).toHaveAttribute("role", "img");
    expect(screen.getByTestId("aux-heap-svg").getAttribute("aria-label")).toContain("堆大小 5");
    // 超出 heap_size 的节点标记为堆外。
    expect(nodes[5]).toHaveAttribute("data-in-heap", "false");
    expect(screen.getByTestId("heap-array-cell-5")).toHaveAttribute("data-tone", "muted");
  });
});

describe("六个算法专属辅助视觉：缺字段与空事件时不崩溃", () => {
  for (const { id, testId, Component } of cases) {
    it(`${id}：缺少辅助字段时显示双语提示，仍渲染当前阵列`, () => {
      renderAux(id, Component, auxEvent({}));

      const missing = screen.getByTestId(`${testId}-missing`);
      expect(missing).toHaveAttribute("role", "alert");
      expect(missing).toHaveTextContent("缺少");
      // 当前阵列仍然来自 state，不猜测缺失内容。
      if (id === "shell") {
        expect(screen.getAllByTestId(/^shell-cell-/)).toHaveLength(auxState.order.length);
      } else {
        expect(screen.getByTestId(`${testId}-cells`).children.length).toBe(auxState.order.length);
      }
    });

    it(`${id}：没有当前事件时只显示操作提示`, () => {
      renderAux(id, Component, null);
      expect(screen.getByTestId(`${testId}-idle`)).toBeInTheDocument();
    });
  }

  it("AuxPanel 只在六种专属算法渲染，冒泡返回空", async () => {
    const { AuxPanel, hasAuxVisual } = await import("../auxiliary/AuxPanel");
    expect(hasAuxVisual("bubble")).toBe(false);
    expect(hasAuxVisual("selection")).toBe(true);

    const { container } = render(
      <AuxPanel
        algorithm="selection"
        event={auxEvent(auxAuxiliaryStates.selection)}
        state={auxState}
        items={auxItems}
      />,
    );
    expect(within(container).getByTestId("aux-selection")).toBeInTheDocument();
  });
});
