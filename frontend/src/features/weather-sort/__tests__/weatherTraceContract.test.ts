import { afterEach, describe, expect, it, vi } from "vitest";

import { traceFixture } from "../../../player/__tests__/traceFixture";
import { parseTraceResponse, TraceProtocolError } from "../../../player/traceValidation";
import { fetchWeatherTrace, WEATHER_TRACE_ENDPOINT } from "../useWeatherTrace";
import { allSameTrace, negativeTrace, tmaxTrace } from "./weatherTraceFixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: status < 400,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const weatherTrace = tmaxTrace();

describe("天气轨迹协议扩展（向后兼容）", () => {
  it("阶段 2 的旧轨迹没有天气字段仍然通过", () => {
    const parsed = parseTraceResponse(traceFixture);
    expect(parsed.metric).toBeUndefined();
    expect(parsed.items[0].label).toBeUndefined();
    expect(parsed.top_hot).toBeUndefined();
  });

  it("天气轨迹的可选字段被保留（元数据、缺失日期、Top 5、single_scan）", () => {
    const parsed = parseTraceResponse(weatherTrace);
    expect(parsed.metric).toBe("tmax");
    expect(parsed.valid_days).toBe(6);
    expect(parsed.requested_days).toBe(8);
    expect(parsed.excluded_dates).toEqual([
      { date: "2026-09-07", reason: "missing" },
      { date: "2026-09-08", reason: "missing" },
    ]);
    expect(parsed.items[0]).toMatchObject({
      value_raw: "30.2",
      label: "2026-09-01",
      station: "HKO",
      station_name_zh_hant: "香港天文台",
      station_name_en: "Hong Kong Observatory",
      quality_flag: "C",
    });
    expect(parsed.top_hot).toHaveLength(5);
    expect(parsed.top_cold).toHaveLength(5);
    expect(parsed.before_order).toHaveLength(6);
    expect(parsed.after_order).toHaveLength(6);
    expect(parsed.single_scan).toEqual({ comparisons: 5, swaps: 0 });
  });

  it("负温与全相同温度的轨迹同样合法", () => {
    expect(parseTraceResponse(negativeTrace).items[0].value_raw).toBe("-3.5");
    expect(parseTraceResponse(allSameTrace).valid_days).toBe(4);
  });

  it("天气字段类型错误会被拒绝，不渲染半份轨迹", () => {
    const withBadMetric = { ...weatherTrace, metric: "rainfall" } as unknown;
    expect(() => parseTraceResponse(withBadMetric)).toThrow(TraceProtocolError);

    const withBadItem = JSON.parse(JSON.stringify(weatherTrace)) as unknown as {
      items: { value_raw: unknown }[];
    };
    withBadItem.items[0].value_raw = 30.2;
    expect(() => parseTraceResponse(withBadItem)).toThrow(TraceProtocolError);

    const withBadExcluded = JSON.parse(JSON.stringify(weatherTrace)) as unknown as {
      excluded_dates: { date: string; reason?: string }[];
    };
    delete withBadExcluded.excluded_dates[0].reason;
    expect(() => parseTraceResponse(withBadExcluded)).toThrow(TraceProtocolError);

    const withDanglingOrder = {
      ...weatherTrace,
      before_order: ["it-does-not-exist"],
    } as unknown;
    expect(() => parseTraceResponse(withDanglingOrder)).toThrow(TraceProtocolError);

    const withBadScan = {
      ...weatherTrace,
      single_scan: { comparisons: 5 },
    } as unknown;
    expect(() => parseTraceResponse(withBadScan)).toThrow(TraceProtocolError);
  });
});

describe("天气轨迹请求", () => {
  it("POST 到 weather-trace，请求体严格使用 station/metric/start/end/direction/options", async () => {
    const fetchMock = stubFetch(weatherTrace);

    const trace = await fetchWeatherTrace({
      station: "HKO",
      metric: "tmax",
      start: "2026-09-01",
      end: "2026-09-08",
      direction: "asc",
      earlyExit: true,
    });

    expect(trace.metric).toBe("tmax");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`/api${WEATHER_TRACE_ENDPOINT}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      station: "HKO",
      metric: "tmax",
      start: "2026-09-01",
      end: "2026-09-08",
      direction: "asc",
      options: { early_exit: true },
    });
  });

  it("不合契约的响应会抛错，由界面显示错误而不是猜数据", async () => {
    stubFetch({ protocol_version: 1, algorithm: "bubble" }, 200);
    await expect(
      fetchWeatherTrace({
        station: "HKO",
        metric: "tmin",
        start: "2026-09-01",
        end: "2026-09-08",
        direction: "asc",
        earlyExit: false,
      }),
    ).rejects.toBeInstanceOf(TraceProtocolError);
  });
});
