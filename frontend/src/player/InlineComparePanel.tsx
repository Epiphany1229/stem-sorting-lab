/**
 * 内联比较互动区（阶段 4.6，阶段 5A 降级扩展）：常驻在 Python 代码面板下方。
 *
 * 三种模式，均由后端数据决定，前端不推导：
 * 1. compare 且 comparison.will_swap 存在（冒泡/天气）：出预测题，判定只读 will_swap；
 * 2. compare 但只有 left/right/relation（阶段 5A 其他算法）：只展示事实性比较与
 *    后端 explanation，不显示选项（插入/归并等的「决策」不是交换，硬套会误导）；
 * 3. 非 compare：显示简短状态说明，区域高度保持稳定。
 *
 * 不暂停播放、不抢焦点、不做 focus trap；区域整体 aria-live="polite"。
 */
import { useState } from "react";

import { BilingualText } from "../i18n/BilingualText";
import type { Comparison, TraceEvent } from "./types";

export interface InlineComparePanelProps {
  readonly event: TraceEvent | null;
}

const RELATION_SYMBOL: Record<Comparison["relation"], string> = {
  gt: ">",
  lt: "<",
  eq: "=",
};

function hasPrediction(comparison: Comparison | null): boolean {
  return comparison !== null && comparison.will_swap !== undefined;
}

export function InlineComparePanel({ event }: InlineComparePanelProps) {
  const comparisonEvent = event?.event_type === "compare" ? event : null;
  const comparison = comparisonEvent?.auxiliary_state.comparison ?? null;
  const [answer, setAnswer] = useState<boolean | null>(null);
  const canAsk = hasPrediction(comparison);
  const resolved = answer !== null && canAsk;
  const correct =
    resolved && comparison?.will_swap !== undefined ? answer === comparison.will_swap : null;

  // 有比较事实（哪怕没有 will_swap）时展示事实性比较；否则若仍是 compare，
  // 至少展示后端 explanation（双语），绝不自行比较数值。
  const showFacts = comparisonEvent !== null && !canAsk;

  return (
    <section
      className="inline-compare"
      data-testid="inline-compare"
      aria-labelledby="inline-compare-title"
      aria-live="polite"
    >
      <h2 id="inline-compare-title">
        <BilingualText as="span" size="subtitle" tkey="player.inline.title" />
      </h2>

      {canAsk && comparison ? (
        <div className="inline-compare__body" data-testid="inline-compare-question">
          <p className="inline-compare__question">
            <BilingualText tkey="player.inline.question" />
          </p>
          <p className="inline-compare__values" aria-hidden="true">
            <span>{comparison.left}</span>
            <span className="inline-compare__mark">?</span>
            <span>{comparison.right}</span>
          </p>

          {resolved ? (
            <div className="inline-compare__feedback" data-testid="inline-compare-feedback">
              <p className="inline-compare__verdict" role="status">
                <BilingualText
                  size="sm"
                  tkey={correct ? "prediction.correct" : "prediction.incorrect"}
                />
              </p>
              <p data-testid="inline-compare-answer">
                <BilingualText
                  size="xs"
                  tkey={
                    comparison.will_swap ? "prediction.answer.swap" : "prediction.answer.keep"
                  }
                />
              </p>
              <div className="inline-compare__explanation">
                <p className="inline-compare__explanation-title">
                  <BilingualText size="xs" tkey="prediction.explanation.title" />
                </p>
                <BilingualText
                  size="sm"
                  zh={comparisonEvent?.explanation["zh-Hant"] ?? ""}
                  en={comparisonEvent?.explanation.en ?? ""}
                />
              </div>
            </div>
          ) : (
            <div className="inline-compare__options">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setAnswer(true)}
              >
                <BilingualText
                  as="span"
                  size="sm"
                  tone="onPrimary"
                  tkey="prediction.option.swap"
                />
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setAnswer(false)}
              >
                <BilingualText as="span" size="sm" tkey="prediction.option.keep" />
              </button>
            </div>
          )}
        </div>
      ) : showFacts && comparisonEvent ? (
        <div className="inline-compare__body" data-testid="inline-compare-facts">
          {comparison ? (
            <p className="inline-compare__values" aria-hidden="true">
              <span>{comparison.left}</span>
              <span className="inline-compare__mark">
                {RELATION_SYMBOL[comparison.relation]}
              </span>
              <span>{comparison.right}</span>
            </p>
          ) : null}
          <p className="inline-compare__question">
            <BilingualText
              size="sm"
              zh={comparisonEvent.explanation["zh-Hant"]}
              en={comparisonEvent.explanation.en}
            />
          </p>
        </div>
      ) : (
        <p className="inline-compare__idle" data-testid="inline-compare-idle">
          <BilingualText size="sm" tkey="player.inline.idle" />
        </p>
      )}
    </section>
  );
}
