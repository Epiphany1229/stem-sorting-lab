import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InlineComparePanel } from "../InlineComparePanel";
import { eventByStep, traceFixture } from "./traceFixture";

describe("内联比较互动区（代码面板下方）", () => {
  it("没有事件或非 compare 事件时显示简短状态说明", () => {
    const { rerender } = render(<InlineComparePanel event={null} />);
    expect(screen.getByTestId("inline-compare")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("inline-compare-idle")).toHaveTextContent("這一步不是比較");

    rerender(<InlineComparePanel event={eventByStep(0)} />); // mark_sorted
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-compare-question")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("compare 事件出题，答对后显示双语反馈与后端解释", () => {
    const compareEvent = eventByStep(1); // compare(5,3)，will_swap=true
    render(<InlineComparePanel event={compareEvent} />);

    expect(screen.getByTestId("inline-compare-question")).toBeInTheDocument();
    expect(screen.getByText("這兩個數需要交換嗎？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "需要" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要" })).toBeInTheDocument();
    // 不再使用弹窗 / focus trap。
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    const feedback = screen.getByTestId("inline-compare-feedback");
    expect(feedback).toHaveTextContent("答對了");
    expect(screen.getByTestId("inline-compare-answer")).toHaveTextContent("需要交換");
    expect(feedback).toHaveTextContent(compareEvent.explanation["zh-Hant"]);
    expect(feedback).toHaveTextContent(compareEvent.explanation.en);
  });

  it("答错时给出纠正反馈；判定只读事件的 will_swap", () => {
    const keepEvent = eventByStep(3); // compare(5,8)，will_swap=false
    expect(keepEvent.auxiliary_state.comparison?.will_swap).toBe(false);
    render(<InlineComparePanel event={keepEvent} />);

    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    expect(screen.getByTestId("inline-compare-feedback")).toHaveTextContent("答錯了");
    expect(screen.getByTestId("inline-compare-answer")).toHaveTextContent("不需要交換");
  });

  it("选项是普通按钮，键盘可达且不阻塞其它操作", () => {
    render(<InlineComparePanel event={eventByStep(1)} />);
    const swapButton = screen.getByRole("button", { name: "需要" });
    swapButton.focus();
    expect(swapButton).toHaveFocus();
    fireEvent.keyDown(swapButton, { key: "Enter" });
    fireEvent.click(swapButton);
    expect(screen.getByTestId("inline-compare-feedback")).toBeInTheDocument();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

// traceFixture 用于确认事件结构与组件读取的字段一致。
it("fixture 的 compare 事件带有后端计算的 will_swap", () => {
  expect(traceFixture.events.some((event) => event.auxiliary_state.comparison)).toBe(true);
});
