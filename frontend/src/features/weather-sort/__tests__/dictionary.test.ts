import { describe, expect, it } from "vitest";

import { dictionary, type TranslationKey } from "../../../i18n/dictionary";

// 与阶段 2/3 相同的简体字黑名单思路：只列一定不会出现在繁体中文里的简体字。
const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

const sortKeys = (Object.keys(dictionary) as TranslationKey[]).filter((key) =>
  key.startsWith("weatherSort."),
);
const sortEntries = sortKeys.map((key) => [key, dictionary[key]] as const);

describe("阶段 4 天气排序双语文案", () => {
  it("新增 key 数量充足，且每个 key 的中文与英文都完整", () => {
    expect(sortEntries.length).toBeGreaterThanOrEqual(45);

    for (const [key, value] of sortEntries) {
      expect(value["zh-Hant"].trim().length, `${key} 缺少繁体中文`).toBeGreaterThan(0);
      expect(value.en.trim().length, `${key} 缺少英文`).toBeGreaterThan(0);
    }
  });

  it("天气排序文案的繁体中文不含简体字", () => {
    const offenders: string[] = [];

    for (const [key, value] of sortEntries) {
      for (const char of SIMPLIFIED_ONLY_CHARS) {
        if (value["zh-Hant"].includes(char)) {
          offenders.push(`${key} 含有简体字「${char}」`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("占位符在中英文里成对出现", () => {
    for (const [key, value] of sortEntries) {
      const zhPlaceholders = [...value["zh-Hant"].matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const enPlaceholders = [...value.en.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      expect(new Set(zhPlaceholders), `${key} 中英文占位符不一致`).toEqual(
        new Set(enPlaceholders),
      );
    }
  });

  it("入口、缺失提示、柱子详情、Top N、STEM 卡片等关键 key 齐备", () => {
    const requiredKeys = [
      "weatherSort.entry",
      "weatherSort.entryHint",
      "weatherSort.missing.line",
      "weatherSort.missing.none",
      "weatherSort.controls.parallel",
      "weatherSort.player.heading",
      "weatherSort.bar.title",
      "weatherSort.bar.detailHint",
      "weatherSort.results.summary",
      "weatherSort.results.topHot",
      "weatherSort.results.topCold",
      "weatherSort.results.before",
      "weatherSort.results.after",
      "weatherSort.results.stemBubble",
      "weatherSort.results.stemScan",
      "weatherSort.error.tooFewDays",
      "weatherSort.noValid",
    ] as const;

    for (const key of requiredKeys) {
      expect(dictionary[key], `缺少字典 key ${key}`).toBeDefined();
    }
  });

  it("入口按钮双语文案与题目要求一致", () => {
    expect(dictionary["weatherSort.entry"]["zh-Hant"]).toBe(
      "用冒泡排序探索這 30 天的氣溫",
    );
    expect(dictionary["weatherSort.entry"].en).toBe(
      "Explore These 30 Days of Temperatures with Bubble Sort",
    );
  });

  it("缺失提示模板包含有效天数、请求天数与缺失日期三个占位符", () => {
    const zh = dictionary["weatherSort.missing.line"]["zh-Hant"];
    expect(zh).toContain("{valid}");
    expect(zh).toContain("{requested}");
    expect(zh).toContain("{dates}");
    expect(zh).toContain("已排除");
  });
});
