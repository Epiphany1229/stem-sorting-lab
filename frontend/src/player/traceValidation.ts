/**
 * 轨迹协议 v1 的运行时校验。
 *
 * 目的不是「猜」任何排序过程，而是拒绝不合契约的响应：
 * 字段缺失、状态 id 悬空、事件链断裂、code_line_ids 指向不存在的行，
 * 都要立即报错，而不是让界面显示半份轨迹。
 */
import type { BubbleTrace, EventType } from "./types";

/** 响应不符合协议时抛出。界面层会显示明确的「轨迹格式错误」提示。 */
export class TraceProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceProtocolError";
  }
}

const EVENT_TYPES: readonly EventType[] = [
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
];

const RELATIONS = ["gt", "lt", "eq"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new TraceProtocolError(message);
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

/** 源码行文本允许为空（Python 源文件里的空行），只要求是字符串。 */
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

/**
 * 校验并返回轨迹。通过后直接使用原对象（字段名按契约保留），
 * 不做任何补全或重排。
 */
export function parseTraceResponse(payload: unknown): BubbleTrace {
  if (!isRecord(payload)) {
    fail("响应必须是 JSON 对象");
  }

  if (payload.protocol_version !== 1) {
    fail(`不支持的 protocol_version：${String(payload.protocol_version)}`);
  }
  if (payload.algorithm !== "bubble") {
    fail(`不支持的 algorithm：${String(payload.algorithm)}`);
  }
  const direction = payload.direction;
  if (direction !== "asc" && direction !== "desc") {
    fail("direction 必须是 asc 或 desc");
  }

  if (!isRecord(payload.options)) {
    fail("options 必须是对象");
  }
  asBoolean(payload.options.early_exit, "options.early_exit");

  // ---------- items ----------
  const items = asArray(payload.items, "items");
  if (items.length === 0) {
    fail("items 不能为空");
  }
  const itemIds = new Set<string>();
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      fail(`items[${index}] 必须是对象`);
    }
    const itemId = asString(item.id, `items[${index}].id`);
    asNumber(item.value, `items[${index}].value`);
    if (itemIds.has(itemId)) {
      fail(`items 中 id 重复：${itemId}`);
    }
    itemIds.add(itemId);

    // 阶段 4 天气元数据全部可选；出现时必须符合类型，否则视为坏轨迹。
    for (const field of [
      "value_raw",
      "label",
      "station",
      "station_name_zh_hant",
      "station_name_en",
      "quality_flag",
    ] as const) {
      if (item[field] !== undefined) {
        asString(item[field], `items[${index}].${field}`);
      }
    }
    if (item.source !== undefined) {
      if (!isRecord(item.source)) {
        fail(`items[${index}].source 必须是对象`);
      }
      asString(item.source.dataset, `items[${index}].source.dataset`);
      asString(item.source.fetched_at, `items[${index}].source.fetched_at`);
      if (
        item.source.mode !== "official" &&
        item.source.mode !== "imported" &&
        item.source.mode !== "demo"
      ) {
        fail(`items[${index}].source.mode 必须是 official、imported 或 demo`);
      }
    }
  });

  // ---------- code ----------
  if (!isRecord(payload.code)) {
    fail("code 必须是对象");
  }
  if (payload.code.language !== "python") {
    fail("code.language 必须是 python");
  }
  const codeLines = asArray(payload.code.lines, "code.lines");
  if (codeLines.length === 0) {
    fail("code.lines 不能为空");
  }
  const lineIds = new Set<string>();
  codeLines.forEach((line, index) => {
    if (!isRecord(line)) {
      fail(`code.lines[${index}] 必须是对象`);
    }
    const lineId = asString(line.line_id, `code.lines[${index}].line_id`);
    asNumber(line.lineno, `code.lines[${index}].lineno`);
    // 空行是合法源码行：text 可以是空字符串。
    asText(line.text, `code.lines[${index}].text`);
    if (line.kind !== "normal" && line.kind !== "trace") {
      fail(`code.lines[${index}].kind 必须是 normal 或 trace`);
    }
    if (lineIds.has(lineId)) {
      fail(`code.lines 中 line_id 重复：${lineId}`);
    }
    lineIds.add(lineId);
  });

  // ---------- states ----------
  const states = asArray(payload.states, "states");
  if (states.length === 0) {
    fail("states 不能为空，states[0] 必须是初始状态");
  }
  const stateIds = new Set<number>();
  states.forEach((state, index) => {
    if (!isRecord(state)) {
      fail(`states[${index}] 必须是对象`);
    }
    const stateId = asNumber(state.state_id, `states[${index}].state_id`);
    const order = asArray(state.order, `states[${index}].order`);
    const values = asNumberArray(state.values, `states[${index}].values`);
    if (order.length !== values.length) {
      fail(`states[${index}] 的 order 与 values 长度不一致`);
    }
    order.forEach((entry, orderIndex) =>
      asString(entry, `states[${index}].order[${orderIndex}]`),
    );
    if (stateIds.has(stateId)) {
      fail(`states 中 state_id 重复：${stateId}`);
    }
    stateIds.add(stateId);
  });

  // ---------- events ----------
  const events = asArray(payload.events, "events");
  events.forEach((event, index) => {
    if (!isRecord(event)) {
      fail(`events[${index}] 必须是对象`);
    }
    asNumber(event.step_id, `events[${index}].step_id`);

    if (
      typeof event.event_type !== "string" ||
      !(EVENT_TYPES as readonly string[]).includes(event.event_type)
    ) {
      fail(`events[${index}].event_type 不在协议允许的取值内`);
    }

    const codeLineIds = asArray(event.code_line_ids, `events[${index}].code_line_ids`);
    if (codeLineIds.length === 0) {
      fail(`events[${index}].code_line_ids 不能为空`);
    }
    codeLineIds.forEach((lineId, lineIndex) => {
      const resolved = asString(lineId, `events[${index}].code_line_ids[${lineIndex}]`);
      if (!lineIds.has(resolved)) {
        fail(`events[${index}].code_line_ids 引用了不存在的行：${resolved}`);
      }
    });

    const beforeId = asNumber(event.state_before_id, `events[${index}].state_before_id`);
    const afterId = asNumber(event.state_after_id, `events[${index}].state_after_id`);
    if (!stateIds.has(beforeId)) {
      fail(`events[${index}].state_before_id 悬空：${beforeId}`);
    }
    if (!stateIds.has(afterId)) {
      fail(`events[${index}].state_after_id 悬空：${afterId}`);
    }

    for (const field of [
      "active_indices",
      "compared_indices",
      "modified_indices",
      "finalized_indices",
    ] as const) {
      asNumberArray(event[field], `events[${index}].${field}`);
    }

    // auxiliary_state：冒泡排序固定提供三个字段；compare 额外提供 comparison。
    if (!isRecord(event.auxiliary_state)) {
      fail(`events[${index}].auxiliary_state 必须是对象`);
    }
    asNumber(event.auxiliary_state.pass_index, `events[${index}].auxiliary_state.pass_index`);
    asBoolean(
      event.auxiliary_state.early_exit_enabled,
      `events[${index}].auxiliary_state.early_exit_enabled`,
    );
    asBoolean(
      event.auxiliary_state.swapped_in_pass,
      `events[${index}].auxiliary_state.swapped_in_pass`,
    );

    if (event.event_type === "compare") {
      const comparison = event.auxiliary_state.comparison;
      if (!isRecord(comparison)) {
        fail(`events[${index}] 是 compare 事件，但缺少 auxiliary_state.comparison`);
      }
      asNumber(comparison.left, `events[${index}].auxiliary_state.comparison.left`);
      asNumber(comparison.right, `events[${index}].auxiliary_state.comparison.right`);
      if (
        typeof comparison.relation !== "string" ||
        !(RELATIONS as readonly string[]).includes(comparison.relation)
      ) {
        fail(`events[${index}].auxiliary_state.comparison.relation 必须是 gt、lt 或 eq`);
      }
      asBoolean(comparison.will_swap, `events[${index}].auxiliary_state.comparison.will_swap`);
    }

    if (!isRecord(event.metrics)) {
      fail(`events[${index}].metrics 必须是对象`);
    }
    asNumber(event.metrics.comparisons, `events[${index}].metrics.comparisons`);
    asNumber(event.metrics.swaps, `events[${index}].metrics.swaps`);
    asNumber(event.metrics.writes, `events[${index}].metrics.writes`);

    if (!isRecord(event.explanation)) {
      fail(`events[${index}].explanation 必须是对象`);
    }
    asString(event.explanation.key, `events[${index}].explanation.key`);
    asString(event.explanation["zh-Hant"], `events[${index}].explanation.zh-Hant`);
    asString(event.explanation.en, `events[${index}].explanation.en`);

    // 不变量：event.state_after_id 是下一个事件的 state_before_id（尾部事件除外）。
    const nextEvent = events[index + 1];
    if (isRecord(nextEvent) && nextEvent.state_before_id !== afterId) {
      fail(`events[${index}] 与 events[${index + 1}] 的状态链断裂`);
    }
  });

  // ---------- summary ----------
  if (!isRecord(payload.summary)) {
    fail("summary 必须是对象");
  }
  for (const field of ["comparisons", "swaps", "writes", "passes", "state_count", "event_count"] as const) {
    asNumber(payload.summary[field], `summary.${field}`);
  }
  asBoolean(payload.summary.early_exit_triggered, "summary.early_exit_triggered");
  asArray(payload.summary.final_order, "summary.final_order");
  asNumberArray(payload.summary.final_values, "summary.final_values");

  // ---------- 阶段 4 天气轨迹的可选字段（旧轨迹没有这些字段，仍然通过） ----------
  if (payload.metric !== undefined && payload.metric !== "tmax" && payload.metric !== "tmin") {
    fail("metric 必须是 tmax 或 tmin");
  }
  for (const field of ["valid_days", "requested_days"] as const) {
    if (payload[field] !== undefined) {
      asNumber(payload[field], field);
    }
  }
  if (payload.excluded_dates !== undefined) {
    asArray(payload.excluded_dates, "excluded_dates").forEach((entry, index) => {
      const path = `excluded_dates[${index}]`;
      if (!isRecord(entry)) {
        fail(`${path} 必须是对象`);
      }
      asString(entry.date, `${path}.date`);
      asString(entry.reason, `${path}.reason`);
    });
  }
  for (const field of ["before_order", "after_order"] as const) {
    if (payload[field] === undefined) {
      continue;
    }
    asArray(payload[field], field).forEach((entry, index) => {
      const itemId = asString(entry, `${field}[${index}]`);
      if (!itemIds.has(itemId)) {
        fail(`${field}[${index}] 引用了不存在的元素：${itemId}`);
      }
    });
  }
  for (const field of ["top_hot", "top_cold"] as const) {
    if (payload[field] === undefined) {
      continue;
    }
    asArray(payload[field], field).forEach((entry, index) => {
      const path = `${field}[${index}]`;
      if (!isRecord(entry)) {
        fail(`${path} 必须是对象`);
      }
      asString(entry.date, `${path}.date`);
      asNumber(entry.value, `${path}.value`);
      asString(entry.value_raw, `${path}.value_raw`);
    });
  }
  if (payload.single_scan !== undefined) {
    if (!isRecord(payload.single_scan)) {
      fail("single_scan 必须是对象");
    }
    asNumber(payload.single_scan.comparisons, "single_scan.comparisons");
    asNumber(payload.single_scan.swaps, "single_scan.swaps");
  }

  return payload as unknown as BubbleTrace;
}
