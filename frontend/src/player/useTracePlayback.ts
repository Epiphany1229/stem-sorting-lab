/**
 * 播放器状态机（契约 §6）。
 *
 * idle → playing → paused → finished。
 * - 画面状态只取轨迹里的 states[]（按事件的 state_after_id / state_before_id 取快照），
 *   绝不自行交换数组或反向执行算法；
 * - prev 只回退到已有的快照，因此永远不会「倒着跑」算法；
 * - 暂停后没有任何计时器推进；
 * - 切换输入/方向/early_exit（trace 对象变化）或调整速度都重置为 idle。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatTranslation } from "../i18n/dictionary";
import type { PredictionResolution } from "./PredictionDialog";
import type { BubbleTrace, Comparison, TraceEvent, TraceState } from "./types";

export type PlaybackPhase = "idle" | "playing" | "paused" | "finished";

export interface PredictionPrompt {
  readonly event: TraceEvent;
  readonly comparison: Comparison;
  readonly wasPlaying: boolean;
  readonly resolution: PredictionResolution | null;
}

export interface PlaybackController {
  readonly step: number;
  readonly total: number;
  readonly phase: PlaybackPhase;
  readonly speed: number;
  readonly currentEvent: TraceEvent | null;
  readonly currentState: TraceState;
  readonly liveMessage: string;
  readonly prediction: PredictionPrompt | null;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  answerPrediction: (needsSwap: boolean) => void;
  continuePrediction: () => void;
  dismissPrediction: () => void;
}

/** 1x 速度下每步的停留时间（毫秒）。 */
export const BASE_STEP_DELAY_MS = 900;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
/** 预测题作答后停留展示 explanation 的时间，随后自动推进（契约 §6.4）。 */
export const PREDICTION_FEEDBACK_DELAY_MS = 3000;

type AdvanceSource = "manual" | "auto";

export function useTracePlayback(trace: BubbleTrace, guidedMode: boolean): PlaybackController {
  const total = trace.events.length;
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [speed, setSpeedState] = useState(1);
  const [prediction, setPrediction] = useState<PredictionPrompt | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  // trace 变化 = 输入/方向/early_exit 变化：重置到 idle（契约 §6.2）。
  useEffect(() => {
    setStep(0);
    setPhase("idle");
    setPrediction(null);
    setLiveMessage("");
  }, [trace]);

  // 切回自由模式时关掉尚未作答的预测，避免弹窗卡住。
  useEffect(() => {
    if (!guidedMode) {
      setPrediction(null);
    }
  }, [guidedMode]);

  const currentEvent = step > 0 ? (trace.events[step - 1] ?? null) : null;

  // 当前快照：直接使用事件记录的快照 id，不在前端计算数组。
  const currentState = useMemo<TraceState>(() => {
    if (step === 0) {
      return trace.states[0];
    }
    const event = trace.events[step - 1];
    const snapshot = event
      ? trace.states.find((state) => state.state_id === event.state_after_id)
      : undefined;
    return snapshot ?? trace.states[0];
  }, [step, trace]);

  const announceStep = useCallback(
    (nextStep: number) => {
      if (nextStep <= 0 || nextStep > trace.events.length) {
        setLiveMessage("");
        return;
      }
      const event = trace.events[nextStep - 1];
      const prefix = formatTranslation("player.announce.step", {
        step: nextStep,
        total: trace.events.length,
      })["zh-Hant"];
      setLiveMessage(`${prefix} ${event.explanation["zh-Hant"]}`);
    },
    [trace.events],
  );

  const commitAdvance = useCallback(
    (source: AdvanceSource) => {
      if (step >= total) {
        setPhase("finished");
        return;
      }
      const nextStep = step + 1;
      setStep(nextStep);
      if (nextStep >= total) {
        setPhase("finished");
      } else if (source === "manual") {
        // 手动步进后进入「已暂停」，等待用户继续下一步或播放。
        setPhase("paused");
      }
      // 只有手动步进才写 aria-live；连续播放不逐帧播报。
      if (source === "manual") {
        announceStep(nextStep);
      }
    },
    [step, total, announceStep],
  );

  const requestAdvance = useCallback(
    (source: AdvanceSource) => {
      if (prediction) {
        return;
      }
      if (step >= total) {
        setPhase("finished");
        return;
      }
      const upcoming = trace.events[step];
      if (!upcoming) {
        return;
      }
      const comparison = upcoming.auxiliary_state.comparison;
      // 引导模式下，进入 compare 事件之前先出预测题；判定数据来自后端 will_swap。
      if (guidedMode && upcoming.event_type === "compare" && comparison) {
        setPrediction({
          event: upcoming,
          comparison,
          wasPlaying: phase === "playing",
          resolution: null,
        });
        setPhase("paused");
        return;
      }
      commitAdvance(source);
    },
    [prediction, step, total, guidedMode, phase, trace.events, commitAdvance],
  );

  const play = useCallback(() => {
    if (prediction) {
      return;
    }
    if (step >= total) {
      setStep(0);
      setLiveMessage("");
    }
    setPhase("playing");
  }, [prediction, step, total]);

  const pause = useCallback(() => {
    if (prediction) {
      return;
    }
    setPhase("paused");
  }, [prediction]);

  const togglePlay = useCallback(() => {
    if (phase === "playing") {
      pause();
    } else {
      play();
    }
  }, [phase, pause, play]);

  const next = useCallback(() => requestAdvance("manual"), [requestAdvance]);

  const prev = useCallback(() => {
    if (prediction || step <= 0) {
      return;
    }
    const nextStep = step - 1;
    setStep(nextStep);
    setPhase(nextStep === 0 ? "idle" : "paused");
    if (nextStep > 0) {
      announceStep(nextStep);
    } else {
      setLiveMessage("");
    }
  }, [prediction, step, announceStep]);

  const reset = useCallback(() => {
    setStep(0);
    setPhase("idle");
    setPrediction(null);
    setLiveMessage("");
  }, []);

  // 契约 §6.2：切换速度也回到 idle，避免中途变速造成时间轴歧义。
  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(Math.min(MAX_SPEED, Math.max(MIN_SPEED, nextSpeed)));
    setStep(0);
    setPhase("idle");
    setPrediction(null);
    setLiveMessage("");
  }, []);

  const answerPrediction = useCallback((needsSwap: boolean) => {
    setPrediction((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        resolution: {
          answer: needsSwap,
          correct: needsSwap === current.comparison.will_swap,
        },
      };
    });
  }, []);

  const continuePrediction = useCallback(() => {
    if (!prediction) {
      return;
    }
    const { wasPlaying } = prediction;
    setPrediction(null);
    commitAdvance("manual");
    if (wasPlaying && step + 1 < total) {
      setPhase("playing");
    }
  }, [prediction, commitAdvance, step, total]);

  const dismissPrediction = useCallback(() => {
    setPrediction(null);
    setPhase("paused");
  }, []);

  // 契约 §6.4：答完展示 explanation 后自动推进；用户也可以按「繼續」立即推进。
  // 推进后该事件的 explanation 仍显示在步骤解释面板里，不会被丢掉。
  useEffect(() => {
    if (!prediction?.resolution) {
      return;
    }
    const timer = window.setTimeout(() => {
      continuePrediction();
    }, PREDICTION_FEEDBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [prediction, continuePrediction]);

  // 自动播放：只在 playing 且没有弹窗时挂计时器；暂停立即清掉。
  useEffect(() => {
    if (phase !== "playing" || prediction) {
      return;
    }
    if (step >= total) {
      setPhase("finished");
      return;
    }
    const delay = BASE_STEP_DELAY_MS / speed;
    const timer = window.setTimeout(() => requestAdvance("auto"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, prediction, step, speed, total, requestAdvance]);

  return {
    step,
    total,
    phase,
    speed,
    currentEvent,
    currentState,
    liveMessage,
    prediction,
    play,
    pause,
    togglePlay,
    next,
    prev,
    reset,
    setSpeed,
    answerPrediction,
    continuePrediction,
    dismissPrediction,
  };
}
