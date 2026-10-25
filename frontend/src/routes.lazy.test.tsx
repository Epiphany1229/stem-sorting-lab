import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "./App";
import appSource from "./App.tsx?raw";

/** 阶段 6 懒加载的页面：首屏不应静态引入（尤其 WeatherPage 会拉入 Plotly）。 */
const LAZY_PAGES = [
  "LabPage",
  "WeatherPage",
  "WeatherSortPage",
  "AlgorithmsPage",
  "AlgorithmDetailPage",
] as const;

describe("阶段 6：路由级代码分割", () => {
  it("重页面都用 React.lazy + 动态 import，不再静态 import", () => {
    expect(appSource).toContain("<Suspense");
    expect(appSource).toContain("RouteLoading");

    for (const page of LAZY_PAGES) {
      expect(appSource).toContain(`lazy(() => import("./pages/${page}"))`);
      // 不能同时保留静态 import，否则会把页面（和 Plotly）打回首屏 chunk。
      expect(appSource).not.toContain(`import ${page} from`);
    }

    // Home / NotFound / Sources / Help 保持同步，首屏无需额外请求。
    for (const page of ["HomePage", "NotFoundPage", "SourcesPage", "HelpPage"]) {
      expect(appSource).toContain(`import ${page} from "./pages/${page}"`);
    }
  });

  it("懒加载路由先显示双语 Suspense fallback，再异步挂载页面", async () => {
    render(
      <MemoryRouter initialEntries={["/lab"]}>
        <App />
      </MemoryRouter>,
    );

    // 首次渲染：fallback（role=status）可见，含繁中与英文两行。
    const fallback = screen.getByTestId("route-loading");
    expect(fallback).toHaveAttribute("role", "status");
    expect(fallback).toHaveTextContent("正在載入頁面…");
    expect(fallback).toHaveTextContent("Loading page…");

    // 动态 import 完成后真实页面替换 fallback。
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByTestId("route-loading")).not.toBeInTheDocument();
  });

  it("构建产物：页面独立 chunk、资源使用 /assets/ 相对根路径（需先 build）", () => {
    // 构建后再跑测试时校验产物；未构建时（例如先跑 test 的 CI 顺序）跳过这段。
    const chunkModules = import.meta.glob("../dist/assets/*.js");
    const chunkNames = Object.keys(chunkModules).map((path) => path.split("/").pop() ?? "");

    if (chunkNames.length > 0) {
      // 每个懒加载页面都应有自己的 chunk。
      for (const page of LAZY_PAGES) {
        expect(
          chunkNames.some((name) => name.startsWith(`${page}-`)),
          `缺少 ${page} 的独立 chunk`,
        ).toBe(true);
      }
      // Plotly 必须独立成 chunk（WeatherPage 只引用它，不在入口里）。
      expect(
        chunkNames.some((name) => name.startsWith("plotly-")),
        "缺少 Plotly 独立 chunk",
      ).toBe(true);
      // 至少：入口 + 5 个页面 chunk + Plotly/共享图表 chunk。
      expect(chunkNames.length).toBeGreaterThanOrEqual(6);
    }

    const htmlModules = import.meta.glob("../dist/index.html", {
      query: "?raw",
      eager: true,
      import: "default",
    }) as Record<string, string>;
    const html = Object.values(htmlModules)[0];
    if (html) {
      // 单端口托管：资源必须是 /assets/...，不能是绝对 CDN 或 file://。
      expect(html).toContain('src="/assets/');
      expect(html).toContain('href="/assets/');
      expect(html).not.toContain("http://");
      expect(html).not.toContain("https://");
      // 首屏不应预加载 Plotly：它是 WeatherPage 的懒加载依赖。
      expect(html).not.toContain("plotly");
    }
  });
});
