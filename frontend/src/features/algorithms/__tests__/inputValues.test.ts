import { describe, expect, it } from "vitest";

import {
  defaultValuesFrom,
  FALLBACK_VALUES,
  generateRandomValues,
  parseAlgorithmValues,
} from "../inputValues";

describe("算法输入解析", () => {
  it("接受整数与一位小数（逗号、空格、中文逗号分隔）", () => {
    expect(parseAlgorithmValues("5, 3, 8, 1")).toEqual({
      ok: true,
      values: [5, 3, 8, 1],
    });
    expect(parseAlgorithmValues("5 3\n8\t1")).toEqual({ ok: true, values: [5, 3, 8, 1] });
    expect(parseAlgorithmValues("-2.5，0，30.2")).toEqual({
      ok: true,
      values: [-2.5, 0, 30.2],
    });
  });

  it("冒泡模式（allowDecimal=false）拒绝小数并给出专门提示", () => {
    expect(parseAlgorithmValues("1.5, 2", { allowDecimal: false })).toEqual({
      ok: false,
      reason: "controls.error.integerOnly",
    });
    expect(parseAlgorithmValues("5, 3, 8, 1", { allowDecimal: false })).toEqual({
      ok: true,
      values: [5, 3, 8, 1],
    });
  });

  it("拒绝空输入、数量不符、非数字、小数位过多与越界", () => {
    expect(parseAlgorithmValues("  ")).toEqual({
      ok: false,
      reason: "controls.error.empty",
    });
    expect(parseAlgorithmValues("5")).toEqual({
      ok: false,
      reason: "controls.error.count",
    });
    expect(parseAlgorithmValues("abc, 2")).toEqual({
      ok: false,
      reason: "controls.error.notNumber",
    });
    expect(parseAlgorithmValues("1.25, 2")).toEqual({
      ok: false,
      reason: "controls.error.decimals",
    });
    expect(parseAlgorithmValues("1, 1001")).toEqual({
      ok: false,
      reason: "controls.error.range",
    });
    expect(parseAlgorithmValues("1, -1000.5")).toEqual({
      ok: false,
      reason: "controls.error.range",
    });

    const tooMany = Array.from({ length: 31 }, (_, index) => String(index)).join(",");
    expect(parseAlgorithmValues(tooMany)).toEqual({
      ok: false,
      reason: "controls.error.count",
    });
  });

  it("接受边界长度与边界数值", () => {
    expect(parseAlgorithmValues("-1000, 1000")).toEqual({
      ok: true,
      values: [-1000, 1000],
    });
    const thirty = Array.from({ length: 30 }, (_, index) => String(index)).join(",");
    expect(parseAlgorithmValues(thirty).ok).toBe(true);
  });

  it("随机小数列长度为 2–30，全部是 1–99 的整数", () => {
    const values = generateRandomValues(6, () => 0.5);
    expect(values).toHaveLength(6);
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(99);
    }
    expect(generateRandomValues(1)).toHaveLength(2);
    expect(generateRandomValues(100)).toHaveLength(30);
  });

  it("元数据默认值不合法时回退到固定教学小数据", () => {
    expect(defaultValuesFrom([5, 3, 8, 1])).toEqual([5, 3, 8, 1]);
    expect(defaultValuesFrom([])).toEqual([...FALLBACK_VALUES]);
    expect(defaultValuesFrom([1])).toEqual([...FALLBACK_VALUES]);
    expect(defaultValuesFrom([1, 2000])).toEqual([...FALLBACK_VALUES]);
  });
});
