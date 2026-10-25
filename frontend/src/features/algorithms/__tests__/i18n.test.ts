import { describe, expect, it } from "vitest";

import {
  algorithmText,
  auxTitles,
  formatAlgorithmText,
  practiceByAlgorithm,
  type AlgorithmTextPair,
} from "../i18n";

// 与既有 BilingualText/字典测试相同的简体黑名单思路；只列一定不会出现在
// 繁体中文里的简体字，排除繁简同形字以避免误报。
const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

function offendersOf(pair: AlgorithmTextPair, label: string): string[] {
  const offenders: string[] = [];
  for (const char of SIMPLIFIED_ONLY_CHARS) {
    if (pair["zh-Hant"].includes(char)) {
      offenders.push(`${label} 含有简体字「${char}」`);
    }
  }
  return offenders;
}

const algorithmEntries = Object.entries(algorithmText);

describe("阶段 5A 算法双语文案", () => {
  it("每个 key 都同时有繁体中文与英文", () => {
    expect(algorithmEntries.length).toBeGreaterThan(110);
    for (const [key, value] of algorithmEntries) {
      expect(value["zh-Hant"].trim().length, `${key} 缺少繁体中文`).toBeGreaterThan(0);
      expect(value.en.trim().length, `${key} 缺少英文`).toBeGreaterThan(0);
    }
  });

  it("繁体中文不含简体字", () => {
    const offenders = algorithmEntries.flatMap(([key, value]) => offendersOf(value, key));
    expect(offenders).toEqual([]);
  });

  it("占位符在中英文里成对出现", () => {
    const withPlaceholders = algorithmEntries.filter(([, value]) =>
      /\{\w+\}/.test(value["zh-Hant"] + value.en),
    );
    expect(withPlaceholders.length).toBeGreaterThan(5);

    for (const [key, value] of withPlaceholders) {
      const zhPlaceholders = [...value["zh-Hant"].matchAll(/\{(\w+)\}/g)].map(
        (match) => match[1],
      );
      const enPlaceholders = [...value.en.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      expect(new Set(zhPlaceholders), `${key} 中英文占位符不一致`).toEqual(
        new Set(enPlaceholders),
      );
    }
  });

  it("formatAlgorithmText 会同时填充中英文", () => {
    expect(formatAlgorithmText("controls.current", { values: "5, 3, 8" })).toEqual({
      "zh-Hant": "目前數列：5, 3, 8",
      en: "Current list: 5, 3, 8",
    });
  });

  it("每个算法的练习问题与参考答案都是双语，且不含简体字", () => {
    const practiceEntries = Object.entries(practiceByAlgorithm);
    expect(practiceEntries).toHaveLength(7);
    for (const [algorithm, practice] of practiceEntries) {
      for (const [label, pair] of [
        ["question", practice.question],
        ["answer", practice.answer],
      ] as const) {
        expect(pair["zh-Hant"].trim().length, `${algorithm}.${label} 缺少中文`).toBeGreaterThan(0);
        expect(pair.en.trim().length, `${algorithm}.${label} 缺少英文`).toBeGreaterThan(0);
        expect(offendersOf(pair, `${algorithm}.${label}`)).toEqual([]);
      }
    }

    const auxEntries = Object.entries(auxTitles);
    expect(auxEntries).toHaveLength(6);
    for (const [key, pair] of auxEntries) {
      expect(offendersOf(pair, `auxTitles.${key}`)).toEqual([]);
    }
  });
});
