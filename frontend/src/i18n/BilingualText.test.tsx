import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BilingualText } from "./BilingualText";
import { dictionary } from "./dictionary";

// 只列一定不会出现在繁体中文里的简体字，用来防止简体文案混进学生可见界面。
// 注意排除繁简同形的字（例如「站」「按」「覆」），否则会产生误报。
const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

describe("BilingualText", () => {
  it("渲染繁体中文在上、英文在下的两个 lang 节点", () => {
    render(<BilingualText zh="排序實驗室" en="Sorting Lab" />);

    const zhNode = document.querySelector('[lang="zh-Hant"]');
    const enNode = document.querySelector('[lang="en"]');

    expect(zhNode).not.toBeNull();
    expect(enNode).not.toBeNull();
    expect(zhNode).toHaveTextContent("排序實驗室");
    expect(enNode).toHaveTextContent("Sorting Lab");

    // DOM 顺序：中文在前（视觉上在上），英文紧随其后。
    expect(zhNode?.compareDocumentPosition(enNode as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // 英文节点对屏幕阅读器隐藏，避免同一段内容被中英文重复朗读。
    expect(enNode).toHaveAttribute("aria-hidden", "true");
    expect(zhNode).not.toHaveAttribute("aria-hidden");
  });

  it("可以直接用字典 key", () => {
    render(<BilingualText tkey="lab.title" />);

    expect(screen.getByText("冒泡排序入門實驗室")).toBeInTheDocument();
    expect(screen.getByText("Bubble sort starter lab")).toBeInTheDocument();
  });

  it("可渲染成标题元素，且标题的可访问名称只有繁体中文", () => {
    render(<BilingualText as="h1" size="title" zh="天氣探索" en="Weather explorer" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("天氣探索");
    expect(heading).toHaveTextContent("Weather explorer");
  });
});

describe("翻译字典", () => {
  const entries = Object.entries(dictionary);

  it("每个 key 的中文与英文都完整", () => {
    expect(entries.length).toBeGreaterThan(50);

    for (const [, value] of entries) {
      expect(value["zh-Hant"].trim().length).toBeGreaterThan(0);
      expect(value.en.trim().length).toBeGreaterThan(0);
    }
  });

  it("繁体中文文案不含简体字", () => {
    const offenders: string[] = [];

    for (const [key, value] of entries) {
      for (const char of SIMPLIFIED_ONLY_CHARS) {
        if (value["zh-Hant"].includes(char)) {
          offenders.push(`${key} 含有简体字「${char}」`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
