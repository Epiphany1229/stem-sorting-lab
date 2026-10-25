import { describe, expect, it } from "vitest";

import {
  AlgorithmContractError,
  parseAlgorithmListResponse,
  parseAlgorithmTraceResponse,
} from "../validation";
import { algorithmListResponse, heapTraceFixture, selectionTraceFixture } from "./fixtures";

function clone<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

type AnyRecord = Record<string, unknown>;

describe("GET /api/algorithms 响应校验", () => {
  it("接受契约信封与早期裸数组两种形式，且只保留 7 项比较类排序", () => {
    expect(parseAlgorithmListResponse(algorithmListResponse()).algorithms).toHaveLength(7);
    expect(
      parseAlgorithmListResponse(algorithmListResponse().algorithms).algorithms,
    ).toHaveLength(7);
  });

  it("静默忽略后端仍返回的 planned 项（不校验已移除的算法 id）", () => {
    const payload = clone(algorithmListResponse());
    const list = payload.algorithms as AnyRecord[];
    list.push({
      id: "counting",
      name: { "zh-Hant": "計數排序", en: "Counting sort" },
      tagline: { "zh-Hant": "統計次數。", en: "Count occurrences." },
      status: "planned",
      time_complexity: { "zh-Hant": "O(n+k)", en: "O(n+k)" },
      space_complexity: { "zh-Hant": "O(k)", en: "O(k)" },
      stable: true,
      use_cases: { "zh-Hant": "整數。", en: "Integers." },
      default_values: [],
      supports_early_exit: false,
    });

    const parsed = parseAlgorithmListResponse(payload);
    expect(parsed.algorithms).toHaveLength(7);
    expect(parsed.algorithms.some((algorithm) => String(algorithm.id) === "counting")).toBe(false);
  });

  it("拒绝重复 id、缺失双语字段与非法状态", () => {
    const duplicated = clone(algorithmListResponse());
    const list = duplicated.algorithms as AnyRecord[];
    list[1] = { ...list[1], id: list[0].id };
    expect(() => parseAlgorithmListResponse(duplicated)).toThrow(AlgorithmContractError);

    const missingBilingual = clone(algorithmListResponse());
    const missingList = missingBilingual.algorithms as AnyRecord[];
    missingList[0] = { ...missingList[0], name: { "zh-Hant": "冒泡排序" } };
    expect(() => parseAlgorithmListResponse(missingBilingual)).toThrow(AlgorithmContractError);

    const badStatus = clone(algorithmListResponse());
    const statusList = badStatus.algorithms as AnyRecord[];
    statusList[0] = { ...statusList[0], status: "coming-soon" };
    expect(() => parseAlgorithmListResponse(badStatus)).toThrow(AlgorithmContractError);
  });
});

describe("通用算法轨迹响应校验", () => {
  it("接受 selection / heap 的 fixture 轨迹", () => {
    expect(
      parseAlgorithmTraceResponse(selectionTraceFixture, "selection").events,
    ).toHaveLength(9);
    expect(parseAlgorithmTraceResponse(heapTraceFixture, "heap").events).toHaveLength(2);
  });

  it("允许 options 为 {}，并按事件/快照补齐 summary 的可选部分", () => {
    const payload = clone(heapTraceFixture);
    delete payload.summary;
    const parsed = parseAlgorithmTraceResponse(payload, "heap");
    expect(parsed.summary.event_count).toBe(2);
    expect(parsed.summary.state_count).toBe(1);
  });

  it("允许 order/values 的空槽（null），但拒绝重复 id 与多个空槽", () => {
    // 契约 §3.1：插入/希尔右移期间 order 允许单个 null，values 同位置为 null。
    const withHole = clone(selectionTraceFixture);
    const states = withHole.states as AnyRecord[];
    states[0] = {
      state_id: 0,
      order: [null, "it-1", "it-2"],
      values: [null, 3, 1],
    };
    const parsed = parseAlgorithmTraceResponse(withHole, "selection");
    // 归一化后空槽位置不携带伪数值；显式空槽由柱图按 order===null 渲染。
    expect(parsed.states[0].order).toEqual([null, "it-1", "it-2"]);
    expect(parsed.states[0].values).toEqual([0, 3, 1]);

    const duplicated = clone(selectionTraceFixture);
    const duplicatedStates = duplicated.states as AnyRecord[];
    duplicatedStates[0] = {
      state_id: 0,
      order: ["it-0", "it-0", "it-2"],
      values: [5, 3, 1],
    };
    expect(() => parseAlgorithmTraceResponse(duplicated, "selection")).toThrow(
      AlgorithmContractError,
    );

    const tooManyHoles = clone(selectionTraceFixture);
    const holeStates = tooManyHoles.states as AnyRecord[];
    holeStates[0] = {
      state_id: 0,
      order: [null, null, "it-2"],
      values: [null, null, 1],
    };
    expect(() => parseAlgorithmTraceResponse(tooManyHoles, "selection")).toThrow(
      AlgorithmContractError,
    );
  });

  it("拒绝 algorithm 不一致、code_line_ids 悬空、状态链断裂与非法 comparison", () => {
    expect(() => parseAlgorithmTraceResponse(selectionTraceFixture, "heap")).toThrow(
      AlgorithmContractError,
    );

    const danglingLine = clone(selectionTraceFixture);
    const events = danglingLine.events as AnyRecord[];
    events[1] = { ...events[1], code_line_ids: ["L999"] };
    expect(() => parseAlgorithmTraceResponse(danglingLine, "selection")).toThrow(
      AlgorithmContractError,
    );

    const brokenChain = clone(selectionTraceFixture);
    const brokenEvents = brokenChain.events as AnyRecord[];
    brokenEvents[2] = { ...brokenEvents[2], state_before_id: 99 };
    expect(() => parseAlgorithmTraceResponse(brokenChain, "selection")).toThrow(
      AlgorithmContractError,
    );

    // comparison 是可选字段：出现时严格校验，不出现时放行（阶段 5A 后端仅冒泡提供）。
    const badComparison = clone(selectionTraceFixture);
    const badComparisonEvents = badComparison.events as AnyRecord[];
    badComparisonEvents[1] = {
      ...badComparisonEvents[1],
      auxiliary_state: {
        ...(badComparisonEvents[1].auxiliary_state as AnyRecord),
        comparison: { left: 3, right: 5, relation: "lt", will_swap: "yes" },
      },
    };
    expect(() => parseAlgorithmTraceResponse(badComparison, "selection")).toThrow(
      AlgorithmContractError,
    );

    const noComparison = clone(selectionTraceFixture);
    const noComparisonEvents = noComparison.events as AnyRecord[];
    const withoutComparison = {
      ...(noComparisonEvents[1].auxiliary_state as AnyRecord),
    };
    delete withoutComparison.comparison;
    noComparisonEvents[1] = {
      ...noComparisonEvents[1],
      auxiliary_state: withoutComparison,
    };
    expect(() => parseAlgorithmTraceResponse(noComparison, "selection")).not.toThrow();
  });
});
