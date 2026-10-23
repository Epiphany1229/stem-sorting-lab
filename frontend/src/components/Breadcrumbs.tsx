import { Link } from "react-router-dom";

import { BilingualText } from "../i18n/BilingualText";
import { zh, type TranslationKey } from "../i18n/dictionary";

interface BreadcrumbsProps {
  /** 当前页面标题的字典 key */
  currentKey: TranslationKey;
}

/**
 * 当前位置：首頁 / <当前页>。当前项带 aria-current="page"，
 * 中文 + 英文仍然上下堆叠显示。
 */
export function Breadcrumbs({ currentKey }: BreadcrumbsProps) {
  return (
    <nav aria-label={zh("breadcrumb.youAreHere")}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link to="/" className="rounded-chip underline-offset-4 hover:underline">
            <BilingualText tkey="breadcrumb.home" size="xs" />
          </Link>
        </li>
        <li aria-hidden="true" className="text-ink-muted">
          /
        </li>
        <li>
          <span aria-current="page">
            <BilingualText tkey={currentKey} size="xs" />
          </span>
        </li>
      </ol>
    </nav>
  );
}
