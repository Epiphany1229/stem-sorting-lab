// Vitest 全局设置：加载 jest-dom 断言，并在每个用例后自动清理 DOM。
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 阶段 6：路由页面改为 React.lazy 后，首次渲染会先出现 Suspense fallback；
// 并行跑整个套件时动态 import 可能超过默认 1s，因此统一放宽等待上限（断言本身不变）。
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
