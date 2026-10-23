/**
 * 手工构造的冒泡排序轨迹 fixture（严格按 docs/trace-protocol.md v1 的字段名与语义）。
 *
 * 用途：前端单测/组件测试不依赖真实后端运行；Lead 之后会用后端真实响应替换它做集成验证。
 * 数据内容：对 [5, 3, 8, 1] 做升序冒泡排序，early_exit=false。
 *
 * 事件序列（共 14 个，与 states / metrics 自洽）：
 *   0 mark_sorted（進入第 1 輪）  1 compare(5,3)  2 swap  → state 1
 *   3 compare(5,8)  4 compare(8,1)  5 swap              → state 2
 *   6 mark_sorted（進入第 2 輪，已就位 [3]）
 *   7 compare(3,5)  8 compare(5,1)  9 swap              → state 3
 *  10 mark_sorted（進入第 3 輪，已就位 [3,2]）
 *  11 compare(3,1) 12 swap                             → state 4
 *  13 done（全部就位 [0,1,2,3]）
 */
import type { BubbleTrace } from "../types";

export const traceFixture: BubbleTrace = {
  protocol_version: 1,
  algorithm: "bubble",
  direction: "asc",
  options: { early_exit: false },

  items: [
    { id: "it-0", value: 5 },
    { id: "it-1", value: 3 },
    { id: "it-2", value: 8 },
    { id: "it-3", value: 1 },
  ],

  code: {
    language: "python",
    lines: [
      { line_id: "L1", lineno: 1, text: "def bubble_sort(items, direction=\"asc\", early_exit=True):", kind: "normal" },
      { line_id: "L2", lineno: 2, text: "    arr = list(items)", kind: "normal" },
      { line_id: "L3", lineno: 3, text: "    n = len(arr)", kind: "normal" },
      { line_id: "L4", lineno: 4, text: "    ascending = direction == \"asc\"", kind: "normal" },
      { line_id: "L5", lineno: 5, text: "    for i in range(n - 1):", kind: "normal" },
      { line_id: "L6", lineno: 6, text: "        trace.emit_mark_sorted(i=i)", kind: "trace" },
      { line_id: "L7", lineno: 7, text: "        swapped = False", kind: "normal" },
      { line_id: "L8", lineno: 8, text: "        for j in range(n - 1 - i):", kind: "normal" },
      { line_id: "L9", lineno: 9, text: "            trace.emit_compare(i=i, j=j)", kind: "trace" },
      { line_id: "L10", lineno: 10, text: "            if _out_of_order(arr[j], arr[j + 1], ascending):", kind: "normal" },
      { line_id: "L11", lineno: 11, text: "                arr[j], arr[j + 1] = arr[j + 1], arr[j]", kind: "normal" },
      { line_id: "L12", lineno: 12, text: "                trace.emit_swap(i=i, j=j)", kind: "trace" },
      { line_id: "L13", lineno: 13, text: "                swapped = True", kind: "normal" },
      { line_id: "L14", lineno: 14, text: "        if early_exit and not swapped:", kind: "normal" },
      { line_id: "L15", lineno: 15, text: "            break", kind: "normal" },
      { line_id: "L16", lineno: 16, text: "    trace.emit_done()", kind: "trace" },
      { line_id: "L17", lineno: 17, text: "    return arr", kind: "normal" },
    ],
  },

  states: [
    { state_id: 0, order: ["it-0", "it-1", "it-2", "it-3"], values: [5, 3, 8, 1] },
    { state_id: 1, order: ["it-1", "it-0", "it-2", "it-3"], values: [3, 5, 8, 1] },
    { state_id: 2, order: ["it-1", "it-0", "it-3", "it-2"], values: [3, 5, 1, 8] },
    { state_id: 3, order: ["it-1", "it-3", "it-0", "it-2"], values: [3, 1, 5, 8] },
    { state_id: 4, order: ["it-3", "it-1", "it-0", "it-2"], values: [1, 3, 5, 8] },
  ],

  events: [
    {
      step_id: 0,
      event_type: "mark_sorted",
      code_line_ids: ["L6", "L5"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: [],
      compared_indices: [],
      modified_indices: [],
      finalized_indices: [],
      auxiliary_state: { pass_index: 0, early_exit_enabled: false, swapped_in_pass: false },
      metrics: { comparisons: 0, swaps: 0, writes: 0 },
      explanation: {
        key: "bubble.mark_sorted.pass",
        "zh-Hant": "進入第 1 輪：這一輪會比較相鄰數字，把最大的數字推到後面。",
        en: "Start pass 1: compare neighbours and push the largest number to the end.",
      },
    },
    {
      step_id: 1,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: [0, 1],
      compared_indices: [0, 1],
      modified_indices: [],
      finalized_indices: [],
      auxiliary_state: {
        pass_index: 0,
        early_exit_enabled: false,
        swapped_in_pass: false,
        comparison: { left: 5, right: 3, relation: "gt", will_swap: true },
      },
      metrics: { comparisons: 1, swaps: 0, writes: 0 },
      explanation: {
        key: "bubble.compare.asc.swap",
        "zh-Hant": "比較第 1 個（5）與第 2 個（3）元素：5 > 3，升序排列需要交換。",
        en: "Compare element 1 (5) with element 2 (3): 5 > 3, so they must be swapped for ascending order.",
      },
    },
    {
      step_id: 2,
      event_type: "swap",
      code_line_ids: ["L12", "L11"],
      state_before_id: 0,
      state_after_id: 1,
      active_indices: [0, 1],
      compared_indices: [],
      modified_indices: [0, 1],
      finalized_indices: [],
      auxiliary_state: { pass_index: 0, early_exit_enabled: false, swapped_in_pass: true },
      metrics: { comparisons: 1, swaps: 1, writes: 2 },
      explanation: {
        key: "bubble.swap.asc",
        "zh-Hant": "交換第 1 個與第 2 個元素：5 與 3 互換位置。",
        en: "Swap elements 1 and 2: 5 and 3 change places.",
      },
    },
    {
      step_id: 3,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: [1, 2],
      compared_indices: [1, 2],
      modified_indices: [],
      finalized_indices: [],
      auxiliary_state: {
        pass_index: 0,
        early_exit_enabled: false,
        swapped_in_pass: true,
        comparison: { left: 5, right: 8, relation: "lt", will_swap: false },
      },
      metrics: { comparisons: 2, swaps: 1, writes: 2 },
      explanation: {
        key: "bubble.compare.asc.keep",
        "zh-Hant": "比較第 2 個（5）與第 3 個（8）元素：5 < 8，升序排列不需要交換。",
        en: "Compare element 2 (5) with element 3 (8): 5 < 8, so no swap is needed for ascending order.",
      },
    },
    {
      step_id: 4,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: [2, 3],
      compared_indices: [2, 3],
      modified_indices: [],
      finalized_indices: [],
      auxiliary_state: {
        pass_index: 0,
        early_exit_enabled: false,
        swapped_in_pass: true,
        comparison: { left: 8, right: 1, relation: "gt", will_swap: true },
      },
      metrics: { comparisons: 3, swaps: 1, writes: 2 },
      explanation: {
        key: "bubble.compare.asc.swap",
        "zh-Hant": "比較第 3 個（8）與第 4 個（1）元素：8 > 1，升序排列需要交換。",
        en: "Compare element 3 (8) with element 4 (1): 8 > 1, so they must be swapped for ascending order.",
      },
    },
    {
      step_id: 5,
      event_type: "swap",
      code_line_ids: ["L12", "L11"],
      state_before_id: 1,
      state_after_id: 2,
      active_indices: [2, 3],
      compared_indices: [],
      modified_indices: [2, 3],
      finalized_indices: [],
      auxiliary_state: { pass_index: 0, early_exit_enabled: false, swapped_in_pass: true },
      metrics: { comparisons: 3, swaps: 2, writes: 4 },
      explanation: {
        key: "bubble.swap.asc",
        "zh-Hant": "交換第 3 個與第 4 個元素：8 與 1 互換位置。",
        en: "Swap elements 3 and 4: 8 and 1 change places.",
      },
    },
    {
      step_id: 6,
      event_type: "mark_sorted",
      code_line_ids: ["L6", "L5"],
      state_before_id: 2,
      state_after_id: 2,
      active_indices: [],
      compared_indices: [],
      modified_indices: [],
      finalized_indices: [3],
      auxiliary_state: { pass_index: 1, early_exit_enabled: false, swapped_in_pass: false },
      metrics: { comparisons: 3, swaps: 2, writes: 4 },
      explanation: {
        key: "bubble.mark_sorted.pass",
        "zh-Hant": "進入第 2 輪：第 1 輪之後，最大的數字 8 已經就位。",
        en: "Start pass 2: after pass 1, the largest number 8 is settled.",
      },
    },
    {
      step_id: 7,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 2,
      state_after_id: 2,
      active_indices: [0, 1],
      compared_indices: [0, 1],
      modified_indices: [],
      finalized_indices: [3],
      auxiliary_state: {
        pass_index: 1,
        early_exit_enabled: false,
        swapped_in_pass: false,
        comparison: { left: 3, right: 5, relation: "lt", will_swap: false },
      },
      metrics: { comparisons: 4, swaps: 2, writes: 4 },
      explanation: {
        key: "bubble.compare.asc.keep",
        "zh-Hant": "比較第 1 個（3）與第 2 個（5）元素：3 < 5，升序排列不需要交換。",
        en: "Compare element 1 (3) with element 2 (5): 3 < 5, so no swap is needed for ascending order.",
      },
    },
    {
      step_id: 8,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 2,
      state_after_id: 2,
      active_indices: [1, 2],
      compared_indices: [1, 2],
      modified_indices: [],
      finalized_indices: [3],
      auxiliary_state: {
        pass_index: 1,
        early_exit_enabled: false,
        swapped_in_pass: false,
        comparison: { left: 5, right: 1, relation: "gt", will_swap: true },
      },
      metrics: { comparisons: 5, swaps: 2, writes: 4 },
      explanation: {
        key: "bubble.compare.asc.swap",
        "zh-Hant": "比較第 2 個（5）與第 3 個（1）元素：5 > 1，升序排列需要交換。",
        en: "Compare element 2 (5) with element 3 (1): 5 > 1, so they must be swapped for ascending order.",
      },
    },
    {
      step_id: 9,
      event_type: "swap",
      code_line_ids: ["L12", "L11"],
      state_before_id: 2,
      state_after_id: 3,
      active_indices: [1, 2],
      compared_indices: [],
      modified_indices: [1, 2],
      finalized_indices: [3],
      auxiliary_state: { pass_index: 1, early_exit_enabled: false, swapped_in_pass: true },
      metrics: { comparisons: 5, swaps: 3, writes: 6 },
      explanation: {
        key: "bubble.swap.asc",
        "zh-Hant": "交換第 2 個與第 3 個元素：5 與 1 互換位置。",
        en: "Swap elements 2 and 3: 5 and 1 change places.",
      },
    },
    {
      step_id: 10,
      event_type: "mark_sorted",
      code_line_ids: ["L6", "L5"],
      state_before_id: 3,
      state_after_id: 3,
      active_indices: [],
      compared_indices: [],
      modified_indices: [],
      finalized_indices: [3, 2],
      auxiliary_state: { pass_index: 2, early_exit_enabled: false, swapped_in_pass: false },
      metrics: { comparisons: 5, swaps: 3, writes: 6 },
      explanation: {
        key: "bubble.mark_sorted.pass",
        "zh-Hant": "進入第 3 輪：第 2 輪之後，數字 8 與 5 已經就位。",
        en: "Start pass 3: after pass 2, the numbers 8 and 5 are settled.",
      },
    },
    {
      step_id: 11,
      event_type: "compare",
      code_line_ids: ["L9", "L10"],
      state_before_id: 3,
      state_after_id: 3,
      active_indices: [0, 1],
      compared_indices: [0, 1],
      modified_indices: [],
      finalized_indices: [3, 2],
      auxiliary_state: {
        pass_index: 2,
        early_exit_enabled: false,
        swapped_in_pass: false,
        comparison: { left: 3, right: 1, relation: "gt", will_swap: true },
      },
      metrics: { comparisons: 6, swaps: 3, writes: 6 },
      explanation: {
        key: "bubble.compare.asc.swap",
        "zh-Hant": "比較第 1 個（3）與第 2 個（1）元素：3 > 1，升序排列需要交換。",
        en: "Compare element 1 (3) with element 2 (1): 3 > 1, so they must be swapped for ascending order.",
      },
    },
    {
      step_id: 12,
      event_type: "swap",
      code_line_ids: ["L12", "L11"],
      state_before_id: 3,
      state_after_id: 4,
      active_indices: [0, 1],
      compared_indices: [],
      modified_indices: [0, 1],
      finalized_indices: [3, 2],
      auxiliary_state: { pass_index: 2, early_exit_enabled: false, swapped_in_pass: true },
      metrics: { comparisons: 6, swaps: 4, writes: 8 },
      explanation: {
        key: "bubble.swap.asc",
        "zh-Hant": "交換第 1 個與第 2 個元素：3 與 1 互換位置。",
        en: "Swap elements 1 and 2: 3 and 1 change places.",
      },
    },
    {
      step_id: 13,
      event_type: "done",
      code_line_ids: ["L16", "L17"],
      state_before_id: 4,
      state_after_id: 4,
      active_indices: [],
      compared_indices: [],
      modified_indices: [],
      finalized_indices: [0, 1, 2, 3],
      auxiliary_state: { pass_index: 2, early_exit_enabled: false, swapped_in_pass: true },
      metrics: { comparisons: 6, swaps: 4, writes: 8 },
      explanation: {
        key: "bubble.done",
        "zh-Hant": "排序完成：數列已由小到大排好，結果是 1、3、5、8。",
        en: "Sorting complete: the list is in ascending order: 1, 3, 5, 8.",
      },
    },
  ],

  summary: {
    comparisons: 6,
    swaps: 4,
    writes: 8,
    passes: 3,
    early_exit_triggered: false,
    final_order: ["it-3", "it-1", "it-0", "it-2"],
    final_values: [1, 3, 5, 8],
    state_count: 5,
    event_count: 14,
  },
};

/** 便于测试取事件：按 step_id 查找。 */
export function eventByStep(stepId: number) {
  const event = traceFixture.events.find((candidate) => candidate.step_id === stepId);
  if (!event) {
    throw new Error(`fixture 中没有 step_id=${stepId} 的事件`);
  }
  return event;
}
