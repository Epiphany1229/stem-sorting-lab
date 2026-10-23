/**
 * 轨迹协议 v1 的 TypeScript 类型（严格照抄 docs/trace-protocol.md，不做字段放宽）。
 *
 * 前端只消费这份数据：不推导事件、不自行交换数组、不用前端规则判断比较结果。
 */

/** 排序方向。 */
export type Direction = "asc" | "desc";

/** 事件类型。前五种是阶段 2 必须实现的，其余为后续算法预留。 */
export type EventType =
  | "compare"
  | "swap"
  | "write"
  | "mark_sorted"
  | "done"
  | "select"
  | "partition"
  | "merge"
  | "bucket"
  | "count";

/** 比较关系，由后端根据真实比较计算。 */
export type Relation = "gt" | "lt" | "eq";

/** 请求里的 options。 */
export interface TraceOptions {
  readonly early_exit: boolean;
}

/** 输入元素：稳定唯一 id 与数值解耦，重复数值也能区分。 */
export interface TraceItem {
  readonly id: string;
  readonly value: number;
}

/** 代码行类型；trace 表示插桩行（保留、可折叠/降淡，不删除）。 */
export type CodeLineKind = "normal" | "trace";

export interface CodeLine {
  readonly line_id: string;
  readonly lineno: number;
  readonly text: string;
  readonly kind: CodeLineKind;
}

export interface CodeBlock {
  readonly language: "python";
  readonly lines: readonly CodeLine[];
}

/** 状态快照：order 与 values 一一对应，前端直接渲染，不重新推导。 */
export interface TraceState {
  readonly state_id: number;
  readonly order: readonly string[];
  readonly values: readonly number[];
}

/** compare 事件额外的比较信息；will_swap 由后端计算，前端只读。 */
export interface Comparison {
  readonly left: number;
  readonly right: number;
  readonly relation: Relation;
  readonly will_swap: boolean;
}

/** 算法专属状态；冒泡排序固定提供前三个字段。 */
export interface AuxiliaryState {
  readonly pass_index: number;
  readonly early_exit_enabled: boolean;
  readonly swapped_in_pass: boolean;
  readonly comparison?: Comparison;
}

/** 累计指标（截至该事件执行完），单调不减。 */
export interface TraceMetrics {
  readonly comparisons: number;
  readonly swaps: number;
  readonly writes: number;
}

/** 后端模板生成的双语解释；排版由前端决定（繁中在上、英文在下）。 */
export interface BilingualExplanation {
  readonly key: string;
  readonly "zh-Hant": string;
  readonly en: string;
}

export interface TraceEvent {
  readonly step_id: number;
  readonly event_type: EventType;
  readonly code_line_ids: readonly string[];
  readonly state_before_id: number;
  readonly state_after_id: number;
  readonly active_indices: readonly number[];
  readonly compared_indices: readonly number[];
  readonly modified_indices: readonly number[];
  readonly finalized_indices: readonly number[];
  readonly auxiliary_state: AuxiliaryState;
  readonly metrics: TraceMetrics;
  readonly explanation: BilingualExplanation;
}

export interface TraceSummary {
  readonly comparisons: number;
  readonly swaps: number;
  readonly writes: number;
  readonly passes: number;
  readonly early_exit_triggered: boolean;
  readonly final_order: readonly string[];
  readonly final_values: readonly number[];
  readonly state_count: number;
  readonly event_count: number;
}

/** POST /api/algorithms/bubble/trace 的完整响应。 */
export interface BubbleTrace {
  readonly protocol_version: 1;
  readonly algorithm: "bubble";
  readonly direction: Direction;
  readonly options: TraceOptions;
  readonly items: readonly TraceItem[];
  readonly code: CodeBlock;
  readonly states: readonly TraceState[];
  readonly events: readonly TraceEvent[];
  readonly summary: TraceSummary;
}

/** POST /api/algorithms/bubble/trace 的请求体。 */
export interface TraceRequest {
  readonly values: readonly number[];
  readonly direction: Direction;
  readonly options: TraceOptions;
}
