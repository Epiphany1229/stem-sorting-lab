import { InfoCard } from "../components/InfoCard";
import { PageHeader } from "../components/PageHeader";
import type { TranslationKey } from "../i18n/dictionary";

interface HelpSection {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

const helpSections: readonly HelpSection[] = [
  { titleKey: "help.bilingual.title", bodyKey: "help.bilingual.body" },
  { titleKey: "help.navigation.title", bodyKey: "help.navigation.body" },
  { titleKey: "help.status.title", bodyKey: "help.status.body" },
  { titleKey: "help.keyboard.title", bodyKey: "help.keyboard.body" },
  { titleKey: "help.phase.title", bodyKey: "help.phase.body" },
];

/** 使用说明：双语排版、导航、状态徽标、键盘与减少动态的现状说明。 */
export default function HelpPage() {
  return (
    <div className="page-stack">
      <PageHeader titleKey="help.title" status="available" leadKey="help.lead" />
      <div className="grid gap-4 md:grid-cols-2">
        {helpSections.map((section) => (
          <InfoCard key={section.titleKey} titleKey={section.titleKey} bodyKey={section.bodyKey} />
        ))}
      </div>
    </div>
  );
}
