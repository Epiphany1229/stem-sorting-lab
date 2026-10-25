/**
 * 阶段 5A 响应校验：GET /api/algorithms 与通用轨迹端点。
 *
 * - 只校验契约字段，不推导排序过程；
 * - 通用轨迹沿用协议信封，但不使用阶段 2 的 bubble 专用校验器
 *   （那会要求 early_exit_enabled / swapped_in_pass 等冒泡字段）；
 * - `auxiliary_state` 允许各算法自定义字段，缺失时由 Aux 组件降级显示。
 */
import type {
  AlgorithmId,
  AlgorithmListResponse,
  AlgorithmMetadata,
  AlgorithmStatus,
  AlgorithmSummary,
  AlgorithmTrace,
  AlgorithmTraceEvent,
  Bilingual,
  ImplementedAlgorithmId,
} from "./types";
import { ALGORITHM_IDS } from "./types";
import type { CodeBlock, CodeLine, TraceItem, TraceState } from "../../player/types";

export class AlgorithmContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlgorithmContractError";
  }
}

const EVENT_TYPES = [
  "compare",
  "swap",
  "write",
  "mark_sorted",
  "done",
  "select",
  "partition",
  "merge",
  "bucket",
  "count",
] as const;

const RELATIONS = ["gt", "lt", "eq"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new AlgorithmContractError(message);
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(`${path} 必须是数组`);
  }
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} 必须是有限数字`);
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} 必须是非空字符串`);
  }
  return value;
}

function asText(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(`${path} 必须是字符串`);
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${path} 必须是布尔值`);
  }
  return value;
}

function asNumberArray(value: unknown, path: string): readonly number[] {
  return asArray(value, path).map((entry, index) => asNumber(entry, `${path}[${index}]`));
}

function asStringArray(value: unknown, path: string): readonly string[] {
  return asArray(value, path).map((entry, index) => asString(entry, `${path}[${index}]`));
}

/** 双语字段必须是 { "zh-Hant": ..., en: ... } 且两者非空。 */
function asBilingual(value: unknown, path: string): Bilingual {
  if (!isRecord(value)) {
    fail(`${path} 必须是 { "zh-Hant", en } 对象`);
  }
  return {
    "zh-Hant": asString(value["zh-Hant"], `${path}["zh-Hant"]`),
    en: asString(value.en, `${path}.en`),
  };
}

function asAlgorithmId(value: unknown, path: string): AlgorithmId {
  if (typeof value !== "string" || !(ALGORITHM_IDS as readonly string[]).includes(value)) {
    fail(`${path} 不是已知的算法 id`);
  }
  return value as AlgorithmId;
}

function asStatus(value: unknown, path: string): AlgorithmStatus {
  if (value !== "available" && value !== "planned") {
    fail(`${path} 必须是 available 或 planned`);
  }
  return value;
}

/** 解析一个算法元数据项。 */
function parseMetadata(value: unknown, index: number): AlgorithmMetadata {
  const path = `algorithms[${index}]`;
  if (!isRecord(value)) {
    fail(`${path} 必须是对象`);
  }

  const defaultValues = asNumberArray(value.default_values, `${path}.default_values`);
  if (defaultValues.length > 0 && (defaultValues.length < 2 || defaultValues.length > 30)) {
    fail(`${path}.default_values 长度必须是 0 或 2–30`);
  }
  for (const number of defaultValues) {
    if (number < -1000 || number > 1000) {
      fail(`${path}.default_values 超出 [-1000, 1000]`);
    }
  }

  const stable = value.stable;
  if (stable !== null && typeof stable !== "boolean") {
    fail(`${path}.stable 必须是布尔值或 null`);
  }

  return {
    id: asAlgorithmId(value.id, `${path}.id`),
    name: asBilingual(value.name, `${path}.name`),
    tagline: asBilingual(value.tagline, `${path}.tagline`),
    status: asStatus(value.status, `${path}.status`),
    time_complexity: asBilingual(value.time_complexity, `${path}.time_complexity`),
    space_complexity: asBilingual(value.space_complexity, `${path}.space_complexity`),
    stable,
    use_cases: asBilingual(value.use_cases, `${path}.use_cases`),
    default_values: defaultValues,
    supports_early_exit: asBoolean(value.supports_early_exit, `${path}.supports_early_exit`),
  };
}

/**
 * 解析 GET /api/algorithms。
 * 契约是 { protocol_version: 1, algorithms: [...] }；同时容忍直接返回数组的早期实现。
 */
export function parseAlgorithmListResponse(payload: unknown): AlgorithmListResponse {
  const container = Array.isArray(payload) ? { algorithm_list: payload } : payload;
  if (!isRecord(container)) {
    fail("响应必须是 JSON 对象或数组");
  }
  const rawList = Array.isArray(payload)
    ? payload
    : container.algorithms !== undefined
      ? container.algorithms
      : container.algorithm_list;
  const algorithms = asArray(rawList, "algorithms");
  if (algorithms.length === 0) {
    fail("algorithms 不能为空");
  }

  const parsed = algorithms.map((entry, index) => parseMetadata(entry, index));
  const ids = new Set<string>();
  for (const metadata of parsed) {
    if (ids.has(metadata.id)) {
      fail(`algorithms 中 id 重复：${metadata.id}`);
    }
    ids.add(metadata.id);
  }

  if (container.protocol_version !== undefined && container.protocol_version !== 1) {
    fail("不支持的 protocol_version");
  }

  return { protocol_version: 1, algorithms: parsed };
}

interface ParsedEvent extends AlgorithmTraceEvent {
  readonly auxiliary_state: AlgorithmTraceEvent["auxiliary_state"];
}

/** 解析单个事件（通用字段 + compare 必须带 comparison）。 */
function parseEvent(
  value: unknown,
  index: number,
  lineIds: ReadonlySet<string>,
  stateIds: ReadonlySet<number>,
): ParsedEvent {
  const path = `events[${index}]`;
  if (!isRecord(value)) {
    fail(`${path} 必须是对象`);
  }

  const eventType = value.event_type;
  if (typeof eventType !== "string" || !(EVENT_TYPES as readonly string[]).includes(eventType)) {
    fail(`${path}.event_type 不在协议允许的取值内`);
  }

  const codeLineIds = asArray(value.code_line_ids, `${path}.code_line_ids`);
  if (codeLineIds.length === 0) {
    fail(`${path}.code_line_ids 不能为空`);
  }
  codeLineIds.forEach((lineId, lineIndex) => {
    const resolved = asString(lineId, `${path}.code_line_ids[${lineIndex}]`);
    if (!lineIds.has(resolved)) {
      fail(`${path}.code_line_ids 引用了不存在的行：${resolved}`);
    }
  });

  const beforeId = asNumber(value.state_before_id, `${path}.state_before_id`);
  const afterId = asNumber(value.state_after_id, `${path}.state_after_id`);
  if (!stateIds.has(beforeId)) {
    fail(`${path}.state_before_id 悬空：${beforeId}`);
  }
  if (!stateIds.has(afterId)) {
    fail(`${path}.state_after_id 悬空：${afterId}`);
  }

  const indexFields = [
    "active_indices",
    "compared_indices",
    "modified_indices",
    "finalized_indices",
  ] as const;
  for (const field of indexFields) {
    asNumberArray(value[field], `${path}.${field}`);
  }

  if (!isRecord(value.auxiliary_state)) {
    fail(`${path}.auxiliary_state 必须是对象`);
  }
  const auxiliaryState = value.auxiliary_state;

  // 协议 §3.4：compare 事件可附带 comparison。阶段 5A 的后端对冒泡提供完整
  // comparison（含 will_swap），其余算法只提供 left/right/relation；因此
  // will_swap 是可选字段，存在时才严格校验，前端绝不自行推导。
  if (auxiliaryState.comparison !== undefined) {
    const comparison = auxiliaryState.comparison;
    if (!isRecord(comparison)) {
      fail(`${path}.auxiliary_state.comparison 必须是对象`);
    }
    asNumber(comparison.left, `${path}.auxiliary_state.comparison.left`);
    asNumber(comparison.right, `${path}.auxiliary_state.comparison.right`);
    if (
      typeof comparison.relation !== "string" ||
      !(RELATIONS as readonly string[]).includes(comparison.relation)
    ) {
      fail(`${path}.auxiliary_state.comparison.relation 必须是 gt、lt 或 eq`);
    }
    if (comparison.will_swap !== undefined) {
      asBoolean(comparison.will_swap, `${path}.auxiliary_state.comparison.will_swap`);
    }
  }

  if (!isRecord(value.metrics)) {
    fail(`${path}.metrics 必须是对象`);
  }
  asNumber(value.metrics.comparisons, `${path}.metrics.comparisons`);
  asNumber(value.metrics.swaps, `${path}.metrics.swaps`);
  asNumber(value.metrics.writes, `${path}.metrics.writes`);

  if (!isRecord(value.explanation)) {
    fail(`${path}.explanation 必须是对象`);
  }
  asString(value.explanation.key, `${path}.explanation.key`);
  asString(value.explanation["zh-Hant"], `${path}.explanation.zh-Hant`);
  asString(value.explanation.en, `${path}.explanation.en`);

  return value as unknown as ParsedEvent;
}

/** 构造 summary：允许缺字段，用事件/快照的安全事实补齐（不用于界面，只满足类型）。 */
function buildSummary(
  raw: unknown,
  lastEvent: ParsedEvent | undefined,
  states: readonly TraceState[],
  events: readonly ParsedEvent[],
): AlgorithmSummary {
  if (raw !== undefined && !isRecord(raw)) {
    fail("summary 必须是对象");
  }
  const summary = isRecord(raw) ? raw : {};
  const lastMetrics = lastEvent?.metrics ?? { comparisons: 0, swaps: 0, writes: 0 };
  const lastState = states[states.length - 1];

  const passes = (() => {
    const values = events
      .map((event) => event.auxiliary_state.pass_index)
      .filter((entry): entry is number => typeof entry === "number");
    return values.length > 0 ? Math.max(...values) + 1 : 0;
  })();

  return {
    comparisons:
      summary.comparisons === undefined
        ? lastMetrics.comparisons
        : asNumber(summary.comparisons, "summary.comparisons"),
    swaps:
      summary.swaps === undefined ? lastMetrics.swaps : asNumber(summary.swaps, "summary.swaps"),
    writes:
      summary.writes === undefined ? lastMetrics.writes : asNumber(summary.writes, "summary.writes"),
    passes: summary.passes === undefined ? passes : asNumber(summary.passes, "summary.passes"),
    early_exit_triggered:
      summary.early_exit_triggered === undefined
        ? false
        : asBoolean(summary.early_exit_triggered, "summary.early_exit_triggered"),
    final_order:
      summary.final_order === undefined
        ? (lastState?.order ?? []).filter((itemId): itemId is string => itemId !== null)
        : asStringArray(summary.final_order, "summary.final_order"),
    final_values:
      summary.final_values === undefined
        ? (lastState?.values ?? [])
        : asNumberArray(summary.final_values, "summary.final_values"),
    state_count:
      summary.state_count === undefined
        ? states.length
        : asNumber(summary.state_count, "summary.state_count"),
    event_count:
      summary.event_count === undefined
        ? events.length
        : asNumber(summary.event_count, "summary.event_count"),
  };
}

/**
 * 解析通用算法轨迹响应；expectedId 存在时要求响应的 algorithm 与路由一致。
 */
export function parseAlgorithmTraceResponse(
  payload: unknown,
  expectedId: ImplementedAlgorithmId,
): AlgorithmTrace {
  if (!isRecord(payload)) {
    fail("响应必须是 JSON 对象");
  }
  if (payload.protocol_version !== 1) {
    fail("不支持的 protocol_version");
  }
  const algorithm = asAlgorithmId(payload.algorithm, "algorithm");
  if (algorithm !== expectedId) {
    fail(`响应的 algorithm（${algorithm}）与请求的算法（${expectedId}）不一致`);
  }
  const direction = payload.direction;
  if (direction !== "asc" && direction !== "desc") {
    fail("direction 必须是 asc 或 desc");
  }
  if (payload.options !== undefined && !isRecord(payload.options)) {
    fail("options 必须是对象");
  }

  // ---------- items ----------
  const rawItems = asArray(payload.items, "items");
  if (rawItems.length === 0) {
    fail("items 不能为空");
  }
  const itemIds = new Set<string>();
  const items: TraceItem[] = rawItems.map((item, index) => {
    if (!isRecord(item)) {
      fail(`items[${index}] 必须是对象`);
    }
    const itemId = asString(item.id, `items[${index}].id`);
    const itemValue = asNumber(item.value, `items[${index}].value`);
    if (itemIds.has(itemId)) {
      fail(`items 中 id 重复：${itemId}`);
    }
    itemIds.add(itemId);
    return { id: itemId, value: itemValue };
  });

  // ---------- code ----------
  if (!isRecord(payload.code)) {
    fail("code 必须是对象");
  }
  if (payload.code.language !== "python") {
    fail("code.language 必须是 python");
  }
  const rawLines = asArray(payload.code.lines, "code.lines");
  if (rawLines.length === 0) {
    fail("code.lines 不能为空");
  }
  const lineIds = new Set<string>();
  const codeLines: CodeLine[] = rawLines.map((line, index) => {
    if (!isRecord(line)) {
      fail(`code.lines[${index}] 必须是对象`);
    }
    const lineId = asString(line.line_id, `code.lines[${index}].line_id`);
    const lineno = asNumber(line.lineno, `code.lines[${index}].lineno`);
    const text = asText(line.text, `code.lines[${index}].text`);
    if (line.kind !== "normal" && line.kind !== "trace") {
      fail(`code.lines[${index}].kind 必须是 normal 或 trace`);
    }
    if (lineIds.has(lineId)) {
      fail(`code.lines 中 line_id 重复：${lineId}`);
    }
    lineIds.add(lineId);
    return { line_id: lineId, lineno, text, kind: line.kind };
  });
  const code: CodeBlock = { language: "python", lines: codeLines };

  // ---------- states ----------
  const rawStates = asArray(payload.states, "states");
  if (rawStates.length === 0) {
    fail("states 不能为空，states[0] 必须是初始状态");
  }
  const stateIds = new Set<number>();
  const states: TraceState[] = rawStates.map((state, index) => {
    if (!isRecord(state)) {
      fail(`states[${index}] 必须是对象`);
    }
    const stateId = asNumber(state.state_id, `states[${index}].state_id`);
    // 契约 §3.1：插入/希尔在右移期间允许 null 空槽；每个 id 至多一次、null 至多一个。
    const rawOrder = asArray(state.order, `states[${index}].order`);
    const order = rawOrder.map((entry, orderIndex) => {
      if (entry === null) {
        return null;
      }
      return asString(entry, `states[${index}].order[${orderIndex}]`);
    });
    const rawValues = asArray(state.values, `states[${index}].values`);
    if (order.length !== rawValues.length) {
      fail(`states[${index}] 的 order 与 values 长度不一致`);
    }
    // 空槽位置后端同时把 values 置为 null；这里归一化成 0 只是为了让既有
    // 播放器类型保持不变——柱图对 null order 渲染显式空槽，绝不显示这个 0。
    const values = rawValues.map((entry, valueIndex) => {
      if (entry === null && order[valueIndex] === null) {
        return 0;
      }
      return asNumber(entry, `states[${index}].values[${valueIndex}]`);
    });
    const presentIds = order.filter((entry): entry is string => entry !== null);
    if (new Set(presentIds).size !== presentIds.length) {
      fail(`states[${index}].order 中存在重复 id`);
    }
    if (order.filter((entry) => entry === null).length > 1) {
      fail(`states[${index}].order 中最多只能有一个空槽（null）`);
    }
    if (stateIds.has(stateId)) {
      fail(`states 中 state_id 重复：${stateId}`);
    }
    stateIds.add(stateId);
    return { state_id: stateId, order, values };
  });

  // ---------- events ----------
  const events = asArray(payload.events, "events").map((event, index) =>
    parseEvent(event, index, lineIds, stateIds),
  );
  events.forEach((event, index) => {
    const nextEvent = events[index + 1];
    if (nextEvent && nextEvent.state_before_id !== event.state_after_id) {
      fail(`events[${index}] 与 events[${index + 1}] 的状态链断裂`);
    }
  });

  const summary = buildSummary(payload.summary, events[events.length - 1], states, events);

  return {
    protocol_version: 1,
    algorithm,
    direction,
    options: isRecord(payload.options) ? payload.options : {},
    items,
    code,
    states,
    events,
    summary,
  };
}
