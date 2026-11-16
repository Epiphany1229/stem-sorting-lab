# 貢獻指南 / Contributing

本項目是雙語（繁體中文在上、英文在下）的排序算法教學網站，數據來自香港天文台官方開放數據。
This is a bilingual (Traditional Chinese + English) sorting-algorithms teaching site using Hong Kong Observatory open data.

## 開發環境 / Development setup

```bash
# Python 3.10（見 .python-version）＋ uv
uv sync

# 前端（Node 22+、pnpm 12）
cd frontend
pnpm install
```

- 後端：`uv run uvicorn backend.app.main:app --reload --port 8000`
- 前端開發：`cd frontend && pnpm dev`（Vite 會把 `/api` 代理到 8000）
- 單端口預覽：`cd frontend && pnpm build` 後，在倉庫根執行 `uv run uvicorn backend.app.main:app --port 8000`

## 提交前門檻 / Before you push

```bash
uv run ruff check .
uv run mypy backend tests
uv run pytest -q

cd frontend
pnpm exec tsc --noEmit
pnpm test:run
pnpm build
```

CI（`.github/workflows/ci.yml`）會跑同一組命令。**測試必須離線**：所有官方 HTTP 請求都要用 `httpx.MockTransport` 模擬，
不得在測試中訪問真實香港天文台服務。

## 代碼與內容規範 / Conventions

- **源碼內部註釋用簡體中文**；**學生可見文字必須繁體中文在上、英文緊貼在下**，不得出現簡體字。
- 算法必須是**唯一可信來源**：同一份插樁源碼既執行又展示；不得維護第二份「教學代碼」或使用 `sorted()` 偽造過程。
- 軌跡協議（`docs/trace-protocol.md`）與算法設計（`docs/algorithms-design.md`）為凍結契約，改動需同步更新文檔與前後端校驗。
- 數據抓取必須遵守 `docs/data-sources.md` 與 `.claude/skills/hko-safe-fetcher/SKILL.md`：同主機並發 1、間隔 ≥3 秒、尊重 `Retry-After`、403 熔斷、不更換 IP、不壓測。
- 不要提交 `.env`、`app.db`、`frontend/dist`、`.venv`、`.tools`（已在 `.gitignore`）。

## 數據與許可 / Data & licence

- 代碼：MIT（見 `LICENSE`）。
- 氣象數據：香港天文台（HKO）所有，非商業使用條款；本項目非官方產品。詳見 `NOTICE`。
- 演示數據快照：`sample_data/demo/`（官方真實快照，頁面必須標註「示範資料」）。

## 提交信息 / Commit messages

使用 Conventional Commits 前綴：`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`；
描述用中文或英文均可，但要能說明「改了什麼、為什麼」。
