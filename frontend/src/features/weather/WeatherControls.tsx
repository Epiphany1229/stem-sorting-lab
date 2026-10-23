/**
 * 查询控件：日期范围、指标多选、示範模式开关、CSV 导出入口。
 * 所有学生可见文案来自字典；日期留空时由后端用锚点回推默认窗口。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { translate } from "../../i18n/dictionary";
import { DAILY_METRICS, type DailyMetric, type DataMode } from "./types";
import { metricKey } from "./transform";

export interface WeatherControlsProps {
  readonly start: string;
  readonly end: string;
  readonly onStartChange: (value: string) => void;
  readonly onEndChange: (value: string) => void;
  readonly metrics: readonly DailyMetric[];
  readonly onToggleMetric: (metric: DailyMetric) => void;
  readonly dataMode: DataMode;
  readonly onDemoChange: (enabled: boolean) => void;
  readonly onBackToOfficial: () => void;
  readonly exportHref: string;
  readonly dateInvalid: boolean;
}

export function WeatherControls({
  start,
  end,
  onStartChange,
  onEndChange,
  metrics,
  onToggleMetric,
  dataMode,
  onDemoChange,
  onBackToOfficial,
  exportHref,
  dateInvalid,
}: WeatherControlsProps) {
  const startLabel = translate("weather.controls.startDate");
  const endLabel = translate("weather.controls.endDate");

  return (
    <section className="weather-panel" aria-labelledby="weather-controls-heading" data-testid="weather-controls">
      <h2 id="weather-controls-heading">
        <BilingualText as="span" size="subtitle" tkey="weather.controls.title" />
      </h2>

      <div className="weather-controls">
        <fieldset className="weather-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="weather.controls.dateRange" />
          </legend>
          <div className="weather-controls__dates">
            <div className="weather-controls__field">
              <label htmlFor="weather-start-date">
                <BilingualText as="span" size="xs" tkey="weather.controls.startDate" />
              </label>
              <input
                id="weather-start-date"
                type="date"
                value={start}
                max={end || undefined}
                aria-label={startLabel["zh-Hant"]}
                aria-invalid={dateInvalid}
                onChange={(event) => onStartChange(event.target.value)}
              />
            </div>
            <div className="weather-controls__field">
              <label htmlFor="weather-end-date">
                <BilingualText as="span" size="xs" tkey="weather.controls.endDate" />
              </label>
              <input
                id="weather-end-date"
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
            <p role="alert" className="weather-controls__error" data-testid="date-error">
              <BilingualText size="xs" tkey="weather.controls.dateInvalid" />
            </p>
          ) : null}
          <p className="weather-controls__hint">
            <BilingualText size="xs" tkey="weather.controls.hint" />
          </p>
        </fieldset>

        <fieldset className="weather-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="weather.controls.metrics" />
          </legend>
          <div className="weather-controls__metrics">
            {DAILY_METRICS.map((metric) => (
              <label key={metric} className="weather-controls__checkbox">
                <input
                  type="checkbox"
                  checked={metrics.includes(metric)}
                  onChange={() => onToggleMetric(metric)}
                />
                <BilingualText as="span" size="sm" tkey={metricKey(metric)} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="weather-controls__group">
          <legend>
            <BilingualText as="span" size="sm" tkey="weather.mode.label" />
          </legend>
          <label className="weather-controls__checkbox">
            <input
              type="checkbox"
              checked={dataMode === "demo"}
              aria-describedby="weather-demo-hint"
              onChange={(event) => onDemoChange(event.target.checked)}
            />
            <BilingualText as="span" size="sm" tkey="weather.mode.demoToggle" />
          </label>
          <p id="weather-demo-hint" className="weather-controls__hint">
            <BilingualText size="xs" tkey="weather.mode.demoHint" />
          </p>
          {dataMode === "imported" ? (
            <div className="weather-controls__imported" data-testid="imported-mode-hint">
              <p>
                <BilingualText size="xs" tkey="weather.mode.importedHint" />
              </p>
              <button type="button" className="btn btn--secondary" onClick={onBackToOfficial}>
                <BilingualText as="span" size="sm" tkey="weather.mode.backToOfficial" />
              </button>
            </div>
          ) : null}
        </fieldset>

        <div className="weather-controls__actions">
          <a className="btn btn--secondary" href={exportHref} download data-testid="export-csv">
            <BilingualText as="span" size="sm" tkey="weather.controls.export" />
          </a>
        </div>
      </div>
    </section>
  );
}
