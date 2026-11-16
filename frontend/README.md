# 前端 / Frontend

本目录是互動 STEM 教學網站的前端（React 19 + TypeScript + Vite 8 + Tailwind CSS 4）。
完整說明、啟動方式與專案架構請見倉庫根目錄的 [README.md](../README.md)。

快速開始：

```bash
pnpm install
pnpm dev        # 開發模式；/api 會代理到 http://127.0.0.1:8000
pnpm build      # 產出 dist/，可由 FastAPI 單端口託管
pnpm test:run
pnpm exec tsc --noEmit
```

注意：

- 學生可見文字必須**繁體中文在上、英文在下**，全部走 `src/i18n/dictionary.ts`。
- 源碼註釋用簡體中文。
- 重量級頁面（`/weather` 等）以 `React.lazy` 分包；Plotly 為獨立 chunk，只在進入天氣頁時載入。
- `scripts/sandbox-guard.cjs` 與 `pnpm-workspace.yaml` 的個別設定是為受限本機環境加的兼容層，
  普通開發環境可保留（不影響功能）。
