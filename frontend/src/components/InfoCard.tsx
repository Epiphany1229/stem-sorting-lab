import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";

interface InfoCardProps {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

/** 说明卡片：小标题 + 双语正文，用于「使用說明」「資料來源」等说明性页面。 */
export function InfoCard({ titleKey, bodyKey }: InfoCardProps) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
      <h2>
        <BilingualText as="span" size="subtitle" tkey={titleKey} />
      </h2>
      <div className="mt-2 max-w-3xl">
        <BilingualText tkey={bodyKey} />
      </div>
    </section>
  );
}
