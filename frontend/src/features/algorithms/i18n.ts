/**
 * 阶段 5A 算法中心与专属辅助可视化的双语文案。
 *
 * 说明：`frontend/src/i18n/dictionary.ts` 由并行任务维护，本阶段新增文案统一放在
 * 这里，仍遵守同一约定——繁体中文在上、英文紧贴在下、成对出现、不得出现简体中文。
 * 组件通过 BilingualText 的 `zh` / `en` 直接传入，不硬编码在 JSX 里。
 */

/** 成对双语文案。 */
export interface AlgorithmTextPair {
  readonly "zh-Hant": string;
  readonly en: string;
}

function pair(zh: string, en: string): AlgorithmTextPair {
  return { "zh-Hant": zh, en };
}

export const algorithmText = {
  // ---------- 算法中心列表 ----------
  "list.note": pair(
    "階段 5A：七種比較類排序全部可用，每一種都能打開學習頁並播放後端真實軌跡。",
    "Phase 5A: all seven comparison sorts are available; each opens a learning page with a real backend trace.",
  ),
  "list.loading": pair("正在載入演算法清單…", "Loading the algorithm list…"),
  "list.error": pair(
    "無法載入演算法清單，請確認後端已啟動，然後重試。",
    "Could not load the algorithm list. Make sure the backend is running, then try again.",
  ),
  "list.retry": pair("重新載入", "Reload"),
  "list.available": pair("開始學習", "Start learning"),

  // ---------- 学习页通用 ----------
  "detail.breadcrumbLabel": pair("目前位置", "You are here"),
  "detail.home": pair("首頁", "Home"),
  "detail.center": pair("演算法中心", "Algorithm center"),
  "detail.back": pair("返回演算法中心", "Back to algorithm center"),
  "detail.loading": pair("正在載入演算法資料…", "Loading the algorithm details…"),
  "detail.error": pair(
    "無法載入演算法資料，請確認後端已啟動，然後重試。",
    "Could not load the algorithm details. Make sure the backend is running, then try again.",
  ),
  "detail.retry": pair("重新載入", "Reload"),
  "detail.sourceNote": pair(
    "所有動畫、程式行高亮與步驟解釋都來自後端真實執行的軌跡；前端不自行推導排序。",
    "Every animation, code highlight and step explanation comes from the trace produced by the backend; the frontend never derives the sorting itself.",
  ),
  "detail.metaTitle": pair("演算法資訊", "Algorithm facts"),
  "detail.practiceTitle": pair("小練習", "Quick practice"),
  "detail.practiceReveal": pair("顯示參考答案", "Show a reference answer"),
  "detail.practiceHide": pair("收起參考答案", "Hide the reference answer"),
  "detail.practicePrompt": pair(
    "先自己想一想，再打開參考答案。",
    "Think about it first, then reveal the reference answer.",
  ),
  "detail.visualTitle": pair("演算法專屬視覺", "Algorithm-specific visual"),
  "detail.visualHint": pair(
    "跟著播放器目前的事件更新；資料來自後端 auxiliary_state，不是前端推算。",
    "Follows the player's current event; the data comes from the backend auxiliary_state, not from frontend guessing.",
  ),
  "detail.defaultValues": pair("預設資料：{values}", "Default data: {values}"),

  // ---------- 复杂度/稳定性 ----------
  "meta.time": pair("時間複雜度", "Time complexity"),
  "meta.space": pair("空間複雜度", "Space complexity"),
  "meta.stable": pair("穩定性", "Stability"),
  "meta.useCases": pair("適用條件", "When to use it"),
  "meta.stableYes": pair("穩定", "Stable"),
  "meta.stableNo": pair("不穩定", "Not stable"),
  "meta.stableUnknown": pair("取決於實作", "Depends on the implementation"),

  // ---------- 输入控制 ----------
  "controls.title": pair("資料與方向", "Data and direction"),
  "controls.random": pair("隨機小數列", "Random small list"),
  "controls.custom": pair("自訂數列", "Custom list"),
  "controls.customHint": pair(
    "用逗號或空格分隔 2 至 30 個數字；可輸入一位小數（例如 30.2），範圍 -1000 至 1000。",
    "Separate 2 to 30 numbers with commas or spaces; one decimal place is allowed (for example 30.2), range -1000 to 1000.",
  ),
  "controls.integerHint": pair(
    "冒泡頁使用整數入門資料；其他比較類算法支援一位小數。請用逗號或空格分隔 2 至 30 個整數，範圍 -1000 至 1000。",
    "The bubble page uses integer starter data; the other comparison sorts support one decimal place. Separate 2 to 30 integers with commas or spaces, range -1000 to 1000.",
  ),
  "controls.apply": pair("套用數列", "Use this list"),
  "controls.current": pair("目前數列：{values}", "Current list: {values}"),
  "controls.resetHint": pair(
    "切換資料或方向會把播放器重置到第一步。",
    "Changing the data or direction resets the player to the first step.",
  ),
  "controls.error.empty": pair("請先輸入至少 2 個數字。", "Please enter at least 2 numbers."),
  "controls.error.count": pair(
    "數字數量必須介於 2 與 30 之間。",
    "The list must contain between 2 and 30 numbers.",
  ),
  "controls.error.notNumber": pair(
    "只能用數字，請用逗號或空格分隔。",
    "Only numbers are allowed; separate them with commas or spaces.",
  ),
  "controls.error.decimals": pair("每個數字最多只能有一位小數。", "Each number may have at most one decimal place."),
  "controls.error.integerOnly": pair(
    "冒泡排序頁只接受整數，請輸入整數（例如 5、3、8、1）。",
    "The bubble sort page accepts whole numbers only; enter integers such as 5, 3, 8, 1.",
  ),
  "controls.error.range": pair(
    "每個數字必須介於 -1000 與 1000 之間。",
    "Each number must be between -1000 and 1000.",
  ),

  // ---------- 专属辅助视觉通用 ----------
  "aux.title": pair("專屬輔助視覺", "Dedicated visual"),
  "aux.idle": pair(
    "按「下一步」或「開始播放」，這裡會跟著事件更新。",
    'Press "Next step" or "Start playing"; this visual follows each event.',
  ),
  "aux.missing": pair(
    "這一步的輔助資料缺少：{fields}。畫面只顯示目前陣列，不推測缺失內容。",
    "The auxiliary data for this step is missing: {fields}. Only the current array is shown; nothing is guessed.",
  ),
  "aux.noData": pair("這一步沒有提供輔助資料。", "This step does not provide auxiliary data."),
  "aux.legend": pair("圖例", "Legend"),
  "aux.index": pair("下標", "Index"),
  "aux.value": pair("數值", "Value"),
  "aux.pass": pair("目前輪次", "Current pass"),
  "aux.passValue": pair("第 {pass} 輪", "Pass {pass}"),

  // ---------- 选择排序 ----------
  "selection.title": pair("選擇追蹤", "Selection tracking"),
  "selection.minCandidate": pair("最小值候選", "Minimum candidate"),
  "selection.scanRange": pair("掃描區間", "Scanning range"),
  "selection.finalized": pair("已排定前綴", "Settled prefix"),
  "selection.minValue": pair("目前最小值", "Current minimum"),
  "selection.rangeValue": pair("{from} 到 {to}", "{from} to {to}"),
  "selection.positions": pair("{count} 個位置", "{count} positions"),
  "selection.candidateValue": pair("下標 {index}（數值 {value}）", "index {index} (value {value})"),
  "selection.candidateBadge": pair("候選", "Candidate"),
  "selection.finalizedBadge": pair("已排定", "Settled"),
  "selection.scannedBadge": pair("已掃描", "Scanned"),
  "selection.legend": pair(
    "圖例：★ 目前最小值候選；✓ 已排定；虛線下緣表示已掃描。",
    "Legend: ★ current minimum candidate; ✓ settled; dashed underline = scanned.",
  ),
  "selection.aria": pair(
    "選擇排序目前狀態：第 {pass} 輪，最小值候選在下標 {min}（數值 {value}），掃描區間 {from} 到 {to}，已排定 {finalized} 個位置。",
    "Selection sort state: pass {pass}, minimum candidate at index {min} (value {value}), scanning indices {from} to {to}, {finalized} positions settled.",
  ),

  // ---------- 插入排序 ----------
  "insertion.title": pair("插入追蹤", "Insertion tracking"),
  "insertion.held": pair("持牌槽位", "Held card slot"),
  "insertion.heldValue": pair("持牌值", "Held value"),
  "insertion.keyIndex": pair("原位置", "Original index"),
  "insertion.holeIndex": pair("空洞位置", "Hole index"),
  "insertion.sortedTo": pair("已排序區", "Sorted region"),
  "insertion.shifting": pair("右移中", "Shifting right"),
  "insertion.ready": pair("準備插入", "Ready to insert"),
  "insertion.sortedBadge": pair("已排序", "Sorted"),
  "insertion.heldBadge": pair("持牌", "Held"),
  "insertion.holeBadge": pair("空洞", "Hole"),
  "insertion.legend": pair(
    "圖例：★ 手上持牌；◌ 空洞；→ 表示右移方向。",
    "Legend: ★ held card; ◌ hole; → shifting direction.",
  ),
  "insertion.aria": pair(
    "插入排序目前狀態：持牌數值 {value}，原位置 {key}，空洞位置 {hole}，已排序區到 {sortedTo}，{shift}。",
    "Insertion sort state: held value {value}, original index {key}, hole index {hole}, sorted up to {sortedTo}, {shift}.",
  ),
  "insertion.shiftYes": pair("正在右移", "currently shifting"),
  "insertion.shiftNo": pair("等待插入", "waiting to insert"),
  "insertion.move": pair("位置 {key} → {hole}", "index {key} → {hole}"),
  "insertion.sortedToValue": pair("下標 0 到 {index}", "indices 0 to {index}"),

  // ---------- 希尔排序 ----------
  "shell.title": pair("希爾追蹤", "Shell tracking"),
  "shell.gap": pair("目前 gap", "Current gap"),
  "shell.gapIndex": pair("gap 序號", "Gap index"),
  "shell.groupIndex": pair("目前組別", "Current group"),
  "shell.groupCount": pair("分組數", "Number of groups"),
  "shell.group": pair("第 {n} 組", "Group {n}"),
  "shell.groupValue": pair("第 {n} 組", "Group {n}"),
  "shell.currentGroupValue": pair("第 {n} 組（目前）", "Group {n} (current)"),
  "shell.legend": pair(
    "圖例：同一括號內的數字屬於同一組；粗框是目前的組，◆ 是持牌值。",
    "Legend: numbers under the same bracket form a group; the thick outline is the current group and ◆ is the held value.",
  ),
  "shell.aria": pair(
    "希爾排序目前狀態：gap 為 {gap}，第 {gapIndex} 個 gap，目前處理第 {groupIndex} 組，共 {groupCount} 組。",
    "Shell sort state: gap {gap}, gap index {gapIndex}, handling group {groupIndex} of {groupCount}.",
  ),
  "shell.heldValue": pair("持牌值：{value}", "Held value: {value}"),

  // ---------- 归并排序 ----------
  "merge.title": pair("歸併追蹤", "Merge tracking"),
  "merge.range": pair("合併區間", "Merge range"),
  "merge.rangeValue": pair("左 {left}、中 {mid}、右 {right}", "left {left}, mid {mid}, right {right}"),
  "merge.depth": pair("遞迴深度", "Recursion depth"),
  "merge.leftPtr": pair("左讀取指標", "Left pointer"),
  "merge.rightPtr": pair("右讀取指標", "Right pointer"),
  "merge.buffer": pair("輔助合併陣列（buffer）", "Auxiliary merge buffer"),
  "merge.bufferIndex": pair("寫入位置", "Write position"),
  "merge.writingBack": pair("回拷主陣列中", "Copying back to the main array"),
  "merge.merging": pair("讀取並比較", "Reading and comparing"),
  "merge.legend": pair(
    "圖例：▼ 左右讀取指標；虛線框是輔助 buffer，回拷時整段寫回主陣列。",
    "Legend: ▼ left/right readers; the dashed box is the buffer, which is copied back into the main array.",
  ),
  "merge.emptyBuffer": pair("尚未寫入 buffer", "The buffer is still empty"),
  "merge.steps": pair("合併段數", "Merge steps"),
  "merge.aria": pair(
    "歸併排序目前狀態：合併區間 [{left}, {mid}, {right}]，深度 {depth}，左指標 {leftPtr}，右指標 {rightPtr}，buffer 已寫到位置 {bufferIndex}，{writingBack}。",
    "Merge sort state: merging [{left}, {mid}, {right}], depth {depth}, left pointer {leftPtr}, right pointer {rightPtr}, buffer written up to {bufferIndex}, {writingBack}.",
  ),
  "merge.writingYes": pair("正在回拷", "copying back"),
  "merge.writingNo": pair("尚未回拷", "not copied back yet"),
  "merge.bufferIndexValue": pair("寫入位置：{index}", "Write position: {index}"),

  // ---------- 快速排序 ----------
  "quick.title": pair("快速追蹤", "Quick tracking"),
  "quick.pivot": pair("樞軸", "Pivot"),
  "quick.pivotValue": pair("樞軸數值", "Pivot value"),
  "quick.range": pair("目前區間", "Current range"),
  "quick.rangeValue": pair("{low} 到 {high}", "{low} to {high}"),
  "quick.leftPtr": pair("左指標", "Left pointer"),
  "quick.rightPtr": pair("右指標", "Right pointer"),
  "quick.partition": pair("分區位置", "Partition index"),
  "quick.phase": pair("目前階段", "Current phase"),
  "quick.phase.compare": pair("比較中", "Comparing"),
  "quick.phase.partition": pair("分區中", "Partitioning"),
  "quick.phase.placed": pair("樞軸已就位", "Pivot placed"),
  "quick.legend": pair(
    "圖例：★ 樞軸；▼ 指標；虛線是分區邊界，左邊不大於樞軸、右邊大於樞軸。",
    "Legend: ★ pivot; ▼ pointers; the dashed line is the partition boundary: left side ≤ pivot, right side > pivot.",
  ),
  "quick.aria": pair(
    "快速排序目前狀態：樞軸在下標 {pivotIndex}（數值 {pivotValue}），目前區間 {low} 到 {high}，左指標 {leftPtr}，右指標 {rightPtr}，分區位置 {partition}，階段 {phase}。",
    "Quick sort state: pivot at index {pivotIndex} (value {pivotValue}), range {low} to {high}, left pointer {leftPtr}, right pointer {rightPtr}, partition index {partition}, phase {phase}.",
  ),

  // ---------- 堆排序 ----------
  "heap.title": pair("堆積追蹤", "Heap tracking"),
  "heap.size": pair("堆大小", "Heap size"),
  "heap.node": pair("目前節點", "Current node"),
  "heap.parent": pair("父節點", "Parent"),
  "heap.left": pair("左子節點", "Left child"),
  "heap.right": pair("右子節點", "Right child"),
  "heap.phase": pair("目前階段", "Current phase"),
  "heap.phase.build": pair("建堆", "Build heap"),
  "heap.phase.extract": pair("取出堆頂", "Extract root"),
  "heap.phase.sift_down": pair("下沉", "Sift down"),
  "heap.array": pair("陣列表示", "Array representation"),
  "heap.tree": pair("二叉堆（陣列與節點聯動）", "Binary heap (array linked to nodes)"),
  "heap.outside": pair("已取出", "Removed"),
  "heap.outsideBadge": pair("堆外", "Outside heap"),
  "heap.nodeBadge": pair("目前", "Current"),
  "heap.parentBadge": pair("父", "Parent"),
  "heap.childBadge": pair("子", "Child"),
  "heap.legend": pair(
    "圖例：★ 目前節點；父節點與子節點分別用文字標記；虛線框是已取出的元素。",
    "Legend: ★ current node; parents and children are labelled with text; dashed cells are removed elements.",
  ),
  "heap.aria": pair(
    "堆積排序目前狀態：堆大小 {size}，目前節點下標 {node}，父節點 {parent}，左子節點 {left}，右子節點 {right}，階段 {phase}。",
    "Heap sort state: heap size {size}, current node index {node}, parent {parent}, left child {left}, right child {right}, phase {phase}.",
  ),
  "heap.nodeAria": pair("下標 {index}，數值 {value}", "index {index}, value {value}"),

  // ---------- 空数据/错误提示 ----------
  "trace.notReady": pair(
    "準備好資料後，播放器會顯示後端真實軌跡。",
    "Once the data is ready, the player shows the real trace from the backend.",
  ),
} as const satisfies Record<string, AlgorithmTextPair>;

export type AlgorithmTextKey = keyof typeof algorithmText;

/** 按 key 取出双语条目（key 不存在时 TypeScript 直接报错）。 */
export function algorithmTextOf(key: AlgorithmTextKey): AlgorithmTextPair {
  return algorithmText[key];
}

function fillPlaceholders(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

/** 取出带占位符的文案并填充参数。 */
export function formatAlgorithmText(
  key: AlgorithmTextKey,
  values: Readonly<Record<string, string | number>>,
): AlgorithmTextPair {
  const entry = algorithmText[key];
  return {
    "zh-Hant": fillPlaceholders(entry["zh-Hant"], values),
    en: fillPlaceholders(entry.en, values),
  };
}

/** 只取繁体中文（aria-label、document.title 等单字符串场合）。 */
export function zhAlgorithmText(key: AlgorithmTextKey): string {
  return algorithmText[key]["zh-Hant"];
}

/** 每个算法的练习问题与参考答案。 */
export const practiceByAlgorithm = {
  bubble: {
    question: pair(
      "如果一輪冒泡排序完全沒有交換，代表什麼？",
      "What does it mean when a pass of bubble sort makes no swaps?",
    ),
    answer: pair(
      "代表數列已經排好，可以提前結束，不必再跑剩下的輪次。",
      "It means the list is already sorted, so we can stop early instead of running the remaining passes.",
    ),
  },
  selection: {
    question: pair(
      "為什麼選擇排序通常被認為不穩定？",
      "Why is selection sort usually considered unstable?",
    ),
    answer: pair(
      "把最小值交換到前綴位置時，可能跨過相等元素，打亂它們原本的先後次序。",
      "Swapping the minimum into the prefix can jump over equal elements and change their original relative order.",
    ),
  },
  insertion: {
    question: pair(
      "為什麼插入排序是穩定的？",
      "Why is insertion sort stable?",
    ),
    answer: pair(
      "只有嚴格大於（或小於）才右移，相等元素不會被跨過，先後次序保持不變。",
      "It shifts only on a strict comparison, so equal elements are never crossed and keep their original order.",
    ),
  },
  shell: {
    question: pair(
      "為什麼希爾排序最後一個 gap 一定要是 1？",
      "Why must the final gap in shell sort be 1?",
    ),
    answer: pair(
      "gap 為 1 的那一輪就是完整的插入排序，能保證整個數列有序。",
      "A gap of 1 performs a full insertion sort, which guarantees the whole list is sorted.",
    ),
  },
  merge: {
    question: pair(
      "歸併排序需要多少額外空間？為什麼？",
      "How much extra space does merge sort need, and why?",
    ),
    answer: pair(
      "O(n)：合併時需要一個輔助陣列暫存結果，再回拷到主陣列。",
      "O(n): merging needs an auxiliary array to hold the result before copying it back.",
    ),
  },
  quick: {
    question: pair(
      "以首元素為樞軸的快速排序，在什麼輸入下最壞？",
      "When does quicksort with a first-element pivot behave worst?",
    ),
    answer: pair(
      "已排序或逆序輸入時，每次分區都極不平均，遞迴深度退化為 O(n)，時間 O(n²)。",
      "On sorted or reverse-sorted input every partition is extremely uneven, the recursion depth becomes O(n) and time degrades to O(n²).",
    ),
  },
  heap: {
    question: pair(
      "為什麼堆積排序不穩定？",
      "Why is heap sort unstable?",
    ),
    answer: pair(
      "把堆頂交換到末尾時，相等元素可能被送到很遠的位置，先後次序因此改變。",
      "Swapping the root to the end can move equal elements far away, changing their relative order.",
    ),
  },
} as const satisfies Record<string, { question: AlgorithmTextPair; answer: AlgorithmTextPair }>;

/** 各 Aux 组件的标题。 */
export const auxTitles = {
  selection: algorithmText["selection.title"],
  insertion: algorithmText["insertion.title"],
  shell: algorithmText["shell.title"],
  merge: algorithmText["merge.title"],
  quick: algorithmText["quick.title"],
  heap: algorithmText["heap.title"],
} as const satisfies Record<string, AlgorithmTextPair>;
