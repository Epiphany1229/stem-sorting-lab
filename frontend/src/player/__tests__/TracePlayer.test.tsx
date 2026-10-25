import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TracePlayer } from "../TracePlayer";
import { BASE_STEP_DELAY_MS } from "../useTracePlayback";
import type { BubbleTrace } from "../types";
import { traceFixture, eventByStep } from "./traceFixture";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function nextButton(): HTMLElement {
  return screen.getByRole("button", { name: "下一步" });
}

function progressText(): string {
  return screen.getByTestId("step-progress").textContent ?? "";
}

describe("TracePlayer 播放器状态机", () => {
  it("初始为 idle，下一步/上一步只使用轨迹中已有的快照", () => {
    render(<TracePlayer trace={traceFixture} />);

    expect(screen.getByTestId("trace-player")).toBeInTheDocument();
    expect(progressText()).toContain("已播放 0 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("待開始");
    expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();
    expect(screen.getByTestId("step-explanation")).toHaveTextContent("按「開始播放」或「下一步」");

    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 1 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("已暫停");
    expect(screen.getByTestId("step-explanation")).toHaveTextContent("進入第 1 輪");
    // mark_sorted 事件的行组 L6 + L5
    expect(document.querySelector('[data-line-id="L6"]')?.getAttribute("data-highlighted")).toBe(
      "true",
    );
    expect(document.querySelector('[data-line-id="L5"]')?.getAttribute("data-highlighted")).toBe(
      "true",
    );

    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 2 / 14 步");
    expect(screen.getByTestId("step-explanation")).toHaveTextContent(
      eventByStep(1).explanation["zh-Hant"],
    );
    expect(document.querySelector('[data-line-id="L10"]')?.getAttribute("data-highlighted")).toBe(
      "true",
    );
    // 状态来自 state_after_id=0，即初始快照 [5, 3, 8, 1]
    expect(screen.getAllByTestId("bar-value").map((node) => node.textContent)).toEqual([
      "5",
      "3",
      "8",
      "1",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(progressText()).toContain("已播放 1 / 14 步");
    expect(document.querySelector('[data-line-id="L10"]')?.getAttribute("data-highlighted")).toBe(
      "false",
    );
    expect(screen.getAllByTestId("bar-value").map((node) => node.textContent)).toEqual([
      "5",
      "3",
      "8",
      "1",
    ]);
  });

  it("暂停后严格不推进", () => {
    vi.useFakeTimers();
    render(<TracePlayer trace={traceFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "開始播放" }));
    act(() => {
      vi.advanceTimersByTime(BASE_STEP_DELAY_MS + 50);
    });
    expect(progressText()).toContain("已播放 1 / 14 步");

    fireEvent.click(screen.getByRole("button", { name: "暫停" }));
    expect(screen.getByTestId("phase")).toHaveTextContent("已暫停");
    const frozenProgress = progressText();
    const frozenExplanation = screen.getByTestId("step-explanation").textContent;

    act(() => {
      vi.advanceTimersByTime(BASE_STEP_DELAY_MS * 10);
    });
    expect(progressText()).toBe(frozenProgress);
    expect(screen.getByTestId("step-explanation").textContent).toBe(frozenExplanation);
    expect(screen.getByTestId("phase")).toHaveTextContent("已暫停");
  });

  it("自动播放会按事件顺序推进到 finished", () => {
    vi.useFakeTimers();
    render(<TracePlayer trace={traceFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "開始播放" }));
    for (let index = 0; index < traceFixture.events.length; index += 1) {
      act(() => {
        vi.advanceTimersByTime(BASE_STEP_DELAY_MS);
      });
    }

    expect(progressText()).toContain("已播放 14 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("已完成");
    expect(nextButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新播放" })).toBeInTheDocument();
    // 最后一个事件是 done，全部下标都已就位。
    const bars = screen.getAllByTestId("bar");
    expect(bars.map((bar) => bar.getAttribute("data-state"))).toEqual([
      "sorted",
      "sorted",
      "sorted",
      "sorted",
    ]);
  });

  it("重置回到 idle；键盘空格播放/暂停、左右键步进", () => {
    render(<TracePlayer trace={traceFixture} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: "重置" }));

    expect(progressText()).toContain("已播放 0 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("待開始");
    expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(progressText()).toContain("已播放 1 / 14 步");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(progressText()).toContain("已播放 0 / 14 步");

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("phase")).toHaveTextContent("播放中");
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("phase")).toHaveTextContent("已暫停");
  });

  it("切换方向（新的轨迹对象）时重置为 idle", () => {
    const { rerender } = render(<TracePlayer trace={traceFixture} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 2 / 14 步");

    const descendingTrace: BubbleTrace = { ...traceFixture, direction: "desc" };
    rerender(<TracePlayer trace={descendingTrace} />);

    expect(progressText()).toContain("已播放 0 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("待開始");
  });

  it("手动步进写 aria-live 摘要，连续播放不逐帧播报", () => {
    vi.useFakeTimers();
    render(<TracePlayer trace={traceFixture} />);

    const liveRegion = screen.getByTestId("live-region");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion.textContent).toBe("");

    fireEvent.click(nextButton());
    expect(liveRegion.textContent).toContain("第 1 步，共 14 步");
    const manualAnnouncement = liveRegion.textContent;

    fireEvent.click(screen.getByRole("button", { name: "繼續播放" }));
    act(() => {
      vi.advanceTimersByTime(BASE_STEP_DELAY_MS + 50);
    });
    // 自动播放推进了，但 live region 不播报新步骤。
    expect(progressText()).toContain("已播放 2 / 14 步");
    expect(liveRegion.textContent).toBe(manualAnnouncement);
  });
});

describe("TracePlayer 内联比较区（阶段 4.7）", () => {
  it("inlinePrompt 在代码面板下方常驻；compare 出题、答后反馈且不阻塞播放", () => {
    render(<TracePlayer trace={traceFixture} inlinePrompt />);

    const inline = screen.getByTestId("inline-compare");
    expect(inline).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();
    // 不再有弹窗式引导模式。
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(nextButton()); // mark_sorted：非 compare
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();
    expect(progressText()).toContain("已播放 1 / 14 步");

    fireEvent.click(nextButton()); // compare(5,3)，will_swap=true
    expect(screen.getByText("這兩個數需要交換嗎？")).toBeInTheDocument();
    expect(progressText()).toContain("已播放 2 / 14 步");

    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    expect(screen.getByTestId("inline-compare-feedback")).toHaveTextContent("答對了");
    expect(screen.getByTestId("inline-compare-answer")).toHaveTextContent("需要交換");

    // 答题不阻塞播放：仍可继续下一步。
    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 3 / 14 步");
  });

  it("答错时给出纠正反馈；下一步非 compare 时区域显示状态说明", () => {
    render(<TracePlayer trace={traceFixture} inlinePrompt />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: "不需要" }));
    expect(screen.getByTestId("inline-compare-feedback")).toHaveTextContent("答錯了");
    expect(screen.getByTestId("inline-compare-answer")).toHaveTextContent("需要交換");

    fireEvent.click(nextButton()); // swap 事件
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();
  });

  it("不传 inlinePrompt 时没有内联区，也不会有任何弹窗（阶段 2 基础行为）", () => {
    render(<TracePlayer trace={traceFixture} />);

    expect(screen.queryByTestId("inline-compare")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 2 / 14 步");
  });
});

describe("TracePlayer 减少动态", () => {
  it("prefers-reduced-motion 开启时标记 reduced motion，但推进逻辑不变", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    render(<TracePlayer trace={traceFixture} />);

    expect(screen.getByTestId("trace-player")).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-reduced-motion", "true");

    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 1 / 14 步");
  });
});
