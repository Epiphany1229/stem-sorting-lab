/**
 * 非官方数据横幅：mode !== "official" 时必须常驻显示。
 *
 * 显示模式（demo / imported）、后端 notice 原文、来源与抓取时间；
 * official 模式直接不渲染，绝不隐藏非官方状态。
 */
import { BilingualText } from "../../i18n/BilingualText";
import { translate } from "../../i18n/dictionary";
import type { DataMode, SourceInfo } from "./types";
import { buildSourceRows } from "./transform";

export interface DemoBannerProps {
  readonly mode: DataMode;
  readonly notice: string | null;
  readonly sources?: readonly SourceInfo[];
}

export function DemoBanner({ mode, notice, sources = [] }: DemoBannerProps) {
  if (mode === "official") {
    return null;
  }

  const titleKey = mode === "demo" ? "weather.mode.demo" : "weather.mode.imported";
  const sourceRows = buildSourceRows(sources);
  const title = translate(titleKey);

  return (
    <aside
      className="weather-banner"
      data-testid="demo-banner"
      data-mode={mode}
      role="status"
      aria-label={`${title["zh-Hant"]} / ${title.en}`}
    >
      <div className="weather-banner__head">
        <span aria-hidden="true" className="weather-banner__glyph">
          {mode === "demo" ? "◇" : "↧"}
        </span>
        <div>
          <BilingualText as="h2" size="subtitle" tkey={titleKey} />
          <p className="weather-banner__warning">
            <BilingualText size="xs" tkey="weather.banner.warning" />
          </p>
        </div>
      </div>

      <div className="weather-banner__body">
        <p className="weather-banner__notice">
          <BilingualText size="xs" tkey="weather.banner.noticeLabel" />
          {": "}
          <span data-testid="demo-banner-notice">{notice}</span>
        </p>

        {sourceRows.length > 0 ? (
          <ul className="weather-banner__sources">
            {sourceRows.map((source) => (
              <li key={source.key}>
                <BilingualText
                  size="xs"
                  zh={`${translate("weather.banner.sourceLabel")["zh-Hant"]}：${source.dataset}`}
                  en={`${translate("weather.banner.sourceLabel").en}: ${source.dataset}`}
                />
                <span className="weather-banner__source-time">{source.fetchedAt}</span>
                <span className="weather-banner__source-link">{source.endpoint}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
