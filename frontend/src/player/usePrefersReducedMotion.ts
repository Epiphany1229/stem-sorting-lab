/**
 * 读取系统「减少动态」偏好。
 *
 * 开启时取消过渡动画，但播放器状态推进逻辑完全不变（契约 §6.6）。
 * jsdom 等环境没有 matchMedia 时安全降级为 false。
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function readPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(readPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQueryList = window.matchMedia(QUERY);
    setReduced(mediaQueryList.matches);

    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}
