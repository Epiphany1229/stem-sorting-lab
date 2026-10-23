import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TracePlayer } from "../TracePlayer";
import { BASE_STEP_DELAY_MS, PREDICTION_FEEDBACK_DELAY_MS } from "../useTracePlayback";
import type { BubbleTrace } from "../types";
import { eventByStep, traceFixture } from "./traceFixture";

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
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

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
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

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
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

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
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

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
    const { rerender } = render(<TracePlayer trace={traceFixture} guidedMode={false} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 2 / 14 步");

    const descendingTrace: BubbleTrace = { ...traceFixture, direction: "desc" };
    rerender(<TracePlayer trace={descendingTrace} guidedMode={false} />);

    expect(progressText()).toContain("已播放 0 / 14 步");
    expect(screen.getByTestId("phase")).toHaveTextContent("待開始");
  });

  it("手动步进写 aria-live 摘要，连续播放不逐帧播报", () => {
    vi.useFakeTimers();
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

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

describe("TracePlayer 教学预测弹窗", () => {
  it("引导模式下 compare 事件前弹出预测，判定只读 will_swap", () => {
    render(<TracePlayer trace={traceFixture} guidedMode={true} />);

    // step 1 是 mark_sorted，不弹窗。
    fireEvent.click(nextButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(progressText()).toContain("已播放 1 / 14 步");

    // step 2 是 compare(5,3)，will_swap=true，弹窗出现且尚未推进。
    fireEvent.click(nextButton());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("下一步這兩個數需要交換嗎？")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Do these two numbers need to be swapped?"),
    ).toBeInTheDocument();
    expect(progressText()).toContain("已播放 1 / 14 步");
    expect(screen.getByRole("button", { name: "需要" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答對了！");
    expect(screen.getByTestId("prediction-correct-answer")).toHaveTextContent(
      "正確答案：需要交換。",
    );
    expect(within(dialog).getByText(eventByStep(1).explanation["zh-Hant"])).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(progressText()).toContain("已播放 2 / 14 步");
    expect(screen.getByTestId("step-explanation")).toHaveTextContent(
      eventByStep(1).explanation["zh-Hant"],
    );
  });

  it("学生答错时给出双语反馈与正确解释", () => {
    render(<TracePlayer trace={traceFixture} guidedMode={true} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不需要" }));
    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答錯了，看看下面的解釋。");
    expect(screen.getByTestId("prediction-correct-answer")).toHaveTextContent(
      "正確答案：需要交換。",
    );
  });

  it("答完展示 explanation 后自动推进（契约 §6.4）", () => {
    vi.useFakeTimers();
    render(<TracePlayer trace={traceFixture} guidedMode={true} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: "需要" }));

    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答對了！");
    expect(progressText()).toContain("已播放 1 / 14 步");

    act(() => {
      vi.advanceTimersByTime(PREDICTION_FEEDBACK_DELAY_MS);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(progressText()).toContain("已播放 2 / 14 步");
    // 推进后 explanation 仍显示在步骤解释面板。
    expect(screen.getByTestId("step-explanation")).toHaveTextContent(
      eventByStep(1).explanation["zh-Hant"],
    );
  });

  it("will_swap=false 的比较点（5 < 8）答「不需要」才算对", () => {
    render(<TracePlayer trace={traceFixture} guidedMode={true} />);

    // 推进到 compare(5,8) 之前：mark_sorted → compare(5,3) 答题 → swap → 下一个 compare。
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(nextButton()); // swap(5,3) → step 3
    fireEvent.click(nextButton()); // 即将 compare(5,8)，弹窗出现

    const comparison = eventByStep(3).auxiliary_state.comparison;
    if (!comparison) {
      throw new Error("fixture 中 compare 事件缺少 comparison 字段");
    }
    expect(comparison.will_swap).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "不需要" }));
    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答對了！");
    expect(screen.getByTestId("prediction-correct-answer")).toHaveTextContent(
      "正確答案：不需要交換。",
    );
  });

  it("Esc 关闭弹窗、不推进，并把焦点还给触发按钮", () => {
    render(<TracePlayer trace={traceFixture} guidedMode={true} />);

    fireEvent.click(nextButton());
    const trigger = nextButton();
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(progressText()).toContain("已播放 1 / 14 步");
    expect(trigger).toHaveFocus();
  });

  it("自由实验模式不弹预测题", () => {
    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

    fireEvent.click(nextButton());
    fireEvent.click(nextButton());

    expect(screen.queryByRole("dialog")).toBeNull();
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

    render(<TracePlayer trace={traceFixture} guidedMode={false} />);

    expect(screen.getByTestId("trace-player")).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-reduced-motion", "true");

    fireEvent.click(nextButton());
    expect(progressText()).toContain("已播放 1 / 14 步");
  });
});
