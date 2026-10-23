import { describe, expect, it } from "vitest";

import { dictionary, formatTranslation } from "../../i18n/dictionary";

// 与 BilingualText.test.tsx 相同的简体字黑名单思路，单独覆盖阶段 2 新增的文案。
// 只列一定不会出现在繁体中文里的简体字，排除繁简同形字以避免误报。
const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

const PHASE2_PREFIXES = ["player.", "trace.", "lab.", "code.", "prediction."] as const;

const phase2Entries = Object.entries(dictionary).filter(([key]) =>
  PHASE2_PREFIXES.some((prefix) => key.startsWith(prefix)),
);

describe("阶段 2 双语文案", () => {
  it("新增 key 数量充足，且每个 key 的中文与英文都完整", () => {
    expect(phase2Entries.length).toBeGreaterThanOrEqual(60);

    for (const [key, value] of phase2Entries) {
      expect(value["zh-Hant"].trim().length, `${key} 缺少繁体中文`).toBeGreaterThan(0);
      expect(value.en.trim().length, `${key} 缺少英文`).toBeGreaterThan(0);
    }
  });

  it("新增文案的繁体中文不含简体字", () => {
    const offenders: string[] = [];

    for (const [key, value] of phase2Entries) {
      for (const char of SIMPLIFIED_ONLY_CHARS) {
        if (value["zh-Hant"].includes(char)) {
          offenders.push(`${key} 含有简体字「${char}」`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("带占位符的文案会同时填充中英文", () => {
    expect(formatTranslation("player.progress", { step: 3, total: 14 })).toEqual({
      "zh-Hant": "已播放 3 / 14 步",
      en: "Played 3 of 14 steps",
    });
    expect(formatTranslation("player.passValue", { pass: 2 })["zh-Hant"]).toBe("第 2 輪");
  });

  it("所有占位符都在中英文里成对出现（避免漏填导致界面残留 {xxx}）", () => {
    const placeholderKeys = Object.entries(dictionary).filter(([, value]) =>
      /\{\w+\}/.test(value["zh-Hant"] + value.en),
    );
    expect(placeholderKeys.length).toBeGreaterThan(0);

    for (const [key, value] of placeholderKeys) {
      const zhPlaceholders = [...value["zh-Hant"].matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const enPlaceholders = [...value.en.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      expect(new Set(zhPlaceholders), `${key} 中英文占位符不一致`).toEqual(new Set(enPlaceholders));
    }
  });
});
