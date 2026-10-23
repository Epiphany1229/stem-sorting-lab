import type { ElementType } from "react";

import { cn } from "../lib/utils";
import { dictionary, type TranslationKey } from "./dictionary";

export type BilingualSize = "title" | "subtitle" | "body" | "sm" | "xs";
export type BilingualTone = "default" | "onPrimary";

interface BilingualTextBaseProps {
  /** 渲染成语义元素的标签，如 h1 / h2 / p / span，默认 span。 */
  as?: ElementType;
  /** 字号层级：title 用于页面主标题，body 为默认正文（中文 17px、英文 14px）。 */
  size?: BilingualSize;
  /** onPrimary 用于青绿底按钮，双语文字改为白色。 */
  tone?: BilingualTone;
  className?: string;
  id?: string;
}

/** 两种用法：传字典 key，或直接传 zh / en（用于数据驱动、无法预先枚举的内容）。 */
export type BilingualTextProps = BilingualTextBaseProps &
  ({ tkey: TranslationKey } | { zh: string; en: string });

/**
 * 双语文本：繁体中文在上、英文紧贴其下（纵向堆叠，不是左右并排）。
 *
 * 无障碍取舍：英文节点使用 aria-hidden="true"，屏幕阅读器只朗读一遍繁体中文，
 * 避免同一段内容被中英文重复朗读。英文仍然完整显示给看得见的学生，
 * 不省略、不截断；若将来需要以英文作为无障碍主语言，可在这里切换隐藏对象。
 *
 * 按钮、导航链接等交互元素只能包一层 BilingualText，不能为两种语言各做一个按钮。
 */
export function BilingualText(props: BilingualTextProps) {
  const { as: Tag = "span", size = "body", tone = "default", className, id } = props;
  const entry = "tkey" in props ? dictionary[props.tkey] : { "zh-Hant": props.zh, en: props.en };

  return (
    <Tag
      id={id}
      className={cn("bilingual", `bilingual--${size}`, tone === "onPrimary" && "bilingual--on-primary", className)}
    >
      <span className="bilingual__zh" lang="zh-Hant">
        {entry["zh-Hant"]}
      </span>
      <span className="bilingual__en" lang="en" aria-hidden="true">
        {entry.en}
      </span>
    </Tag>
  );
}
