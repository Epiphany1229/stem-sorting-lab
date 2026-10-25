/**
 * 单个指标的排序面板：直接复用阶段 2 的 TracePlayer（播放控件、代码高亮、
 * 内联比较区、减少动态）与结果区；本组件不包含任何排序逻辑。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { formatTranslation } from "../../i18n/dictionary";
import { TracePlayer } from "../../player/TracePlayer";
import type { BubbleTrace, WeatherMetric } from "../../player/types";
import { classifyTraceError, traceErrorKey } from "./useWeatherTrace";
import { WeatherSortResults } from "./WeatherSortResults";
import { metricLabelEn, metricLabelZh } from "./weatherSortHelpers";

export interface WeatherTracePanelProps {
  readonly metric: WeatherMetric;
  readonly trace: BubbleTrace | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly unit: string;
  readonly onRetry: () => void;
}

export function WeatherTracePanel({
  metric,
  trace,
  loading,
  error,
  unit,
  onRetry,
}: WeatherTracePanelProps) {
  const zhMetric = metricLabelZh(metric);
  const enMetric = metricLabelEn(metric);
  const heading = formatTranslation("weatherSort.player.heading", { metric: zhMetric });
  const headingEn = formatTranslation("weatherSort.player.heading", { metric: enMetric });
  const headingId = `weather-sort-player-${metric}`;
  const errorKind = error ? classifyTraceError(error) : null;
  const tooFewDays = errorKind === "invalidInput";

  return (
    <section
      className="weather-sort__panel"
      aria-labelledby={headingId}
      data-testid={`weather-sort-panel-${metric}`}
    >
      <h3 id={headingId}>
        <BilingualText size="subtitle" zh={heading["zh-Hant"]} en={headingEn.en} />
      </h3>

      {loading ? (
        <p role="status" data-testid={`trace-loading-${metric}`}>
          <BilingualText tkey="weatherSort.loading" />
        </p>
      ) : error ? (
        <div role="alert" className="weather-alert" data-testid={`trace-error-${metric}`}>
          <h4>
            <BilingualText as="span" size="sm" tkey="weatherSort.error.title" />
          </h4>
          {tooFewDays ? (
            <p>
              <BilingualText size="xs" tkey="weatherSort.error.tooFewDays" />
            </p>
          ) : null}
          <p>
            <BilingualText size="xs" tkey={traceErrorKey(error)} />
          </p>
          <button type="button" className="btn btn--secondary mt-3" onClick={onRetry}>
            <BilingualText as="span" size="sm" tkey="trace.retry" />
          </button>
        </div>
      ) : trace ? (
        <>
          <TracePlayer key={metric} trace={trace} inlinePrompt unit={unit} />
          <WeatherSortResults trace={trace} metric={metric} />
        </>
      ) : (
        <p className="weather-sort__hint">
          <BilingualText size="xs" tkey="weatherSort.noValid" />
        </p>
      )}
    </section>
  );
}
