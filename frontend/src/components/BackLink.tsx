import { Link } from "react-router-dom";

import { BilingualText } from "../i18n/BilingualText";
import type { TranslationKey } from "../i18n/dictionary";
import { cn } from "../lib/utils";

interface BackLinkProps {
  /** 站内路径（以 / 开头）或页内锚点（以 # 开头）。 */
  href: string;
  labelKey?: TranslationKey;
  className?: string;
}

/** 返回入口：箭头与双语文字属于同一个链接，不是两个控件。 */
export function BackLink({ href, labelKey = "back.toHome", className }: BackLinkProps) {
  const classes = cn("inline-flex items-center gap-2 rounded-chip text-primary underline-offset-4 hover:underline", className);
  const content = (
    <>
      <span aria-hidden="true">←</span>
      <BilingualText tkey={labelKey} size="sm" />
    </>
  );

  if (href.startsWith("/")) {
    return (
      <Link to={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} className={classes}>
      {content}
    </a>
  );
}
