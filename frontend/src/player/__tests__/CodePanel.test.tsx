import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodePanel } from "../CodePanel";
import { eventByStep, traceFixture } from "./traceFixture";

function lineElement(lineId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-line-id="${lineId}"]`);
  if (!element) {
    throw new Error(`没有渲染行 ${lineId}`);
  }
  return element;
}

describe("CodePanel Python 代码高亮", () => {
  it("只高亮当前事件 code_line_ids 的行组，其余行不带高亮标记", () => {
    const compareEvent = eventByStep(1);
    render(
      <CodePanel code={traceFixture.code} highlightedLineIds={compareEvent.code_line_ids} />,
    );

    const renderedLines = document.querySelectorAll<HTMLElement>("[data-line-id]");
    expect(renderedLines).toHaveLength(traceFixture.code.lines.length);

    for (const line of renderedLines) {
      const lineId = line.dataset.lineId;
      const expected = compareEvent.code_line_ids.includes(lineId ?? "") ? "true" : "false";
      expect(line.dataset.highlighted).toBe(expected);
    }

    // compare 的行组是 [emit 行 L9, if 行 L10]。
    expect(lineElement("L9").dataset.lineNo).toBe("9");
    expect(lineElement("L10").dataset.lineNo).toBe("10");
    expect(lineElement("L10").dataset.highlighted).toBe("true");
    expect(lineElement("L11").dataset.highlighted).toBe("false");
  });

  it("mark_sorted 的高亮行组同时包含插桩行与 for 行，行号保持不变", () => {
    const markSorted = eventByStep(0);
    render(<CodePanel code={traceFixture.code} highlightedLineIds={markSorted.code_line_ids} />);

    expect(markSorted.code_line_ids).toEqual(["L6", "L5"]);
    expect(lineElement("L6").dataset.highlighted).toBe("true");
    expect(lineElement("L5").dataset.highlighted).toBe("true");
    expect(lineElement("L6").dataset.lineNo).toBe("6");
    // 行号来自协议字段，不因折叠/降淡而重排。
    expect(lineElement("L17").dataset.lineNo).toBe("17");
  });

  it("插桩行默认降淡，切换后突出显示且不影响高亮", () => {
    const compareEvent = eventByStep(1);
    render(
      <CodePanel code={traceFixture.code} highlightedLineIds={compareEvent.code_line_ids} />,
    );

    // 未被高亮的插桩行默认降淡。
    expect(lineElement("L12").dataset.trace).toBe("true");
    expect(lineElement("L12").dataset.dimmed).toBe("true");
    // 高亮优先：正在高亮的插桩行不会变淡。
    expect(lineElement("L9").dataset.dimmed).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "顯示插樁行" }));
    expect(lineElement("L12").dataset.dimmed).toBe("false");
    expect(lineElement("L9").dataset.highlighted).toBe("true");
    expect(lineElement("L12").dataset.lineNo).toBe("12");

    fireEvent.click(screen.getByRole("button", { name: "隱藏插樁行" }));
    expect(lineElement("L12").dataset.dimmed).toBe("true");
  });

  it("没有当前事件时不渲染任何高亮", () => {
    render(<CodePanel code={traceFixture.code} highlightedLineIds={[]} />);

    for (const line of document.querySelectorAll<HTMLElement>("[data-line-id]")) {
      expect(line.dataset.highlighted).toBe("false");
    }
  });
});
