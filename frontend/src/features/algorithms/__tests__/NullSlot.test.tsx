import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "../../../player/BarChart";
import { TracePlayer } from "../../../player/TracePlayer";
import type { BubbleTrace } from "../../../player/types";
import { auxItems } from "./fixtures";

describe("契约 §3.1 空槽渲染", () => {
  it("BarChart 把 null 画成显式空槽并保留下标位置", () => {
    render(
      <BarChart
        items={auxItems.slice(0, 3)}
        state={{ state_id: 0, order: ["it-0", null, "it-2"], values: [5, 0, 8] }}
      />,
    );

    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(3);
    expect(bars.map((bar) => bar.getAttribute("data-display-index"))).toEqual([
      "0",
      "1",
      "2",
    ]);
    expect(bars[1]).toHaveAttribute("data-empty", "true");
    expect(bars[0]).toHaveAttribute("data-empty", "false");
    expect(within(bars[1]).getByTestId("bar-value")).toHaveTextContent("__");
    // 空槽不伪造数值，也不丢位置。
    expect(bars[1].getAttribute("data-item-id")).toBe("");
  });

  it("TracePlayer 在含空槽的快照上不崩溃且保留全部位置", () => {
    const trace: BubbleTrace = {
      protocol_version: 1,
      algorithm: "bubble",
      direction: "asc",
      options: { early_exit: false },
      items: auxItems.slice(0, 3),
      code: {
        language: "python",
        lines: [{ line_id: "L1", lineno: 1, text: "def sort():", kind: "normal" }],
      },
      states: [
        { state_id: 0, order: ["it-0", null, "it-2"], values: [5, 0, 8] },
        { state_id: 1, order: ["it-2", "it-0", "it-1"], values: [8, 5, 1] },
      ],
      events: [
        {
          step_id: 0,
          event_type: "write",
          code_line_ids: ["L1"],
          state_before_id: 0,
          state_after_id: 1,
          active_indices: [0, 1],
          compared_indices: [],
          modified_indices: [0, 1],
          finalized_indices: [],
          auxiliary_state: {
            pass_index: 0,
            early_exit_enabled: false,
            swapped_in_pass: false,
          },
          metrics: { comparisons: 0, swaps: 0, writes: 1 },
          explanation: { key: "fixture", "zh-Hant": "寫入測試", en: "Write fixture" },
        },
      ],
      summary: {
        comparisons: 0,
        swaps: 0,
        writes: 1,
        passes: 1,
        early_exit_triggered: false,
        final_order: ["it-2", "it-0", "it-1"],
        final_values: [8, 5, 1],
        state_count: 2,
        event_count: 1,
      },
    };

    render(<TracePlayer trace={trace} />);
    expect(screen.getAllByTestId("bar")).toHaveLength(3);
    expect(screen.getAllByTestId("bar")[1]).toHaveAttribute("data-empty", "true");
  });
});
