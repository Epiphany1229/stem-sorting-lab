# 阶段 5 设计：比较类排序学习中心（7 种）

> 状态：**契约冻结**（2026-10-25）。**产品范围已正式收敛**：仅实现经典比较类排序 **冒泡、选择、插入、希尔、归并、快速、堆** 共 **7 种**。
> 计数/桶/基数排序**不再实现**（产品决策：对零基础学习者引入非比较范式与定点整数转换认知负荷过高，且与"一位小数气温"场景不匹配）；算法中心不保留任何「開發中」占位入口。
> 基础协议见 `docs/trace-protocol.md`；本文件只新增**可选**字段与新事件类型的映射规则，不修改既有字段语义。

## 1. 架构：算法注册表 + 统一轨迹

```
POST /api/algorithms/{algorithm_id}/trace      # id ∈ bubble|selection|insertion|shell|merge|quick|heap（5B 再加 counting|bucket|radix）
body: { "values": [...], "direction": "asc"|"desc", "options": {...} }
```

- `backend/app/algorithms/registry.py`：`ALGORITHMS = {id: AlgorithmSpec(module, function, line_map, aux_fields, metadata)}`（`aux_fields` 声明该算法的固定 aux 键，供测试核对；aux 值由插桩处直接给出，避免第二份来源）。
- 每个算法模块**只有一份插桩源码**，与执行代码完全相同；`code.lines` 仍只下发该函数本体（去注释/文档串，`lineno` 保持模块绝对行号）。
- 映射在**导入期**用 AST 建立并校验，失败即阻止启动。
- 前端 `TracePlayer` + 通用 `AuxPanel` + 每算法一个专属可视化组件；**禁止**把专属视图退化成普通柱图。

### 1.1 `GET /api/algorithms` 响应契约（冻结）

```jsonc
{
  "protocol_version": 1,
  "algorithms": [
    {
      "id": "bubble",
      "name": {"zh-Hant": "冒泡排序", "en": "Bubble sort"},
      "tagline": {"zh-Hant": "相鄰兩兩比較，大的往右冒。", "en": "Compare neighbours; the larger value bubbles right."},
      "status": "available",                 // available | planned
      "time_complexity": {"zh-Hant": "O(n²)（含提前結束優化）", "en": "O(n²) with early exit"},
      "space_complexity": {"zh-Hant": "O(1)", "en": "O(1)"},
      "stable": true,                        // planned 项可为 null
      "use_cases": {"zh-Hant": "教學入門、資料量很小。", "en": "First lessons and very small lists."},
      "default_values": [5, 3, 8, 1, 9, 2],
      "supports_early_exit": true            // 仅冒泡为 true，其余 false
    }
    // ……10 项，planned 也必须返回
  ]
}
```

- 通用轨迹端点 `POST /api/algorithms/{id}/trace`：请求 `{values, direction, options}`，`options` 可为 `{}`；响应沿用协议信封，`events[].auxiliary_state` 按 §4 提供各算法字段。
- 未知或 planned 的 id 调用 trace → **404**；输入不合法 → 422（双语 `detail`/`reason`）。

## 2. 插桩与行号映射规则（扩展）

沿用阶段 2 的四条规则，新增三类：

| 插桩 | 位置 | 映射到 |
|---|---|---|
| `emit_compare(...)` | 比较语句之前 | 下一条同块语句（`if`/`while` 行） |
| `emit_swap(...)` | 交换赋值之后 | 上一条同块语句（赋值行） |
| `emit_write(...)` | 写入/平移/回拷之后 | 上一条同块语句 |
| `emit_select(...)` | 更新最小值下标之前 | 下一条同块语句 |
| `emit_partition(...)` | 分区边界推进之前 | 下一条同块语句 |
| `emit_merge(...)` | 合并阶段语句之前 | 下一条同块语句 |
| `emit_mark_sorted(...)` | 每轮/每段结束处的循环体第一句 | 所在 `for`/`while` 行 |
| `emit_done(...)` | `return` 之前 | 下一条语句（`return` 行） |

事件类型：`compare` / `swap` / `write` / `select` / `partition` / `merge` / `mark_sorted` / `done`。

## 3. 指标口径（严格区分）

| 算法 | comparisons | swaps | writes | 说明 |
|---|---|---|---|---|
| 选择 | 每比较一次 +1 | 每轮最多 1 次 | `swaps*2` | 只交换不移动 |
| 插入 | 每比较一次 +1 | 0 | 每次右移 +1、最终插入 +1 | 稳定；`swaps` 必须为 0 |
| 希尔 | 组内比较 +1 | 0 | 组内平移/插入每次 +1 | gap 序列：`n//2, n//4, …, 1` |
| 归并 | 左右头比较 +1 | 0 | 写入辅助数组 +1、回拷 +1 | 稳定；空间 O(n) |
| 快速 | 与枢轴比较 +1 | 每交换 +1 | `swaps*2` | 枢轴：**首元素**（`arr[low]`），Lomuto 分区（实现与说明必须一致） |
| 堆 | 父子比较 +1 | 每交换 +1 | `swaps*2` | 二叉堆数组表示；建堆 + 逐次取最大/最小 |
| 计数 | 0（不比较） | 0 | 计数写入 + 输出写入 | 5B |
| 桶 | 桶内插入比较 | 0 | 桶内插入 + 回填主数组 | 5B |
| 基数 | 0 | 0 | 入桶 + 收集 | 5B，LSD |

> 每一类事件执行后 `metrics` 为累计值且单调不减；`summary` 与事件序列自洽（测试断言）。

## 4. 专属 `auxiliary_state` 字段（前端按此渲染）

| 算法 | 字段 |
|---|---|
| 选择 | `pass_index`、`min_index`、`scan_from`、`scan_to`、`finalized_before` |
| 插入 | `pass_index`、`key_value`、`key_index`、`hole_index`、`sorted_to`、`shifting`（bool） |
| 希尔 | `gap`、`gap_index`、`groups`（[[下标…], …]）、`group_index`、`key_value`、`hole_index` |
| 归并 | `left`、`mid`、`right`、`depth`、`left_ptr`、`right_ptr`、`buffer`（id 列表）、`buffer_index`、`writing_back`（bool） |
| 快速 | `pivot_value`、`pivot_index`、`low`、`high`、`left_ptr`、`right_ptr`、`partition_index`、`phase`（`compare`/`partition`/`placed`） |
| 堆 | `heap_size`、`node_index`、`parent_index`、`left_child`、`right_child`、`phase`（`build`/`extract`/`sift_down`） |

前端必须为每个算法提供独立辅助视图（选择：min 候选/已扫描区；插入：持牌槽位；希尔：gap 与分组；归并：区间层级 + 辅助合并数组；快速：枢轴/边界/指针；堆：数组与二叉堆 SVG 联动）。不得只用主柱图代替。

## 5. 元数据（教学文案必须与实现一致）

| 算法 | 一句话直观解释 | 时间 | 空间 | 稳定 |
|---|---|---|---|---|
| 冒泡 | 相邻两两比较，大的往右冒 | O(n²)（含提前结束优化） | O(1) | 稳定 |
| 选择 | 每轮扫描剩余部分找最小值放到前面 | O(n²) | O(1) | **不稳定** |
| 插入 | 像整理手牌，把新牌插到已排序区 | O(n²) | O(1) | 稳定 |
| 希尔 | 先按大步长分组做插入，再逐步缩小 gap | O(n log n)~O(n²)（取决于 gap 序列） | O(1) | **不稳定** |
| 归并 | 递归对半拆，再把有序两半合并 | O(n log n) | O(n) | 稳定 |
| 快速 | 选枢轴分区，左边小右边大再递归 | 平均 O(n log n)、最坏 O(n²)（首元素枢轴） | O(log n) 递归栈 | **不稳定** |
| 堆 | 建最大堆，反复把堆顶换到末尾并下沉 | O(n log n) | O(1) | **不稳定** |
| 计数 | 统计每个值出现次数再按序输出 | O(n+k) | O(k) | 稳定 |
| 桶 | 按区间分桶，桶内排序后拼接 | 平均 O(n+k) | O(n+k) | 取决于桶内算法 |
| 基数 | 按个位/十位/百位逐位稳定分配再收集 | O(d(n+b)) | O(n+b) | 稳定 |

## 6. 输入与边界

- 比较类 6 种：接受整数与一位小数（`float`，如 `30.2`）；范围 `[-1000, 1000]`，长度 2–30；`direction` 升降序都要支持（降序通过比较符翻转，稳定性/指标口径不变）。
- 计数/基数/桶（5B）：计数仅整数且跨度 `max-min ≤ 1000`；基数支持负数（偏移或正负分桶，须在 UI 说明所选变体）；桶排序说明区间映射 `bucket = (v-min) // ceil((max-min)/k)`（最大值归入最后一个桶）。
- 小数点教学转换（5B）：如提供温度整数化，必须 `Decimal(str(value)) * 10` 定点，并展示 `30.2°C ↔ 302`；禁止 `int()` 截断或二进制浮点乘。
- 不适用输入 → 422 + 双语 `reason`，不得静默改数据。

## 7. 前端信息架构

- `/algorithms`：10 个入口，状态徽标（可用/开发中）；5A 后 7 个可用（含冒泡），3 个为开发中。
- `/algorithms/:id`：一句话解释 + 默认小数据 + 播放器 + Python 高亮 + 双语步骤解释 + 复杂度/空间/稳定性 + 适用条件 + 练习/预测题 + 专属 AuxPanel。
- 未知 id → 404 页面（已有 NotFound）。
