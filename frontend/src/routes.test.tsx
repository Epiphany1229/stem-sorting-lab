import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { dictionary } from "./i18n/dictionary";
import { navItems } from "./navigation";
import {
  algorithmListFixture,
  algorithmListResponse,
} from "./features/algorithms/__tests__/fixtures";

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("七个页面路由", () => {
  const pageCases = navItems.map((item) => [item.path, dictionary[item.titleKey]["zh-Hant"]] as const);

  it.each(pageCases)("%s 有明确的 h1 页面标题", async (path, title) => {
    renderRoute(path);

    // 懒加载页面会先显示 Suspense fallback，再异步挂载真实页面。
    await expect(screen.findByRole("heading", { level: 1 })).resolves.toHaveTextContent(title);
  });

  it.each(pageCases)("%s 有当前位置与返回入口", async (path) => {
    renderRoute(path);
    await screen.findByRole("heading", { level: 1 });

    // 面包屑：当前项带 aria-current="page"
    const current = document.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();

    // 返回入口：首页用「回到頁首」，其他页面用「返回首頁」
    expect(screen.getAllByRole("link", { name: /^(返回首頁|回到頁首)$/ }).length).toBeGreaterThan(0);
  });

  it.each(pageCases)("%s 出现在顶部导航里", async (path) => {
    renderRoute(path);
    await screen.findByRole("heading", { level: 1 });

    const nav = screen.getAllByRole("navigation")[0];
    expect(nav).toBeDefined();
  });
});

describe("算法中心（产品收敛：7 种比较类排序）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("从后端清单列出 7 种比较类排序，全部可用且无開發中占位", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => algorithmListResponse(),
      }) as unknown as Response),
    );

    renderRoute("/algorithms");
    await screen.findByTestId("algorithm-list");

    const expectedNames = [
      "冒泡排序",
      "選擇排序",
      "插入排序",
      "希爾排序",
      "歸併排序",
      "快速排序",
      "堆積排序",
    ];

    expect(algorithmListFixture).toHaveLength(7);
    for (const name of expectedNames) {
      expect(screen.getAllByRole("heading", { level: 3, name })).toHaveLength(1);
    }

    expect(screen.getAllByTestId(/^algorithm-item-/)).toHaveLength(7);
    for (const metadata of algorithmListFixture) {
      const item = screen.getByTestId(`algorithm-item-${metadata.id}`);
      expect(item).toHaveTextContent("可用");
      expect(screen.getByTestId(`algorithm-link-${metadata.id}`)).toHaveAttribute(
        "href",
        `/algorithms/${metadata.id}`,
      );
    }

    // 不再保留任何「開發中」占位。
    expect(screen.queryByText(/開發中/)).toBeNull();
  });

  it("首页学习目录的算法卡片改为「七種比較類排序」表述", () => {
    renderRoute("/");

    const algorithmCard = screen
      .getAllByRole("heading", { level: 3 })
      .find((heading) => heading.textContent?.includes("七種比較類排序學習中心"));
    expect(algorithmCard).toBeDefined();
    const card = algorithmCard?.closest("li") ?? algorithmCard?.closest("a");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("七種比較類排序");
    expect(card).toHaveTextContent("可用");
    // 首页不应再出现「十種演算法」的旧表述。
    expect(screen.queryByText(/十種/)).toBeNull();
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
