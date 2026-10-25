/**
 * 内联比较互动区（阶段 4.6）：常驻在 Python 代码面板下方，不再使用弹窗。
 *
 * - 当前事件是 compare 时出题；学生选择后显示双语反馈 + 该事件的解释；
 * - 判定只读后端事件的 auxiliary_state.comparison.will_swap，前端不比较数值；
 * - 非 compare 事件显示简短状态说明，区域高度保持稳定；
 * - 不暂停播放、不抢焦点、不做 focus trap；区域整体 aria-live="polite"。
 */
import { useState } from "react";

import { BilingualText } from "../i18n/BilingualText";
import type { TraceEvent } from "./types";

export interface InlineComparePanelProps {
  readonly event: TraceEvent | null;
}

export function InlineComparePanel({ event }: InlineComparePanelProps) {
  const comparisonEvent = event?.event_type === "compare" ? event : null;
  const comparison = comparisonEvent?.auxiliary_state.comparison ?? null;
  const [answer, setAnswer] = useState<boolean | null>(null);
  const resolved = answer !== null && comparison !== null;
  const correct = resolved ? answer === comparison.will_swap : null;

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

      {comparison ? (
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
      ) : (
        <p className="inline-compare__idle" data-testid="inline-compare-idle">
          <BilingualText size="sm" tkey="player.inline.idle" />
        </p>
      )}
    </section>
  );
}
