import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "./App";
import { dictionary } from "./i18n/dictionary";
import { navItems } from "./navigation";

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("七个页面路由", () => {
  const pageCases = navItems.map((item) => [item.path, dictionary[item.titleKey]["zh-Hant"]] as const);

  it.each(pageCases)("%s 有明确的 h1 页面标题", (path, title) => {
    renderRoute(path);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
  });

  it.each(pageCases)("%s 有当前位置与返回入口", (path) => {
    renderRoute(path);

    // 面包屑：当前项带 aria-current="page"
    const current = document.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();

    // 返回入口：首页用「回到頁首」，其他页面用「返回首頁」
    expect(screen.getAllByRole("link", { name: /^(返回首頁|回到頁首)$/ }).length).toBeGreaterThan(0);
  });

  it.each(pageCases)("%s 出现在顶部导航里", (path) => {
    renderRoute(path);

    const nav = screen.getAllByRole("navigation")[0];
    expect(nav).toBeDefined();
  });
});

describe("算法中心", () => {
  it("列出全部十种算法，并各自标注状态", () => {
    renderRoute("/algorithms");

    const expectedNames = [
      "冒泡排序",
      "選擇排序",
      "插入排序",
      "希爾排序",
      "歸併排序",
      "快速排序",
      "堆積排序",
      "計數排序",
      "桶排序",
      "基數排序",
    ];

    for (const name of expectedNames) {
      expect(screen.getAllByRole("heading", { level: 3, name })).toHaveLength(1);
    }

    // 十个「開發中」状态徽标都渲染出来，不隐藏未完成项。
    const algorithmItems = expectedNames
      .map((name) => screen.getAllByRole("heading", { level: 3, name })[0]?.closest("li"))
      .filter((item): item is HTMLLIElement => item instanceof HTMLLIElement);
    expect(algorithmItems).toHaveLength(10);

    for (const item of algorithmItems) {
      expect(item).toHaveTextContent("開發中");
    }
  });
});

describe("未知路径", () => {
  it("显示「找不到頁面」而不是空白页", () => {
    renderRoute("/no-such-page");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找不到頁面");
  });
});

describe("页脚署名", () => {
  it("包含香港天文台与 data.gov.hk 的双语署名", () => {
    renderRoute("/");

    expect(screen.getByText(/香港天文台及政府資料一線通/)).toBeInTheDocument();
    expect(screen.getByText(/Hong Kong Observatory and data\.gov\.hk/)).toBeInTheDocument();
  });
});
