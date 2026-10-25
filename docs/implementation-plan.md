# 项目实施计划 · 技术架构 · 风险登记册

> **状态**：**阶段 0–1 已完成**（工具链 + 项目骨架 + 7 页双语导航 + 质量门禁），**阶段 2 未开始**（排序轨迹与播放器尚未编写）。
> **主需求文件**：[`docs/PROJECT_REQUIREMENTS.md`](./PROJECT_REQUIREMENTS.md)（1069 行，2026-10-23 通读全文）
> **关联交付**：`docs/data-sources.md`（HKO 数据源实况核验）、`docs/environment-report.md`（工具链与依赖可达性）、根 `README.md`
> **编制**：Lead · 2026-10-23（阶段 1 完成后更新）

---

## 1. 项目目标（我的理解）

需求文件不是"做一个排序动画页面"，而是三层目标叠在一起，任何一层塌陷都算失败。

### 1.1 教学层

面向**零算法基础的初学者**，用香港真实气象数据制造"为什么需要排序"的动机，走一条固定学习路径：

> 认识比较与交换 → 学习冒泡排序 → 探索真实天气 → 排序气温 → 学习更多算法

教学纪律（需求文件反复强调，属于硬约束）：

- **一步只讲一个概念**；默认速度为初学者设计；"引导学习"与"自由实验"两种模式。
- 每个状态用**颜色 + 图标 + 文字**三通道标记（待处理 / 正在比较 / 正在交换 / 已排序），不得只靠颜色。
- 必须讲清五件事：比较哪两个、为何交换或不交换、交换前后状态、每轮谁已就位、为何可提前结束。
- 每页有教学提问（如"下一步这两个数需要交换吗？"），答后给解释再继续。

### 1.2 工程层（真正的核心竞争力）

需求文件第六节把"统一算法轨迹与代码同步"定义为**项目核心架构**，其约束非常刚性：

| 约束 | 含义 |
|---|---|
| Python 真实执行产生轨迹 | 前端**只播放**，不得自行模拟算法 |
| 单一可信来源 | 不允许"教学代码"与"执行代码"两套；不得 `sorted()` 造假过程 |
| 稳定唯一 ID | 每个输入元素有 ID，重复数值也能追踪原始位置与日期 |
| 状态语义显式 | 每个事件必须说明 `array_state` 是操作前还是操作后 |
| 可重复 | 同输入同参数 → 同轨迹 |
| 回退不逆算 | 上一步靠历史快照恢复，不反向执行算法 |
| 代码高亮有据 | 高亮由事件 `code_line_ids` 驱动，不得按动画时间轮流点亮 |
| 有上限 | 输入长度与轨迹总量设限，防浏览器卡死 |

### 1.3 数据层

- **只用可核验的官方来源**；实时 API ≠ 历史日数据源，必须分别核实（含各测站覆盖、30 日可得性、发布延迟）。
- "最近一个月" = **Asia/Hong_Kong 时区、截至昨日的最近 30 个完整自然日**；界面显示具体起止日期，**不得**静默漂移成"最近有数据的 30 天"。
- 严格区分四种口径：行政区 / 气象测站 / 官方代表性指标 / 教学计算的跨站汇总。"香港总体"不得由无权重平均冒充。
- 缺失值不得填 0；保留原始精度（气温不得擅自取整）；风向不得算术平均；日最高 ≥ 日最低需校验。
- 数据不足时：显示真实缺口 + 允许用户导入官方 CSV + 演示数据独立模式并常驻醒目标识，**不得静默回退虚构数据**。

### 1.4 体验与合规层

- 全站**繁体中文在上、英文紧贴在下**的双语（非左右并排、非语言切换），覆盖导航/按钮/标题/解释/图例/提示/错误/加载态/测站名/来源/图表悬停；`BilingualText` 组件 + 字典，禁止逐页硬编码。
- 可访问：键盘操作、`prefers-reduced-motion`、可访问名称与焦点态、屏幕阅读器不逐帧播报。
- 抓取合规：后端是唯一抓取方；保守限速（同主机并发 1、间隔 ≥3 秒 + jitter）；共享限速与租约；尊重 `Retry-After`；403 不重试；熔断；预算与开关；不换 IP/不伪造身份；`robots.txt` ≠ 授权。

### 1.5 明确的非目标

不做用户任意 Python 执行；不引入 Redis/Celery/微服务；不在前端重写算法；不用大模型做实时翻译或教学解释；不用静态截图冒充交互；不做跨 IP 绕过封禁。

---

## 2. 需求冲突与裁定

用户指示"若需求存在冲突，以文件中较新的『修订要求』为准"。**核查结果：需求文件中不存在显式命名为"修订要求"的章节**（已全文检索"修订/修訂/补充/版本"无命中）。因此采用如下裁定规则，并把每一处冲突显式记录，避免 Silent Decision：

| # | 位置 | 冲突内容 | 裁定 | 理由 |
|---|---|---|---|---|
| C-1 | 第 38 行 vs 第 19、923 行 | 38 行：「代码的备注使用简体中文，仅前端显示界面用繁体中文」；19 行：「学生可见的程式码註解及步骤说明采上下双语」；923 行验收：「沒有殘留簡體中文」 | **源码内部注释（学生不可见）用简体中文；学生可见的代码视图、代码注释、步骤说明一律"繁中在上 + 英文在下"**（**用户 2026-10-23 已确认**） | 923 行属验收条款、且是全文最后出现的口径，最具体最严格；38 行可解释为"内部注释" |
| C-2 | 第 42、84 行 | 两个章节都编号「三、」（视觉方向 / 技术栈） | 仅编号瑕疵，不构成语义冲突；文档结构按语义分组引用 | 无实质矛盾 |
| C-3 | 第 461 行 vs 第七节 | 「最近一个月 = 截至昨日 30 完整日」 vs 官方发布延迟可能导致昨日数据尚未入库 | **以定义为准**：显示真实起止日期 + 缺口提示；**不**自动改成"最近有数据的 30 天"；跨月需拼接两个月表 | 461 行为显式口径 |
| C-4 | 第 1045 行 vs 第十二节 | 「不留无法运行的空页面」 vs 必须实现十种算法 | 导航与算法中心**全部列出并标注状态**（可用 / 开发中 / 不适用），不静默隐藏 | 1045 行明确要求标注状态 |
| C-5 | 第 150–162 行 vs 本机现状 | 强制 Python 3.10 + uv 锁依赖 vs 本机未装 uv、`python` 不在 PATH | 阶段 0 先补工具链，不降级 Python 版本 | 142 行「开发、测试及部署保持一致」 |
| C-6 | 第 102 行 vs 第 98 行 | Plotly 图表 vs SVG 排序可视化 | 不冲突：**排序用 SVG（自绘、可控）**，**气象图表用 Plotly** | 二者用途不同 |

> **需用户确认**：C-1 的裁定方式（源码简化/界面繁体+英文）是否符合你的预期；若你手上有更新的"修订要求"文本，请提供，我按其覆盖。

---

## 3. 技术架构

### 3.1 分层与边界

```
┌──────────────────────────────────────────────────────────────┐
│ frontend/  React 18 + TS + Vite + Tailwind + shadcn/ui       │
│  ├─ BilingualText / i18n 字典（zh-Hant, en）                  │
│  ├─ TracePlayer（唯一播放器，冒泡实验室与气温排序共用）        │
│  ├─ SVG 排序可视化 + Plotly 气象图表 + 可访问数据表            │
│  └─ TanStack Query（只请求本项目后端）                        │
└───────────────▲──────────────────────────────────────────────┘
                │ 普通 HTTP（当前规模不需要 WebSocket）
┌───────────────┴──────────────────────────────────────────────┐
│ backend/  Python 3.10 + FastAPI + Pydantic                    │
│  ├─ api/          路由、校验、错误语义（429/422/503）          │
│  ├─ algorithms/   10 种算法：插桩源码 = 唯一实现 → 轨迹        │
│  ├─ trace/        统一事件协议、快照表、上限与确定性检查        │
│  ├─ services/     轨迹服务、气象聚合、CSV 导入、质量规则        │
│  ├─ data_sources/hko/  唯一 HKO 客户端（限速/缓存/熔断/ETag）  │
│  └─ models/       SQLAlchemy + SQLite（缓存、抓取日志、来源）   │
└───────────────▲──────────────────────────────────────────────┘
                │ 串行 + 间隔 ≥3s + jitter + 预算 + 租约
        ┌───────┴────────────┐
        │ HKO 官方接口/文件   │  ← 只此一条外部通道
        └────────────────────┘
```

**关键边界**：前端不含任何排序逻辑；后端不含任何"预生成好的动画"；外部数据只能经 `data_sources/hko/` 进入系统。

### 3.2 目录结构（需求文件第十四节）

```
frontend/    src/{components,features,player,charts,api,styles,i18n}
backend/     app/{api,algorithms,schemas,services,data_sources,models,core}
             tests/
docs/        PROJECT_REQUIREMENTS.md, implementation-plan.md, data-sources.md,
             environment-report.md, trace-protocol.md(后续)
sample_data/ 官方文件样本（用于离线解析测试）
```

### 3.3 四条核心契约

#### C1 · 统一轨迹协议（`app/trace/protocol.py` + `docs/trace-protocol.md`）

外层协议统一 + 算法专属辅助状态，事件字段按需求文件第六节建议：

```jsonc
// 响应信封（草案，字段名将固化为 Pydantic 模型）
{
  "algorithm": "bubble",
  "params": {"direction": "asc", "early_exit": true},
  "items": [{"id": "it-0", "value": 34.4, "label": "2025-09-01", "station": "HKO"}],
  "state_semantics": "after",        // 明确 array_state 表示操作前还是操作后
  "snapshots": [{"order": ["it-0","it-2", ...]}],  // 事件按 ID 引用快照，避免重复膨胀
  "events": [{
     "step_id": 0,
     "event_type": "compare",        // compare|swap|write|select|partition|merge|
                                     // bucket|count|mark_sorted|done
     "code_line_ids": ["bubble.compare"],
     "snapshot_id": 3,
     "active_indices": [], "compared_indices": [2,3],
     "modified_indices": [], "finalized_indices": [],
     "auxiliary_state": {},          // 算法专属（gap / pivot / 计数数组 / 桶）
     "metrics": {"comparisons": 1, "swaps": 0, "writes": 0},
     "explanation_key": "bubble.compare.asc"   // 由模板+参数生成双语，不经大模型
  }],
  "final_state": ["it-3", ...],
  "metrics": {"comparisons": 45, "swaps": 12, "writes": 12},
  "code_view": {"bubble.compare": {"zh-Hant": "if a[j] > a[j+1]:", "en": "if a[j] > a[j+1]:"}},
  "limits": {"max_events": 20000, "truncated": false}
}
```

设计要求：

- **比较 / 交换 / 写入（移动）三类计数分开**，不把移动算作交换（归并、插入、计数、桶、基数尤其重要）。
- 每个事件说明状态语义；交换/移动事件必须能还原前后状态。
- 输入元素 ID 与数值解耦，重复温度不丢日期。
- 上限：自定义输入长度（建议 ≤ 30）、事件总数上限，超限返回 422 而非截断播放。
- 确定性：固定枢轴策略、无随机、不依赖 dict/set 迭代顺序；同参数轨迹逐字节可复现（测试断言）。

#### C2 · 单一可信代码来源 + 行映射

这是最容易"看起来对、实际漂移"的地方，方案固定为：

1. 每个算法模块只有**一份**插桩源码：语义语句旁调用 `trace.emit(...)`；它就是被执行的真实代码。
2. 学生视图 = 对该源码做 **AST 变换**（移除 `trace.emit` 语句后重新编号），不是另写一份。
3. 建立三级映射：`code_line_id`（稳定语义 ID，如 `bubble.swap`）→ 执行行号 → 视图行号。
4. 测试强制：每个 `code_line_id` 在视图源码中存在且唯一；compare 事件只映射比较语句、swap 事件只映射交换语句；视图行号连续无空洞。
5. 展示源码与执行源码的一致性由测试而非人工保证；若将来用装饰器/`sys.settrace`，需先证明行级噪声可控，否则不采用。

> 需求文件允许插桩、但要求"明确映射规则并测试每种事件对应的代码行"。以上即该规则的实现形态。

#### C3 · BilingualText + 翻译字典

- 单一组件负责"繁中 16–18px 在上、英文 13–15px 在下、间距 2–4px"、各自 `lang="zh-Hant"` / `lang="en"`；按钮是**一个**交互元素而非两个。
- 字典键值成对存放，缺一即测试失败；再加两道自动检查：
  1. 扫描渲染字符串中的**简体字残留**（针对 923 行验收）；
  2. Playwright 三视口截图 + 溢出断言（针对文字溢出/控制列拥挤/标签重叠）。
- 图表（Plotly）的轴标签、图例、悬停文本、空状态、错误态同样走字典；Python 标识符不翻译。

#### C4 · 唯一 HKO 客户端 + 共享限额 + 模式标记

- 只有后端访问官方源；前端永远只打本项目 API（需求文件第七节）。
- 同主机并发 1、最小间隔 3 秒 + jitter、每日预算、重试 ≤3 次指数退避、`429` 遵守 `Retry-After` 并暂停该主机、`403` 不重试、连续失败熔断；以上均为**可配置、保守、非官方保证**，须在文档注明。
- 单实例抓取用 **SQLite 租约/锁**保证唯一 worker；页面"更新"按钮**不得**绕过缓存、冷却与预算（返回 202/429 语义 + 剩余冷却时间）。
- 多用户并发访问同一页面 → 合并为一次上游请求（单航班/缓存锁）。
- 数据带 `mode` 标记：`official` / `imported`（用户导入官方 CSV）/ `demo`；UI 横幅由后端字段驱动，演示模式不可隐藏。
- 旧缓存可展示，但必须显示观测日期、抓取时间、"数据可能未更新"。

### 3.4 API 草案（非最终契约，仅用于对齐边界）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 存活 + 版本 |
| GET | `/api/algorithms` | 算法清单 + 状态（available / planned）+ 复杂度/稳定性元数据 |
| POST | `/api/algorithms/{id}/trace` | `{values, direction, options}` → 轨迹信封；校验失败 422 |
| GET | `/api/weather/coverage` | 起止日期、按测站/指标的可用天数与缺口 |
| GET | `/api/weather/daily` | 日序列（含来源、抓取时间、质量标记、mode） |
| POST | `/api/weather/refresh` | 受冷却/预算约束；返回 202 或 429 |
| POST | `/api/weather/import` | 官方 CSV 上传 + 格式校验报告 |
| GET | `/api/weather/export.csv` | CSV 导出 |
| GET | `/api/sources` | 数据来源、许可、最后成功时间、请求计数 |
| POST | `/api/admin/fetch-toggle` | 停止外部抓取的开关（需令牌） |

### 3.5 数据模型要点（SQLite + SQLAlchemy）

- `weather_daily(date, station_id, metric, value, unit, quality_flag, source_id, fetched_at, method, mode)`；唯一约束防重复日期。
- `source_meta(etag, last_modified, last_success_at, last_status, retry_after)` 支撑条件式请求。
- `fetch_log(ts, url, status, duration, error_class)` 支撑 429/403 计数、缓存命中率、最后成功时间。
- `station_district(station_id, district, source_ref)`：**映射必须有来源**，不得按测站名猜行政区。

### 3.6 数据可得性对产品口径的硬约束（已实测定论，详见 `docs/data-sources.md`）

| 官方事实（已实测） | 对产品的直接后果 |
|---|---|
| 逐日最高/最低温**只有** `opendata.php` 月表一条官方通道，发布频率为 Monthly | 当月（2026-10）返回 `data: []`；"截至昨日 30 天"缺口 ≈ **当月已过天数**（今日实测缺 22 天）。这是**结构性滞后**（推断：月初缺口小、月末最大），代码无法绕过。**产品已定（D-1）**：以最后可用日为锚点回推"最近有数据的 30 天"，界面显示真实起止日期并注明"当月官方数据尚未发布" |
| 实时 `rhrread` 只有**单次观测**，无日汇总 | 不能把实时数据倒推成历史日值（需求第九节明令） |
| 实时端点**无风速/风向字段** | 需求第九节的风速风向项无法用该端点实现，须另找官方源或明确标注缺失，**不得**编造 |
| 湿度只有天文台总部 **1 站**；UV 只有京士柏 1 站 | 不能做"各区湿度"对比，只能标注为"天文台总部观测" |
| 降雨是 **18 个行政区**而非测站 | 降雨维度只能按行政区展示，且**不得**与温度测站混为同一实体 |
| 未找到官方"全港平均/代表性"指标 | "香港总体"口径必须三选一并显式标注（需求第八节） |
| HKO 站月表可回溯到 **1884-09**；`month` 省略可一次取整年 | 历史教学（历年同期对比）可行性高；整年请求可显著降低请求预算 |
| 缺测有 `***` / `#` / `C` 三态标记 | 质量标记必须入库并上图，缺失不得当 0、不得当完整 |

---

## 4. 实施阶段（0–6）

每阶段必须"可运行、可验证"，且不允许留下无法运行的空页面。

### 阶段 0 · 工具链基线（2026-10-23 已部分完成）

- **已完成（本轮，Lead 执行）**：`uv 0.13.5` 与 `pnpm 12.15.0` 已在**工作区内** `.tools\bin\` 就绪，可直接使用（因沙箱禁止写工作区外，未做系统级全局安装；记录见 `docs/environment-report.md` 附录）。
- 待办：`.python-version`=3.10；`pyproject.toml`（`requires-python=">=3.10,<3.11"`、Ruff `target-version="py310"`）；`uv.lock`；前端脚手架 + Tailwind/shadcn；`.env.example`；Ruff/mypy/pytest/Vitest 可跑；可选 Docker Compose。
- **具体执行要点（来自 `docs/environment-report.md` 实测，避免踩已发现的坑）**：
  1. 建环境用 `py -3.10 -m venv .venv`（`python` 不在 PATH，勿写裸 `python`）。
  2. 装依赖前在会话内设 `$env:NO_PROXY='*'`，并把 `%APPDATA%\pip\pip.ini` 里失效的 tsinghua index 改为 `https://pypi.org/simple`（实测 `NO_PROXY=*` 下 pip 可成功下载 wheel）。
  3. uv 已就绪（`.tools\bin\uv.exe`）：`uv python list --only-installed` 已正确识别 `cpython-3.10.4`；建项目时用 `uv python pin 3.10` + `uv lock`。**必须**把 `UV_CACHE_DIR` 指到工作区（默认缓存在工作区外，沙箱会拒写）；**不得**用 pip 的依赖状态冒充 `uv.lock`。
  4. pnpm 已就绪（`.tools\bin\pnpm.cmd` → `node .tools\pnpm-home\node_modules\pnpm\bin\pnpm.mjs`）。本机 `corepack enable`（写 `C:\Program Files\nodejs`）与 `npm i -g pnpm`（写 `%LOCALAPPDATA%`）均被拒，属沙箱边界；系统级安装需在普通终端执行，**未验证**。
  5. **连通性自检脚本一律用 Python/Node，禁用 `curl.exe` / `Invoke-WebRequest`**（本机 Schannel 全故障，会误报"网络不通"）。
  6. 装好 httpx 后立即实测 `httpx.get(HKO_URL, trust_env=False)`，据此决定 `data_sources/hko/client.py` 的客户端配置。
- 验收：`uv run pytest`、`uv run ruff check`、`uv run mypy`、`pnpm build` 四条命令在本机真实通过；httpx 连通性自检结果入档。
- 依赖：无（阻塞源 B1–B4 已定位，见 environment-report §5）。

### 阶段 1 · 骨架、导航、质量门禁与数据调查报告 ✅ 已完成（2026-10-23）

- 已交付：
  - 后端：`pyproject.toml`（Python 3.10 锁定、Ruff py310、mypy strict）、`uv.lock`（51 包）、`.python-version`、`.env.example`、`backend/app/` 骨架（FastAPI 工厂 + CORS + `/api/health` + settings + 四通道 logging + 5 个职责说明空包）、`tests/test_health.py`
  - 前端：`frontend/` 42 个源/配置文件——7 个页面 + 404、`BilingualText` + 86 条双语字典、设计 tokens（繁中 17px / 英文 14px / 间距 3px）、`AppLayout` + 面包屑（`aria-current`）+ 返回入口 + 状态徽标、10 种算法入口、TanStack Query Provider、Vitest 29 个断言
  - 文档：`docs/data-sources.md`、`docs/environment-report.md`、根 `README.md`、`.gitignore`
- 验收（Lead 独立复跑，非转述）：`uv run pytest -q` → 1 passed；`uv run ruff check .` → All checks passed；`uv run mypy backend` → 14 files 无问题（strict 无放宽）；`pnpm test:run` → 29/29；`pnpm build` → 327ms 产出 dist；`pnpm exec tsc --noEmit` → 通过；后端实际启动 `GET /api/health` 200、`/docs` 200。
- 阶段 1 的**偏离**（如实记录）：① 用 **Vite 8（rolldown）** 替代 Vite 7——Vite 7 的 esbuild 需派生子进程，本机沙箱 `spawn EPERM`；② `frontend/scripts/sandbox-guard.cjs` 把 Vite 的 `net use` 探测降级（沙箱兼容层，普通终端可移除）；③ `pnpm-workspace.yaml` 中 `verifyDepsBeforeRun:false` 与 `nodeLinker:hoisted` 亦为沙箱兼容；④ Tailwind v4 已接入但**尚未生成任何 shadcn/ui 组件**；⑤ 未引入 ESLint（lint 暂等同 `tsc --noEmit`）。
- 未做（属阶段 2+）：排序算法与轨迹、SVG 播放器、代码高亮、Plotly/Prism、气象数据接入。

### 阶段 2 · 冒泡排序真实轨迹 + 播放器 + 代码同步 ✅ 已完成（2026-10-23）

- 契约：`docs/trace-protocol.md` v1 已冻结（字段、事件语义、`code_line_ids` 行组规则表）。
- 后端已交付：`backend/app/algorithms/bubble.py`（**唯一可信源码**，真实执行 + 插桩）、`trace/recorder.py`（事件/快照/指标，超限抛错）、`trace/line_map.py`（`inspect.getsourcelines` + AST 导入期建立并校验行映射）、`schemas/trace.py`、`services/trace_service.py`（固定模板双语解释）、`api/algorithms.py`（`POST /api/algorithms/bubble/trace`）。
- 前端已交付：`src/player/`（`types` / `traceValidation` 运行时校验 / `useTrace` / `useTracePlayback` 状态机 / `BarChart` 真 SVG / `CodePanel` Prism 行组高亮 / `PredictionDialog` / `TracePlayer`），`LabPage` 接入真实轨迹；字典新增 79 个双语键。
- 验收（Lead 独立复跑）：后端 `pytest` **63 passed**（含 10 个 Hypothesis 属性测试：结果等于 `sorted()`、元素多重集不变、状态链自洽、指标分账、行 ID 可解析、可重复性、提前结束、finalized 覆盖全部、compare 元数据、排列不变性）；`ruff` / `mypy`（25 files）通过；前端 `vitest` **76 passed**、`tsc --noEmit` 通过、`build` 381ms；**跨栈回归** 4 个用例直接消费后端真实轨迹 JSON。
- 已知边界（如实记录）：`early_exit_triggered` 在 n=2 时为 `false`（只存在一轮，无语义上的"提前"）；冒泡只产生 compare/swap/mark_sorted/done 四类事件（`write` 已实现但本算法不触发）；未做浏览器目视验收（属阶段 6）。

### 阶段 3 · 官方天气数据接入 + 质量说明 + 互动图表 ✅ 已完成（2026-10-23）

- 设计：`docs/weather-data-design.md`（Schema、接口信封、reason 集合、降雨/湿度限定）。
- 后端已交付：`data_sources/hko/{limiter,client,registry}.py`（`trust_env=False`、并发 1、≥3s+jitter、429 `Retry-After` 挂起、403 熔断、ETag/Last-Modified、预算、租约）、`models/weather.py`（8 表）、`services/{hko_ingest,weather_import,weather_service}.py`、`api/{weather,sources}.py`、`cli.py`（`init-db`/`ingest --dry-run`）、`tests/` 44 个离线测试。
- 前端已交付：`features/weather/`（validation/api/transform、5 类 Plotly 图表、覆盖率面板、39 站选择器、数据表、CSV 导入、冷却刷新、demo/imported 横幅）、`WeatherPage` 重写、字典 +180 键。
- 验收（Lead 独立复跑）：后端 `pytest` **107 passed**、`ruff` 干净、`mypy`（含测试 44 files）通过；真实联网冒烟 2 请求写入 546 行；真实 API 实测 39 站 / anchor=2026-09-30 / coverage 30/30 / `value_raw:"34.2"` / bins `[2,7,15,6]` / export 6 列；前端 `vitest` **153 passed**、`tsc`、`build` 通过；**天气跨栈回归** 6 用例消费真实 API 响应。
- 与设计的偏差（已确认合理）：DB 惰性初始化（避免 import 副作用，另有 `init-db`）；multipart 手工解析（环境无 `python-multipart`，`pyproject` 禁改）；读接口在"未尝试抓取"时返回 `no_cache` 而非伪造 `not_published`；`hourly_observation` 表已建但未接 rhrread 采集。
- 已知边界：降雨/湿度无历史接口 → 柱状图用日最高温对比、散点用 `tmax` vs `tmean` 并显式标注；Plotly 使主 chunk 约 5.2 MB。

### 阶段 4 · 真实气温排序（复用同一播放器，**仅冒泡排序**）✅ 已完成（2026-10-23）

- 设计：`docs/weather-sort-design.md`（协议可选字段扩展、接口、页面要求、雨量专项核查结论）。
- 后端已交付：`services/weather_trace_service.py`、`schemas/weather_trace.py`、`POST /api/algorithms/bubble/weather-trace`；**零重写排序**（真实调用 `bubble_sort` + `TraceRecorder`，`code_line_ids` 沿用阶段 2 的 `BUBBLE_LINE_MAP`）；`TraceRecorder` 新增**可选** `explanation_factory`（默认 None，阶段 2 行为不变）；items 带 `value_raw`/`label`/`station`/双语站名/`quality_flag`/`source`；顶层新增 `metric/valid_days/requested_days/excluded_dates/before_order/after_order/top_hot/top_cold/single_scan`；稳定性（等温不交换）与缺失过滤均已测。
- 可选官方日雨量：`data_sources/hko/ryes.py` + CLI `ingest-rainfall`（RYES，1 请求/天，仅 HKO，无常驻）。实测修正日期语义：按 `ReportTimeInfoDate` 校验、`BulletinDate` 为次日发布；`Trace`（<0.05mm）不入库不写 0。
- 前端已交付：`/weather` 入口按钮；`/weather-sort` 页面（tmax/tmin 切换、升降序、测站、日期范围、并排比较、缺失日期明示、Top5 最热/最冷、排序前后对比、冒泡 vs 单次扫描 STEM 卡片、负温/全相同边界）；**直接复用** `TracePlayer/CodePanel/PredictionDialog/useTracePlayback/BarChart`，仅加可选 `unit` 与元数据渲染。
- 验收（Lead 独立复跑）：后端 `pytest` **134 passed**、`ruff` 干净、`mypy`（49 files）通过；真实 app.db 冒烟 30 天 HKO tmax → 200、`valid_days=30`、`single_scan=29`、`summary 380/129/19`、解释含真实日期温度、等温日期顺序稳定；前端 `vitest` **187 passed**（新增 28 + 真实响应跨栈 6）、`tsc`、`build` 通过。
- 已知边界：降雨/湿度仍未在查询接口暴露（RYES 已可取但与阶段 3 metrics 白名单未打通）；`Trace` 不写 0；柱底日期标签在 30 天窗口下较紧凑（完整信息靠悬停/聚焦）。
- 需求覆盖核对：`tmax`/`tmin` 两种模式均完整；升降序、测站与日期范围可用；并排比较可用；元素保留 ID/日期/测站/温度/来源；排除日期明示；交换后标签与日期仍匹配（前端逐步断言）；负值与全相同温度正常；"寻找最高温是否必须完整排序"以 STEM 卡片实现（`summary` vs `single_scan` 真实数值）。

### 阶段 5 · 比较类排序学习中心 ✅ 已完成（2026-10-25，范围收敛）

- **产品决策（Scope Reduction）**：算法中心正式收敛为 **7 种经典比较类排序**（冒泡、选择、插入、希尔、归并、快速、堆）。计数/桶/基数排序**不再实现**——对零基础学习者引入非比较范式与定点整数转换认知负荷过高，与一位小数气温场景不匹配；算法中心不留任何「開發中」占位入口。
- 已交付：算法注册表、7 个唯一插桩源码、通用导入期 AST 行映射、新事件（write/select/partition/merge）、单空槽 `null`、compare 的 `comparison`、`GET /api/algorithms`（7 项全 available）、`POST /api/algorithms/{id}/trace`；前端算法中心 7 入口 + 学习页 + 6 个专属辅助可视化（冒泡沿用阶段 2 播放器；堆为数组+二叉堆 SVG 联动）。
- 验收：后端 `pytest` 全绿、ruff、mypy strict；前端 vitest/tsc/build 全绿；真实链路 catalog 7 项、7 算法轨迹 200、未知 id 404。
- 后续：阶段 6（路由懒加载分包、Playwright 三视口验收、文档与交付总结）。
- 交付：选择/插入/希尔/归并/快速/堆/计数/桶/基数；每种含一句话解释、小规模默认数据、真实实现、同步高亮、统一控件、与实际实现一致的复杂度/空间/稳定性、适用条件、练习题。
- 专属可视化按需求文件第十二节逐项实现（堆的数组-二叉树联动、计数数组、桶区间、基数位桶等）。
- 验收：计数排序拒绝任意小数并解释；基数排序说明整数/负数变体；桶排序说明区间映射与桶内算法；温度 ×10 定点转换用十进制规则并展示映射。
- 依赖：C1 协议稳定后并行开发；**导航不得出现空页面**——按 D-4，十种算法**全部列出**并标注状态（可用 / 开发中），不得隐藏未完成项。

### 阶段 6 · 浏览器验收、无障碍、性能、文档 ✅ 已完成（2026-10-25）

- 已交付：路由级 `React.lazy` 分包（首屏入口 chunk 从 5.26 MB 降到 **373.89 kB**，Plotly 独立 4.64 MB chunk 仅天气页加载）；`vite server.allowedHosts: true`；FastAPI 单端口托管 `frontend/dist` + SPA History Fallback（`/api`、`/docs`、`/openapi.json` 优先，`/api/unknown` 仍 JSON 404）；README 增加「`pnpm build` + uvicorn 单端口 + cloudflared tunnel」公网演示步骤；全套后端/前端门禁实跑通过。
- 验收：后端 450 passed / ruff / mypy（71 files）；前端 239 passed + 6 skipped / tsc / build；单端口实测 `/`、`/weather-sort`、`/algorithms/heap`、`/lab` 均 200 HTML，`/api/health` 200 JSON，`/docs` 200，`/api/unknown` 404 JSON，`/assets/*` 200，`index.html` 未预加载 Plotly。
- **未执行**：Playwright 三视口截图与真实 Cloudflare Tunnel 公网联调（本机无浏览器自动化 / 无公网域名），已在 README「未完成与已知限制」中如实标注。

---

## 5. 风险登记册

等级：H 高 / M 中 / L 低。"证据"仅写已实测或明确标注未验证。

| ID | 风险 | 证据（实测/未验证） | 等级 | 影响 | 缓解 | 触发阶段 |
|---|---|---|---|---|---|---|
| R1 | **本机 TLS/代理路径分裂：curl/IWR 全失败，Python 直连可通，但默认走坏代理** | Lead 受控对照：默认 opener（读 WinINET 注册表代理 `127.0.0.1:10809`）→ `URLError [Errno 2]`；`ProxyHandler({})` 直连 → **200，30 行，0.21s**。`httpx 0.28.1` 复核：`trust_env=True` → `ConnectError: EOF occurred in violation of protocol`；`trust_env=False` → **200 / 30 行**。`curl`/`IWR` 对 HKO+PyPI+经代理**全部** `SEC_E_NO_CREDENTIALS`（机器级 Schannel 故障） | **已降为低** | 若误用默认配置会全线失败 | ①`httpx.Client(trust_env=False)` 固定写进 HKO 客户端；②验证脚本只用 Python/Node；③pip 需 `NO_PROXY=*` | 3 |
| R2 | uv / pnpm 未安装，PyPI / npm 可达性未知 | 已实测：两者 CommandNotFound；可达性见 environment-report | H | 阶段 0 阻塞 | 安装或改用手工 venv（**但不得降级 Python 版本**）；必要时配置镜像 | 0 |
| R3 | 历史月表**测站完整清单未知** | 已实测（含 Lead 独立复核）：`HKO`/`KP`/`CCH`/`SHA`/`TKL` 五站均返回 200 并回显站名；`station` 为必填；`station=XYZ` 报参数错但 **HTTP 仍 200**。**完整合法代号表未验证**（官方 PDF 读不到） | M | 站点选择器可能漏站；若按名字猜代码会取到错误测站 | 人工查阅官方 PDF 取得代号表后再建测站字典；未确认代号一律不入库 | 3 |
| R4 | **当月无数据，默认"最近 30 天"存在结构性缺口**（已由风险转为**确定约束**） | Lead 独立复核：`CLMMAXT`+`HKO`+`2026-10` → HTTP 200 且 `"data": []`（非 404、非报错）；`2026-09` 完整 30 天。窗口 2026-09-24～10-22 中**缺 22 天** | H | 首页默认视图与"排序这 30 天气温"入口直接受影响 | 默认窗口改口径必须**显式提示**（需求第八节禁止静默替换）：显示真实起止日期 + "当月数据尚未发布"；后端必须判 `data == []` 而非只看状态码 | 3/4 |
| R14 | **默认窗口口径**（原风险） | ~~需求定义与 Monthly 发布结构性冲突~~ → **已由 D-1 解决**：以最后可用日为锚点回推最近有数据的 30 天 | 低 | 仍需保证"不静默替换"：必须显示起止日期 + 当月未发布提示 | 后端输出 `window_anchor` 与 `gap_days` 字段供 UI 渲染，禁止前端自行推算 | 3 |
| R5 | **代码高亮与执行逻辑双源漂移** | **已缓解（阶段 2 实测）**：同一份插桩源码即执行源码；`trace/line_map.py` 在导入期用 AST 建立并校验行映射，失败即抛错；测试断言每个 `code_line_id` 存在于 `code.lines`、目标行 AST 类型符合预期（compare→If / swap→Assign / mark_sorted→For / done→Return） | 中 | 若手工改动算法而不同步插桩，导入即失败 | 保持"改算法必须同步插桩"的规则；新增算法时复制同一套测试 | 2 |
| R6 | 双语文案遗漏 / 简体残留 / 移动端溢出 | 需求 923 行验收项 | M | 验收不通过 | 字典成对校验 + 简繁扫描 + Playwright 三视口截图断言 | 1–6 |
| R7 | 十种算法 + 9 种专属可视化工作量 | 需求第十二节 | H | 阶段 5 延期或留空页面 | 按协议先行、可视化组件化；导航标注状态；先保证 4 条教学链路可运行 | 5 |
| R8 | 计数/桶/基数不适用小数温度 | 需求第十二节明令 | M | 教学错误 | 明示不适用 + 定点转换仅用于教学并展示映射；不得静默改数据 | 5 |
| R9 | 屏幕阅读器逐帧播报 / 动画引发不适 | 需求第十三节 | M | 无障碍不达标 | `aria-live` 仅手动步进时播报摘要；支持 `prefers-reduced-motion` | 2/6 |
| R10 | Plotly 体积、移动端标签重叠 | 需求第十五节 | M | 体验下降 | 按需加载、图表精简、标签抽稀、三视口截图验证 | 3/6 |
| R11 | 轨迹不确定（枢轴/顺序依赖） | 需求第六节"可重复" | M | 测试不稳定 | 固定策略、禁随机、排序稳定比较键 | 2 |
| R12 | 需求冲突裁定错误 | 见第 2 节；无显式"修订要求"章节 | M | 返工 | 已显式列出 C-1..C-6，请用户确认 | 0 |
| R13 | "官方指标"表述越界（把教学阈值说成官方标准） | 需求第八、十节 | M | 合规/信任问题 | 每个汇总标注口径与覆盖率；阈值标注"教学自定" | 3/4 |

---

## 6. 已实测事实 vs 未验证空白

### 6.1 已实测（本机，2026-10-23）

| 事实 | 证据 |
|---|---|
| Node v22.22.0、git 2.56.0 可用 | 命令输出 |
| Python 3.10 存在但 `python` 不在 PATH | `py -0p` 输出路径 |
| `uv`、`pnpm` 未安装 | CommandNotFound |
| HKO 实时接口可用且结构完整 | `web_fetch` HTTP 200，含 27 个测站气温、18 区降雨、UV、`updateTime=2026-10-23T13:02:00+08:00` |
| HKO 日最高温月表可用于 HKO 站 | `CLMMAXT` + `station=HKO` + `2025-09` → 30/30 天，含完整性 legend |
| 本机 curl/Invoke-WebRequest 直连 HKO TLS 失败 | schannel `SEC_E_NO_CREDENTIALS` |
| 月表支持 HKO 以外的测站 | Lead 独立复核 `KP` + 2026-09 → 200，`type` 回显「京士柏 / King's Park」，30 天全 `C` |
| **当前月月表为空数组** | Lead 独立复核 `CLMMAXT` + `HKO` + 2026-10 → HTTP 200 且 `"data": []` |
| 实时端点无风、无日最高/最低温；湿度仅 1 站；降雨为 18 行政区 | `rhrread` 实际响应结构（Lead 首次抓取与成员核验一致） |
| HKO 站月表可回溯到 1884-09 | 成员实测（`year=1884&month=9` 返回 30 行完整） |
| 月表 `month` 省略 → 返回整年 365 行 | 成员实测（`year=2025` 无 `month`） |
| `station` 为必填；无效代号返回**纯文本错误但 HTTP 200** | 成员实测（`station=XYZ`、省略 `station`） |
| **Python 3.10.4 + OpenSSL 1.1.1n 可用，直连能取到 HKO 数据** | Lead 受控对照：`ProxyHandler({})` 直连 → HKO **200，30 行，0.21s**；`http.client` + `create_default_context()` → 200；裸握手 TLSv1.3 |
| **urllib 失败的根因是 WinINET 注册表代理 `127.0.0.1:10809`，不是 HKO 拦截** | `getproxies()` → `{'https': 'https://127.0.0.1:10809'}`；默认 opener → `URLError [Errno 2]`；仅切换到无代理即成功（同一解释器、同一 URL） |
| curl / Invoke-WebRequest / .NET 对 HKO、PyPI、经代理**三条路径全部** `SEC_E_NO_CREDENTIALS` | 机器级 Schannel 故障，**不可**用作连通性判据（`docs/environment-report.md` §2） |
| pip 22.0.4 存在；`NO_PROXY=*` 下实测可下载 wheel（six 1.17.0, 11,050 B） | 成员实测；默认 `pip.ini` 指向的 tsinghua 镜像报 `SSLEOFError` |
| npm 10.9.4、registry 可达（`npm view vite version` → 8.3.5）、corepack 0.34.0 在 | 成员实测 |
| Docker CLI 28.1.1 + Compose v2.35.1 存在（daemon 未验证） | 成员实测 |
| 未安装任何项目依赖 | `pip list` 无 fastapi/httpx/pandas/pydantic/pytest/ruff/mypy 等；该 3.10 是 Django+MySQL 环境 |
| **httpx 0.28.1 在 `.venv` 中实测可用，但必须 `trust_env=False`** | `trust_env=True` → `ConnectError: EOF occurred in violation of protocol`（走注册表代理）；`trust_env=False` → HKO opendata **200/30 行**、`rhrread` **200/27 站** |

### 6.2 未验证（禁止当作已成立）

- ✅ **`station` 完整合法代号表已于 2026-10-23 补齐**：官方 PDF（2025-09-22 版）解析出 39 站代号 + 中英文名 + 逐站起始年，见 `docs/data-sources.md` §5.4；抽样 API 复核一致（`HKO` 的 API 显示名简写为「天文台」）。
- **仍缺**：测站 → 18 行政区的官方映射（PDF 未提供），不得按站名猜测。
- **是否存在比"月表"更新的逐日官方端点**：PDF 的 `dataType` 清单显示只有月表类温度数据，无逐日/逐时气温端点（已核对口径见 §5.4 说明）。
- **月表发布的具体时点**（次月几日）：只观测到一个时间点，无法量化，需 11 月初再实测一次。
- **响应头** ETag / Last-Modified / Retry-After / 速率限制：`web_fetch` 不暴露响应头，此通道无法验证，只能后端直连后复测。
- **风速/风向、能见度等其他指标的官方来源**：`rhrread` 无风字段，需另行调查。
- **官方"全港平均/代表性"指标是否存在**：两个已核验端点均无此字段。
- **`data.weather.gov.hk/robots.txt`**：请求被跨域重定向到 `www.hko.gov.hk`，该主机自身 robots 规则未知。
- 许可条文已取得原文（HKO 非商业条件、data.gov.hk 条款 v1.2），但**未做法务确认**。
- **uv / pnpm 的实际安装**：均未执行（沙箱内 `npm i -g pnpm` 报 `EPERM spawn`，属沙箱限制，不能据此判定真实终端不可装）。
- **httpx 请求 HKO 的真实行为**：httpx 未安装，`trust_env=False` 是否可绕过注册表代理属**推断**，必须装后实测。
- **FastAPI/Uvicorn/Pydantic/pandas/SQLAlchemy/pytest/Ruff/mypy 在 3.10.4 上的安装与兼容性**：一个都没装。
- **Playwright 与浏览器二进制下载**、**Docker daemon 是否运行**：未验证。
- **非沙箱终端下 Schannel 是否同样故障**：无法区分「机器本身故障」与「沙箱放大」，报告未作断言。

> 以上由 `docs/data-sources.md`、`docs/environment-report.md` 补充；本文不预写结论。

---

## 7. 决策记录（用户已于 2026-10-23 确认）

| # | 决策点 | 用户决定 | 落地要求 |
|---|---|---|---|
| D-1 ✅ | 默认"最近 30 天"窗口 | **以最后可用日为锚点，回推"最近有数据的 30 天"**（官方 Monthly 发布导致当月缺口，见 R4/R14） | ① 后端以 `last_available_date` 为锚点生成窗口，不按"今天"硬算；② 界面**必须**显示具体起止日期；③ **必须**注明"当月（YYYY-MM）官方数据尚未发布"，不得让用户误以为是实时 30 天 |
| D-2 ✅ | 需求冲突 C-1 | **源码内部注释用简体；学生可见代码/步骤一律繁中在上 + 英文在下** | 内部注释不受双语校验约束；学生可见代码视图与步骤说明进双语字典与简体残留扫描 |
| D-3 ✅ | 后端取数通道 | **直连可用**（2026-10-23 实测关闭） | `httpx 0.28.1`：`trust_env=True` → `ConnectError: EOF occurred in violation of protocol`；`trust_env=False` → HKO opendata **200 / 30 行**、`rhrread` **200 / 27 站**。**结论：`data_sources/hko/client.py` 必须显式 `trust_env=False`**；CSV 导入仍作为兜底但不再是唯一出路 |
| D-4 ✅ | 十算法入口 | **全部列出**并标注状态（可用/开发中），不隐藏 | 导航与算法中心一次性列全 10 项 |
| D-5 ✅ | 天气数据排序演示范围 | **只涉及冒泡排序** | 阶段 4 仅实现冒泡；其余 9 种算法用教学小数据，**不得**强行套天气数据（对齐需求第十二节"不适用当前数据须明确解释"） |

## 8. 下一步

1. ✅ 阶段 0–4 完成：工具链、双语导航、冒泡轨迹与播放器、HKO 安全取数 + 天气探索页、真实气温排序 `/weather-sort`（后端 134 / 前端 187 测试全绿）。
2. 🔜 **阶段 5（下一步）**：其余九种算法 + 专属可视化（选择/插入/希尔/归并/快速/堆/计数/桶/基数），导航全部列出并标注状态；计数/桶/基数要说明整数与定点转换限制。
3. ⏳ 阶段 6：Playwright 三视口验收、无障碍检查、性能优化（Plotly 按路由懒加载把 5.2 MB 拆掉）、文档完善。
4. ⏳ 可选后续：把 RYES 日雨量接入阶段 3 的 metrics 白名单，让柱状图切到真实降雨（仅 HKO）。
