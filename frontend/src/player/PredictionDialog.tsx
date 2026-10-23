/**
 * 教学预测弹窗：只在「引导模式 + 即将执行 compare 事件」时出现。
 *
 * 判定只读事件的 auxiliary_state.comparison.will_swap，前端不比较数值。
 * 答完展示双语反馈与该事件的 explanation，再由用户按「繼續」推进播放。
 *
 * 无障碍：role="dialog" + aria-modal、初始焦点在第一个选项、Tab 焦点圈定、
 * Esc 关闭、关闭后焦点回到打开弹窗的元素。
 */
import { useEffect, useId, useRef } from "react";

import { BilingualText } from "../i18n/BilingualText";
import { zh } from "../i18n/dictionary";
import type { Comparison, TraceEvent } from "./types";

export interface PredictionResolution {
  /** 学生是否选择「需要交换」。 */
  readonly answer: boolean;
  /** 是否与后端给出的 will_swap 一致。 */
  readonly correct: boolean;
}

interface PredictionDialogProps {
  readonly event: TraceEvent;
  /** 后端给出的比较信息（含 will_swap），前端只读。 */
  readonly comparison: Comparison;
  readonly resolution: PredictionResolution | null;
  readonly onAnswer: (needsSwap: boolean) => void;
  readonly onContinue: () => void;
  readonly onDismiss: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PredictionDialog({
  event,
  comparison,
  resolution,
  onAnswer,
  onContinue,
  onDismiss,
}: PredictionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const explanationTitleId = `${baseId}-explanation`;

  // 打开时记录触发元素，关闭时把焦点还回去。
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    return () => {
      const previous = previouslyFocusedRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  // 初始焦点：未作答在第一个选项，已作答在「繼續」。
  useEffect(() => {
    if (resolution) {
      continueRef.current?.focus();
    } else {
      firstOptionRef.current?.focus();
    }
  }, [resolution]);

  // Esc 关闭 + Tab 焦点圈定在弹窗内。
  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      if (keyboardEvent.key === "Escape") {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        onDismiss();
        return;
      }

      if (keyboardEvent.key !== "Tab") {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (keyboardEvent.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          keyboardEvent.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        keyboardEvent.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div className="dialog-overlay" data-testid="prediction-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="prediction-dialog"
        data-testid="prediction-dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="prediction-dialog__eyebrow">
              <BilingualText size="xs" tkey="prediction.title" />
            </p>
            <h2 id={titleId} className="mt-2">
              <BilingualText as="span" size="subtitle" tkey="prediction.question" />
            </h2>
          </div>
          <button
            type="button"
            className="prediction-dialog__close"
            aria-label={zh("prediction.close")}
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>

        <p id={descriptionId} className="mt-3">
          <BilingualText tkey="prediction.help" />
        </p>

        <div className="prediction-dialog__values" aria-hidden="true">
          <span className="prediction-dialog__value">{comparison.left}</span>
          <span className="prediction-dialog__question-mark">?</span>
          <span className="prediction-dialog__value">{comparison.right}</span>
        </div>

        {resolution ? (
          <div className="mt-4 space-y-4">
            <p className="prediction-dialog__feedback" role="status" data-testid="prediction-feedback">
              <BilingualText
                size="subtitle"
                tkey={resolution.correct ? "prediction.correct" : "prediction.incorrect"}
              />
            </p>
            <p data-testid="prediction-correct-answer">
              <BilingualText
                tkey={
                  comparison.will_swap ? "prediction.answer.swap" : "prediction.answer.keep"
                }
              />
            </p>
            <section aria-labelledby={explanationTitleId} className="prediction-dialog__explanation">
              <h3 id={explanationTitleId}>
                <BilingualText as="span" size="sm" tkey="prediction.explanation.title" />
              </h3>
              <div className="mt-2">
                <BilingualText
                  zh={event.explanation["zh-Hant"]}
                  en={event.explanation.en}
                />
              </div>
            </section>
            <button
              ref={continueRef}
              type="button"
              className="btn btn--primary"
              onClick={onContinue}
            >
              <BilingualText as="span" size="sm" tone="onPrimary" tkey="prediction.continue" />
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              ref={firstOptionRef}
              type="button"
              className="btn btn--primary"
              onClick={() => onAnswer(true)}
            >
              <BilingualText
                as="span"
                size="sm"
                tone="onPrimary"
                tkey="prediction.option.swap"
              />
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => onAnswer(false)}>
              <BilingualText as="span" size="sm" tkey="prediction.option.keep" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
