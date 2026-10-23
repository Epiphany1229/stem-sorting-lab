# 阶段 4 设计：真实天气排序 `/weather-sort`

> 状态：**冻结**（2026-10-23）。基础协议见 `docs/trace-protocol.md`，数据见 `docs/weather-data-design.md`。

## 0. 官方数据核查结论（本阶段新增实测）

| 候选 | 实测结果 | 结论 |
|---|---|---|
| `dataType=CLMRAINF` | PDF 的 `dataType` 清单里**不存在**；接口对未知 dataType 返回 200 + 参数错误文本 | ❌ 不存在 |
| `hourlyRainfall.php` | 200，返回 `{obsTime, hourlyRainfall}`，**只有当前一小时** | 实时专用，不可回溯 |
| `opendata.php?dataType=RYES&date=YYYYMMDD` | **200 + 官方日报 JSON**，含 `HKOReadingsRainfall`（日雨量 mm）、`HKOReadingsAccumRainfall`、`HKOReadingsMaxRH/MinRH`、多站 `MaxTemp/MinTemp` 等 | ✅ **官方日雨量存在，但仅 HKO 一站、每请求一天** |

因此：**不为降雨做常驻累积守护进程**；RYES 仅作为可选的按需回填（CLI，1 请求/天），阶段 4 的核心是 `/weather-sort`。

## 1. 轨迹协议扩展（向后兼容，`protocol_version` 仍为 1）

新增**可选**字段，不破坏阶段 2 的客户端：

```jsonc
// items[] 增加天气元数据（阶段 2 的算法只有 id/value，仍合法）
{"id": "it-2026-09-12", "value": 30.2, "value_raw": "30.2",
 "label": "2026-09-12", "station": "HKO",
 "station_name_zh_hant": "香港天文台", "station_name_en": "Hong Kong Observatory",
 "quality_flag": "C",
 "source": {"dataset": "CLMMAXT", "fetched_at": "2026-10-23T12:29:24Z", "mode": "official"}}

// 顶层新增（仅天气轨迹出现）
"metric": "tmax",
"valid_days": 30, "requested_days": 30,
"excluded_dates": [{"date": "2026-09-07", "reason": "missing"}],
"before_order": ["it-2026-09-01", "..."],   // 按日期升序（排序前）
"after_order":  ["it-2026-09-03", "..."],   // 按温度排序后
"top_hot":  [{"date": "2026-09-30", "value": 34.2, "value_raw": "34.2"}],
"top_cold": [{"date": "2026-09-02", "value": 27.5, "value_raw": "27.5"}],
"single_scan": {"comparisons": 29, "swaps": 0}   // O(n) 找极值的对照数据
```

**稳定性**：相等温度不交换（`>` 而非 `>=`），因此等温日期的先后顺序在轨迹中自然保留，`after_order` 可验证。
**缺失值**：`***` / 无记录的日期不进入排序，只进 `excluded_dates`；`tmax` 与 `tmin` 各自独立统计。

## 2. 后端接口

`POST /api/algorithms/bubble/weather-trace`

```jsonc
{
  "station": "HKO",        // 必须在 39 站名单
  "metric": "tmax",        // tmax | tmin
  "start": "2026-09-01", "end": "2026-09-30",
  "direction": "asc",      // asc | desc
  "options": {"early_exit": true}
}
```

- 复用 `backend/app/algorithms/bubble.py` 与 `TraceRecorder`（**不新写排序**）；通过注入"天气解释工厂"生成双语解释。
- 解释模板（固定模板 + 真实参数）：`比較 9 月 12 日的 30.2°C 與 9 月 13 日的 29.6°C；升序排列時需要交換。` / `Comparing 30.2°C on Sep 12 with 29.6°C on Sep 13; swap needed for ascending order.`
- 无有效数据（<2 天）→ 422，`detail` 说明原因。
- 可选：`python -m backend.app.cli ingest-rainfall --station HKO --start ... --end ...`（RYES，1 请求/天，写 `metric="rainfall"`，**仅 HKO**，非默认执行）。

## 3. 前端页面

- `/weather` 顶部突出按钮：「用冒泡排序探索這 30 天的氣溫 / Explore These 30 Days of Temperatures with Bubble Sort」→ 携带当前 `station/metric/start/end` 跳转。
- `/weather-sort`：
  - 控件：`tmax`/`tmin` 一键切换（各自独立有效天数）、升/降序、测站、日期范围；切换指标必须重置播放器。
  - **复用** `TracePlayer` + `BarChart` + `CodePanel` + `PredictionDialog`；仅扩展柱子的日期标签与悬停/聚焦详情（完整日期、测站中英文名、质量标记）。
  - 并排比较开关：同一窗口下 `tmax` 与 `tmin` 两个播放器并排（各自独立控制）。
  - 顶部缺失提示：「當前有效天數 X 天，已排除以下缺失日期：…」，按指标分别计算。
  - 结果区：Top 5 最热/最冷、排序前后对比、比较/交换/轮次、冒泡 vs 单次扫描 STEM 卡片。
  - 柱高比例尺处理负值与"全部相同"（分母 0）边界。

## 4. 测试

- 后端（pytest + Hypothesis）：一位小数、负数、全相同、重复温度保持日期顺序、缺失过滤与 `excluded_dates`、`tmax`/`tmin` 不串数据、解释含真实日期与温度、`single_scan = n-1`、确定性。
- 前端（Vitest）：切换指标重置、交换后标签与日期仍匹配、缺失日期提示、并排比较、双语无简体、STEM 卡片数值来自轨迹。
- 跨栈：用真实后端响应做契约测试（沿用阶段 2/3 做法）。
