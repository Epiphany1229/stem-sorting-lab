import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";

interface DevelopmentNoticeProps {
  bodyKey?: TranslationKey;
}

/**
 * 「开发中」提示：明确说明骨架已完成、互动功能尚未实现，
 * 不展示模拟或预先编好的结果。
 */
export function DevelopmentNotice({ bodyKey = "page.inDevelopment.body" }: DevelopmentNoticeProps) {
  return (
    <section
      aria-labelledby="development-notice-title"
      className="rounded-card border border-border border-l-4 border-l-compare bg-compare-soft/50 p-5 sm:p-6"
    >
      <h2 id="development-notice-title">
        <BilingualText as="span" size="subtitle" tkey="page.inDevelopment.title" />
      </h2>
      <div className="mt-3 max-w-3xl">
        <BilingualText tkey={bodyKey} />
      </div>
    </section>
  );
}
