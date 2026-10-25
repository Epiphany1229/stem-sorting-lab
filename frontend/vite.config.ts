import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 阶段 1 配置：Vite 负责构建，vitest 复用同一份配置。
// 注意：浏览器端只允许访问本项目后端（/api），不直接请求香港天文台。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Cloudflare Tunnel / 自定义域名穿透开发端口时，避免 Vite 的 host 校验拦截。
    allowedHosts: true,
    // 开发阶段把 /api 转发到本项目的 FastAPI 后端；后续阶段再按需加代理规则。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Plotly 体积很大且只有天气页会用到：单独拆成独立 chunk，
    // 首屏主 chunk 不含 Plotly，访问天气页时才加载。
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "plotly",
              test: /node_modules[\\/]plotly\.js-dist-min/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // 沙箱禁止 fork 子进程，改用 worker_threads 池（默认 forks 会 spawn EPERM）。
    pool: "threads",
    // 测试不加载全局 CSS，避免 Tailwind 构建拖慢单测。
    css: false,
    restoreMocks: true,
  },
});
