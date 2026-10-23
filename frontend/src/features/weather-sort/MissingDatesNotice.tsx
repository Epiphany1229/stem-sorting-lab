/**
 * 顶部缺失提示：按指标分别显示有效天数与被排除的缺失日期。
 *
 * tmax 与 tmin 各自由后端统计（valid_days / requested_days / excluded_dates），
 * 两个指标互不串数据；这里只展示，不自行计算或过滤。
 */
import type { ReactNode } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation } from "../../i18n/dictionary";
import type { BubbleTrace, WeatherMetric } from "../../player/types";
import { traceErrorKey } from "./useWeatherTrace";
import { metricLabelEn, metricLabelZh } from "./weatherSortHelpers";

export interface MetricTraceState {
  readonly metric: WeatherMetric;
  readonly trace: BubbleTrace | undefined;
  readonly loading: boolean;
  readonly error: unknown;
}

export interface MissingDatesNoticeProps {
  readonly states: readonly MetricTraceState[];
}

function MissingRow({ state }: { state: MetricTraceState }) {
  const zhLabel = metricLabelZh(state.metric);
  const enLabel = metricLabelEn(state.metric);
  let content: ReactNode = null;

  if (state.loading) {
    const zhText = formatTranslation("weatherSort.missing.loading", { metric: zhLabel });
    const enText = formatTranslation("weatherSort.missing.loading", { metric: enLabel });
    content = (
      <p role="status">
        <BilingualText size="xs" zh={zhText["zh-Hant"]} en={enText.en} />
      </p>
    );
  } else if (state.error) {
    const zhText = formatTranslation("weatherSort.missing.error", { metric: zhLabel });
    const enText = formatTranslation("weatherSort.missing.error", { metric: enLabel });
    content = (
      <div role="alert" className="weather-alert" data-testid={`missing-${state.metric}-error`}>
        <p>
          <BilingualText size="xs" zh={zhText["zh-Hant"]} en={enText.en} />
        </p>
        <p>
          <BilingualText size="xs" tkey={traceErrorKey(state.error)} />
        </p>
      </div>
    );
  } else if (state.trace) {
    const trace = state.trace;
    const valid = trace.valid_days ?? trace.items.length;
    const excludedDates = (trace.excluded_dates ?? []).map((entry) => entry.date);
    const requested = trace.requested_days ?? valid + excludedDates.length;

    if (excludedDates.length > 0) {
      const zhText = formatTranslation("weatherSort.missing.line", {
        metric: zhLabel,
        valid,
        requested,
        dates: excludedDates.join("、"),
      });
      const enText = formatTranslation("weatherSort.missing.line", {
        metric: enLabel,
        valid,
        requested,
        dates: excludedDates.join(", "),
      });
      content = (
        <p data-testid={`missing-${state.metric}`}>
          <BilingualText size="xs" zh={zhText["zh-Hant"]} en={enText.en} />
        </p>
      );
    } else {
      const zhText = formatTranslation("weatherSort.missing.none", {
        metric: zhLabel,
        valid,
        requested,
      });
      const enText = formatTranslation("weatherSort.missing.none", {
        metric: enLabel,
        valid,
        requested,
      });
      content = (
        <p data-testid={`missing-${state.metric}`}>
          <BilingualText size="xs" zh={zhText["zh-Hant"]} en={enText.en} />
        </p>
      );
    }
  }

  return (
    <li className="weather-sort-missing__row" data-metric={state.metric}>
      <h3>
        <BilingualText as="span" size="sm" zh={zhLabel} en={enLabel} />
      </h3>
      {content}
    </li>
  );
}

export function MissingDatesNotice({ states }: MissingDatesNoticeProps) {
  return (
    <section
      className="weather-panel weather-sort-missing"
      aria-labelledby="weather-sort-missing-heading"
      data-testid="missing-dates"
    >
      <h2 id="weather-sort-missing-heading">
        <BilingualText as="span" size="subtitle" tkey="weatherSort.missing.title" />
      </h2>
      <ul className="weather-sort-missing__list">
        {states.map((state) => (
          <MissingRow key={state.metric} state={state} />
        ))}
      </ul>
    </section>
  );
}
