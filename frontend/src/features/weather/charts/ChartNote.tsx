/** 图表卡片里的双语补充说明（例如「本圖實際指標」）。 */
import { BilingualText } from "../../../i18n/BilingualText";
import { formatTranslation } from "../../../i18n/dictionary";

export interface ChartNoteProps {
  readonly zh: string;
  readonly en: string;
}

export function ChartNote({ zh, en }: ChartNoteProps) {
  return (
    <p className="weather-chart-card__note">
      <BilingualText size="xs" zh={zh} en={en} />
    </p>
  );
}

/** 生成「本圖實際指標：…」的双语文本；metric 名称必须来自字典。 */
export function metricNoteText(zhMetric: string, enMetric: string): { zh: string; en: string } {
  return {
    zh: formatTranslation("weather.chart.metricNote", { metric: zhMetric })["zh-Hant"],
    en: formatTranslation("weather.chart.metricNote", { metric: enMetric }).en,
  };
}
