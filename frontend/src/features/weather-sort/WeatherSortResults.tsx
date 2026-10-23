/**
 * 结果区：Top 5 最热/最冷、排序前后对比、比较/交换/轮次，以及冒泡 vs 单次扫描的 STEM 卡片。
 *
 * 所有数字都直接读自后端轨迹（top_hot / top_cold / before_order / after_order /
 * summary / single_scan），前端不重新排序、不写死任何统计值。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation } from "../../i18n/dictionary";
import type { BubbleTrace, WeatherMetric } from "../../player/types";
import { metricLabelEn, metricLabelZh, orderEntries, topEntries } from "./weatherSortHelpers";

export interface WeatherSortResultsProps {
  readonly trace: BubbleTrace;
  readonly metric: WeatherMetric;
}

/** 「日期｜溫度」的双语文本；温度保留后端原始字符串。 */
function itemText(date: string, valueRaw: string): { zh: string; en: string } {
  const valueZh = formatTranslation("weatherSort.results.temperature", { value: valueRaw });
  const valueEn = formatTranslation("weatherSort.results.temperature", { value: valueRaw });
  return {
    zh: formatTranslation("weatherSort.results.topItem", {
      date,
      value: valueZh["zh-Hant"],
    })["zh-Hant"],
    en: formatTranslation("weatherSort.results.topItem", { date, value: valueEn.en }).en,
  };
}

export function WeatherSortResults({ trace, metric }: WeatherSortResultsProps) {
  const zhMetric = metricLabelZh(metric);
  const enMetric = metricLabelEn(metric);
  const summary = trace.summary;
  const summaryText = formatTranslation("weatherSort.results.summary", {
    comparisons: summary.comparisons,
    swaps: summary.swaps,
    passes: summary.passes,
  });
  const hot = topEntries(trace.top_hot);
  const cold = topEntries(trace.top_cold);
  const before = orderEntries(trace, trace.before_order);
  const after = orderEntries(trace, trace.after_order);
  const scan = trace.single_scan;
  const headingId = `weather-sort-results-${metric}`;

  const bubbleText = formatTranslation("weatherSort.results.stemBubble", {
    comparisons: summary.comparisons,
    swaps: summary.swaps,
  });
  const scanText = scan
    ? formatTranslation("weatherSort.results.stemScan", {
        comparisons: scan.comparisons,
        swaps: scan.swaps,
      })
    : null;

  return (
    <section
      className="weather-panel weather-sort-results"
      aria-labelledby={headingId}
      data-testid={`results-${metric}`}
    >
      <h3 id={headingId}>
        <BilingualText as="span" size="subtitle" tkey="weatherSort.results.title" />
      </h3>
      <p className="weather-sort-results__metric">
        <BilingualText size="xs" zh={zhMetric} en={enMetric} />
      </p>
      <p data-testid="result-summary">
        <BilingualText size="xs" zh={summaryText["zh-Hant"]} en={summaryText.en} />
      </p>

      <div className="weather-sort-results__grid">
        <section aria-labelledby={`${headingId}-hot`}>
          <h4 id={`${headingId}-hot`}>
            <BilingualText as="span" size="sm" tkey="weatherSort.results.topHot" />
          </h4>
          {hot.length > 0 ? (
            <ol className="weather-sort-results__list" data-testid="top-hot">
              {hot.map((entry) => {
                const text = itemText(entry.date, entry.valueRaw);
                return (
                  <li key={`hot-${entry.date}`}>
                    <BilingualText size="xs" zh={text.zh} en={text.en} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>
              <BilingualText size="xs" tkey="weatherSort.results.topUnavailable" />
            </p>
          )}
        </section>

        <section aria-labelledby={`${headingId}-cold`}>
          <h4 id={`${headingId}-cold`}>
            <BilingualText as="span" size="sm" tkey="weatherSort.results.topCold" />
          </h4>
          {cold.length > 0 ? (
            <ol className="weather-sort-results__list" data-testid="top-cold">
              {cold.map((entry) => {
                const text = itemText(entry.date, entry.valueRaw);
                return (
                  <li key={`cold-${entry.date}`}>
                    <BilingualText size="xs" zh={text.zh} en={text.en} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>
              <BilingualText size="xs" tkey="weatherSort.results.topUnavailable" />
            </p>
          )}
        </section>
      </div>

      <div className="weather-sort-results__grid">
        <section aria-labelledby={`${headingId}-before`}>
          <h4 id={`${headingId}-before`}>
            <BilingualText as="span" size="sm" tkey="weatherSort.results.before" />
          </h4>
          {before.length > 0 ? (
            <ol className="weather-sort-results__order" data-testid="before-order">
              {before.map((entry) => {
                const text = itemText(entry.date, entry.valueRaw);
                return (
                  <li key={`before-${entry.itemId}`}>
                    <BilingualText size="xs" zh={text.zh} en={text.en} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>
              <BilingualText size="xs" tkey="weatherSort.results.orderUnavailable" />
            </p>
          )}
        </section>

        <section aria-labelledby={`${headingId}-after`}>
          <h4 id={`${headingId}-after`}>
            <BilingualText as="span" size="sm" tkey="weatherSort.results.after" />
          </h4>
          {after.length > 0 ? (
            <ol className="weather-sort-results__order" data-testid="after-order">
              {after.map((entry) => {
                const text = itemText(entry.date, entry.valueRaw);
                return (
                  <li key={`after-${entry.itemId}`}>
                    <BilingualText size="xs" zh={text.zh} en={text.en} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>
              <BilingualText size="xs" tkey="weatherSort.results.orderUnavailable" />
            </p>
          )}
        </section>
      </div>

      <div className="weather-sort-results__stem" data-testid="stem-card">
        <h4>
          <BilingualText as="span" size="sm" tkey="weatherSort.results.stemTitle" />
        </h4>
        {scan && scanText ? (
          <>
            <p data-testid="stem-bubble">
              <BilingualText size="xs" zh={bubbleText["zh-Hant"]} en={bubbleText.en} />
            </p>
            <p data-testid="stem-scan">
              <BilingualText size="xs" zh={scanText["zh-Hant"]} en={scanText.en} />
            </p>
            <p>
              <BilingualText size="xs" tkey="weatherSort.results.stemNote" />
            </p>
          </>
        ) : (
          <p>
            <BilingualText size="xs" tkey="weatherSort.results.stemUnavailable" />
          </p>
        )}
      </div>
    </section>
  );
}
