/**
 * 跨栈契约回归测试：直接消费**后端真实运行结果**（由 TestClient 导出的 JSON），
 * 而不是手写 fixture。用于防止前后端字段漂移（states/events/code_line_ids/explanation）。
 *
 * fixture 生成命令（仓库根目录）：
 *   $env:PYTHONPATH="$PWD"; uv run python .tools/reference/export_frontend_fixture.py
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseTraceResponse } from "../traceValidation";
import type { BubbleTrace } from "../types";
import { TracePlayer } from "../TracePlayer";
import asc4 from "./fixtures/realTraceAsc4.json";
import descDuplicates from "./fixtures/realTraceDescDuplicates.json";

function loadTrace(payload: unknown): BubbleTrace {
  return parseTraceResponse(payload);
}

function nextButton(): HTMLElement {
  return screen.getByRole("button", { name: "下一步" });
}

function barValues(): string[] {
  return screen.getAllByTestId("bar-value").map((node) => node.textContent ?? "");
}

describe("真实后端轨迹可以完整驱动播放器", () => {
  it("升序 4 元素：解析成功、事件数一致、逐步走到已排序", () => {
    const trace = loadTrace(asc4);
    expect(trace.summary.event_count).toBe(trace.events.length);
    expect(trace.summary.final_values).toEqual([1, 3, 5, 8]);

    render(<TracePlayer trace={trace} />);
    expect(screen.getByTestId("trace-player")).toBeInTheDocument();

    // 初始状态必须是输入顺序
    expect(barValues()).toEqual(["5", "3", "8", "1"]);

    for (let step = 0; step < trace.events.length; step += 1) {
      fireEvent.click(nextButton());
    }

    // 走完全部事件后，柱状图呈现后端给出的最终顺序
    expect(barValues()).toEqual(trace.summary.final_values.map(String));
    expect(screen.getByTestId("phase")).toHaveTextContent("已完成");
    expect(screen.getByTestId("metric-comparisons")).toHaveTextContent(
      String(trace.summary.comparisons),
    );
    expect(screen.getByTestId("metric-swaps")).toHaveTextContent(String(trace.summary.swaps));
    expect(screen.getByTestId("metric-writes")).toHaveTextContent(String(trace.summary.writes));
  });

  it("降序 + 重复值 + 负数：最终顺序与后端一致", () => {
    const trace = loadTrace(descDuplicates);
    expect(trace.summary.final_values).toEqual([4, 4, 1, 0, -2]);

    render(<TracePlayer trace={trace} />);
    for (let step = 0; step < trace.events.length; step += 1) {
      fireEvent.click(nextButton());
    }
    expect(barValues()).toEqual(trace.summary.final_values.map(String));
  });

  it("高亮行组来自事件自身的 code_line_ids（每个事件至少一行被高亮）", () => {
    const trace = loadTrace(asc4);
    render(<TracePlayer trace={trace} />);

    trace.events.forEach((event) => {
      fireEvent.click(nextButton());
      const highlighted = event.code_line_ids.filter((lineId) => {
        const node = document.querySelector(`[data-line-id="${lineId}"]`);
        return node?.getAttribute("data-highlighted") === "true";
      });
      expect(highlighted.length).toBeGreaterThan(0);
      // 未在当前事件行组内的行不得高亮
      const allLines = Array.from(document.querySelectorAll("[data-line-id]"));
      const stray = allLines.filter(
        (node) =>
          node.getAttribute("data-highlighted") === "true" &&
          !event.code_line_ids.includes(node.getAttribute("data-line-id") ?? ""),
      );
      expect(stray).toHaveLength(0);
    });
  });

  it("每个事件都带繁体中文与英文解释（双语模板来自后端）", () => {
    const trace = loadTrace(asc4);
    for (const event of trace.events) {
      expect(event.explanation["zh-Hant"].length).toBeGreaterThan(0);
      expect(event.explanation.en.length).toBeGreaterThan(0);
      expect(event.explanation["zh-Hant"]).not.toBe(event.explanation.en);
    }
  });
});
