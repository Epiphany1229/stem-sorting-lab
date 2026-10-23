# 排序實驗室 · Sorting Lab

面向**零算法基础初学者**的互动 STEM 教学网站：以 Python 排序算法为核心，用**香港天文台真实气象数据**展示算法如何解决现实问题。

> **双语约定**：网站所有面向学生的文字为 **繁体中文在上、英文紧贴在下**（纵向堆叠，非左右并排、非语言切换）。
> **注释约定**（用户已确认）：源码内部注释用**简体中文**；学生可见的代码视图与步骤说明用**繁中 + 英文**。

---

## 当前状态（2026-10-23）

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | 工具链基线（uv / pnpm / Python 3.10 / 依赖锁定） | ✅ 完成 |
| 1 | 项目骨架、7 页导航、双语组件、设计 tokens、质量门禁、数据来源调查 | ✅ 完成 |
| 2 | 冒泡排序真实 Python 轨迹 + SVG 播放器 + 代码同步高亮 + 教学预测弹窗 | ✅ 完成 |
| 3 | 官方天气数据接入 + 数据质量 + 互动图表 | ⬜ 未开始 |
| 4 | 用真实气温做排序（**仅冒泡排序**） | ⬜ 未开始 |
| 5 | 其余九种算法 + 专属可视化 | ⬜ 未开始 |
| 6 | 浏览器验收、无障碍、性能、文档完善 | ⬜ 未开始 |

**已实现（可真实使用）**：

- 后端 `POST /api/algorithms/bubble/trace`：真实执行 `bubble_sort` 产生协议 v1 轨迹（状态快照、比较/交换/写入分账、双语模板解释），支持升/降序与提前结束优化。
- 前端 `/lab`：SVG 柱状图、播放/暂停/上一步/下一步/重置/调速、引导模式与自由实验模式、Python 代码行组同步高亮（插桩行可折叠且行号不漂移）、"下一步这两个数需要交换吗？"预测弹窗（可用键盘、Esc 关闭、焦点归还）。
- 跨栈回归：前端直接消费**后端真实输出**的轨迹 JSON 做测试（`src/player/__tests__/realTraceContract.test.tsx`）。

**尚未实现（不要误认为已有）**：气象图表与真实天气数据接入、天气数据排序页、其余九种算法、shadcn/ui 具体组件、Plotly、ESLint、Playwright 浏览器截图验收。

---

## 目录结构

```
backend/app/          FastAPI 应用（api / core / algorithms / schemas / services / data_sources / models）
frontend/             React + TS + Vite 前端
  src/i18n/           BilingualText 组件与 zh-Hant/en 字典
  src/pages/          7 个页面 + 404
  src/styles/         设计 tokens（颜色/字体/间距/圆角/阴影/动效/焦点）
  src/data/           10 种算法元数据（含实现状态）
tests/                后端测试（pytest）
docs/                 需求文件、实施计划、数据来源调查、环境审计
.tools/               工作区内工具链（uv / pnpm / 缓存，已 gitignore，不入库）
```

---

## 环境要求（本机已实测版本）

| 工具 | 版本 | 说明 |
|---|---|---|
| Python | **3.10.4**（项目锁 `>=3.10,<3.11`） | `python` 不在 PATH，用 `.venv\Scripts\python.exe` 或 `py -3.10` |
| uv | 0.13.5 | 位于 `.tools\bin\uv.exe` |
| Node.js | v22.22.0 | — |
| pnpm | 12.15.0 | 位于 `.tools\bin\pnpm.cmd` |
| Vite / React / TS | 8.3.5 / 19.3 / 5.9 | — |

### 本机特有的三件事（都是环境问题，不是项目问题）

1. **必须用 Python 访问网络**：本机 Windows Schannel 凭据故障，`curl.exe` / `Invoke-WebRequest` 对所有站点都报 `SEC_E_NO_CREDENTIALS`。判断接口能否连通**只能**用 Python 或 Node。
2. **后端 HTTP 客户端必须 `trust_env=False`**：系统注册表里有一个失效代理 `127.0.0.1:10809`，`httpx` 默认 `trust_env=True` 会走它并报 `ConnectError: EOF occurred in violation of protocol`；设 `trust_env=False` 后实测香港天文台接口 200。项目已在 `backend/app/core/settings.py` 的 `http_trust_env=False` 中默认关闭。
3. **工具缓存必须留在工作区内**（沙箱禁止写工作区外）：uv 用 `UV_CACHE_DIR`，pnpm 用 `USERPROFILE` / `npm_config_store_dir` / `npm_config_cache_dir`。详见下方命令。

---

## 运行步骤

### 1. 准备会话环境（每次新开终端）

```powershell
$ws = (Get-Location).Path
$env:Path = "$ws\.tools\bin;" + $env:Path
$env:UV_CACHE_DIR = "$ws\.tools\uv-cache"
$env:NO_PROXY = "*"; $env:no_proxy = "*"          # pip/uv 需要；否则会走失效代理
```

### 2. 后端

```powershell
# 首次：按锁文件安装依赖（会复用根目录 .venv）
uv sync

# 启动开发服务器
uv run uvicorn backend.app.main:app --reload --port 8000
```

- 健康检查：<http://127.0.0.1:8000/api/health> → `{"status":"ok","version":"0.1.0"}`
- 交互式 API 文档：<http://127.0.0.1:8000/docs>

### 3. 前端

```powershell
$env:USERPROFILE = "$ws\.tools\userprofile"        # pnpm store 锁需在工作区内
$env:npm_config_store_dir = "$ws\.tools\pnpm-store"
$env:npm_config_cache_dir = "$ws\.tools\pnpm-cache"
cd frontend
pnpm install
pnpm dev                                           # 默认 http://localhost:5173
```

> `frontend/package.json` 的脚本用 `node --require ./scripts/sandbox-guard.cjs` 包了一层：当前沙箱禁止管道 stdio 派生子进程，Vite 在 Windows 上的 `net use` 探测会抛 EPERM。**这只是本机沙箱兼容层**，普通终端下可以直接 `vite` / `vitest`。

### 4. 质量门禁

```powershell
# 后端（工作区根目录）
uv run ruff check .
uv run mypy backend
uv run pytest -q

# 前端
cd frontend
pnpm exec tsc --noEmit
pnpm test:run
pnpm build
```

**最近一次真实结果（2026-10-23，阶段 2 交付时实际执行）**：

| 命令 | 结果 |
|---|---|
| `uv run pytest -q` | `63 passed, 1 warning`（含 10 个 Hypothesis 属性测试；warning 来自 fastapi/starlette 的 `httpx2` 弃用提示，非失败） |
| `uv run ruff check .` | `All checks passed!` |
| `uv run mypy backend` | `Success: no issues found in 21 source files`（strict，无放宽） |
| `pnpm test:run` | `Test Files 11 passed`、`Tests 76 passed` |
| `pnpm build` | `✓ built in 381ms`，产出 `dist/`（JS 476 kB / CSS 33 kB） |
| `pnpm exec tsc --noEmit` | 通过（无输出） |
| 后端实际启动 | `GET /api/health` 200、`GET /docs` 200 |
| 跨栈回归 | 前端 4 个用例直接消费后端真实轨迹 JSON，全部通过 |

---

## 数据来源与许可

- 官方资料：香港天文台开放数据 API（`https://data.weather.gov.hk/weatherAPI/opendata/`）。
- **尚未接入**真实数据；数据可行性、实测字段、测站覆盖、许可与限制见 [`docs/data-sources.md`](docs/data-sources.md)。
- **测站代号表已核实**：官方 API 说明书 PDF（2025-09-22 版）解析出 **39 个测站**的代号、中英文名与逐站起始年（`docs/data-sources.md` §5.4），并抽样用 API 复核。行政区 ↔ 测站映射官方未提供，代码中**不得猜测**。
- 已知关键约束：逐日最高/最低温只有**月表**渠道（每月发布），**当月返回空数组**；因此"截至昨日 30 天"会有结构性缺口。产品已确认：**以最后可用日为锚点回推"最近有数据的 30 天"**，并在界面显示真实起止日期与"当月数据尚未发布"。
- 许可要求：须署名香港天文台、复现其免责声明、不得出售数据（本项目为非商业教学用途）。

---

## 已确认的产品决策

| 决策 | 内容 |
|---|---|
| 默认窗口 | 以最后可用日为锚点，回推"最近有数据的 30 天"；界面显示起止日期 + 当月未发布提示 |
| 注释语言 | 源码内部注释简体中文；学生可见代码/步骤繁中在上 + 英文在下 |
| 算法入口 | 十种算法**全部列出**并标注状态，不隐藏未完成项 |
| 天气数据排序 | **仅冒泡排序**；其余九种用教学小数据 |

---

## 未完成与已知限制

1. **阶段 3–6 未开始**：无气象图表、无真实天气数据接入、无天气排序页、其余九种算法未实现。
2. **shadcn/ui 未生成具体组件**：`components.json`、`cn()`、路径别名已就位，组件留待按需添加。
3. **Plotly 未接入**（TanStack Query 与 Prism 已用于当前功能）；ESLint、Playwright 未接入。
4. **行政区 ↔ 测站映射仍缺失**：官方 PDF 只给站名，没有行政区归属表，**不得**按站名猜测。
5. **响应头能力未知**：API 的 ETag / Last-Modified / Retry-After 未能观测，条件式请求是否可用待后端直连复测。
6. **pytest 有一条第三方弃用警告**（fastapi/starlette 建议 `httpx2`），未处理。
7. **未做真实浏览器截图验收**：布局与响应式由 DOM 测试覆盖，三视口 Playwright 检查属阶段 6。
8. **沙箱兼容层**：`frontend/scripts/sandbox-guard.cjs` 与 `pnpm-workspace.yaml` 的两项设置（`verifyDepsBeforeRun: false`、`nodeLinker: hoisted`）是为本机沙箱加的；普通环境可移除。
9. **前端 bundle 未分包**：`prism-react-renderer` 使 provider 包增大到 476 kB（gzip 149 kB），后续可做动态加载。
10. **`.tools/` 不入库**（约 130 MB）：里面有 uv/pnpm 二进制、HKO PDF 与解析产物；pdf 解析脚本在 `.tools/reference/`，未纳入版本控制。

---

## 开发规范 Skills

`.claude/skills/` 下有 12 个项目开发规范，分两类（来源均可审计，见 [`.claude/skills/README.md`](.claude/skills/README.md)）：

- **外部下载 9 个**（未改写原文，每个目录附 `SOURCE.md` 记录仓库/路径/ref/ETag/sha256 与 `LICENSE.repo`）：`test-driven-development`、`verification-before-completion`、`animate`、`animation-performance`、`react-best-practices`、`web-design-guidelines`、`responsive-testing`、`accessibility-auditing`、`impeccable`。
- **本地编写 3 个**（基于本项目规范与实测结论，**不是外部下载**）：`trace-and-code-sync`、`bilingual-a11y-lab-ui`、`hko-safe-fetcher`。

> 说明：本机 `raw.githubusercontent.com` 与 jsDelivr 被网络重置、GitHub API 被未认证限流，因此外部 Skill 是通过 `codeload.github.com` 下载仓库 tarball 后提取的（实测 200）。

## 相关文档

- [`docs/PROJECT_REQUIREMENTS.md`](docs/PROJECT_REQUIREMENTS.md) — 需求文件（主依据）
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — 目标理解、架构与四契约、阶段 0–6、风险登记册、决策记录
- [`docs/data-sources.md`](docs/data-sources.md) — 香港天文台数据源实况核验（含 26 条证据）
- [`docs/environment-report.md`](docs/environment-report.md) — 工具链审计与本轮安装记录
