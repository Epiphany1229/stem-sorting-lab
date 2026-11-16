/**
 * 資料來源與方法說明 /sources（阶段 6.1 正式内容页）。
 *
 * - 静态部分：官方来源、方法/限速、质量标记、30 天窗口口径、已知限制、许可与免责声明；
 * - 动态部分：GET /api/sources 的最近成功同步时间、今日请求预算、服务状态与数据集表；
 * - 动态失败时静态说明仍完整保留，并显示双语错误与重试，不整页空白；
 * - 所有学生可见文字来自 i18n 字典（繁中在上、英文紧贴其下）。
 */
import { DataTable } from "../features/weather/DataTable";
import { PageHeader } from "../components/PageHeader";
import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation, translate, type TranslationKey } from "../i18n/dictionary";
import { classifySourcesError, useSourcesStatus } from "../features/sources/api";
import {
  formatHongKongDateTime,
  hostOf,
  splitBilingualLicense,
} from "../features/sources/format";
import "../styles/sources.css";

const HKO_WEBSITE = "https://www.hko.gov.hk/";
const DATA_GOV_WEBSITE = "https://data.gov.hk/";
const API_PDF =
  "https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf";

function sourcesErrorKey(error: unknown): TranslationKey {
  const kind = classifySourcesError(error);
  if (kind === "invalidResponse") {
    return "sources.error.invalidResponse";
  }
  if (kind === "server") {
    return "sources.error.server";
  }
  return "sources.error.network";
}

interface ExternalLinkProps {
  readonly href: string;
  readonly labelKey: TranslationKey;
}

/** 外部链接：新窗口打开，并阻断 opener/referrer。 */
function ExternalLink({ href, labelKey }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="sources-link"
    >
      <BilingualText as="span" size="sm" tkey={labelKey} />
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function SectionHeading({
  id,
  titleKey,
}: {
  readonly id: string;
  readonly titleKey: TranslationKey;
}) {
  return (
    <h2 id={id} className="sources-section__title">
      <BilingualText as="span" size="subtitle" tkey={titleKey} />
    </h2>
  );
}

/** 官方月表的三个质量标记（固定三种，直接来自官方 API 文档）。 */
function QualityFlagTable() {
  const rows: ReadonlyArray<{ readonly flag: string; readonly labelKey: TranslationKey }> = [
    { flag: "C", labelKey: "sources.quality.c" },
    { flag: "#", labelKey: "sources.quality.hash" },
    { flag: "***", labelKey: "sources.quality.stars" },
  ];
  const caption = translate("sources.quality.caption");

  return (
    <table className="sources-quality" data-testid="sources-quality-table">
      <caption>
        <span lang="zh-Hant">{caption["zh-Hant"]}</span>
        <span lang="en" aria-hidden="true">
          {caption.en}
        </span>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <BilingualText as="span" size="xs" tkey="sources.quality.flag" />
          </th>
          <th scope="col">
            <BilingualText as="span" size="xs" tkey="sources.quality.meaning" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.flag}>
            <td className="sources-quality__flag">
              <code>{row.flag}</code>
            </td>
            <td>
              <BilingualText as="span" size="sm" tkey={row.labelKey} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 动态数据状态：成功显示预算/同步时间/服务状态与数据集表；失败保留静态说明。 */
function DataStatusSection() {
  const statusQuery = useSourcesStatus();
  const status = statusQuery.data;
  const lastSuccess = formatHongKongDateTime(status?.last_success_at);
  const circuitUntil = formatHongKongDateTime(status?.circuit_open_until);

  const tableCaption = translate("sources.table.caption");
  const datasetHeader = translate("sources.table.dataset");
  const hostHeader = translate("sources.table.host");
  const fetchedHeader = translate("sources.table.fetchedAt");
  const columns = [
    { key: "dataset", zh: datasetHeader["zh-Hant"], en: datasetHeader.en },
    { key: "host", zh: hostHeader["zh-Hant"], en: hostHeader.en },
    { key: "fetchedAt", zh: fetchedHeader["zh-Hant"], en: fetchedHeader.en },
  ] as const;
  const rows = (status?.sources ?? []).map((source, index) => ({
    key: `${source.dataset}-${index}-${source.fetched_at}`,
    cells: [
      source.dataset,
      hostOf(source.endpoint),
      formatHongKongDateTime(source.fetched_at) ?? "—",
    ] as const,
  }));

  return (
    <section
      aria-labelledby="sources-status-title"
      className="section-card sources-section"
      data-testid="sources-status"
    >
      <SectionHeading id="sources-status-title" titleKey="sources.status.title" />

      {statusQuery.isPending ? (
        <p role="status" className="sources-status__loading" data-testid="sources-status-loading">
          <BilingualText tkey="sources.status.loading" />
        </p>
      ) : statusQuery.isError ? (
        <div role="alert" className="sources-status__error" data-testid="sources-status-error">
          <p>
            <BilingualText tkey={sourcesErrorKey(statusQuery.error)} />
          </p>
          <p className="sources-status__error-note">
            <BilingualText size="sm" tkey="sources.status.error" />
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            data-testid="sources-status-retry"
            onClick={() => {
              void statusQuery.refetch();
            }}
          >
            <BilingualText as="span" size="sm" tkey="sources.status.retry" />
          </button>
        </div>
      ) : status ? (
        <>
          <dl className="sources-status__grid">
            <div className="sources-status__card" data-testid="sources-last-success">
              <dt>
                <BilingualText size="xs" tkey="sources.status.lastSuccess" />
              </dt>
              <dd>
                {lastSuccess ? (
                  <time dateTime={status.last_success_at ?? undefined}>{lastSuccess}</time>
                ) : (
                  <BilingualText size="sm" tkey="sources.status.never" />
                )}
              </dd>
            </div>

            <div className="sources-status__card" data-testid="sources-request-budget">
              <dt>
                <BilingualText size="xs" tkey="sources.status.today" />
              </dt>
              <dd>
                <span className="sources-status__number">
                  {status.request_stats.today} / {status.request_stats.budget}
                </span>
              </dd>
            </div>

            <div className="sources-status__card" data-testid="sources-remaining-budget">
              <dt>
                <BilingualText size="xs" tkey="sources.status.remaining" />
              </dt>
              <dd>
                <span className="sources-status__number">
                  {status.request_stats.budget_remaining}
                </span>
              </dd>
            </div>

            <div className="sources-status__card" data-testid="sources-service-status">
              <dt>
                <BilingualText size="xs" tkey="sources.status.service" />
              </dt>
              <dd>
                {status.circuit_open ? (
                  <BilingualText size="sm" tkey="sources.status.circuitOpen" />
                ) : (
                  <BilingualText size="sm" tkey="sources.status.normal" />
                )}
                {status.circuit_open && circuitUntil ? (
                  <p className="sources-status__hint">
                    <BilingualText
                      size="xs"
                      zh={
                        formatTranslation("sources.status.circuitUntil", {
                          time: circuitUntil,
                        })["zh-Hant"]
                      }
                      en={
                        formatTranslation("sources.status.circuitUntil", {
                          time: circuitUntil,
                        }).en
                      }
                    />
                  </p>
                ) : null}
              </dd>
            </div>

            <div className="sources-status__card" data-testid="sources-mode">
              <dt>
                <BilingualText size="xs" tkey="sources.status.mode" />
              </dt>
              <dd>
                {status.mode === "official" ? (
                  <BilingualText size="sm" tkey="sources.status.modeOfficial" />
                ) : (
                  <code>{status.mode}</code>
                )}
              </dd>
            </div>
          </dl>

          <DataTable
            testId="sources-datasets"
            caption={tableCaption}
            columns={columns}
            rows={rows}
            initialRows={5}
          />

          <p className="sources-status__hint">
            <BilingualText size="xs" tkey="sources.status.note" />
          </p>
        </>
      ) : null}
    </section>
  );
}

export default function SourcesPage() {
  const statusQuery = useSourcesStatus();
  const apiLicenses = statusQuery.data?.licenses ?? [];

  return (
    <div className="page-stack page-stack--loose">
      <PageHeader titleKey="sources.title" status="available" leadKey="sources.lead" />

      {/* 1. 官方來源 */}
      <section aria-labelledby="sources-official-title" className="section-card sources-section">
        <SectionHeading id="sources-official-title" titleKey="sources.official.title" />
        <p className="sources-section__lead">
          <BilingualText tkey="sources.official.intro" />
        </p>
        <dl className="sources-official__list">
          <div>
            <dt className="sources-official__name">HKO Open Data API</dt>
            <dd>
              <BilingualText size="sm" tkey="sources.official.clm" />
            </dd>
          </div>
          <div>
            <dt className="sources-official__name">RYES</dt>
            <dd>
              <BilingualText size="sm" tkey="sources.official.ryes" />
            </dd>
          </div>
        </dl>
        <p className="sources-section__note">
          <BilingualText size="sm" tkey="sources.official.noThirdParty" />
        </p>
      </section>

      {/* 2. 方法與限速 + 品質標記 */}
      <section aria-labelledby="sources-method-title" className="section-card sources-section">
        <SectionHeading id="sources-method-title" titleKey="sources.method.title" />
        <ul className="sources-bullets">
          <li>
            <BilingualText size="sm" tkey="sources.method.backend" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.method.rateLimits" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.method.sync" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.method.missing" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.method.sorting" />
          </li>
        </ul>
        <h3 className="sources-section__subtitle">
          <BilingualText as="span" size="sm" tkey="sources.quality.title" />
        </h3>
        <QualityFlagTable />
      </section>

      {/* 3. 30 天窗口口徑 */}
      <section aria-labelledby="sources-window-title" className="section-card sources-section">
        <SectionHeading id="sources-window-title" titleKey="sources.window.title" />
        <ul className="sources-bullets">
          <li>
            <BilingualText size="sm" tkey="sources.window.body1" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.window.body2" />
          </li>
        </ul>
      </section>

      {/* 4. 已知限制 */}
      <section aria-labelledby="sources-limits-title" className="section-card sources-section">
        <SectionHeading id="sources-limits-title" titleKey="sources.limits.title" />
        <ul className="sources-bullets">
          <li>
            <BilingualText size="sm" tkey="sources.limits.monthly" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.limits.provisional" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.limits.station" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.limits.tpo" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.limits.district" />
          </li>
          <li>
            <BilingualText size="sm" tkey="sources.limits.rainHumidity" />
          </li>
        </ul>
      </section>

      {/* 5. 許可與署名 */}
      <section aria-labelledby="sources-license-title" className="section-card sources-section">
        <SectionHeading id="sources-license-title" titleKey="sources.license.title" />
        {apiLicenses.length > 0 ? (
          <>
            <p className="sources-section__note">
              <BilingualText size="xs" tkey="sources.license.fromApi" />
            </p>
            <ul className="sources-license-list" data-testid="sources-licenses">
              {apiLicenses.map((license, index) => {
                const parsed = splitBilingualLicense(license);
                return (
                  <li key={`${index}-${license.slice(0, 24)}`} data-testid={`sources-license-${index}`}>
                    {parsed ? (
                      <BilingualText
                        size="sm"
                        zh={parsed["zh-Hant"]}
                        en={parsed.en}
                      />
                    ) : (
                      <span className="sources-license-list__raw">{license}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <ul className="sources-license-list" data-testid="sources-licenses-static">
            <li>
              <BilingualText size="sm" tkey="sources.license.hko" />
            </li>
            <li>
              <BilingualText size="sm" tkey="sources.license.dataGov" />
            </li>
          </ul>
        )}
        <p className="sources-section__note">
          <BilingualText size="xs" tkey="sources.license.apiNote" />
        </p>
        <p className="sources-disclaimer">
          <BilingualText size="sm" tkey="sources.license.disclaimer" />
        </p>
      </section>

      {/* 6. 動態資料狀態 */}
      <DataStatusSection />

      {/* 7. 頁腳：核對日期與相關連結 */}
      <section aria-labelledby="sources-footer-title" className="section-card sources-section sources-footer">
        <h2 id="sources-footer-title" className="sources-section__title">
          <BilingualText as="span" size="subtitle" tkey="sources.footer.linksTitle" />
        </h2>
        <ul className="sources-links">
          <li>
            <ExternalLink href={HKO_WEBSITE} labelKey="sources.link.hko" />
          </li>
          <li>
            <ExternalLink href={DATA_GOV_WEBSITE} labelKey="sources.link.dataGov" />
          </li>
          <li>
            <ExternalLink href={API_PDF} labelKey="sources.link.apiPdf" />
          </li>
        </ul>
        <p className="sources-footer__checked" data-testid="sources-verified">
          <BilingualText size="xs" tkey="sources.footer.checked" />
        </p>
      </section>
    </div>
  );
}
