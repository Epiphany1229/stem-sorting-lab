/**
 * 跨栈契约回归（真实后端响应，非手写 fixture）。
 *
 * 夹具生成命令（仓库根目录，需后端在 8010 运行且 app.db 已有真实数据）：
 *   .venv\Scripts\python.exe .tools\reference\capture_weather_fixtures.py
 *
 * 目的：后端一旦改动字段名/语义，这里会立即失败；同时验证
 * demo / imported 两种模式必须携带 notice（前端拒绝静默隐藏横幅）。
 */

import { describe, expect, it } from "vitest";

import {
  parseCoverageResponse,
  parseDailyResponse,
  parseSourcesResponse,
  parseStationsEnvelope,
  parseSummaryResponse,
} from "../validation";
import { buildCoverageTableRows, buildDonutRows } from "../transform";
import coverageFixture from "./fixtures/real/coverage.json";
import dailyFixture from "./fixtures/real/daily.json";
import demoFixture from "./fixtures/real/daily_demo.json";
import importedFixture from "./fixtures/real/daily_imported.json";
import sourcesFixture from "./fixtures/real/sources.json";
import stationsFixture from "./fixtures/real/stations.json";
import summaryFixture from "./fixtures/real/summary.json";

describe("真实后端响应可以完整通过前端校验", () => {
  it("stations：39 站、中文名与起始年正确", () => {
    const env = parseStationsEnvelope(stationsFixture);
    expect(env.mode).toBe("official");
    expect(env.stations).toHaveLength(39);
    const hko = env.stations.find((s) => s.id === "HKO");
    expect(hko).toBeDefined();
    expect(hko?.name_zh_hant).toBe("香港天文台");
    expect(hko?.name_en).toBe("Hong Kong Observatory");
    expect(hko?.start_year).toBe(1884);
  });

  it("coverage：锚点 2026-09-30、30 天完整、无缺口", () => {
    const env = parseCoverageResponse(coverageFixture);
    expect(env.mode).toBe("official");
    expect(env.window.anchor).toBe("2026-09-30");
    expect(env.window.start).toBe("2026-09-01");
    expect(env.window.end).toBe("2026-09-30");
    expect(env.coverage.days_with_data).toBe(30);
    expect(env.coverage.days_missing).toBe(0);
    const perStation = env.coverage.per_station ?? [];
    expect(perStation.length).toBeGreaterThan(0);
    const rows = buildCoverageTableRows(perStation, [
      {
        id: "HKO",
        name_en: "Hong Kong Observatory",
        name_zh_hant: "香港天文台",
        start_year: 1884,
        available_days: 30,
        first_date: "2026-09-01",
        last_date: "2026-09-30",
        metrics: ["tmax", "tmin"],
      },
    ]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.daysWithData).toBe(30);
  });

  it("daily：60 行、原始字符串保精度、无 null 混入", () => {
    const env = parseDailyResponse(dailyFixture);
    expect(env.mode).toBe("official");
    expect(env.precision_policy).toBe("raw_string");
    expect(env.data).toHaveLength(60);
    for (const row of env.data) {
      expect(typeof row.value_raw).toBe("string");
      expect(row.value_raw).toMatch(/^-?\d+(\.\d)?$/);
      expect(row.obs_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["tmax", "tmin"]).toContain(row.metric);
    }
    const hottest = env.data.find((r) => r.obs_date === "2026-09-30" && r.metric === "tmax");
    expect(hottest?.value_raw).toBe("34.2");
  });

  it("summary：4 个区间、有效 30 天、阈值说明为中英双语且注明非官方", () => {
    const env = parseSummaryResponse(summaryFixture);
    expect(env.bins).toHaveLength(4);
    expect(env.valid_days).toBe(30);
    expect(env.missing_days).toBe(0);
    const totalDays = env.bins.reduce((sum, bin) => sum + bin.days, 0);
    expect(totalDays).toBe(env.valid_days);
    expect(env.threshold_note["zh-Hant"]).toContain("非官方");
    expect(env.threshold_note.en.toLowerCase()).toContain("not an official");
    const donut = buildDonutRows(env.bins, env.valid_days);
    expect(donut).toHaveLength(4);
    const shareSum = donut.reduce((sum, row) => sum + row.share, 0);
    expect(shareSum).toBeCloseTo(1, 5);
  });

  it("sources：包含 CLMMAXT/CLMMINT 的真实端点与抓取时间", () => {
    const env = parseSourcesResponse(sourcesFixture);
    const datasets = env.sources.map((s) => s.dataset);
    expect(datasets).toContain("CLMMAXT");
    expect(datasets).toContain("CLMMINT");
    for (const source of env.sources) {
      expect(source.endpoint).toContain("data.weather.gov.hk");
      expect(source.fetched_at).toBeTruthy();
    }
  });

  it("demo / imported 模式必须带 notice（否则前端拒绝渲染横幅）", () => {
    const demo = parseDailyResponse(demoFixture);
    expect(demo.mode).toBe("demo");
    expect(demo.notice).toBeTruthy();
    expect(demo.data.length).toBeGreaterThan(0);

    const imported = parseDailyResponse(importedFixture);
    expect(imported.mode).toBe("imported");
    expect(imported.notice).toBeTruthy();
  });
});
