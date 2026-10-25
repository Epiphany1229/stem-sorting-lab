/**
 * Aux 组件共用的小部件：区块外壳、事实表、缺失提示、阵列单元格。
 * 所有学生可见文字都来自 features/algorithms/i18n.ts，繁中在上、英文在下。
 */
import type { ReactNode } from "react";

import { BilingualText } from "../../../i18n/BilingualText";
import { algorithmTextOf, formatAlgorithmText, type AlgorithmTextPair } from "../i18n";
import { formatAuxNumber } from "./auxRead";

export interface AuxSectionProps {
  readonly title: AlgorithmTextPair;
  readonly algorithm: string;
  readonly eventPresent: boolean;
  readonly testId: string;
  readonly children: ReactNode;
  readonly legend?: AlgorithmTextPair;
}

/** 专属视觉区块：标题 + 说明 + 内容（没有当前事件时显示操作提示）。 */
export function AuxSection({
  title,
  algorithm,
  eventPresent,
  testId,
  children,
  legend,
}: AuxSectionProps) {
  const hint = algorithmTextOf("detail.visualHint");
  return (
    <section className={`algo-aux algo-aux--${algorithm}`} data-testid={testId}>
      <h3 className="algo-aux__title">
        <BilingualText size="sm" zh={title["zh-Hant"]} en={title.en} />
      </h3>
      <p className="algo-aux__hint">
        <BilingualText size="xs" zh={hint["zh-Hant"]} en={hint.en} />
      </p>
      {eventPresent ? (
        children
      ) : (
        <p className="algo-aux__idle" data-testid={`${testId}-idle`}>
          <BilingualText
            size="xs"
            zh={algorithmTextOf("aux.idle")["zh-Hant"]}
            en={algorithmTextOf("aux.idle").en}
          />
        </p>
      )}
      {legend ? (
        <p className="algo-aux__legend" data-testid={`${testId}-legend`}>
          <BilingualText size="xs" zh={legend["zh-Hant"]} en={legend.en} />
        </p>
      ) : null}
    </section>
  );
}

export interface AuxFactProps {
  readonly label: AlgorithmTextPair;
  readonly value: ReactNode;
  readonly testId?: string;
}

/** 事实表的一行（标签双语，值可以是数字或双语文本）。 */
export function AuxFact({ label, value, testId }: AuxFactProps) {
  return (
    <div className="algo-aux__fact" data-testid={testId}>
      <dt>
        <BilingualText size="xs" zh={label["zh-Hant"]} en={label.en} />
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AuxFacts({ children }: { readonly children: ReactNode }) {
  return <dl className="algo-aux__facts">{children}</dl>;
}

/** 缺字段时的明确提示：只显示当前阵列，不补造专属数据。 */
export function AuxMissingNote({
  fields,
  testId,
}: {
  readonly fields: readonly string[];
  readonly testId: string;
}) {
  if (fields.length === 0) {
    return null;
  }
  const text = formatAlgorithmText("aux.missing", { fields: fields.join(", ") });
  return (
    <p className="algo-aux__missing" role="alert" data-testid={testId}>
      <BilingualText size="xs" zh={text["zh-Hant"]} en={text.en} />
    </p>
  );
}

export type AuxCellTone =
  | "normal"
  | "active"
  | "settled"
  | "muted"
  | "hole"
  | "candidate"
  | "pivot";

export interface AuxCellProps {
  readonly index: number;
  readonly value: number | null;
  readonly tone?: AuxCellTone;
  /** 符号标记（★ ✓ ◌ 等），与颜色/文字共同传达状态。 */
  readonly marker?: string;
  readonly testId?: string;
  readonly dimmed?: boolean;
}

/** 阵列中的一个位置：上标下标、中间数值、右上角符号标记。 */
export function AuxCell({
  index,
  value,
  tone = "normal",
  marker,
  testId,
  dimmed = false,
}: AuxCellProps) {
  return (
    <li
      className={[
        "algo-cell",
        `algo-cell--${tone}`,
        dimmed ? "algo-cell--dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      data-index={index}
      data-value={value ?? ""}
      data-tone={tone}
    >
      <span className="algo-cell__index" aria-hidden="true">
        {index}
      </span>
      {marker ? (
        <span className="algo-cell__marker" aria-hidden="true">
          {marker}
        </span>
      ) : null}
      <span className="algo-cell__value">{formatAuxNumber(value)}</span>
    </li>
  );
}

/** 一行阵列单元格。 */
export function AuxCellRow({
  children,
  label,
  testId,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly testId?: string;
}) {
  return (
    <ol className="algo-cells" aria-label={label} data-testid={testId}>
      {children}
    </ol>
  );
}
