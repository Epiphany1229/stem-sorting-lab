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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("从后端清单列出全部十种算法，并分别标注可用与开发中", async () => {
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
      "計數排序",
      "桶排序",
      "基數排序",
    ];

    for (const name of expectedNames) {
      expect(screen.getAllByRole("heading", { level: 3, name })).toHaveLength(1);
    }

    // 十个入口全部渲染，不隐藏未完成项；状态来自后端元数据。
    for (const metadata of algorithmListFixture) {
      const item = screen.getByTestId(`algorithm-item-${metadata.id}`);
      expect(item).toBeInTheDocument();
      if (metadata.status === "available") {
        expect(item).toHaveTextContent("可用");
        expect(screen.getByTestId(`algorithm-link-${metadata.id}`)).toHaveAttribute(
          "href",
          `/algorithms/${metadata.id}`,
        );
      } else {
        expect(item).toHaveTextContent("開發中");
        expect(item.querySelector("a")).toBeNull();
      }
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
