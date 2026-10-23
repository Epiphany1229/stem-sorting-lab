import { describe, expect, it } from "vitest";

import { generateRandomValues, parseCustomValues } from "../inputValues";

describe("输入校验", () => {
  it("随机生成 10 个 1–100 的整数", () => {
    const values = generateRandomValues(10, 1, 100, () => 0.999);
    expect(values).toHaveLength(10);
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("接受逗号、空格、换行与中文逗号分隔的整数（含负数）", () => {
    expect(parseCustomValues("5, 3, 8, 1")).toEqual({ ok: true, values: [5, 3, 8, 1] });
    expect(parseCustomValues("5 3\n8\t1")).toEqual({ ok: true, values: [5, 3, 8, 1] });
    expect(parseCustomValues("-5，0，7")).toEqual({ ok: true, values: [-5, 0, 7] });
  });

  it("拒绝空输入、非整数、越界值与数量不符", () => {
    expect(parseCustomValues("  ")).toEqual({ ok: false, reason: "lab.input.error.empty" });
    expect(parseCustomValues("5")).toEqual({ ok: false, reason: "lab.input.error.count" });
    expect(parseCustomValues("1.5, 2")).toEqual({
      ok: false,
      reason: "lab.input.error.notInteger",
    });
    expect(parseCustomValues("1, 1001")).toEqual({ ok: false, reason: "lab.input.error.range" });
    expect(parseCustomValues("1, -1001")).toEqual({ ok: false, reason: "lab.input.error.range" });

    const tooMany = Array.from({ length: 31 }, (_, index) => String(index)).join(",");
    expect(parseCustomValues(tooMany)).toEqual({ ok: false, reason: "lab.input.error.count" });
  });

  it("接受边界长度与边界数值", () => {
    expect(parseCustomValues("-1000, 1000")).toEqual({ ok: true, values: [-1000, 1000] });
    const thirty = Array.from({ length: 30 }, (_, index) => String(index)).join(",");
    expect(parseCustomValues(thirty).ok).toBe(true);
  });
});
