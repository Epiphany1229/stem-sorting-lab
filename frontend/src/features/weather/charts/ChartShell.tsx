/** 图表卡片外壳：统一标题、说明、实际指标备注、空/载入状态、Plotly 画布与数据表位置。 */
import type { Data, Layout } from "plotly.js-dist-min";
import type { ReactNode } from "react";

import { BilingualText } from "../../../i18n/BilingualText";
import type { TranslationKey } from "../../../i18n/dictionary";
import { ChartEmpty } from "./ChartEmpty";
import { PlotlyFigure } from "./PlotlyFigure";

export interface ChartShellProps {
  readonly testId: string;
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  /** 额外的双语说明行（例如「本圖實際指標」）。 */
  readonly note?: ReactNode;
  readonly ariaLabel: string;
  readonly data: readonly Data[];
  readonly layout: Partial<Layout>;
  readonly loading?: boolean;
  readonly empty: boolean;
  readonly emptyReason?: string | null;
  /** 图表下方的可访问数据表。 */
  readonly table: ReactNode;
}

export function ChartShell({
  testId,
  titleKey,
  descriptionKey,
  note,
  ariaLabel,
  data,
  layout,
  loading = false,
  empty,
  emptyReason = null,
  table,
}: ChartShellProps) {
  const headingId = `${testId}-heading`;

  return (
    <section className="weather-chart-card" data-testid={testId} aria-labelledby={headingId}>
      <div className="weather-chart-card__head">
        <h3 id={headingId}>
          <BilingualText as="span" size="subtitle" tkey={titleKey} />
        </h3>
        <p className="weather-chart-card__desc">
          <BilingualText size="xs" tkey={descriptionKey} />
        </p>
        {note}
      </div>

      {loading ? (
        <p role="status" className="weather-chart-loading" data-testid={`${testId}-loading`}>
          <BilingualText tkey="common.loading" />
        </p>
      ) : empty ? (
        <ChartEmpty testId={`${testId}-empty`} reason={emptyReason} />
      ) : (
        <PlotlyFigure testId={testId} ariaLabel={ariaLabel} data={data} layout={layout} />
      )}

      <div className="weather-chart-card__table">{table}</div>
    </section>
  );
}
