/**
 * react-plotly.js 的轻量测试替身：不加载 plotly bundle，也不碰 canvas/WebGL，
 * 只记录每次渲染收到的 data / layout / config，供断言双语悬停、图例等配置。
 */
export interface CapturedFigure {
  readonly data: readonly Record<string, unknown>[];
  readonly layout: Record<string, unknown>;
  readonly config: Record<string, unknown>;
}

export const capturedFigures: CapturedFigure[] = [];

export function resetCapturedFigures(): void {
  capturedFigures.length = 0;
}

export function lastFigure(): CapturedFigure | undefined {
  return capturedFigures[capturedFigures.length - 1];
}

export function PlotlyStub(props: {
  data?: unknown[];
  layout?: unknown;
  config?: unknown;
}): null {
  capturedFigures.push({
    data: (props.data ?? []) as Record<string, unknown>[],
    layout: (props.layout ?? {}) as Record<string, unknown>,
    config: (props.config ?? {}) as Record<string, unknown>,
  });
  return null;
}
