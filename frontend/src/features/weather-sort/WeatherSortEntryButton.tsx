/**
 * /weather 顶部入口：把当前测站、指标与真实数据窗口带进 /weather-sort。
 * 只拼查询参数，不携带或伪造任何温度数据。
 */
import { Link } from "react-router-dom";

import { BilingualText } from "../../i18n/BilingualText";
import type { WeatherMetric } from "../../player/types";

export interface WeatherSortEntryButtonProps {
  readonly station: string | undefined;
  readonly metric: WeatherMetric;
  readonly start: string | undefined;
  readonly end: string | undefined;
}

export function buildWeatherSortHref({
  station,
  metric,
  start,
  end,
}: WeatherSortEntryButtonProps): string {
  const search = new URLSearchParams();
  if (station) {
    search.set("station", station);
  }
  search.set("metric", metric);
  if (start) {
    search.set("start", start);
  }
  if (end) {
    search.set("end", end);
  }
  return `/weather-sort?${search.toString()}`;
}

export function WeatherSortEntryButton(props: WeatherSortEntryButtonProps) {
  return (
    <section className="weather-sort-entry" data-testid="weather-sort-entry">
      <Link className="btn btn--primary" to={buildWeatherSortHref(props)}>
        <BilingualText as="span" size="sm" tone="onPrimary" tkey="weatherSort.entry" />
      </Link>
      <p className="weather-sort-entry__hint">
        <BilingualText size="xs" tkey="weatherSort.entryHint" />
      </p>
    </section>
  );
}
