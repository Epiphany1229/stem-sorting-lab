import { describe, expect, it } from "vitest";

import { dictionary, type TranslationKey } from "../../../i18n/dictionary";

// 与阶段 2 相同的简体字黑名单思路：只列一定不会出现在繁体中文里的简体字。
const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

const weatherKeys = (Object.keys(dictionary) as TranslationKey[]).filter((key) =>
  key.startsWith("weather."),
);
const weatherEntries = weatherKeys.map((key) => [key, dictionary[key]] as const);

describe("阶段 3 天气双语文案", () => {
  it("新增 key 数量充足，且每个 key 的中文与英文都完整", () => {
    expect(weatherEntries.length).toBeGreaterThanOrEqual(120);

    for (const [key, value] of weatherEntries) {
      expect(value["zh-Hant"].trim().length, `${key} 缺少繁体中文`).toBeGreaterThan(0);
      expect(value.en.trim().length, `${key} 缺少英文`).toBeGreaterThan(0);
    }
  });

  it("天气文案的繁体中文不含简体字", () => {
    const offenders: string[] = [];

    for (const [key, value] of weatherEntries) {
      for (const char of SIMPLIFIED_ONLY_CHARS) {
        if (value["zh-Hant"].includes(char)) {
          offenders.push(`${key} 含有简体字「${char}」`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("占位符在中英文里成对出现", () => {
    for (const [key, value] of weatherEntries) {
      const zhPlaceholders = [...value["zh-Hant"].matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const enPlaceholders = [...value.en.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      expect(new Set(zhPlaceholders), `${key} 中英文占位符不一致`).toEqual(
        new Set(enPlaceholders),
      );
    }
  });

  it("固定 reason 集合、数据模式与图表红线文案齐备", () => {
    const requiredKeys = [
      "weather.reason.not_published",
      "weather.reason.na_no_history",
      "weather.reason.cooldown",
      "weather.reason.circuit_open",
      "weather.reason.budget_exhausted",
      "weather.reason.disabled",
      "weather.reason.no_cache",
      "weather.reason.station_out_of_range",
      "weather.reason.unknown",
      "weather.mode.official",
      "weather.mode.demo",
      "weather.mode.imported",
      "weather.chart.line.title",
      "weather.chart.bar.titleFallback",
      "weather.chart.bar.descFallback",
      "weather.chart.hist.title",
      "weather.chart.donut.desc",
      "weather.table.expand",
      "weather.table.collapse",
      "weather.coverage.sourceLine",
      "weather.stations.noMatch",
      "weather.table.empty",
    ] as const;

    for (const key of requiredKeys) {
      expect(dictionary[key], `缺少字典 key ${key}`).toBeDefined();
    }
  });

  it("图表红线写清楚：柱状图不冒充降雨、环形图只讲天数占比", () => {
    expect(dictionary["weather.chart.bar.descFallback"]["zh-Hant"]).toContain("這不是降雨資料");
    expect(dictionary["weather.chart.bar.descFallback"].en).toContain("not rainfall data");

    const donutDesc = dictionary["weather.chart.donut.desc"];
    expect(donutDesc["zh-Hant"]).toContain("天數佔比");
    expect(donutDesc["zh-Hant"]).toContain("不是氣溫數值佔比");
    expect(donutDesc.en).toContain("not a share of temperature values");
  });

  it("模式横幅文案明确提示非官方数据", () => {
    expect(dictionary["weather.banner.warning"]["zh-Hant"]).toContain("不是官方即時資料");
    expect(dictionary["weather.mode.demo"]["zh-Hant"]).toContain("示範資料");
  });
});
