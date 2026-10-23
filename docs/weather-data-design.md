# 阶段 3 设计：气象数据接入、存储与探索页

> 状态：**设计冻结**（2026-10-23）。实现以本文件 + `docs/trace-protocol.md` 为准。
> 数据事实来源：`docs/data-sources.md`（含 39 站代号表 §5.4）。合规取数规范：`.claude/skills/hko-safe-fetcher/SKILL.md`。

## 1. 先明确"官方到底有什么"（决定一切设计）

| 指标 | 官方渠道 | 时间粒度 | 能否回溯 30 天 | 结论 |
|---|---|---|---|---|
| 日最高温 `tmax` | `opendata.php?dataType=CLMMAXT` | 日 / 测站 | ✅（月表，上一个月完整） | **主数据** |
| 日最低温 `tmin` | `dataType=CLMMINT` | 日 / 测站 | ✅ | **主数据** |
| 日平均温 `tmean` | `dataType=CLMTEMP` | 日 / 测站 | ✅ | 主数据（散点/直方图备用） |
| 降雨量 | 仅 `weather.php?dataType=rhrread` 的**18 个行政区**逐小时雨量 | 小时 / 行政区 | ❌ 无历史接口 | **只能从部署后累积**，页面必须说明 |
| 相对湿度 | 仅 `rhrread` 的**天文台总部 1 站** | 小时 / 单站 | ❌ | 同上，且只 1 站 |
| 风速风向 | `rhrread` 中不存在 | — | ❌ | 不实现，不编造 |

**因此**：30 天窗口内可完整展示的只有**逐日气温（39 站 × tmax/tmin/tmean）**；降雨与湿度属于"部署后累积观测"，覆盖范围从 0 开始增长，UI 必须显示真实覆盖与缺口，不得用气温数据冒充降雨。

## 2. 数据库 Schema（SQLAlchemy 2.0 + SQLite）

### 2.1 `station` —— 测站字典（唯一来源：官方 PDF §5.4）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 官方站号（如 `HKO`、`KP`、`VP1`） |
| `name_en` | TEXT | 官方英文名 |
| `name_zh_hant` | TEXT | 官方繁体中文名 |
| `start_year` | INTEGER | 官方给出的资料起始年（1884–2022 不等） |
| `source_ref` | TEXT | 固定写 `HKO_Open_Data_API_Documentation.pdf@2025-09-22 §CLMTEMP` |

> 不建"行政区"表：官方未提供测站→18 区映射，**不得猜**。UI 只用测站维度。

### 2.2 `daily_weather` —— 逐日观测（核心表）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `station_id` | TEXT FK → station.id | — |
| `metric` | TEXT | `tmax` / `tmin` / `tmean` |
| `obs_date` | DATE | 观测日期（香港时区自然日） |
| `value_raw` | TEXT | **原始字符串，保精度**（如 `"34.4"`） |
| `value` | REAL | 数值型，仅供排序/计算（不用于显示） |
| `unit` | TEXT | `°C` |
| `quality_flag` | TEXT | 官方标记 `C`（完整）/ `#`（不完整）/ `***`（无数据） |
| `source_document_id` | INTEGER FK | 指向 `source_document` |
| `fetched_at` | DATETIME | 抓取时间（UTC） |
| `mode` | TEXT | `official` / `imported`（用户导入的官方 CSV） |

约束：`UNIQUE(station_id, metric, obs_date, mode)`；`***` 行**不入库**（缺失就是缺失，不写 0），但要在覆盖率统计里作为"已知缺失"计数。

### 2.3 `hourly_observation` —— 实时累积观测（降雨/湿度）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `entity_kind` | TEXT | `district`（降雨）/ `station`（湿度） |
| `entity_id` | TEXT | 行政区名（英文官方名）或站号 |
| `metric` | TEXT | `rainfall_hourly` / `humidity` |
| `observed_at` | DATETIME | 观测窗口结束时间（带 +08:00 存储为 UTC） |
| `value_raw` / `value` / `unit` | TEXT/REAL/TEXT | `mm` / `percent` |
| `quality_flag` | TEXT | 官方 `FALSE/TRUE`（`main` 字段）或 `trace`（<0.05mm 独立标记） |
| `fetched_at` | DATETIME | — |

> 缺口即事实：某天没有累积记录就显示"未采集"，不得插值。

### 2.4 抓取与运维表

| 表 | 关键列 | 用途 |
|---|---|---|
| `source_document` | `dataset_key, endpoint, http_status, etag, last_modified, retrieved_at, payload_sha256` | 每次成功抓取的来源凭据（可审计） |
| `http_cache` | `url PK, etag, last_modified, status, body, stored_at` | 条件请求（304 复用）与离线兜底 |
| `fetch_event` | `ts, url, status, outcome, duration_ms, bytes, retry_after, note` | 429/403/超时/缓存命中统计 |
| `ingestion_run` | `started_at, finished_at, status, requests, upserts, skipped, message` | 调度与排障 |
| `service_state` | `key PK, value, updated_at` | 熔断截止时间、当日请求计数、抓取租约（唯一 worker） |

## 3. 接口规划（Backend）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/weather/stations` | 39 站 + 各站可用天数 + 起始年 + 中文/英文名 |
| GET | `/api/weather/coverage?start&end` | 起止日期、每站每指标可用天数、**真实首末可用日**、缺口天数、`mode`、`demo_notice` |
| GET | `/api/weather/daily?start&end&stations&metrics` | 日序列；响应含 `precision_policy: "raw_string"`、来源与抓取时间 |
| GET | `/api/weather/summary?start&end&station&metric&bins` | 温度区间统计（供环形图/直方图）：各区间天数、有效样本量、缺失天数 |
| POST | `/api/weather/refresh` | 受冷却/预算/熔断约束；返回 `accepted`、`next_allowed_at`、剩余预算、失败原因 |
| POST | `/api/weather/import` | 上传官方 CSV，返回校验报告（成功行/跳过行/错误行），`mode=imported` |
| GET | `/api/weather/export.csv` | 导出当前查询范围 |
| GET | `/api/sources` | 数据来源、许可、最后成功时间、熔断状态、请求统计 |

**通用查询参数**：

| 参数 | 取值 | 说明 |
|---|---|---|
| `mode` | `official`（默认）/ `demo` / `imported` | 省略 = official；`demo` 只读 `sample_data/demo/` 快照，**不落库**；`imported` 读用户导入行 |
| `start` / `end` | `YYYY-MM-DD` | 必须显示在界面；默认窗口由锚点回推 |
| `stations` | 逗号分隔官方站号 | 不在 39 站名单内 → 422 |
| `metrics` | `tmax,tmin,tmean` | 逗号分隔 |

**统一响应信封**（所有天气接口）：

```jsonc
{
  "mode": "official",              // official | imported | demo
  "notice": null,                  // 非 official 时必填，前端必须显示
  "window": {"start": "2026-08-31", "end": "2026-09-29", "anchor": "2026-09-30", "requested_days": 30},
  "coverage": {"days_with_data": 30, "days_missing": 0, "last_available_date": "2026-09-30"},
  "data": [...],
  "sources": [{"dataset": "CLMMAXT", "endpoint": "...", "fetched_at": "...", "mode": "official"}]
}
```

**没有数据时的 `reason` 取值（固定集合）**：`not_published`（当月未发布）/ `na_no_history`（该指标无历史接口）/ `cooldown`（刷新冷却中）/ `circuit_open`（熔断）/ `budget_exhausted`（预算耗尽）/ `disabled`（开关关闭）/ `no_cache`（无缓存）/ `station_out_of_range`（站号不合法）。前端必须显示对应双语说明 + 原始 reason 代码。

**阶段 3 的降雨/湿度限定**：`hourly_observation` 表建立，但阶段 3 **不提供**降雨/湿度查询接口（官方无历史日值，实时仅 18 区逐小时/单站）。因此：
- 柱状图阶段 3 使用"所选站日最高温对比"，标题与说明必须写清实际指标；
- 散点图阶段 3 使用同日 `tmax` vs `tmean`，并标注实际指标；
- 图表组件**预留** rainfall/humidity 入参，阶段 4 接入累积数据时再切换；
- 接口只在被明确实现后启用，前端**不得**自行注入演示数值冒充降雨/湿度。

### 3.1 精确字段形状（前后端必须一致）

```jsonc
// GET /api/weather/stations
{
  "mode": "official",
  "notice": null,
  "stations": [
    {"id": "HKO", "name_en": "Hong Kong Observatory", "name_zh_hant": "香港天文台",
     "start_year": 1884, "available_days": 30, "first_date": "2026-09-01",
     "last_date": "2026-09-30", "metrics": ["tmax", "tmin", "tmean"]}
  ]
}

// GET /api/weather/coverage?start=2026-09-01&end=2026-09-30[&stations=HKO,KP]
{
  "mode": "official",
  "notice": null,
  "window": {"start": "2026-09-01", "end": "2026-09-30", "anchor": "2026-09-30", "requested_days": 30},
  "coverage": {
    "days_with_data": 30,
    "days_missing": 0,
    "last_available_date": "2026-09-30",
    "per_station": [
      {"station_id": "HKO", "metric": "tmax", "days_with_data": 30, "first_date": "2026-09-01",
       "last_date": "2026-09-30", "missing_dates": [], "incomplete_dates": []}
    ]
  },
  "reason": null,          // 无数据时必填：not_published / circuit_open / budget_exhausted /
                           // disabled / no_cache / station_out_of_range
  "sources": [{"dataset": "CLMMAXT", "endpoint": "https://...", "fetched_at": "2026-10-23T20:00:00+08:00",
               "last_modified": "2025-09-22T09:15:39Z", "mode": "official"}]
}

// GET /api/weather/daily?start&end&stations=HKO,KP&metrics=tmax,tmin
{
  "mode": "official", "notice": null,
  "window": {...}, "coverage": {...}, "reason": null,
  "precision_policy": "raw_string",
  "data": [
    {"obs_date": "2026-09-01", "station_id": "HKO", "metric": "tmax",
     "value_raw": "28.7", "value": 28.7, "unit": "°C", "quality_flag": "C"}
  ],
  "sources": [...]
}

// GET /api/weather/summary?start&end&station=HKO&metric=tmax&bins=4
{
  "mode": "official", "notice": null,
  "window": {...},
  "station_id": "HKO", "metric": "tmax",
  "bins": [
    {"index": 0, "lower": 27.0, "upper": 29.0, "label_zh_hant": "27–29°C", "label_en": "27–29°C", "days": 7}
  ],
  "valid_days": 30, "missing_days": 0,
  "threshold_note": {"zh-Hant": "區間由教學程式依資料範圍等分，非官方標準", "en": "Bins are computed by the teaching app, not an official standard"}
}

// POST /api/weather/refresh
{"accepted": false, "reason": "cooldown", "next_allowed_at": "2026-10-23T20:05:00+08:00",
 "remaining_budget": 494, "requests_made": 0, "rows_upserted": 0, "message": null}

// POST /api/weather/import（multipart，字段名 file）
{"mode": "imported", "accepted_rows": 120, "skipped_rows": 2,
 "errors": [{"line": 17, "reason": "unknown_station", "detail": "ZZZ"}],
 "detected_format": "official_csv" | "canonical_csv"}
```

## 4. 安全抓取实现要点（对齐 `hko-safe-fetcher`）
1. `httpx.AsyncClient(trust_env=False)`，`timeout` 来自 settings。
2. **同主机并发 1 + 最小间隔 3s + 0–0.6s jitter**：`asyncio.Lock` + `monotonic` 时间戳，全局单例（进程内）；跨进程用 `service_state` 租约保证只有 1 个抓取者。
3. **429**：读 `Retry-After`（秒或 HTTP 日期），写入 `service_state.host_suspend_until`，挂起该主机后续请求；**403**：立即置 `circuit_open_until = now + 30min` 并停止自动抓取；5xx/超时：指数退避最多额外 3 次。
4. **条件请求**：带 `If-None-Match` / `If-Modified-Since`；304 → 复用 `http_cache.body`，记 `cache_hit`。
5. **预算**：`fetch_daily_budget` 按 UTC 日期计数，超限拒绝；"刷新"按钮不绕过冷却。
6. **开关**：`EXTERNAL_FETCH_ENABLED=false` 时全部拒绝并返回可理解原因。
7. 日志分类：`network` / `data` / `validation` / `algorithms`。

## 5. 数据获取与窗口策略

- **窗口锚点**：`anchor = 官方最后可用日`（实测当前为 2026-09-30，因当月月表为空）；默认窗口 = 锚点前 30 天（含锚点），即 2026-09-01–09-30。
- **取数方式**：`opendata.php?...&station=X&year=Y`（省略 `month` 可一次取整年，1 请求换 365 行，已实测）。
- **首次入库**：对所选站点 × `tmax/tmin/tmean` 各 1 请求/指标/年；请求间隔 3s，2 站 3 指标 ≈ 18s。
- **当月为空**必须显式识别为"未发布"，不是错误。

## 6. 演示模式与 CSV 导入（红线）

- **演示数据**：`sample_data/demo/` 下固定 CSV，**来源真实快照**（官方 2026-09 月表实测数据），文件头注释写明来源、抓取时间、生成脚本、覆盖范围。`mode=demo`，接口与页面都常驻"示範資料"横幅，**默认不启用**。
- **失败不静默回退**：官方抓取失败 → 若无缓存，返回 `mode: "official"` + 空数据 + `status.reason`（熔断/预算/403/超时），前端显示原因与"上传官方 CSV"入口；**不得**自动切 demo。
- **CSV 导入**：接受官方 `rformat=csv` 原始格式（双语标题 2 行 + 字段行 + 数据 + legend 3 行）与规范 5 列格式；逐行校验日期、站号（必须在 39 站名单内）、数值精度、质量标记；返回明细报告；导入行 `mode=imported`，与 official 分开存储、分开标注。

## 7. 前端页面（`/weather`）

- 顶部：数据窗口（真实起止日期）、数据模式横幅、覆盖率摘要（有效天数/缺失天数/最后可用日）。
- 控件：日期范围、测站多选（可比较）、指标多选、刷新（显示冷却）、CSV 导入、"示範模式"开关。
- **5 类图表（Plotly.js + react-plotly.js）**，全部双语悬停文本、图例可开关、下方附可访问数据表：

| # | 图表 | 数据 | 说明 |
|---|---|---|---|
| 1 | 折线图 | 所选站的日 `tmax`/`tmin` | 趋势，缺口断开不连线 |
| 2 | 柱状图 | 日降雨量（已采集时）或所选站点的日最高温对比 | 说明指标口径 |
| 3 | 直方图 | 日最高温分布（按站或合并） | 展示有效样本 |
| 4 | 散点图 | 同日 `tmax` vs `tmean`（湿度不可回溯时）或 `tmax` vs 湿度（已采集时） | 标注所用指标 |
| 5 | 环形图 | **有效观测日中不同温度区间的天数占比** | **禁止**用于"气温数值占比"；必须标注区间阈值、有效样本量、缺失天数 |

- 无障碍：图表容器 `role="img"` + `aria-label` 摘要；数据表可键盘访问；颜色不是唯一编码。

## 8. 测试要求

- 后端：限速/并发（用假时钟）、429 `Retry-After`、403 熔断、超时重试、304 缓存命中、预算耗尽、开关关闭、CSV 解析（官方式/规范式/坏行）、精度保真（`"34.4"` 不得变 34）、缺失不写 0、最高温 ≥ 最低温校验、窗口锚点、覆盖率计算。全部用 `respx` 或 `httpx.MockTransport`，**不联网**。
- 前端：5 个图表在缺数据/有数据时的渲染、双语悬停配置、数据表存在、模式横幅非 official 时必现、导入错误提示、Vitest 不触发真实网络。
- 回归：阶段 2 的后端 63 / 前端 76 测试必须继续全绿。
