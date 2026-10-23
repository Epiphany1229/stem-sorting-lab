/**
 * 排序条件控件：测站、指标、方向、日期、提前结束、引导模式和并排比较。
 * 所有输入变化都会成为新的查询条件，从而让播放器回到 idle（见页面与 useTracePlayback）。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation, translate } from "../../i18n/dictionary";
import type { Direction, WeatherMetric } from "../../player/types";
import type { Station } from "../weather/types";
import { weatherErrorKey } from "../weather/api";
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
  readonly guidedMode: boolean;
  readonly onGuidedModeChange: (guidedMode: boolean) => void;
  readonly parallel: boolean;
  readonly onParallelChange: (parallel: boolean) => void;
  readonly start: string;
  readonly end: string;
  readonly onStartChange: (start: string) => void;
  readonly onEndChange: (end: string) => void;
  readonly dateInvalid: boolean;
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
  guidedMode,
  onGuidedModeChange,
  parallel,
  onParallelChange,
  start,
  end,
  onStartChange,
  onEndChange,
  dateInvalid,
}: WeatherSortControlsProps) {
  const stationList = stations ?? [];
  const startLabel = translate("weather.controls.startDate");
  const endLabel = translate("weather.controls.endDate");
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
                {`${item.name_zh_hant} / ${item.name_en} (${item.id})`}
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

        <fieldset className="weather-sort-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="weatherSort.controls.dateRange" />
          </legend>
          <div className="weather-sort-controls__dates">
            <div className="weather-sort-controls__field">
              <label htmlFor="weather-sort-start">
                <BilingualText as="span" size="xs" tkey="weather.controls.startDate" />
              </label>
              <input
                id="weather-sort-start"
                type="date"
                value={start}
                max={end || undefined}
                aria-label={startLabel["zh-Hant"]}
                aria-invalid={dateInvalid}
                onChange={(event) => onStartChange(event.target.value)}
              />
            </div>
            <div className="weather-sort-controls__field">
              <label htmlFor="weather-sort-end">
                <BilingualText as="span" size="xs" tkey="weather.controls.endDate" />
              </label>
              <input
                id="weather-sort-end"
                type="date"
                value={end}
                min={start || undefined}
                aria-label={endLabel["zh-Hant"]}
                aria-invalid={dateInvalid}
                onChange={(event) => onEndChange(event.target.value)}
              />
            </div>
          </div>
          {dateInvalid ? (
            <p role="alert" className="weather-controls__error" data-testid="sort-date-error">
              <BilingualText size="xs" tkey="weather.controls.dateInvalid" />
            </p>
          ) : null}
          <p className="weather-controls__hint">
            <BilingualText size="xs" tkey="weatherSort.rangeHint" />
          </p>
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

          <fieldset className="weather-sort-controls__group">
            <legend>
              <BilingualText as="span" size="sm" tkey="lab.mode.title" />
            </legend>
            <div className="weather-sort-controls__options">
              <label className="weather-sort-controls__checkbox">
                <input
                  type="radio"
                  name="weather-sort-mode"
                  value="guided"
                  checked={guidedMode}
                  onChange={() => onGuidedModeChange(true)}
                />
                <BilingualText as="span" size="sm" tkey="lab.mode.guided" />
              </label>
              <label className="weather-sort-controls__checkbox">
                <input
                  type="radio"
                  name="weather-sort-mode"
                  value="free"
                  checked={!guidedMode}
                  onChange={() => onGuidedModeChange(false)}
                />
                <BilingualText as="span" size="sm" tkey="lab.mode.free" />
              </label>
            </div>
          </fieldset>

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
