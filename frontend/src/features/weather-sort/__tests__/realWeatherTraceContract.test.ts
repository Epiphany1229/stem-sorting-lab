/**
 * 跨栈契约回归（阶段 4）：直接消费**后端真实 weather-trace 响应**。
 *
 * 夹具生成命令（仓库根目录）：
 *   $env:PYTHONPATH="$PWD"; uv run python .tools/reference/export_weather_sort_fixtures.py
 *
 * 覆盖：元素身份元数据、缺失日期透明返回、tmax/tmin 不串、稳定性（等温保持日期顺序）、
 * Top N 方向、single_scan 对照、解释中真实日期与温度、代码行引用可解析。
 */

import { describe, expect, it } from "vitest";

import { parseTraceResponse } from "../../../player/traceValidation";
import gapFixture from "./fixtures/real/trace_gap_tmax.json";
import tmaxFixture from "./fixtures/real/trace_week_tmax.json";
import tminFixture from "./fixtures/real/trace_week_tmin_desc.json";

const WEEK = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

describe("真实天气轨迹（后端实际输出）", () => {
  it("元素身份：id/日期/测站/原始精度/来源齐备，且排序前按日期排列", () => {
    const trace = parseTraceResponse(tmaxFixture);
    expect(trace.metric).toBe("tmax");
    expect(trace.valid_days).toBe(7);
    expect(trace.requested_days).toBe(7);
    expect(trace.items).toHaveLength(7);
    expect(trace.items.map((item) => item.label)).toEqual(WEEK);
    for (const item of trace.items) {
      expect(item.id).toBe(`it-${item.label}`);
      expect(item.station).toBe("HKO");
      expect(item.station_name_en).toBe("Hong Kong Observatory");
      expect(item.station_name_zh_hant).toBe("香港天文台");
      expect(typeof item.value_raw).toBe("string");
      expect(item.value_raw).toMatch(/^-?\d+\.\d$/);
      expect(Number(item.value_raw)).toBe(item.value);
      expect(item.quality_flag).toBeTruthy();
      expect(item.source?.dataset).toBe("CLMMAXT");
    }
    expect(trace.before_order).toEqual(trace.items.map((item) => item.id));
  });

  it("缺失日期透明返回：10 月当月未发布被列入 excluded_dates", () => {
    const trace = parseTraceResponse(gapFixture);
    expect(trace.valid_days).toBe(6);
    expect(trace.requested_days).toBe(11);
    expect(trace.excluded_dates?.map((entry) => entry.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    expect(trace.excluded_dates?.every((entry) => entry.reason === "missing")).toBe(true);
    // 被排除的日期绝不进入排序元素
    const labels = trace.items.map((item) => item.label);
    expect(labels).not.toContain("2026-10-01");
    expect(trace.items).toHaveLength(6);
  });

  it("tmax/tmin 不串数据：final 值域与数据集不同", () => {
    const tmax = parseTraceResponse(tmaxFixture);
    const tmin = parseTraceResponse(tminFixture);
    expect(tmax.metric).toBe("tmax");
    expect(tmin.metric).toBe("tmin");
    const tmaxValues = tmax.summary.final_values;
    const tminValues = tmin.summary.final_values;
    expect(tmaxValues).not.toEqual(tminValues);
    // tmin 是降序轨迹，final_values 必须单调不增
    for (let i = 1; i < tminValues.length; i += 1) {
      expect(tminValues[i]).toBeLessThanOrEqual(tminValues[i - 1]);
    }
    // 同一日期在两条轨迹里的原始值不同
    const tmaxByDate = new Map(tmax.items.map((item) => [item.label, item.value_raw]));
    const tminByDate = new Map(tmin.items.map((item) => [item.label, item.value_raw]));
    for (const date of WEEK) {
      expect(tmaxByDate.get(date)).toBeDefined();
      expect(tminByDate.get(date)).toBeDefined();
      expect(tmaxByDate.get(date)).not.toBe(tminByDate.get(date));
    }
  });

  it("稳定性：等温日期的先后顺序在排序结果中保持", () => {
    const trace = parseTraceResponse(tmaxFixture);
    const byId = new Map(trace.items.map((item) => [item.id, item]));
    const order = trace.after_order ?? [];
    expect(order).toHaveLength(trace.items.length);

    // 找出所有等温分组，断言组内日期顺序与 before_order 一致
    for (let i = 1; i < order.length; i += 1) {
      const previous = byId.get(order[i - 1]);
      const current = byId.get(order[i]);
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous && current && previous.value_raw === current.value_raw) {
        const beforeIndexPrev = trace.before_order?.indexOf(previous.id) ?? -1;
        const beforeIndexCurr = trace.before_order?.indexOf(current.id) ?? -1;
        expect(beforeIndexPrev).toBeLessThan(beforeIndexCurr);
      }
    }
  });

  it("Top N 与 single_scan：最热降序、最冷升序、单次扫描 = N-1 次比较 0 次交换", () => {
    const trace = parseTraceResponse(tmaxFixture);
    const hot = trace.top_hot ?? [];
    const cold = trace.top_cold ?? [];
    expect(hot.length).toBeGreaterThan(0);
    expect(cold.length).toBeGreaterThan(0);
    for (let i = 1; i < hot.length; i += 1) {
      expect(hot[i].value).toBeLessThanOrEqual(hot[i - 1].value);
    }
    for (let i = 1; i < cold.length; i += 1) {
      expect(cold[i].value).toBeGreaterThanOrEqual(cold[i - 1].value);
    }
    // 最热的第一天必须等于完整排序后的最后一个元素
    expect(hot[0].value_raw).toBe(trace.summary.final_values[trace.summary.final_values.length - 1].toFixed(1));
    // 最冷的第一天必须等于完整排序后的第一个元素
    expect(cold[0].value_raw).toBe(trace.summary.final_values[0].toFixed(1));
    expect(trace.single_scan?.comparisons).toBe((trace.valid_days ?? 0) - 1);
    expect(trace.single_scan?.swaps).toBe(0);
    // 完整冒泡的比较次数应显著多于单次扫描
    expect(trace.summary.comparisons).toBeGreaterThan(trace.single_scan?.comparisons ?? 0);
  });

  it("解释使用真实日期与温度，且每个事件的 code_line_ids 可解析", () => {
    const trace = parseTraceResponse(tmaxFixture);
    const lineIds = new Set(trace.code.lines.map((line) => line.line_id));
    const datePattern = /(\d{1,2}) 月 (\d{1,2}) 日/;
    const enDatePattern = /on (Sep|Oct|Nov) (\d{1,2})/;
    let matchedCompare = 0;
    for (const event of trace.events) {
      expect(event.code_line_ids.length).toBeGreaterThan(0);
      for (const lineId of event.code_line_ids) {
        expect(lineIds.has(lineId)).toBe(true);
      }
      expect(event.explanation["zh-Hant"].length).toBeGreaterThan(0);
      expect(event.explanation.en.length).toBeGreaterThan(0);
      if (event.event_type === "compare") {
        expect(datePattern.test(event.explanation["zh-Hant"])).toBe(true);
        expect(enDatePattern.test(event.explanation.en)).toBe(true);
        matchedCompare += 1;
      }
    }
    expect(matchedCompare).toBeGreaterThan(0);
  });
});
