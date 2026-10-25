import { BackLink } from "./BackLink";
import { Breadcrumbs } from "./Breadcrumbs";
import { StatusBadge } from "./StatusBadge";
import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";
import type { PageStatus } from "../navigation";

interface PageHeaderProps {
  titleKey: TranslationKey;
  leadKey?: TranslationKey;
  status?: PageStatus;
  /** 默认返回首页；首页可传 "#top" 回到页首。 */
  backTo?: string;
  backLabelKey?: TranslationKey;
}

/**
 * 统一页头：当前位置 + 页面标题 + 状态徽标 + 说明 + 返回入口。
 * 七个页面都用它，保证「每页都有标题、当前位置、返回入口」。
 */
export function PageHeader({
  titleKey,
  leadKey,
  status,
  backTo = "/",
  backLabelKey,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <Breadcrumbs currentKey={titleKey} />
      <div className="page-header__titles">
        <BilingualText as="h1" size="title" tkey={titleKey} />
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {leadKey ? (
        <p className="page-lead">
          <BilingualText tkey={leadKey} />
        </p>
      ) : null}
      <BackLink href={backTo} labelKey={backLabelKey} className="page-header__back" />
    </header>
  );
}
