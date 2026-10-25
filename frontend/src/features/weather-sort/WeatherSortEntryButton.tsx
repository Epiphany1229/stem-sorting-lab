/**
 * /weather 顶部入口：把当前测站与指标带进 /weather-sort。
 * 日期窗口由 /weather-sort 使用后端默认的「最近 30 天」，因此不再携带 start/end。
 */
import { Link } from "react-router-dom";

import { BilingualText } from "../../i18n/BilingualText";
import type { WeatherMetric } from "../../player/types";

export interface WeatherSortEntryButtonProps {
  readonly station: string | undefined;
  readonly metric: WeatherMetric;
}

export function buildWeatherSortHref({
  station,
  metric,
}: WeatherSortEntryButtonProps): string {
  const search = new URLSearchParams();
  if (station) {
    search.set("station", station);
  }
  search.set("metric", metric);
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
