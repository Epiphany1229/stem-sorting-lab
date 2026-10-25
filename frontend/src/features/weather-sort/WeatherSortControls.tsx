/**
 * 排序条件控件：测站、指标、方向、提前结束与并排比较。
 * 阶段 4.8 移除起止日期选择器：固定使用后端默认的「最近 30 天」窗口。
 * 所有输入变化都会成为新的查询条件，从而让播放器回到 idle（见页面与 useTracePlayback）。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation, translate } from "../../i18n/dictionary";
import type { Direction, WeatherMetric } from "../../player/types";
import type { Station } from "../weather/types";
import { weatherErrorKey } from "../weather/api";
import { selectableStations } from "../weather/StationPicker";
import { metricLabelEn, metricLabelZh, WEATHER_METRICS } from "./weatherSortHelpers";

export interface WeatherSortControlsProps {
  readonly stations: readonly Station[] | undefined;
  readonly stationsLoading: boolean;
  readonly stationsError: unknown;
  readonly station: string;
  readonly onStationChange: (station: string) => void;
  readonly metric: WeatherMetric;
  readonly onMetricChange: (metric: WeatherMetric) => void;
  readonly direction: Direction;
  readonly onDirectionChange: (direction: Direction) => void;
  readonly earlyExit: boolean;
  readonly onEarlyExitChange: (earlyExit: boolean) => void;
  readonly parallel: boolean;
  readonly onParallelChange: (parallel: boolean) => void;
}

/** 只列出在当前窗口有资料的测站（与 /weather 的筛选规则一致）。 */
function selectable(stations: readonly Station[] | undefined): readonly Station[] {
  return selectableStations(stations);
}

export function WeatherSortControls({
  stations,
  stationsLoading,
  stationsError,
  station,
  onStationChange,
  metric,
  onMetricChange,
  direction,
  onDirectionChange,
  earlyExit,
  onEarlyExitChange,
  parallel,
  onParallelChange,
}: WeatherSortControlsProps) {
  const stationList = selectable(stations);
  const stationLabel = translate("weatherSort.controls.station");
  const placeholder = formatTranslation("weatherSort.controls.stationPlaceholder", {});

  return (
    <section
      className="weather-panel"
      aria-labelledby="weather-sort-controls-heading"
      data-testid="weather-sort-controls"
    >
      <h2 id="weather-sort-controls-heading">
        <BilingualText as="span" size="subtitle" tkey="weatherSort.controls.title" />
      </h2>
      <p className="weather-controls__hint" data-testid="weather-sort-fixed-window">
        <BilingualText size="xs" tkey="weatherSort.controls.fixedWindow" />
      </p>

      <div className="weather-sort-controls">
        <div className="weather-sort-controls__field">
          <label htmlFor="weather-sort-station">
            <BilingualText as="span" size="sm" tkey="weatherSort.controls.station" />
          </label>
          <select
            id="weather-sort-station"
            value={station}
            aria-label={stationLabel["zh-Hant"]}
            onChange={(event) => onStationChange(event.target.value)}
            disabled={stationsLoading || stationList.length === 0}
          >
            <option value="">{`${placeholder["zh-Hant"]} / ${placeholder.en}`}</option>
            {stationList.map((item) => (
              <option key={item.id} value={item.id}>
                {`${item.name_zh_hant} / ${item.name_en}`}
              </option>
            ))}
          </select>
          {stationsLoading ? (
            <p role="status">
              <BilingualText size="xs" tkey="weather.stations.loading" />
            </p>
          ) : null}
          {stationsError ? (
            <p role="alert" className="weather-controls__error">
              <BilingualText size="xs" tkey={weatherErrorKey(stationsError)} />
            </p>
          ) : null}
        </div>

        <fieldset className="weather-sort-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="weatherSort.controls.metric" />
          </legend>
          <div className="weather-sort-controls__options">
            {WEATHER_METRICS.map((option) => (
              <label key={option} className="weather-sort-controls__checkbox">
                <input
                  type="radio"
                  name="weather-sort-metric"
                  value={option}
                  checked={metric === option}
                  onChange={() => onMetricChange(option)}
                />
                <BilingualText
                  as="span"
                  size="sm"
                  zh={metricLabelZh(option)}
                  en={metricLabelEn(option)}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="weather-sort-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="lab.direction.title" />
          </legend>
          <div className="weather-sort-controls__options">
            {(["asc", "desc"] as const).map((option) => (
              <label key={option} className="weather-sort-controls__checkbox">
                <input
                  type="radio"
                  name="weather-sort-direction"
                  value={option}
                  checked={direction === option}
                  onChange={() => onDirectionChange(option)}
                />
                <BilingualText
                  as="span"
                  size="sm"
                  tkey={option === "asc" ? "lab.direction.asc" : "lab.direction.desc"}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="weather-sort-controls__toggles">
          <label className="weather-sort-controls__checkbox">
            <input
              type="checkbox"
              checked={earlyExit}
              onChange={(event) => onEarlyExitChange(event.target.checked)}
            />
            <BilingualText as="span" size="sm" tkey="lab.earlyExit" />
          </label>
          <p className="weather-controls__hint">
            <BilingualText size="xs" tkey="lab.earlyExit.hint" />
          </p>

          <label className="weather-sort-controls__checkbox">
            <input
              type="checkbox"
              checked={parallel}
              aria-describedby="weather-sort-parallel-hint"
              onChange={(event) => onParallelChange(event.target.checked)}
            />
            <BilingualText as="span" size="sm" tkey="weatherSort.controls.parallel" />
          </label>
          <p id="weather-sort-parallel-hint" className="weather-controls__hint">
            <BilingualText size="xs" tkey="weatherSort.controls.parallelHint" />
          </p>
        </div>
      </div>

      <p className="weather-controls__hint">
        <BilingualText size="xs" tkey="weatherSort.controls.resetHint" />
      </p>
    </section>
  );
}
