/** 图表空状态：说明没有数据，并在后端给出 reason 时展示双语原因 + 原始代码。 */
import { BilingualText } from "../../../i18n/BilingualText";
import { weatherReasonKey } from "../transform";

export interface ChartEmptyProps {
  readonly testId: string;
  readonly reason?: string | null;
}

export function ChartEmpty({ testId, reason = null }: ChartEmptyProps) {
  return (
    <div role="status" className="weather-chart-empty" data-testid={testId}>
      <p>
        <BilingualText tkey="weather.chart.empty" />
      </p>
      <p className="weather-chart-empty__hint">
        <BilingualText size="xs" tkey="weather.chart.emptyBody" />
      </p>
      {reason ? (
        <div className="weather-chart-empty__reason">
          <p>
            <BilingualText size="xs" tkey={weatherReasonKey(reason)} />
          </p>
          <p className="weather-chart-empty__code">
            <BilingualText size="xs" tkey="weather.coverage.reasonCode" />
            {": "}
            <code>{reason}</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}
