/**
 * 天气接口的手工 fixture（全部按 docs/weather-data-design.md §3.1 字段形状）。
 * 只用于测试；页面运行时不使用这些数据。
 */
import type {
  CoverageResponse,
  DailyResponse,
  DailyRow,
  ImportResponse,
  RefreshResponse,
  SourceInfo,
  Station,
  StationsEnvelope,
  SummaryResponse,
} from "../types";

export const HKO: Station = {
  id: "HKO",
  name_en: "Hong Kong Observatory",
  name_zh_hant: "香港天文台",
  start_year: 1884,
  available_days: 5,
  first_date: "2026-09-01",
  last_date: "2026-09-05",
  metrics: ["tmax", "tmin", "tmean"],
};

export const KP: Station = {
  id: "KP",
  name_en: "King's Park",
  name_zh_hant: "京士柏",
  start_year: 1992,
  available_days: 4,
  first_date: "2026-09-01",
  last_date: "2026-09-04",
  metrics: ["tmax", "tmin", "tmean"],
};

export const VP1: Station = {
  id: "VP1",
  name_en: "Victoria Peak",
  name_zh_hant: "山頂",
  start_year: 2009,
  available_days: 0,
  first_date: null,
  last_date: null,
  metrics: ["tmax", "tmin", "tmean"],
};

export const STATIONS: readonly Station[] = [HKO, KP, VP1];

export const SOURCES: readonly SourceInfo[] = [
  {
    dataset: "CLMMAXT",
    endpoint: "https://www.hko.gov.hk/cis/climatology/opendata_station_tmax.csv",
    fetched_at: "2026-10-23T20:00:00+08:00",
    last_modified: "2025-09-22T09:15:39Z",
    mode: "official",
  },
];

export const WINDOW = {
  start: "2026-09-01",
  end: "2026-09-05",
  anchor: "2026-09-05",
  requested_days: 5,
} as const;

/** 5 天窗口；HKO 的 tmax 在 09-04 缺一天，用来验证折线断点。 */
export function buildDailyRows(): DailyRow[] {
  const values: Record<string, Record<string, [string, number]>> = {
    HKO: {
      "2026-09-01": ["30.1", 30.1],
      "2026-09-02": ["31.4", 31.4],
      "2026-09-03": ["32.0", 32.0],
      // 2026-09-04 缺 tmax（缺口）
      "2026-09-05": ["29.8", 29.8],
    },
    KP: {
      "2026-09-01": ["29.2", 29.2],
      "2026-09-02": ["30.6", 30.6],
      "2026-09-03": ["31.1", 31.1],
      "2026-09-04": ["30.0", 30.0],
    },
  };

  const rows: DailyRow[] = [];
  for (const [stationId, byDate] of Object.entries(values)) {
    for (const [date, [raw, value]] of Object.entries(byDate)) {
      rows.push({
        obs_date: date,
        station_id: stationId,
        metric: "tmax",
        value_raw: raw,
        value,
        unit: "°C",
        quality_flag: "C",
      });
      rows.push({
        obs_date: date,
        station_id: stationId,
        metric: "tmin",
        value_raw: String(value - 5),
        value: value - 5,
        unit: "°C",
        quality_flag: "C",
      });
      rows.push({
        obs_date: date,
        station_id: stationId,
        metric: "tmean",
        value_raw: String(value - 2),
        value: value - 2,
        unit: "°C",
        quality_flag: "C",
      });
    }
  }
  return rows;
}

export function stationsEnvelope(overrides: Partial<StationsEnvelope> = {}): StationsEnvelope {
  return {
    mode: "official",
    notice: null,
    stations: STATIONS,
    ...overrides,
  };
}

export function coverageResponse(overrides: Partial<CoverageResponse> = {}): CoverageResponse {
  return {
    mode: "official",
    notice: null,
    window: WINDOW,
    coverage: {
      days_with_data: 4,
      days_missing: 1,
      last_available_date: "2026-09-05",
      per_station: [
        {
          station_id: "HKO",
          metric: "tmax",
          days_with_data: 4,
          first_date: "2026-09-01",
          last_date: "2026-09-05",
          missing_dates: ["2026-09-04"],
          incomplete_dates: [],
        },
        {
          station_id: "KP",
          metric: "tmax",
          days_with_data: 4,
          first_date: "2026-09-01",
          last_date: "2026-09-04",
          missing_dates: [],
          incomplete_dates: ["2026-09-03"],
        },
      ],
    },
    reason: null,
    sources: SOURCES,
    ...overrides,
  };
}

export function dailyResponse(overrides: Partial<DailyResponse> = {}): DailyResponse {
  return {
    mode: "official",
    notice: null,
    window: WINDOW,
    coverage: {
      days_with_data: 4,
      days_missing: 1,
      last_available_date: "2026-09-05",
    },
    reason: null,
    precision_policy: "raw_string",
    data: buildDailyRows(),
    sources: SOURCES,
    ...overrides,
  };
}

export function demoDailyResponse(): DailyResponse {
  return dailyResponse({
    mode: "demo",
    notice: "示範資料：官方 2026-09 月表快照，僅供教學展示。",
    sources: [{ ...SOURCES[0], dataset: "CLMMAXT-DEMO", mode: "demo" }],
  });
}

export function importedDailyResponse(): DailyResponse {
  return dailyResponse({
    mode: "imported",
    notice: "匯入資料：使用者上傳的官方 CSV。",
    sources: [{ ...SOURCES[0], dataset: "IMPORTED-CSV", mode: "imported" }],
  });
}

export function emptyOfficialDailyResponse(): DailyResponse {
  return dailyResponse({
    data: [],
    reason: "not_published",
    coverage: { days_with_data: 0, days_missing: 5, last_available_date: null },
  });
}

export function summaryResponse(overrides: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    mode: "official",
    notice: null,
    window: WINDOW,
    station_id: "HKO",
    metric: "tmax",
    bins: [
      { index: 0, lower: 29, upper: 30.2, label_zh_hant: "29–30.2°C", label_en: "29–30.2°C", days: 1 },
      { index: 1, lower: 30.2, upper: 31.4, label_zh_hant: "30.2–31.4°C", label_en: "30.2–31.4°C", days: 2 },
      { index: 2, lower: 31.4, upper: 32.6, label_zh_hant: "31.4–32.6°C", label_en: "31.4–32.6°C", days: 1 },
    ],
    valid_days: 4,
    missing_days: 1,
    threshold_note: {
      "zh-Hant": "區間由教學程式依資料範圍等分，非官方標準",
      en: "Bins are computed by the teaching app, not an official standard",
    },
    sources: SOURCES,
    ...overrides,
  };
}

export function refreshResponse(overrides: Partial<RefreshResponse> = {}): RefreshResponse {
  return {
    accepted: true,
    reason: null,
    next_allowed_at: "2026-10-23T20:05:00+08:00",
    remaining_budget: 494,
    requests_made: 2,
    rows_upserted: 120,
    message: null,
    ...overrides,
  };
}

export function importResponse(overrides: Partial<ImportResponse> = {}): ImportResponse {
  return {
    mode: "imported",
    accepted_rows: 12,
    skipped_rows: 2,
    errors: [
      { line: 17, reason: "unknown_station", detail: "ZZZ" },
      { line: 21, reason: "invalid_date", detail: "2026-13-01" },
    ],
    detected_format: "official_csv",
    ...overrides,
  };
}
