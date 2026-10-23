// Vitest 全局设置：加载 jest-dom 断言，并在每个用例后自动清理 DOM。
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
