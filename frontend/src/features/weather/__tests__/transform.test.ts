import { describe, expect, it } from "vitest";

import {
  buildCoverageTableRows,
  buildDailySeries,
  buildDonutRows,
  buildHistogramSeries,
  buildSourceRows,
  buildTmaxComparisonSeries,
  computeHistogramBins,
  enumerateDates,
  formatTemperature,
  formatTimestamp,
  isKnownReason,
  metricLabelEn,
  metricLabelZh,
  secondsUntil,
  weatherReasonKey,
} from "../transform";
import {
  buildDailyRows,
  coverageResponse,
  HKO,
  KP,
  SOURCES,
  STATIONS,
  summaryResponse,
  WINDOW,
} from "./fixtures";

const rows = buildDailyRows();

describe("日期与序列", () => {
  it("枚举窗口内每个自然日；非法范围返回空数组", () => {
    expect(enumerateDates("2026-09-01", "2026-09-05")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(enumerateDates("2026-09-05", "2026-09-01")).toEqual([]);
    expect(enumerateDates("bad", "2026-09-01")).toEqual([]);
  });

  it("逐日序列在缺口处补 null，并保留 value_raw", () => {
    const series = buildDailySeries(rows, [HKO], ["tmax"], WINDOW);
    expect(series).toHaveLength(1);
    expect(series[0].values).toEqual([30.1, 31.4, 32, null, 29.8]);
    expect(series[0].rawValues).toEqual(["30.1", "31.4", "32.0", null, "29.8"]);
    expect(series[0].labelZh).toBe("香港天文台 · 日最高溫");
    expect(series[0].labelEn).toBe("Hong Kong Observatory · Daily maximum temperature");
  });

  it("多站多指标按站 × 指标展开", () => {
    const series = buildDailySeries(rows, [HKO, KP], ["tmax", "tmin"], WINDOW);
    expect(series).toHaveLength(4);
    expect(new Set(series.map((item) => item.stationId))).toEqual(new Set(["HKO", "KP"]));
  });

  it("柱状图数据只取 tmax", () => {
    const series = buildTmaxComparisonSeries(rows, [HKO, KP], WINDOW);
    expect(series).toHaveLength(2);
    expect(series.every((item) => item.metric === "tmax")).toBe(true);
  });
});

describe("直方图", () => {
  it("按资料范围等分区间，计数之和等于样本量", () => {
    const series = buildHistogramSeries(rows, [HKO, KP], "tmax");
    const bins = computeHistogramBins(series, 4);
    expect(bins).not.toBeNull();
    expect(bins?.bins).toHaveLength(4);
    expect(bins?.total).toBe(8);
    const summed = bins?.bins.reduce((sum, bin) => sum + bin.total, 0);
    expect(summed).toBe(8);
    expect(bins?.bins[0].label).toContain("°C");
  });

  it("没有样本时返回 null；相同温度也能得到区间", () => {
    expect(computeHistogramBins([], 4)).toBeNull();
    const flat = computeHistogramBins(
      [
        {
          stationId: "HKO",
          stationNameZh: "香港天文台",
          stationNameEn: "Hong Kong Observatory",
          labelZh: "香港天文台",
          labelEn: "Hong Kong Observatory",
          values: [30, 30],
          rawValues: ["30", "30"],
        },
      ],
      3,
    );
    expect(flat?.total).toBe(2);
    expect(flat?.bins.reduce((sum, bin) => sum + bin.counts[0], 0)).toBe(2);
    expect(formatTemperature(30)).toBe("30.0");
  });
});

describe("环形图与表格数据", () => {
  it("环形图只按 valid_days 算天数占比", () => {
    const summary = summaryResponse();
    const donutRows = buildDonutRows(summary.bins, summary.valid_days);
    expect(donutRows.map((row) => row.shareText)).toEqual(["25.0%", "50.0%", "25.0%"]);
    const totalShare = donutRows.reduce((sum, row) => sum + row.share, 0);
    expect(totalShare).toBeCloseTo(1);
  });

  it("覆盖率表格保留站名、指标与缺口数字", () => {
    const coverage = coverageResponse();
    const tableRows = buildCoverageTableRows(coverage.coverage.per_station ?? [], STATIONS);
    expect(tableRows).toHaveLength(2);
    expect(tableRows[0]).toMatchObject({
      stationId: "HKO",
      stationNameZh: "香港天文台",
      daysWithData: 4,
      missingCount: 1,
      incompleteCount: 0,
    });
    expect(tableRows[1].incompleteCount).toBe(1);
  });

  it("来源表格使用固定香港时区时间", () => {
    const sourceRows = buildSourceRows(SOURCES);
    expect(sourceRows[0].fetchedAt).toBe("2026-10-23 20:00 HKT");
  });
});

describe("原因、时间与指标文案", () => {
  it("八个固定 reason 都有专门的双语说明，未知 reason 有兜底", () => {
    expect(weatherReasonKey("not_published")).toBe("weather.reason.not_published");
    expect(weatherReasonKey("na_no_history")).toBe("weather.reason.na_no_history");
    expect(weatherReasonKey("cooldown")).toBe("weather.reason.cooldown");
    expect(weatherReasonKey("circuit_open")).toBe("weather.reason.circuit_open");
    expect(weatherReasonKey("budget_exhausted")).toBe("weather.reason.budget_exhausted");
    expect(weatherReasonKey("disabled")).toBe("weather.reason.disabled");
    expect(weatherReasonKey("no_cache")).toBe("weather.reason.no_cache");
    expect(weatherReasonKey("station_out_of_range")).toBe(
      "weather.reason.station_out_of_range",
    );
    expect(weatherReasonKey("future_reason")).toBe("weather.reason.unknown");
    expect(isKnownReason("future_reason")).toBe(false);
    expect(isKnownReason("no_cache")).toBe(true);
  });

  it("时间格式化固定使用 HKT，冷却秒数不为负", () => {
    expect(formatTimestamp("2026-10-23T12:00:00Z")).toBe("2026-10-23 20:00 HKT");
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
    const now = Date.parse("2026-10-23T20:00:00+08:00");
    expect(secondsUntil("2026-10-23T20:05:00+08:00", now)).toBe(300);
    expect(secondsUntil("2026-10-23T19:00:00+08:00", now)).toBe(0);
    expect(secondsUntil(null, now)).toBe(0);
  });

  it("指标名来自字典", () => {
    expect(metricLabelZh("tmax")).toBe("日最高溫");
    expect(metricLabelEn("tmax")).toBe("Daily maximum temperature");
  });
});
