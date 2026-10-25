/**
 * 阶段 5A 前端测试 fixture（不依赖后端运行）。
 *
 * - `algorithmListFixture`：GET /api/algorithms 的 10 项元数据（契约见设计文档 §1.1）；
 * - `selectionTraceFixture` / `heapTraceFixture`：可被通用校验器接受的短轨迹，
 *   仅用于 UI 测试，字段严格按协议与设计文档 §4；
 * - `auxEvent`：给六个 Aux 组件测试用的单事件辅助状态。
 */
import type {
  AlgorithmListResponse,
  AlgorithmMetadata,
  AlgorithmTrace,
  AlgorithmTraceEvent,
  AuxAlgorithmId,
  Bilingual,
} from "../types";
import type { Direction } from "../../../player/types";

function pair(zh: string, en: string): Bilingual {
  return { "zh-Hant": zh, en };
}

const AVAILABLE_IDS = [
  "bubble",
  "selection",
  "insertion",
  "shell",
  "merge",
  "quick",
  "heap",
] as const;

/** 十项元数据；前七项 available，后三项 planned。 */
export const algorithmListFixture: readonly AlgorithmMetadata[] = [
  {
    id: "bubble",
    name: pair("冒泡排序", "Bubble sort"),
    tagline: pair("相鄰兩兩比較，大的往右冒。", "Compare neighbours; the larger value bubbles right."),
    status: "available",
    time_complexity: pair("O(n²)（含提前結束優化）", "O(n²) with early exit"),
    space_complexity: pair("O(1)", "O(1)"),
    stable: true,
    use_cases: pair("教學入門、資料量很小。", "First lessons and very small lists."),
    default_values: [5, 3, 8, 1, 9, 2],
    supports_early_exit: true,
  },
  {
    id: "selection",
    name: pair("選擇排序", "Selection sort"),
    tagline: pair("每輪掃描剩餘部分找最小值放到前面。", "Each pass scans the rest for the minimum and moves it to the front."),
    status: "available",
    time_complexity: pair("O(n²)", "O(n²)"),
    space_complexity: pair("O(1)", "O(1)"),
    stable: false,
    use_cases: pair("資料量小、希望交換次數少。", "Small lists where few swaps matter."),
    default_values: [5, 3, 8, 1],
    supports_early_exit: false,
  },
  {
    id: "insertion",
    name: pair("插入排序", "Insertion sort"),
    tagline: pair("像整理手牌，把新牌插到已排序區。", "Like sorting cards: insert each new card into the sorted part."),
    status: "available",
    time_complexity: pair("O(n²)", "O(n²)"),
    space_complexity: pair("O(1)", "O(1)"),
    stable: true,
    use_cases: pair("近乎有序的資料。", "Lists that are almost sorted."),
    default_values: [5, 3, 8, 1, 9, 2],
    supports_early_exit: false,
  },
  {
    id: "shell",
    name: pair("希爾排序", "Shell sort"),
    tagline: pair("先按大步長分組做插入，再逐步縮小 gap。", "Insertion sort on large gaps first, then shrink the gap."),
    status: "available",
    time_complexity: pair("O(n log n) 至 O(n²)（取決於 gap 序列）", "O(n log n) to O(n²), depending on the gap sequence"),
    space_complexity: pair("O(1)", "O(1)"),
    stable: false,
    use_cases: pair("中等資料量、記憶體受限。", "Medium lists with tight memory."),
    default_values: [7, 3, 9, 1, 5, 2],
    supports_early_exit: false,
  },
  {
    id: "merge",
    name: pair("歸併排序", "Merge sort"),
    tagline: pair("遞迴對半拆，再把有序兩半合併。", "Split in halves recursively, then merge the sorted halves."),
    status: "available",
    time_complexity: pair("O(n log n)", "O(n log n)"),
    space_complexity: pair("O(n)", "O(n)"),
    stable: true,
    use_cases: pair("需要穩定排序、可接受額外空間。", "When stability matters and extra space is acceptable."),
    default_values: [5, 3, 8, 1, 9, 2],
    supports_early_exit: false,
  },
  {
    id: "quick",
    name: pair("快速排序", "Quick sort"),
    tagline: pair("選樞軸分區，左邊小右邊大再遞迴。", "Pick a pivot, partition smaller/larger, then recurse."),
    status: "available",
    time_complexity: pair("平均 O(n log n)、最壞 O(n²)（首元素樞軸）", "Average O(n log n), worst O(n²) with a first-element pivot"),
    space_complexity: pair("O(log n) 遞迴堆疊", "O(log n) recursion stack"),
    stable: false,
    use_cases: pair("一般資料、平均效能優先。", "General data where average speed matters."),
    default_values: [5, 3, 8, 1, 9, 2],
    supports_early_exit: false,
  },
  {
    id: "heap",
    name: pair("堆積排序", "Heap sort"),
    tagline: pair("建最大堆，反覆把堆頂換到末尾並下沉。", "Build a max-heap, then swap the root to the end and sift down."),
    status: "available",
    time_complexity: pair("O(n log n)", "O(n log n)"),
    space_complexity: pair("O(1)", "O(1)"),
    stable: false,
    use_cases: pair("需要 O(1) 額外空間且不要求穩定。", "When O(1) extra space is needed and stability is not required."),
    default_values: [5, 3, 8, 1, 9, 2],
    supports_early_exit: false,
  },
  {
    id: "counting",
    name: pair("計數排序", "Counting sort"),
    tagline: pair("統計每個值出現次數再按序輸出。", "Count occurrences of each value, then output them in order."),
    status: "planned",
    time_complexity: pair("O(n+k)", "O(n+k)"),
    space_complexity: pair("O(k)", "O(k)"),
    stable: true,
    use_cases: pair("整數且範圍小（階段 5B）。", "Integers with a small range (phase 5B)."),
    default_values: [],
    supports_early_exit: false,
  },
  {
    id: "bucket",
    name: pair("桶排序", "Bucket sort"),
    tagline: pair("按區間分桶，桶內排序後拼接。", "Distribute into buckets, sort each bucket, then concatenate."),
    status: "planned",
    time_complexity: pair("平均 O(n+k)", "Average O(n+k)"),
    space_complexity: pair("O(n+k)", "O(n+k)"),
    stable: null,
    use_cases: pair("數值均勻分佈（階段 5B）。", "Evenly distributed values (phase 5B)."),
    default_values: [],
    supports_early_exit: false,
  },
  {
    id: "radix",
    name: pair("基數排序", "Radix sort"),
    tagline: pair("按個位、十位、百位逐位穩定分配再收集。", "Stable distribution and collection by digit, from ones upward."),
    status: "planned",
    time_complexity: pair("O(d(n+b))", "O(d(n+b))"),
    space_complexity: pair("O(n+b)", "O(n+b)"),
    stable: true,
    use_cases: pair("整數或可轉成整數（階段 5B）。", "Integers, or data convertible to integers (phase 5B)."),
    default_values: [],
    supports_early_exit: false,
  },
];

export function algorithmListResponse(): AlgorithmListResponse {
  return { protocol_version: 1, algorithms: algorithmListFixture };
}

/** 可用项 id 清单（route 测试用）。 */
export const availableAlgorithmIds: readonly string[] = [...AVAILABLE_IDS];

/* ---------- 通用轨迹 fixture 辅助 ---------- */

function explanation(zh: string, en: string): AlgorithmTraceEvent["explanation"] {
  return { key: "fixture", "zh-Hant": zh, en };
}

function makeEvent(
  stepId: number,
  partial: Omit<AlgorithmTraceEvent, "step_id" | "metrics" | "explanation"> & {
    readonly metrics?: AlgorithmTraceEvent["metrics"];
    readonly explanation?: AlgorithmTraceEvent["explanation"];
  },
  metrics: AlgorithmTraceEvent["metrics"],
): AlgorithmTraceEvent {
  return {
    ...partial,
    step_id: stepId,
    metrics: partial.metrics ?? metrics,
    explanation:
      partial.explanation ??
      explanation(`測試步驟 ${stepId}`, `Fixture step ${stepId}`),
  };
}

/* ---------- 选择排序短轨迹 ---------- */

const selectionItems = [
  { id: "it-0", value: 5 },
  { id: "it-1", value: 3 },
  { id: "it-2", value: 1 },
];

const selectionStates = [
  { state_id: 0, order: ["it-0", "it-1", "it-2"], values: [5, 3, 1] },
  { state_id: 1, order: ["it-2", "it-1", "it-0"], values: [1, 3, 5] },
];

const selectionCode = {
  language: "python" as const,
  lines: [
    { line_id: "L1", lineno: 1, text: "def selection_sort(values, direction=\"asc\"):", kind: "normal" as const },
    { line_id: "L2", lineno: 2, text: "    arr = list(values)", kind: "normal" as const },
    { line_id: "L3", lineno: 3, text: "    n = len(arr)", kind: "normal" as const },
    { line_id: "L4", lineno: 4, text: "    for i in range(n - 1):", kind: "normal" as const },
    { line_id: "L5", lineno: 5, text: "        min_index = i", kind: "normal" as const },
    { line_id: "L6", lineno: 6, text: "        for j in range(i + 1, n):", kind: "normal" as const },
    { line_id: "L7", lineno: 7, text: "            recorder.emit_compare(i=min_index, j=j)", kind: "trace" as const },
    { line_id: "L8", lineno: 8, text: "            if _out_of_order(arr[min_index], arr[j], direction):", kind: "normal" as const },
    { line_id: "L9", lineno: 9, text: "                min_index = j", kind: "normal" as const },
    { line_id: "L10", lineno: 10, text: "        recorder.emit_select(i=i, min_index=min_index)", kind: "trace" as const },
    { line_id: "L11", lineno: 11, text: "        if min_index != i:", kind: "normal" as const },
    { line_id: "L12", lineno: 12, text: "            arr[i], arr[min_index] = arr[min_index], arr[i]", kind: "normal" as const },
    { line_id: "L13", lineno: 13, text: "            recorder.emit_swap(i=i, j=min_index)", kind: "trace" as const },
    { line_id: "L14", lineno: 14, text: "        recorder.emit_mark_sorted(i=i)", kind: "trace" as const },
    { line_id: "L15", lineno: 15, text: "    recorder.emit_done()", kind: "trace" as const },
    { line_id: "L16", lineno: 16, text: "    return arr", kind: "normal" as const },
  ],
};

const emptyIndices: readonly number[] = [];
const add = (values: readonly number[]): readonly number[] => values;

function selectionAux(
  passIndex: number,
  minIndex: number,
  scanFrom: number,
  scanTo: number,
  finalizedBefore: readonly number[],
  extra: Record<string, unknown> = {},
): AlgorithmTraceEvent["auxiliary_state"] {
  return {
    pass_index: passIndex,
    min_index: minIndex,
    scan_from: scanFrom,
    scan_to: scanTo,
    finalized_before: finalizedBefore,
    ...extra,
  };
}

export const selectionTraceFixture: AlgorithmTrace = {
  protocol_version: 1,
  algorithm: "selection",
  direction: "asc",
  options: {},
  items: selectionItems,
  code: selectionCode,
  states: selectionStates,
  events: [
    makeEvent(0, {
      event_type: "select",
      code_line_ids: ["L10", "L9"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([0]),
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 0, 1, 2, []),
    }, { comparisons: 0, swaps: 0, writes: 0 }),
    makeEvent(1, {
      event_type: "compare",
      code_line_ids: ["L7", "L8"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([0, 1]),
      compared_indices: add([0, 1]),
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 0, 1, 2, [], {
        comparison: { left: 3, right: 5, relation: "lt", will_swap: false },
      }),
    }, { comparisons: 1, swaps: 0, writes: 0 }),
    makeEvent(2, {
      event_type: "select",
      code_line_ids: ["L10", "L9"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([1]),
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 1, 1, 2, []),
    }, { comparisons: 1, swaps: 0, writes: 0 }),
    makeEvent(3, {
      event_type: "compare",
      code_line_ids: ["L7", "L8"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([1, 2]),
      compared_indices: add([1, 2]),
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 1, 1, 2, [], {
        comparison: { left: 1, right: 3, relation: "lt", will_swap: false },
      }),
    }, { comparisons: 2, swaps: 0, writes: 0 }),
    makeEvent(4, {
      event_type: "select",
      code_line_ids: ["L10", "L9"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([2]),
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 2, 1, 2, []),
    }, { comparisons: 2, swaps: 0, writes: 0 }),
    makeEvent(5, {
      event_type: "swap",
      code_line_ids: ["L13", "L12"],
      state_before_id: 0,
      state_after_id: 1,
      active_indices: add([0, 2]),
      compared_indices: emptyIndices,
      modified_indices: add([0, 2]),
      finalized_indices: emptyIndices,
      auxiliary_state: selectionAux(0, 2, 1, 2, []),
    }, { comparisons: 2, swaps: 1, writes: 2 }),
    makeEvent(6, {
      event_type: "mark_sorted",
      code_line_ids: ["L14", "L4"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: emptyIndices,
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: add([0]),
      auxiliary_state: selectionAux(1, 0, 1, 2, [0]),
    }, { comparisons: 2, swaps: 1, writes: 2 }),
    makeEvent(7, {
      event_type: "compare",
      code_line_ids: ["L7", "L8"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: add([1, 2]),
      compared_indices: add([1, 2]),
      modified_indices: emptyIndices,
      finalized_indices: add([0]),
      auxiliary_state: selectionAux(1, 1, 2, 2, [0], {
        comparison: { left: 5, right: 3, relation: "gt", will_swap: false },
      }),
    }, { comparisons: 3, swaps: 1, writes: 2 }),
    makeEvent(8, {
      event_type: "done",
      code_line_ids: ["L15", "L16"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: emptyIndices,
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: add([0, 1, 2]),
      auxiliary_state: selectionAux(1, 1, 2, 2, [0, 1, 2]),
    }, { comparisons: 3, swaps: 1, writes: 2 }),
  ],
  summary: {
    comparisons: 3,
    swaps: 1,
    writes: 2,
    passes: 2,
    early_exit_triggered: false,
    final_order: ["it-2", "it-1", "it-0"],
    final_values: [1, 3, 5],
    state_count: 2,
    event_count: 9,
  },
};

/* ---------- 堆排序短轨迹（用于切换算法测试） ---------- */

export const heapTraceFixture: AlgorithmTrace = {
  protocol_version: 1,
  algorithm: "heap",
  direction: "asc",
  options: {},
  items: [
    { id: "it-0", value: 3 },
    { id: "it-1", value: 1 },
  ],
  code: {
    language: "python",
    lines: [
      { line_id: "L1", lineno: 1, text: "def heap_sort(values, direction=\"asc\"):", kind: "normal" },
      { line_id: "L2", lineno: 2, text: "    recorder.emit_compare(i=0, j=1)", kind: "trace" },
      { line_id: "L3", lineno: 3, text: "    recorder.emit_done()", kind: "trace" },
      { line_id: "L4", lineno: 4, text: "    return arr", kind: "normal" },
    ],
  },
  states: [{ state_id: 0, order: ["it-0", "it-1"], values: [3, 1] }],
  events: [
    makeEvent(0, {
      event_type: "compare",
      code_line_ids: ["L2", "L2"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([0, 1]),
      compared_indices: add([0, 1]),
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: {
        heap_size: 2,
        node_index: 1,
        parent_index: 0,
        left_child: null,
        right_child: null,
        phase: "build",
        comparison: { left: 1, right: 3, relation: "lt", will_swap: true },
      },
    }, { comparisons: 1, swaps: 0, writes: 0 }),
    makeEvent(1, {
      event_type: "done",
      code_line_ids: ["L3", "L4"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: emptyIndices,
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: add([0, 1]),
      auxiliary_state: {
        heap_size: 2,
        node_index: 0,
        parent_index: 0,
        left_child: 1,
        right_child: null,
        phase: "extract",
      },
    }, { comparisons: 1, swaps: 0, writes: 0 }),
  ],
  summary: {
    comparisons: 1,
    swaps: 0,
    writes: 0,
    passes: 1,
    early_exit_triggered: false,
    final_order: ["it-1", "it-0"],
    final_values: [1, 3],
    state_count: 1,
    event_count: 2,
  },
};

/** 复制轨迹并替换方向（用于方向切换测试）。 */
export function withDirection(trace: AlgorithmTrace, direction: Direction): AlgorithmTrace {
  return { ...trace, direction };
}

/* ---------- 归并排序短轨迹（用于合并段数与事实性比较测试） ---------- */

export const mergeTraceFixture: AlgorithmTrace = {
  protocol_version: 1,
  algorithm: "merge",
  direction: "asc",
  options: {},
  items: [
    { id: "it-0", value: 3 },
    { id: "it-1", value: 1 },
  ],
  code: {
    language: "python",
    lines: [
      { line_id: "L1", lineno: 1, text: "def merge_sort(values, direction=\"asc\"):", kind: "normal" },
      { line_id: "L2", lineno: 2, text: "    recorder.emit_compare(i=0, j=1)", kind: "trace" },
      { line_id: "L3", lineno: 3, text: "    recorder.emit_merge(left=0, mid=0, right=1)", kind: "trace" },
      { line_id: "L4", lineno: 4, text: "    recorder.emit_done()", kind: "trace" },
      { line_id: "L5", lineno: 5, text: "    return arr", kind: "normal" },
    ],
  },
  states: [
    { state_id: 0, order: ["it-0", "it-1"], values: [3, 1] },
    { state_id: 1, order: ["it-1", "it-0"], values: [1, 3] },
  ],
  events: [
    makeEvent(0, {
      event_type: "compare",
      code_line_ids: ["L2", "L2"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([0, 1]),
      compared_indices: add([0, 1]),
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      // 阶段 5A：非冒泡算法只提供 left/right/relation，没有 will_swap。
      auxiliary_state: {
        left: 0,
        mid: 0,
        right: 1,
        depth: 1,
        left_ptr: 0,
        right_ptr: 1,
        buffer: [],
        buffer_index: 0,
        writing_back: false,
        comparison: { left: 3, right: 1, relation: "gt" },
      },
    }, { comparisons: 1, swaps: 0, writes: 0 }),
    makeEvent(1, {
      event_type: "merge",
      code_line_ids: ["L3", "L3"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: add([0, 1]),
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: {
        left: 0,
        mid: 0,
        right: 1,
        depth: 1,
        left_ptr: 0,
        right_ptr: 1,
        buffer: ["it-0"],
        buffer_index: 1,
        writing_back: false,
      },
    }, { comparisons: 1, swaps: 0, writes: 1 }),
    makeEvent(2, {
      event_type: "merge",
      code_line_ids: ["L3", "L3"],
      state_before_id: 0,
      state_after_id: 1,
      active_indices: add([0, 1]),
      compared_indices: emptyIndices,
      modified_indices: add([0, 1]),
      finalized_indices: emptyIndices,
      auxiliary_state: {
        left: 0,
        mid: 0,
        right: 1,
        depth: 1,
        left_ptr: 1,
        right_ptr: 1,
        buffer: ["it-0", "it-1"],
        buffer_index: 2,
        writing_back: true,
      },
    }, { comparisons: 1, swaps: 0, writes: 2 }),
    makeEvent(3, {
      event_type: "done",
      code_line_ids: ["L4", "L5"],
      state_before_id: 1,
      state_after_id: 1,
      active_indices: emptyIndices,
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: add([0, 1]),
      auxiliary_state: {
        left: 0,
        mid: 0,
        right: 1,
        depth: 1,
        left_ptr: 1,
        right_ptr: 1,
        buffer: ["it-0", "it-1"],
        buffer_index: 2,
        writing_back: false,
      },
    }, { comparisons: 1, swaps: 0, writes: 2 }),
  ],
  summary: {
    comparisons: 1,
    swaps: 0,
    writes: 2,
    passes: 0,
    early_exit_triggered: false,
    final_order: ["it-1", "it-0"],
    final_values: [1, 3],
    state_count: 2,
    event_count: 4,
  },
};

/* ---------- Aux 组件 fixture ---------- */

export const auxItems = [
  { id: "it-0", value: 5 },
  { id: "it-1", value: 3 },
  { id: "it-2", value: 8 },
  { id: "it-3", value: 1 },
  { id: "it-4", value: 9 },
  { id: "it-5", value: 2 },
];

export const auxState = {
  state_id: 0,
  order: auxItems.map((item) => item.id),
  values: auxItems.map((item) => item.value),
};

/** 构造一个带指定辅助字段的 compare 事件（Aux 组件测试用）。 */
export function auxEvent(
  auxiliaryState: Record<string, unknown>,
  eventType: AlgorithmTraceEvent["event_type"] = "compare",
): AlgorithmTraceEvent {
  return makeEvent(
    0,
    {
      event_type: eventType,
      code_line_ids: ["L1"],
      state_before_id: 0,
      state_after_id: 0,
      active_indices: emptyIndices,
      compared_indices: emptyIndices,
      modified_indices: emptyIndices,
      finalized_indices: emptyIndices,
      auxiliary_state: auxiliaryState,
    },
    { comparisons: 1, swaps: 0, writes: 0 },
  );
}

export const auxAuxiliaryStates: Record<AuxAlgorithmId, Record<string, unknown>> = {
  selection: {
    pass_index: 0,
    min_index: 2,
    scan_from: 1,
    scan_to: 4,
    finalized_before: [0],
  },
  insertion: {
    pass_index: 1,
    key_value: 8,
    key_index: 2,
    hole_index: 1,
    sorted_to: 1,
    shifting: true,
  },
  shell: {
    gap: 3,
    gap_index: 1,
    groups: [
      [0, 3],
      [1, 4],
      [2, 5],
    ],
    group_index: 1,
    key_value: 8,
    hole_index: 1,
  },
  merge: {
    left: 1,
    mid: 3,
    right: 5,
    depth: 1,
    left_ptr: 1,
    right_ptr: 4,
    buffer: ["it-3", "it-1", "it-2"],
    buffer_index: 2,
    writing_back: false,
  },
  quick: {
    pivot_value: 5,
    pivot_index: 0,
    low: 0,
    high: 5,
    left_ptr: 1,
    right_ptr: 4,
    partition_index: 2,
    phase: "partition",
  },
  heap: {
    heap_size: 5,
    node_index: 1,
    parent_index: 0,
    left_child: 3,
    right_child: 4,
    phase: "sift_down",
  },
};
