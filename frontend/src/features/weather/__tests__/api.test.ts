import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../api/client";
import {
  buildExportCsvUrl,
  buildWeatherQueryString,
  classifyWeatherError,
  fetchDaily,
  fetchRefresh,
  fetchStations,
  importCsv,
  weatherErrorKey,
} from "../api";import { WeatherProtocolError } from "../validation";
import {
  dailyResponse,
  demoDailyResponse,
  importResponse,
  refreshResponse,
  SOURCES,
  stationsEnvelope,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; payload?: unknown }) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("天气请求 URL", () => {
  it("official 模式省略 mode；demo/imported 显式追加", () => {
    expect(
      buildWeatherQueryString({
        start: "2026-09-01",
        end: "2026-09-30",
        stations: ["HKO", "KP"],
        metrics: ["tmax", "tmin"],
        mode: "official",
      }),
    ).toBe("start=2026-09-01&end=2026-09-30&stations=HKO%2CKP&metrics=tmax%2Ctmin");

    expect(
      buildWeatherQueryString({ start: "2026-09-01", mode: "demo" }),
    ).toBe("start=2026-09-01&mode=demo");
    expect(buildWeatherQueryString({ mode: "imported" })).toBe("mode=imported");
  });

  it("导出 CSV 返回可直接放进 <a href> 的本项目地址", () => {
    expect(
      buildExportCsvUrl({ stations: ["HKO"], metrics: ["tmax"], mode: "demo" }),
    ).toBe("/api/weather/export.csv?stations=HKO&metrics=tmax&mode=demo");
  });
});

describe("天气请求与契约校验", () => {
  it("daily 请求带齐查询参数，并保留 value_raw", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, payload: dailyResponse() });

    const result = await fetchDaily({
      start: "2026-09-01",
      end: "2026-09-05",
      stations: ["HKO", "KP"],
      metrics: ["tmax", "tmean"],
      mode: "official",
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/weather/daily?start=2026-09-01&end=2026-09-05&stations=HKO%2CKP&metrics=tmax%2Ctmean",
    );
    expect(result.data[0].value_raw).toBe("30.1");
    expect(result.precision_policy).toBe("raw_string");
  });

  it("stations 在 demo 模式下追加 mode=demo", async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      payload: stationsEnvelope({ mode: "demo", notice: "示範資料" }),
    });

    const result = await fetchStations("demo");

    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/weather/stations?mode=demo");
    expect(result.stations).toHaveLength(3);
  });

  it("非契约字段形状会抛出 WeatherProtocolError，而不是渲染半份数据", async () => {
    stubFetch({ ok: true, status: 200, payload: { mode: "official", notice: null } });
    await expect(fetchDaily({ mode: "official" })).rejects.toBeInstanceOf(WeatherProtocolError);

    stubFetch({ ok: true, status: 200, payload: demoDailyResponse() });
    // 合法 demo 数据可以解析。
    await expect(fetchDaily({ mode: "demo" })).resolves.toMatchObject({ mode: "demo" });
  });

  it("demo 模式缺少 notice 视为契约违规", async () => {
    stubFetch({
      ok: true,
      status: 200,
      payload: { ...demoDailyResponse(), notice: null },
    });
    await expect(fetchDaily({ mode: "demo" })).rejects.toBeInstanceOf(WeatherProtocolError);
  });

  it("refresh 走 POST，import 使用 multipart 且不手写 Content-Type", async () => {
    const refreshFetch = stubFetch({ ok: true, status: 200, payload: refreshResponse() });
    const refresh = await fetchRefresh();
    expect(refresh.accepted).toBe(true);
    expect(String(refreshFetch.mock.calls[0][0])).toBe("/api/weather/refresh");
    expect((refreshFetch.mock.calls[0][1] as RequestInit).method).toBe("POST");

    const importFetch = stubFetch({ ok: true, status: 200, payload: importResponse() });
    const file = new File(["a,b"], "demo.csv", { type: "text/csv" });
    const imported = await importCsv(file);
    expect(imported.accepted_rows).toBe(12);
    const [url, init] = importFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/weather/import");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ Accept: "application/json" });
  });
});

describe("错误分类", () => {
  it("按 network / 422 / 5xx / 契约违规分类", () => {
    expect(classifyWeatherError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyWeatherError(new ApiError("bad", 422))).toBe("invalidInput");
    expect(classifyWeatherError(new ApiError("boom", 500))).toBe("server");
    expect(classifyWeatherError(new WeatherProtocolError("bad shape"))).toBe(
      "invalidResponse",
    );
  });

  it("错误分类映射到双语字典 key", () => {
    expect(weatherErrorKey(new TypeError("x"))).toBe("weather.error.network");
    expect(weatherErrorKey(new ApiError("x", 422))).toBe("weather.error.invalidInput");
    expect(weatherErrorKey(new ApiError("x", 503))).toBe("weather.error.server");
    expect(weatherErrorKey(new WeatherProtocolError("x"))).toBe(
      "weather.error.invalidResponse",
    );
  });

  it("fixture 的来源信息字段形状完整", () => {
    expect(SOURCES[0].dataset).toBe("CLMMAXT");
  });
});
