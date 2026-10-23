import { DevelopmentNotice } from "../components/DevelopmentNotice";
import { PageHeader } from "../components/PageHeader";
import { PlannedSection } from "../components/PlannedSection";
import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";

interface ExternalSource {
  href: string;
  key: TranslationKey;
}

/** 只链接官方机构首页；具体数据 API / 文件地址必须核实后才写入文档。 */
const externalSources: readonly ExternalSource[] = [
  { href: "https://www.hko.gov.hk/", key: "sources.attribution.hko" },
  { href: "https://data.gov.hk/", key: "sources.attribution.dataGov" },
];

/** 数据来源与方法说明（阶段 1 只说明计划与署名，不宣称已接通数据）。 */
export default function SourcesPage() {
  return (
    <div className="page-stack">
      <PageHeader titleKey="sources.title" status="inDevelopment" leadKey="sources.lead" />
      <DevelopmentNotice bodyKey="sources.notice" />
      <PlannedSection
        itemKeys={[
          "sources.planned.1",
          "sources.planned.2",
          "sources.planned.3",
          "sources.planned.4",
        ]}
      />

      <section
        aria-labelledby="sources-attribution-title"
        className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"
      >
        <h2 id="sources-attribution-title">
          <BilingualText as="span" size="subtitle" tkey="sources.attribution.title" />
        </h2>
        <p className="mt-2 max-w-3xl">
          <BilingualText tkey="sources.attribution.body" />
        </p>
        <ul className="mt-4 space-y-2">
          {externalSources.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-chip text-primary underline underline-offset-4"
              >
                <BilingualText tkey={source.key} size="sm" />
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl">
          <BilingualText tkey="sources.pending" size="sm" />
        </p>
      </section>
    </div>
  );
}
