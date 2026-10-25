/**
 * 测站多选：只列出在当前窗口内真的有资料的测站，只显示中英文站名。
 *
 * 数据不可用的测站（available_days === 0 或 metrics 为空）不显示为可选项；
 * 起始年、可用天数等信息不再展示，避免选择器变成小型仪表盘。
 * 支持名称/代号筛选，便于在 39 站里快速找到目标。
 */
import { useMemo, useState } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation, translate } from "../../i18n/dictionary";
import type { Station } from "./types";
import { weatherErrorKey } from "./api";

export interface StationPickerProps {
  readonly stations: readonly Station[] | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly onSelectAll: (ids: readonly string[]) => void;
  readonly onClear: () => void;
}

/** 过滤出真正可以选择的测站；页面自动选中也复用这条规则。 */
export function selectableStations(stations: readonly Station[] | undefined): readonly Station[] {
  return (stations ?? []).filter(
    (station) => station.available_days > 0 && station.metrics.length > 0,
  );
}

export function StationPicker({
  stations,
  loading,
  error,
  onRetry,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: StationPickerProps) {
  const [filter, setFilter] = useState("");
  const allStations = selectableStations(stations);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return allStations;
    }
    return allStations.filter(
      (station) =>
        station.id.toLowerCase().includes(needle) ||
        station.name_en.toLowerCase().includes(needle) ||
        station.name_zh_hant.includes(filter.trim()),
    );
  }, [allStations, filter]);

  const countText = formatTranslation("weather.stations.count", {
    selected: selected.length,
    total: allStations.length,
  });
  const filterLabel = translate("weather.stations.filter");

  return (
    <section className="weather-panel" aria-labelledby="weather-stations-heading" data-testid="station-picker">
      <h2 id="weather-stations-heading">
        <BilingualText as="span" size="subtitle" tkey="weather.stations.title" />
      </h2>

      {error ? (
        <div role="alert" className="weather-alert" data-testid="stations-error">
          <h3>
            <BilingualText as="span" size="sm" tkey="weather.error.title" />
          </h3>
          <p>
            <BilingualText tkey={weatherErrorKey(error)} />
          </p>
          <button type="button" className="btn btn--secondary mt-3" onClick={onRetry}>
            <BilingualText as="span" size="sm" tkey="weather.error.retry" />
          </button>
        </div>
      ) : loading ? (
        <p role="status" data-testid="stations-loading">
          <BilingualText tkey="weather.stations.loading" />
        </p>
      ) : allStations.length === 0 ? (
        <p className="weather-stations__empty">
          <BilingualText tkey="weather.stations.empty" />
        </p>
      ) : (
        <>
          <div className="weather-stations__toolbar">
            <label className="weather-stations__filter" htmlFor="weather-station-filter">
              <BilingualText as="span" size="xs" tkey="weather.stations.filter" />
            </label>
            <input
              id="weather-station-filter"
              type="search"
              className="weather-stations__filter-input"
              value={filter}
              aria-label={filterLabel["zh-Hant"]}
              onChange={(event) => setFilter(event.target.value)}
            />
            <span className="weather-stations__count" data-testid="stations-count">
              <BilingualText size="xs" zh={countText["zh-Hant"]} en={countText.en} />
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => onSelectAll(filtered.map((station) => station.id))}
            >
              <BilingualText as="span" size="sm" tkey="weather.stations.selectAll" />
            </button>
            <button type="button" className="btn btn--secondary" onClick={onClear}>
              <BilingualText as="span" size="sm" tkey="weather.stations.clear" />
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="weather-stations__empty" data-testid="stations-no-match">
              <BilingualText tkey="weather.stations.noMatch" />
            </p>
          ) : (
            <ul className="weather-stations__list">
              {filtered.map((station) => (
                <li key={station.id} className="weather-station">
                  <label className="weather-station__label">
                    <input
                      type="checkbox"
                      checked={selected.includes(station.id)}
                      onChange={() => onToggle(station.id)}
                    />
                    <span className="weather-station__text">
                      <BilingualText
                        as="span"
                        size="sm"
                        zh={station.name_zh_hant}
                        en={station.name_en}
                      />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="weather-stations__notice">
            <BilingualText size="xs" tkey="weather.stations.notice" />
          </p>
        </>
      )}
    </section>
  );
}
