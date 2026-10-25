/**
 * 可选的真实后端契约冒烟测试（默认跳过）。
 *
 * 用途：排查「後端回應的格式不符合介面契約」这类运行时问题——用**真实**响应
 * 跑一遍前端校验器，比只读后端代码更快定位。
 *
 * 运行方式（需本地后端已启动）：
 *   $env:LIVE_BASE="http://127.0.0.1:8000"; pnpm test:run src/features/weather/__tests__/liveContract.test.ts
 *
 * 不设置 LIVE_BASE 时整组用例跳过，因此不会让常规测试依赖网络。
 * 历史案例：阶段 4 的 RYES rainfall 指标曾泄漏到 /stations，导致整页契约校验失败；
 * 该用例会在后端回归时立即暴露同类问题。
 */

import { describe, expect, it } from "vitest";

import {
  parseCoverageResponse,
  parseDailyResponse,
  parseSourcesResponse,
  parseStationsEnvelope,
  parseSummaryResponse,
} from "../validation";

// 仅本测试读取环境变量；项目未引入 @types/node，这里做最小声明。
declare const process: { env: Record<string, string | undefined> };

const BASE = process.env.LIVE_BASE;
const liveIt = BASE ? it : it.skip;

async function get(path: string): Promise<unknown> {
  if (!BASE) {
    throw new Error("LIVE_BASE 未设置");
  }
  const response = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path} -> 非 JSON（status ${response.status}）：${text.slice(0, 120)}`);
  }
}

describe("真实后端契约（可选，LIVE_BASE 生效时运行）", () => {
  liveIt("stations 可被前端校验", async () => {
    const envelope = parseStationsEnvelope(await get("/api/weather/stations"));
    expect(envelope.stations).toHaveLength(39);
    for (const station of envelope.stations) {
      for (const metric of station.metrics) {
        expect(["tmax", "tmin", "tmean"]).toContain(metric);
      }
    }
  });

  liveIt("stations(demo) 可被前端校验且带 notice", async () => {
    const envelope = parseStationsEnvelope(await get("/api/weather/stations?mode=demo"));
    expect(envelope.mode).toBe("demo");
    expect(envelope.notice).toBeTruthy();
  });

  liveIt("coverage 可被前端校验", async () => {
    const envelope = parseCoverageResponse(
      await get("/api/weather/coverage?stations=HKO&metrics=tmax,tmin"),
    );
    expect(envelope.coverage.days_with_data).toBeGreaterThanOrEqual(0);
  });

  liveIt("daily 可被前端校验（含精度策略）", async () => {
    const envelope = parseDailyResponse(await get("/api/weather/daily?stations=HKO&metrics=tmax,tmin"));
    expect(envelope.precision_policy).toBe("raw_string");
  });

  liveIt("summary 可被前端校验（含阈值说明）", async () => {
    const envelope = parseSummaryResponse(
      await get("/api/weather/summary?station=HKO&metric=tmax&bins=5"),
    );
    expect(envelope.threshold_note["zh-Hant"].length).toBeGreaterThan(0);
  });

  liveIt("sources 可被前端校验", async () => {
    const envelope = parseSourcesResponse(await get("/api/sources"));
    expect(Array.isArray(envelope.sources)).toBe(true);
  });
});
