/**
 * 播放器状态机（契约 §6）。
 *
 * idle → playing → paused → finished。
 * - 画面状态只取轨迹里的 states[]（按事件的 state_after_id / state_before_id 取快照），
 *   绝不自行交换数组或反向执行算法；
 * - prev 只回退到已有的快照，因此永远不会「倒着跑」算法；
 * - 暂停后没有任何计时器推进；
 * - 切换输入/方向/early_exit（trace 对象变化）或调整速度都重置为 idle；
 * - 阶段 4.7 起比较互动是代码面板下方的内联区，因此这里不再需要「预测弹窗」暂停逻辑。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatTranslation } from "../i18n/dictionary";
import type { BubbleTrace, TraceEvent, TraceState } from "./types";

export type PlaybackPhase = "idle" | "playing" | "paused" | "finished";

export interface PlaybackController {
  readonly step: number;
  readonly total: number;
  readonly phase: PlaybackPhase;
  readonly speed: number;
  readonly currentEvent: TraceEvent | null;
  readonly currentState: TraceState;
  readonly liveMessage: string;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
}

/** 1x 速度下每步的停留时间（毫秒）。 */
export const BASE_STEP_DELAY_MS = 900;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

type AdvanceSource = "manual" | "auto";

export function useTracePlayback(trace: BubbleTrace): PlaybackController {
  const total = trace.events.length;
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [speed, setSpeedState] = useState(1);
  const [liveMessage, setLiveMessage] = useState("");

  // trace 变化 = 输入/方向/early_exit 变化：重置到 idle（契约 §6.2）。
  useEffect(() => {
    setStep(0);
    setPhase("idle");
    setLiveMessage("");
  }, [trace]);

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
      if (step >= total) {
        setPhase("finished");
        return;
      }
      commitAdvance(source);
    },
    [step, total, commitAdvance],
  );

  const play = useCallback(() => {
    if (step >= total) {
      setStep(0);
      setLiveMessage("");
    }
    setPhase("playing");
  }, [step, total]);

  const pause = useCallback(() => {
    setPhase("paused");
  }, []);

  const togglePlay = useCallback(() => {
    if (phase === "playing") {
      pause();
    } else {
      play();
    }
  }, [phase, pause, play]);

  const next = useCallback(() => requestAdvance("manual"), [requestAdvance]);

  const prev = useCallback(() => {
    if (step <= 0) {
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
  }, [step, announceStep]);

  const reset = useCallback(() => {
    setStep(0);
    setPhase("idle");
    setLiveMessage("");
  }, []);

  // 契约 §6.2：切换速度也回到 idle，避免中途变速造成时间轴歧义。
  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(Math.min(MAX_SPEED, Math.max(MIN_SPEED, nextSpeed)));
    setStep(0);
    setPhase("idle");
    setLiveMessage("");
  }, []);

  // 自动播放：只在 playing 时挂计时器；暂停立即清掉。
  useEffect(() => {
    if (phase !== "playing") {
      return;
    }
    if (step >= total) {
      setPhase("finished");
      return;
    }
    const delay = BASE_STEP_DELAY_MS / speed;
    const timer = window.setTimeout(() => requestAdvance("auto"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, step, speed, total, requestAdvance]);

  return {
    step,
    total,
    phase,
    speed,
    currentEvent,
    currentState,
    liveMessage,
    play,
    pause,
    togglePlay,
    next,
    prev,
    reset,
    setSpeed,
  };
}
