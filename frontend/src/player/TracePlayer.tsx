/**
 * 冒泡排序轨迹播放器：全宽柱图 + 紧凑控制条 + 顶部对齐的双栏。
 *
 * 布局（阶段 4.8）：
 * 1. 柱图占主内容区 100% 宽，10/30 根柱一屏完整显示，不横向滚动；
 * 2. 柱图正下方是紧凑控制条（播放/暂停、上一步、下一步、重置、调速）+ 当前步骤一句双语说明；
 * 3. 控制条下方是 `items-start` 双栏：左为核心循环代码，右为内联比较区 + 实时计数。
 *
 * 所有视觉状态都来自 trace 数据（states[] 与当前事件的索引/行组），
 * 组件本身不推导排序、不自行交换数字、不猜测下一行代码。
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
  /** 在右列常驻内联比较区（/lab 与 /weather-sort 都使用）。 */
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
  const progress = formatTranslation("player.progress", { step, total });
  const passValue = formatTranslation("player.passValue", { pass: passNumber });
  const computedPass = passMetric ? passMetric.compute(currentEvent) : null;

  return (
    <section
      aria-label={zh("player.region")}
      className="lab-player"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-testid="trace-player"
    >
      <div className="section-card player-chart-card" data-testid="player-chart-card">
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

        {/* 紧凑控制条：紧贴柱图下方，不 sticky、不占用整块卡片。 */}
        <div
          className="lab-controls"
          data-testid="player-controls"
          role="group"
          aria-label={zh("player.controls.title")}
        >
          <div className="player-control-row">
            <button type="button" className="btn btn--primary" onClick={playback.togglePlay}>
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
            <span className="player-meta-row">
              <span className="lab-controls__phase" data-testid="phase">
                <BilingualText size="xs" tkey={PHASE_LABEL_KEYS[phase]} />
              </span>
              <span data-testid="step-progress">
                <BilingualText size="xs" zh={progress["zh-Hant"]} en={progress.en} />
              </span>
            </span>
          </div>

          {/* 当前步骤一句话说明；idle 时给固定提示，避免空白跳动。 */}
          <div className="player-step-explanation" data-testid="step-explanation">
            {currentEvent ? (
              <BilingualText
                size="xs"
                zh={currentEvent.explanation["zh-Hant"]}
                en={currentEvent.explanation.en}
              />
            ) : (
              <BilingualText size="xs" tkey="player.idleHint" />
            )}
          </div>
        </div>
      </div>

      {/* 双栏顶部对齐：左核心循环代码，右内联比较区 + 实时计数。 */}
      <div
        className="grid gap-5 md:grid-cols-2 items-start player-main-grid"
        data-testid="player-main-grid"
      >
        <div className="section-card player-code-card">
          <CodePanel
            code={trace.code}
            highlightedLineIds={currentEvent?.code_line_ids ?? []}
            reducedMotion={reducedMotion}
          />
        </div>

        <div className="player-side-column" data-testid="player-side-column">
          {inlinePrompt ? (
            <InlineComparePanel key={currentEvent?.step_id ?? "idle"} event={currentEvent} />
          ) : null}

          <section
            className="player-metrics-card"
            aria-label={zh("player.metrics.title")}
            data-testid="player-metrics"
          >
            <h3>
              <BilingualText as="span" size="sm" tkey="player.metrics.title" />
            </h3>
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
                    computedPass === null ? (
                      "—"
                    ) : (
                      computedPass
                    )
                  ) : (
                    <BilingualText size="xs" zh={passValue["zh-Hant"]} en={passValue.en} />
                  )}
                </dd>
              </div>
            </dl>
          </section>
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
