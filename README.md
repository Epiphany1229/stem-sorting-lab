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
| 3 | 官方天气数据接入 + 数据质量 + 互动图表 | ✅ 完成 |
| 4 | 用真实气温做排序（**仅冒泡排序**） | ✅ 完成 |
| 5 | 其余九种算法 + 专属可视化 | ✅ **已完成（范围收敛为 7 种比较类排序）**：冒泡/选择/插入/希尔/归并/快速/堆 |
| 6 | 浏览器验收、无障碍、性能、文档完善 | ⬜ 未开始 |

**已实现（可真实使用）**：

- 后端 `POST /api/algorithms/bubble/trace`：真实执行 `bubble_sort` 产生协议 v1 轨迹（状态快照、比较/交换/写入分账、双语模板解释），支持升/降序与提前结束优化。
- 前端 `/lab`：SVG 柱状图、播放/暂停/上一步/下一步/重置/调速、引导模式与自由实验模式、Python 代码行组同步高亮（插桩行可折叠且行号不漂移）、"下一步这两个数需要交换吗？"预测弹窗（可用键盘、Esc 关闭、焦点归还）。
- **天气数据（阶段 3）**：HKO 安全抓取客户端（`trust_env=False`、并发 1、≥3s + jitter、429 `Retry-After` 挂起、403 熔断、ETag/Last-Modified 条件请求、每日预算、单 worker 租约）、SQLite 落库（保留 `value_raw` 原始字符串精度、质量标记 `C`/`#`/`***`）、CLI 入库、8 个天气/来源接口、官方 CSV 导入与演示模式隔离。
- 前端 `/weather`：日期范围、39 站多选、覆盖率与真实窗口、5 类 Plotly 图表（折线/柱状/直方/散点/环形）、双语悬停、数据表、CSV 导入报告、刷新冷却显示、非 official 模式常驻横幅。
- **真实气温排序 `/weather-sort`（阶段 4）**：`/weather` 顶部入口按钮；`tmax`/`tmin` 一键切换（各自有效天数与缺失日期）、升降序、测站与日期范围、并排比较开关；**复用**阶段 2 播放器（播放/暂停/上一步/下一步/重置/调速、Python 行组高亮、内联比较区），零重写排序逻辑；柱上显示纯数字温度与日期标签，悬停/聚焦看完整日期、测站中英文名、质量标记；Top5 最热/最冷、排序前后对比、比较/交换/轮次、冒泡 vs 单次扫描 STEM 卡片。
- **比较类排序学习中心（阶段 5，7 种）**：冒泡、选择、插入、希尔、归并、快速、堆；每种都有唯一真实 Python 源码 + AST 行号映射、同步代码高亮、双语逐步解释、复杂度/空间/稳定性/适用条件与练习；专属可视化：选择（最小值候选）、插入（持牌槽位）、希尔（gap 分组）、归并（区间 + 辅助合并区）、快速（枢轴/边界指针）、堆（数组与二叉堆 SVG 联动）。
- 跨栈回归：前端直接消费**后端真实输出**做测试（轨迹 JSON、天气 API JSON、天气排序轨迹、算法清单与轨迹）。

**尚未实现（不要误认为已有）**：其余九种算法、shadcn/ui 具体组件、ESLint、Playwright 浏览器截图验收；降雨/湿度的查询接口仍缺（RYES 日雨量已可由 CLI 回填，但未接入页面）。

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

### 3. 首次导入真实天气数据（可选，需要联网）

```powershell
# 抓取 HKO 2026 全年逐日最高/最低温并入库（每请求间隔 ≥3 秒）
uv run python -m backend.app.cli ingest --stations HKO,KP,SHA --metrics tmax,tmin --year 2026

# 只看将要发起多少请求，不实际抓取
uv run python -m backend.app.cli ingest --stations HKO --metrics tmax,tmin --year 2026 --dry-run

# 可选：回填官方日雨量（RYES，仅 HKO，1 请求/天；官方无 CLMRAINF 数据源）
uv run python -m backend.app.cli ingest-rainfall --start 2026-09-01 --end 2026-09-05 --dry-run
```

- 数据写入 `app.db`（已 gitignore）。首次运行 `init-db` 会自动建表并可显式执行：`uv run python -m backend.app.cli init-db`
- 抓取受预算/冷却/熔断约束；失败会返回原因，不会静默使用演示数据
- 演示模式样本在 `sample_data/demo/`（真实官方快照，来源见该目录 README），页面需手动开启且常驻「示範資料」标识

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
| `uv run pytest -q` | `401 passed, 1 warning`（含算法轨迹/Hypothesis/天气/抓取测试，全部离线 MockTransport） |
| `uv run ruff check .` | `All checks passed!` |
| `uv run mypy backend tests` | `Success: no issues found in 63 source files`（strict，无 `# type: ignore`） |
| `pnpm test:run` | `Test Files 34 passed / 1 skipped`、`Tests 234 passed + 6 skipped` |
| `pnpm build` | `✓ built in 2.44s`（Plotly 主 chunk 约 5.26 MB，阶段 6 做路由懒加载分包） |
| `pnpm exec tsc --noEmit` | 通过（无输出） |
| 真实算法链路 | catalog **7 项全 available**；7 算法轨迹均 200 且最终排序正确；`counting/bucket/radix/bogus` → 404 |
| 跨栈回归 | 轨迹/天气/天气排序/算法清单与轨迹均消费真实后端输出 |

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

1. **阶段 5–6 未开始**：其余九种算法未实现、未做浏览器截图验收。
2. **雨量/湿度仍未在页面暴露**：官方无 `CLMRAINF`；`hourlyRainfall.php` 只有当前一小时；`RYES` 日报可给 HKO 单站日雨量（已实现 CLI `ingest-rainfall`），但尚未接入阶段 3 的 metrics 白名单，因此天气页柱状图仍用"日最高温对比"并显式标注。`Trace`（<0.05mm）不入库、不写 0。
3. **shadcn/ui 未生成具体组件**：`components.json`、`cn()`、路径别名已就位，组件留待按需添加。
4. **ESLint、Playwright 未接入**；三视口验收属阶段 6。
5. **行政区 ↔ 测站映射仍缺失**：官方 PDF 只给站名，没有行政区归属表，**不得**按站名猜测。
6. **API 响应头未观测**：ETag / Last-Modified / Retry-After 是否由官方返回仍未验证；客户端按"支持则用"实现，缺失时降级为无条件请求。
7. **pytest 有一条第三方弃用警告**（fastapi/starlette 建议 `httpx2`），未处理。
8. **前端 bundle 偏大**：Plotly 使主 chunk 约 5.2 MB（gzip 1.60 MB），阶段 6 用路由懒加载拆分。
9. **单 worker 租约是进程级 + TTL**，不是数据库行锁；SQLite 写串行化下足够。
10. **沙箱兼容层**：`frontend/scripts/sandbox-guard.cjs`、`pnpm-workspace.yaml`（`verifyDepsBeforeRun:false`、`nodeLinker:hoisted`、`allowBuilds: es5-ext:false`）均为本机沙箱所需。
10. **测站数据覆盖 38/39**：官方 PDF 名单含 `TPO`（大埔自然環境保護研究中心），但当前 API 对三种 dataType 均返回参数错误 HTML（2026-10-25 实测），因此该站可用天数为 0；其余 38 站已回填 2026 全年 tmax/tmin/tmean（30,790 行，其中 `#` 不完整 1,839 行）。`TPO` 不得伪造数据。
11. **`.tools/` 不入库**；本地 `app.db` 已 gitignore。

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
