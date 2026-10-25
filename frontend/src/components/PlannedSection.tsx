import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";

interface PlannedSectionProps {
  itemKeys: readonly TranslationKey[];
  titleKey?: TranslationKey;
}

/** 「預計提供」清单：后续阶段要做的功能，不隐藏未完成项。 */
export function PlannedSection({ itemKeys, titleKey = "page.planned.title" }: PlannedSectionProps) {
  return (
    <section className="section-card">
      <BilingualText as="h2" size="subtitle" tkey={titleKey} />
      <ul className="space-y-3">
        {itemKeys.map((key) => (
          <li key={key} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <BilingualText tkey={key} />
          </li>
        ))}
      </ul>
    </section>
  );
}
