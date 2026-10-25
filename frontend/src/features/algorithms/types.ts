/**
 * 阶段 5A 算法中心与专属辅助可视化使用的类型。
 *
 * 通用轨迹沿用 docs/trace-protocol.md 的信封；`auxiliary_state` 按
 * docs/algorithms-design.md §4 提供各算法自己的字段，因此这里用带索引签名的
 * 辅助状态类型，由各 Aux 组件按设计文档读取（缺失时降级显示，不崩溃）。
 */
import type {
  BilingualExplanation,
  CodeBlock,
  Comparison,
  Direction,
  EventType,
  TraceEvent,
  TraceItem,
  TraceMetrics,
  TraceState,
  TraceSummary,
} from "../../player/types";

/** 十种算法的稳定 id（与后端注册表一致）。 */
export const ALGORITHM_IDS = [
  "bubble",
  "selection",
  "insertion",
  "shell",
  "merge",
  "quick",
  "heap",
  "counting",
  "bucket",
  "radix",
] as const;

export type AlgorithmId = (typeof ALGORITHM_IDS)[number];

/** 阶段 5A 已实现、可以打开学习页的七种（含冒泡）。 */
export const IMPLEMENTED_ALGORITHM_IDS = [
  "bubble",
  "selection",
  "insertion",
  "shell",
  "merge",
  "quick",
  "heap",
] as const;

export type ImplementedAlgorithmId = (typeof IMPLEMENTED_ALGORITHM_IDS)[number];

/** 除冒泡外需要专属辅助可视化的六种。 */
export const AUX_ALGORITHM_IDS = [
  "selection",
  "insertion",
  "shell",
  "merge",
  "quick",
  "heap",
] as const;

export type AuxAlgorithmId = (typeof AUX_ALGORITHM_IDS)[number];

/** 类型守卫：字符串是否是本阶段已实现的算法 id。 */
export function isImplementedAlgorithmId(
  value: string | undefined,
): value is ImplementedAlgorithmId {
  return value !== undefined && (IMPLEMENTED_ALGORITHM_IDS as readonly string[]).includes(value);
}

/** 类型守卫：字符串是否是已知的十种算法 id。 */
export function isAlgorithmId(value: string | undefined): value is AlgorithmId {
  return value !== undefined && (ALGORITHM_IDS as readonly string[]).includes(value);
}

export type AlgorithmStatus = "available" | "planned";

/** 成对双语文案：繁体中文在上、英文在下。 */
export interface Bilingual {
  readonly "zh-Hant": string;
  readonly en: string;
}

/** GET /api/algorithms 中每一项的元数据（契约见设计文档 §1.1）。 */
export interface AlgorithmMetadata {
  readonly id: AlgorithmId;
  readonly name: Bilingual;
  readonly tagline: Bilingual;
  readonly status: AlgorithmStatus;
  readonly time_complexity: Bilingual;
  readonly space_complexity: Bilingual;
  /** planned 项可能为 null。 */
  readonly stable: boolean | null;
  readonly use_cases: Bilingual;
  readonly default_values: readonly number[];
  readonly supports_early_exit: boolean;
}

export interface AlgorithmListResponse {
  readonly protocol_version: 1;
  readonly algorithms: readonly AlgorithmMetadata[];
}

/**
 * 算法专属辅助状态。
 *
 * 保留 `comparison` 的类型（compare 事件仍提供），其余字段按算法不同而不同，
 * 由 Aux 组件用 auxRead 的读取器安全读取。
 */
export interface AlgorithmAuxiliaryState {
  readonly comparison?: Comparison;
  readonly [field: string]: unknown;
}

/** 与协议 TraceEvent 相同，只把 auxiliary_state 放宽为各算法专属字段。 */
export interface AlgorithmTraceEvent extends Omit<TraceEvent, "auxiliary_state"> {
  readonly auxiliary_state: AlgorithmAuxiliaryState;
}

export interface AlgorithmSummary extends TraceSummary {
  readonly comparisons: number;
  readonly swaps: number;
  readonly writes: number;
}

/** 通用算法轨迹响应（新算法 options 可为 {}）。 */
export interface AlgorithmTrace {
  readonly protocol_version: 1;
  readonly algorithm: AlgorithmId;
  readonly direction: Direction;
  readonly options: Readonly<Record<string, unknown>>;
  readonly items: readonly TraceItem[];
  readonly code: CodeBlock;
  readonly states: readonly TraceState[];
  readonly events: readonly AlgorithmTraceEvent[];
  readonly summary: AlgorithmSummary;
}

export interface AlgorithmTraceRequest {
  readonly values: readonly number[];
  readonly direction: Direction;
  readonly options: Readonly<Record<string, unknown>>;
}

/** Aux 组件统一入参：当前事件（可为空）与当前快照。 */
export interface AuxContext {
  readonly event: AlgorithmTraceEvent | null;
  readonly state: TraceState;
  readonly items: readonly TraceItem[];
}

/** 事件解释字段在部分 Aux 组件里不用，但保持类型可读性。 */
export type AlgorithmExplanation = BilingualExplanation;
export type AlgorithmEventType = EventType;
export type AlgorithmMetrics = TraceMetrics;
