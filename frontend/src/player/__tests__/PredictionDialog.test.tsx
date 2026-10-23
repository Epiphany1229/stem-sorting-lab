import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PredictionDialog, type PredictionResolution } from "../PredictionDialog";
import { eventByStep } from "./traceFixture";

const compareEvent = eventByStep(1);

function comparisonOfFirstCompare() {
  const comparison = compareEvent.auxiliary_state.comparison;
  if (!comparison) {
    throw new Error("fixture 中的 compare 事件缺少 comparison 字段");
  }
  return comparison;
}

function renderDialog(resolution: PredictionResolution | null) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <PredictionDialog
      event={compareEvent}
      comparison={comparisonOfFirstCompare()}
      resolution={resolution}
      onAnswer={onAnswer}
      onContinue={onContinue}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onAnswer, onContinue, onDismiss };
}

describe("PredictionDialog 无障碍与反馈", () => {
  it("role=dialog + aria-modal，初始焦点在第一个选项，点击时把选择交给上层", () => {
    const { onAnswer } = renderDialog(null);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("下一步這兩個數需要交換嗎？")).toBeInTheDocument();
    expect(screen.getByText("Do these two numbers need to be swapped?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "需要" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "不需要" }));
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it("作答后展示双语反馈、正确答案与该事件 explanation，焦点移到「繼續」", () => {
    const { onContinue } = renderDialog({ answer: true, correct: true });

    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答對了！");
    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("Correct!");
    expect(screen.getByTestId("prediction-correct-answer")).toHaveTextContent("需要交換");
    expect(screen.getByText(compareEvent.explanation["zh-Hant"])).toBeInTheDocument();
    expect(screen.getByText(compareEvent.explanation.en)).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "繼續" });
    expect(continueButton).toHaveFocus();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("作答错误时展示错误反馈，但正确答案仍由 will_swap 决定", () => {
    renderDialog({ answer: true, correct: false });

    expect(screen.getByTestId("prediction-feedback")).toHaveTextContent("答錯了");
    expect(screen.getByTestId("prediction-correct-answer")).toHaveTextContent(
      "正確答案：需要交換。",
    );
  });

  it("Esc 关闭弹窗，并把焦点归还给打开弹窗的元素", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const onDismiss = vi.fn();
    const { unmount } = render(
      <PredictionDialog
        event={compareEvent}
        comparison={comparisonOfFirstCompare()}
        resolution={null}
        onAnswer={vi.fn()}
        onContinue={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("button", { name: "需要" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
