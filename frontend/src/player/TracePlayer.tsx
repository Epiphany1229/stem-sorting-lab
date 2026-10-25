/**
 * 冒泡排序轨迹播放器：把 BarChart、CodePanel、内联比较区与控制栏组合起来。
 *
 * 所有视觉状态都来自 trace 数据（states[] 与当前事件的索引/行组），
 * 组件本身不推导排序、不自行交换数字、不猜测下一行代码。
 * 阶段 4.7 起不再有弹窗式引导模式：比较互动统一在代码面板下方的 InlineComparePanel。
 */
import { useEffect, useMemo, type ReactNode } from "react";

import { BilingualText } from "../i18n/BilingualText";
import { formatTranslation, zh } from "../i18n/dictionary";
import { BarChart } from "./BarChart";
import { CodePanel } from "./CodePanel";
import { InlineComparePanel } from "./InlineComparePanel";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useTracePlayback, type PlaybackPhase } from "./useTracePlayback";
import type { BubbleTrace, TraceEvent, TraceState } from "./types";

export interface PlayerPassMetricOverride {
  /** 指标名称（双语，由调用方提供，例如「合併段數 / Merge steps」）。 */
  readonly label: { readonly "zh-Hant": string; readonly en: string };
  /** 按当前事件计算要显示的数字；返回 null 时显示「—」。 */
  readonly compute: (event: TraceEvent | null) => number | null;
}

interface TracePlayerProps {
  readonly trace: BubbleTrace;
  /** 在代码面板下方常驻内联比较区（/lab 与 /weather-sort 都使用）。 */
  readonly inlinePrompt?: boolean;
  /** 天气轨迹的数值单位（如 "°C"）；阶段 2 的整数轨迹不传。 */
  readonly unit?: string;
  /**
   * 阶段 5：可选插槽，渲染在主柱图卡片内（BarChart 之后），
   * 与播放器共享当前事件与快照，供算法专属辅助可视化使用。
   * 不传时行为与阶段 4 完全一致。
   */
  readonly renderAux?: (context: {
    readonly event: TraceEvent | null;
    readonly state: TraceState;
  }) => ReactNode;
  /**
   * 阶段 5：可选的「輪次」指标覆盖。
   * 归并排序没有 mark_sorted（passes=0），学习页用它显示「合併段數」；
   * 不传时沿用原来的「第 N 輪」逻辑，阶段 2/4 页面行为不变。
   */
  readonly passMetric?: PlayerPassMetricOverride;
}

const SPEED_OPTIONS: readonly number[] = [0.5, 1, 1.5, 2];

const PHASE_LABEL_KEYS: Record<PlaybackPhase, "player.phase.idle" | "player.phase.playing" | "player.phase.paused" | "player.phase.finished"> = {
  idle: "player.phase.idle",
  playing: "player.phase.playing",
  paused: "player.phase.paused",
  finished: "player.phase.finished",
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.closest(
      "button, a, input, select, textarea, [contenteditable='true'], [role='dialog']",
    ) !== null
  );
}

export function TracePlayer({
  trace,
  inlinePrompt = false,
  unit,
  renderAux,
  passMetric,
}: TracePlayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const playback = useTracePlayback(trace);
  const { phase, step, total, currentEvent, currentState } = playback;

  // 键盘操作：空格播放/暂停，←/→ 步进；输入控件内的按键不受影响。
  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.defaultPrevented) {
        return;
      }
      if (isInteractiveTarget(keyboardEvent.target)) {
        return;
      }
      if (keyboardEvent.key === " " || keyboardEvent.code === "Space") {
        keyboardEvent.preventDefault();
        playback.togglePlay();
      } else if (keyboardEvent.key === "ArrowRight") {
        keyboardEvent.preventDefault();
        playback.next();
      } else if (keyboardEvent.key === "ArrowLeft") {
        keyboardEvent.preventDefault();
        playback.prev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback]);

  const playLabelKey = useMemo(() => {
    if (phase === "playing") {
      return "player.pause" as const;
    }
    if (phase === "finished") {
      return "player.replay" as const;
    }
    if (step > 0) {
      return "player.resume" as const;
    }
    return "player.play" as const;
  }, [phase, step]);

  const metrics = currentEvent?.metrics ?? { comparisons: 0, swaps: 0, writes: 0 };
  const passNumber = (currentEvent?.auxiliary_state.pass_index ?? 0) + 1;
  const customPassValue = passMetric ? passMetric.compute(currentEvent) : null;
  const progress = formatTranslation("player.progress", { step, total });
  const passValue = formatTranslation("player.passValue", { pass: passNumber });

  return (
    <section
      aria-label={zh("player.region")}
      className="lab-player"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-testid="trace-player"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="section-card">
          <h2>
            <BilingualText as="span" size="subtitle" tkey="player.chart.title" />
          </h2>
          <BarChart
            items={trace.items}
            state={currentState}
            event={currentEvent}
            reducedMotion={reducedMotion}
            unit={unit}
          />
          {renderAux ? renderAux({ event: currentEvent, state: currentState }) : null}
        </div>

        <div className="section-card">
          <CodePanel
            code={trace.code}
            highlightedLineIds={currentEvent?.code_line_ids ?? []}
            reducedMotion={reducedMotion}
          />
          {inlinePrompt ? (
            <InlineComparePanel
              key={currentEvent?.step_id ?? "idle"}
              event={currentEvent}
            />
          ) : null}
        </div>
      </div>

      <section
        aria-labelledby="step-explanation-title"
        className="section-card"
      >
        <h2 id="step-explanation-title">
          <BilingualText as="span" size="subtitle" tkey="player.explanation.title" />
        </h2>
        <div className="section-lead" data-testid="step-explanation">
          {currentEvent ? (
            <BilingualText
              zh={currentEvent.explanation["zh-Hant"]}
              en={currentEvent.explanation.en}
            />
          ) : (
            <BilingualText tkey="player.idleHint" />
          )}
        </div>
      </section>

      <div className="lab-controls" aria-label={zh("player.controls.title")} role="group">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn--primary"
            onClick={playback.togglePlay}
          >
            <BilingualText as="span" size="sm" tone="onPrimary" tkey={playLabelKey} />
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={playback.prev}
            disabled={step === 0}
          >
            <BilingualText as="span" size="sm" tkey="player.prev" />
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={playback.next}
            disabled={step >= total}
          >
            <BilingualText as="span" size="sm" tkey="player.next" />
          </button>
          <button type="button" className="btn btn--secondary" onClick={playback.reset}>
            <BilingualText as="span" size="sm" tkey="player.reset" />
          </button>
          <label className="flex items-center gap-2">
            <BilingualText as="span" size="sm" tkey="player.speed.label" />
            <select
              className="lab-controls__speed"
              aria-label={zh("player.speed.label")}
              value={playback.speed}
              onChange={(changeEvent) => playback.setSpeed(Number(changeEvent.target.value))}
            >
              {SPEED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {`${option}x`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <dl className="lab-controls__metrics">
          <div>
            <dt>
              <BilingualText size="xs" tkey="player.metric.comparisons" />
            </dt>
            <dd data-testid="metric-comparisons">{metrics.comparisons}</dd>
          </div>
          <div>
            <dt>
              <BilingualText size="xs" tkey="player.metric.swaps" />
            </dt>
            <dd data-testid="metric-swaps">{metrics.swaps}</dd>
          </div>
          <div>
            <dt>
              <BilingualText size="xs" tkey="player.metric.writes" />
            </dt>
            <dd data-testid="metric-writes">{metrics.writes}</dd>
          </div>
          <div>
            <dt>
              {passMetric ? (
                <BilingualText
                  size="xs"
                  zh={passMetric.label["zh-Hant"]}
                  en={passMetric.label.en}
                />
              ) : (
                <BilingualText size="xs" tkey="player.metric.pass" />
              )}
            </dt>
            <dd data-testid="metric-pass">
              {passMetric ? (
                (customPassValue ?? "—")
              ) : (
                <BilingualText size="xs" zh={passValue["zh-Hant"]} en={passValue.en} />
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="lab-controls__phase" data-testid="phase">
            <BilingualText size="xs" tkey={PHASE_LABEL_KEYS[phase]} />
          </span>
          <span data-testid="step-progress">
            <BilingualText size="xs" zh={progress["zh-Hant"]} en={progress.en} />
          </span>
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        <BilingualText size="xs" tkey="player.keyboardHint" />
      </p>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">
        {playback.liveMessage}
      </p>
    </section>
  );
}
