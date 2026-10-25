# 算法轨迹协议 v1（Trace Protocol）

> 状态：**契约冻结**（阶段 2 实现依据）。前后端都以此文件为准，任何字段变更必须先改本文件。
> 维护：Lead · 2026-10-23

## 0. 四条不可违背的原则

1. **只有 Python 算法真实执行才产生轨迹**。前端不得推导、猜测或补全事件；不得在动画时间轴上"轮流点亮"代码。
2. **单一可信代码源**：算法模块里的源码就是被执行的源码，也是展示给学生的源码；不存在第二份"教学版"。插桩调用（`trace.*`）写在源码里，展示时以 `kind: "trace"` 标注并允许折叠，但**行号不变**。
3. **稳定唯一 ID**：输入元素有 `id`（如 `it-0`），与数值解耦；重复数值、相等温度也必须能区分。
4. **可重复**：同一输入 + 同一参数 ⇒ 逐字节相同的轨迹（无随机、无 dict/set 顺序依赖、无时间戳进入轨迹）。

## 1. 端点

```
POST /api/algorithms/bubble/trace
Content-Type: application/json
```

请求体：

```json
{
  "values": [5, 3, 8, 1],
  "direction": "asc",
  "options": { "early_exit": true }
}
```

| 字段 | 类型 | 约束 |
|---|---|---|
| `values` | `int[]` | 长度 2–30；每个值在 `[-1000, 1000]`；允许重复、负数、全相同 |
| `direction` | `"asc" \| "desc"` | 必填 |
| `options.early_exit` | `bool` | 默认 `true`；是否启用"本轮无交换则提前结束"优化 |

校验失败返回 **422**，`detail` 为字段级错误数组（FastAPI 默认语义），不得返回 200 + 空轨迹。

## 2. 响应结构

```jsonc
{
  "protocol_version": 1,
  "algorithm": "bubble",
  "direction": "asc",
  "options": { "early_exit": true },

  "items": [
    { "id": "it-0", "value": 5 },
    { "id": "it-1", "value": 3 },
    { "id": "it-2", "value": 8 },
    { "id": "it-3", "value": 1 }
  ],

  "code": {
    "language": "python",
    "lines": [
      { "line_id": "L1", "lineno": 1, "text": "def bubble_sort(items, direction=\"asc\", early_exit=True):", "kind": "normal" },
      { "line_id": "L2", "lineno": 2, "text": "    arr = list(items)", "kind": "normal" },
      { "line_id": "L7", "lineno": 7, "text": "            trace.emit_compare(i=j, j=j + 1)", "kind": "trace" }
      // ……完整源码，行号与算法模块实际行号一致
    ]
  },

  "states": [
    { "state_id": 0, "order": ["it-0", "it-1", "it-2", "it-3"], "values": [5, 3, 8, 1] },
    { "state_id": 1, "order": ["it-1", "it-0", "it-2", "it-3"], "values": [3, 5, 8, 1] }
  ],

  "events": [
    {
      "step_id": 0,
      "event_type": "compare",
      "code_line_ids": ["L7", "L8"],
      "state_before_id": 0,
      "state_after_id": 0,
      "active_indices": [0, 1],
      "compared_indices": [0, 1],
      "modified_indices": [],
      "finalized_indices": [],
      "auxiliary_state": {
        "pass_index": 0,
        "early_exit_enabled": true,
        "swapped_in_pass": false,
        "comparison": { "left": 5, "right": 3, "relation": "gt", "will_swap": true }
      },
      "metrics": { "comparisons": 1, "swaps": 0, "writes": 0 },
      "explanation": {
        "key": "bubble.compare.asc.swap",
        "zh-Hant": "比較第 1 個（5）與第 2 個（3）元素：5 > 3，升序排列需要交換。",
        "en": "Compare element 1 (5) with element 2 (3): 5 > 3, so they must be swapped for ascending order."
      }
    }
  ],

  "summary": {
    "comparisons": 5,
    "swaps": 2,
    "writes": 4,
    "passes": 2,
    "early_exit_triggered": false,
    "final_order": ["it-3", "it-1", "it-0", "it-2"],
    "final_values": [1, 3, 5, 8],
    "state_count": 6,
    "event_count": 7
  }
}
```

## 3. 字段语义（规范性）

### 3.1 状态与语义

- `states[0]` 是**输入初始状态**。每个事件通过 `state_before_id` / `state_after_id` 引用快照。
- **不变量**：`event.state_after_id` 是下一个事件的 `state_before_id`（尾部事件除外）。
- `compare` 类事件 `before == after`；`swap` / `write` 类事件 `before != after`（交换事件必须能还原前后状态）。
- 前端**不得**自行交换数组元素来推进动画，必须直接渲染 `states[...]`。
- **空槽（hole）**：插入/希尔等在"抽出待插入元素、元素右移"期间，`states[].order` 允许用 `null` 表示当前空槽（该下标的元素正被持有在 `auxiliary_state.key_value`/`key_index`）。约束：
  - 同一 `order` 中每个 item id **至多出现一次**（禁止重复 id）；
  - `null` 至多一个（单空槽实现）；`states[].values` 在同一位置也必须是 `null`（不得填 0）；
  - 最终 `done` 时的 order 必须是全部输入 id 的完整排列。
  前端渲染时把 `null` 画成显式空槽（不得跳过导致下标错位）。

### 3.2 事件类型（阶段 2 至少实现前 5 种，其余为后续算法预留）

`compare` · `swap` · `write` · `mark_sorted` · `done` ·（预留）`select` `partition` `merge` `bucket` `count`

| event_type | 含义 | `modified_indices` | 指标变化 |
|---|---|---|---|
| `compare` | 比较两个元素 | `[]` | `comparisons += 1` |
| `swap` | 交换两个元素 | 被交换的两个下标 | `swaps += 1`，`writes += 2` |
| `write` | 单点写入/移动（非交换） | 被写入下标 | `writes += 1`（**不**计 `swaps`） |
| `mark_sorted` | 某个下标已确定最终位置 | `[]` | 无 |
| `done` | 排序结束 | `[]` | 无 |

> **禁止把移动算作交换**：`writes` 与 `swaps` 必须分别累计。冒泡排序一次交换 = 2 次写入。

### 3.3 指标

`metrics` 是**截至该事件执行完的累计值**，单调不减。`summary` 是最后一个事件的 `metrics` 加上整体统计。`comparisons + swaps + writes` 必须与事件序列自洽（测试断言）。

### 3.4 `auxiliary_state`（算法专属，键名必须存在）

冒泡排序固定提供：`pass_index`（第几轮，0 起）、`early_exit_enabled`、`swapped_in_pass`（本轮是否已发生交换）。
`compare` 事件额外提供 `comparison: {left, right, relation, will_swap}`，其中 `relation ∈ {"gt","lt","eq"}`。

> `will_swap` 由**后端**根据真实比较计算。前端只用它来出教学预测题，**不得**在前端重新实现比较规则。

### 3.5 `finalized_indices`

已确定最终位置的元素下标（当前数组坐标）。每轮结束将本轮冒泡到末尾的元素加入；测试断言最终为全部下标。

### 3.6 `code` 与 `code_line_ids`

- `code.lines` 是**实际执行源码**的逐行表示，`lineno` 与模块源文件行号一致（1 起）。
- **只包含被演示的算法函数本体**（`bubble_sort`）：模块级 docstring / import 等不下发，避免学生看到无关后端代码；`lineno` 仍是模块绝对行号，因此行号不重排、映射不变（2026-10-25 调整）。
- **不展示源码注释与函数文档字符串**：内部注释按项目约定用简体中文，而学生界面不允许出现简体；教学说明由后端双语 `explanation` 承担。展示行中 `text` 已去掉注释/文档串，行号与行映射保持不变。
- `kind: "trace"` 标记插桩行（`trace.emit_*`），前端可折叠/降淡显示，但**不移除**（移除会导致行号漂移）。
- 事件 `code_line_ids` 是"行组"：`compare` 必须包含比较语句行（`if` 行）以及记录行；`swap` 必须包含交换赋值行。规则见 §5。
- 每个 `line_id` 必须能用 `L{lineno}` 反解，且该行文本与 `source` 对应行一致（测试断言）。

### 3.7 双语解释

- `explanation` 由**后端固定模板 + 事件参数**生成，不调用任何大模型，不依赖前端拼接。
- `key` 是模板键（稳定，便于测试）；`zh-Hant` / `en` 必须同时非空。
- 学生可见文案遵循**繁体中文在上、英文在下**，但在协议层两者是并列字段，排版由前端决定。

## 4. 限量与错误

| 情况 | 行为 |
|---|---|
| `len(values)` < 2 或 > 30 | 422 |
| 值超出 `[-1000, 1000]` 或非整数 | 422 |
| `direction` 非法 | 422 |
| 事件总数超过 20000 | 422（不得截断后返回） |
| 算法未实现 | 404 |

## 5. 代码行映射规则（C2 的实现约束）

算法源码中，插桩调用必须**紧邻**其语义语句。**不同插桩类型的位置与映射方向不同**，这是本协议唯一需要记忆的规则表：

| 插桩调用 | 位置 | 映射到的高亮行 | 理由 |
|---|---|---|---|
| `trace.emit_compare(...)` | 比较语句**之前** | **下一条**同块语句（`if` 行） | 先记录"即将比较"，事件状态为比较前 |
| `trace.emit_swap(...)` | 交换赋值**之后** | **上一条**同块语句（交换赋值行） | 交换已发生，可记录到真实的前后状态 |
| `trace.emit_mark_sorted(...)` | 每轮循环体**第一句** | **所在 `for` 语句行** | 进入新一轮 = 上一轮末尾已就位 |
| `trace.emit_done(...)` | `return` **之前** | **下一条**语句（`return` 行） | 排序结束 |

示例（摘自 `backend/app/algorithms/bubble.py`，`L*` 为模块内真实行号）：

```python
    for i in range(n - 1):                                # L29
        recorder.emit_mark_sorted(pass_index=i)           # L31 trace → 高亮 L29（所在 for）
        ...
        for j in range(n - 1 - i):                        # L34
            recorder.emit_compare(i=j, j=j + 1, ...)      # L36 trace → 高亮 L38（下一条 if）
            if arr[j] > arr[j + 1]:                       # L38
                arr[j], arr[j + 1] = arr[j + 1], arr[j]   # L39
                recorder.emit_swap(i=j, j=j + 1, ...)     # L41 trace → 高亮 L39（上一条赋值）
                swapped = True
        if early_exit and not swapped:                    # L43
            break
    recorder.emit_done(...)                               # L47 trace → 高亮下一条 return
    return arr                                            # L48
```

建立与校验方式：

1. 导入算法模块时用 **AST** 解析源码，按上表把每个 `emit_*` 解析到目标语句行；解析不到 ⇒ **导入即失败**（防止映射漂移）。
2. `code_line_ids` 固定为二元组 `[emit 行, 目标语义行]`；两行都必须存在于 `code.lines`。
3. 测试必须覆盖：每种 `event_type` 至少一个事件，其目标行 AST 节点类型符合预期（`compare`/`swap` 为 `If` 或 `Assign`，`mark_sorted` 为 `For`，`done` 为 `Return`）。
4. 学生可见视图就是 `code.lines`，**不得**由第二份手写源码生成；`code.lines` 由 `inspect.getsourcelines` 从**实际执行的模块**取得。
5. `mark_sorted` 触发的时机是"进入第 i+1 轮"，因此其 `finalized_indices` 为前几轮已就位元素的下标集合，**不含**本轮。

## 6. 前端消费约束

1. 播放器状态机：`idle → playing → paused → finished`；`prev` 只能**回退到已有快照**，禁止反向执行算法。
2. 暂停后不得推进；切换输入/方向/速度必须重置到 `idle`。
3. 高亮只由当前事件的 `code_line_ids` 驱动。
4. 教学预测题只在 `compare` 事件、且为引导模式时出现；答完展示 `explanation` 再自动推进。
5. 屏幕阅读器只播报手动步进的摘要（`aria-live="polite"`），播放中不逐帧播报。
6. 支持 `prefers-reduced-motion`：开启时取消过渡动画，但状态推进逻辑不变。

## 7. 兼容策略

`protocol_version` 目前固定为 `1`。新增字段必须可选；删除或改语义必须升版本，并在前端做兼容分支。
