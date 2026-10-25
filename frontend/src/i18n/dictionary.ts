/**
 * 双语翻译字典：每个 key 对应一组「繁体中文 + 英文」。
 *
 * 约定：
 * - 所有面向学生的文案只能从这里取值，组件内禁止硬编码中文；
 * - 繁体中文是主阅读层级，英文紧随其下（由 BilingualText 组件负责排版）；
 * - Python 关键字、变量名、API 标识符保持原文，不翻译；
 * - 源码注释用简体中文，学生可见文案只用繁体中文 + 英文。
 */
export interface Translation {
  readonly "zh-Hant": string;
  readonly en: string;
}

export const dictionary = {
  // ---------- 站点与通用 ----------
  "site.name": {
    "zh-Hant": "排序實驗室",
    en: "Sorting Lab",
  },
  "site.tagline": {
    "zh-Hant": "用 Python 看懂排序，用香港天氣數據理解真實問題。",
    en: "Learn sorting with Python and solve real questions with Hong Kong weather data.",
  },
  "site.skipToMain": {
    "zh-Hant": "跳至主要內容",
    en: "Skip to main content",
  },
  "common.loading": {
    "zh-Hant": "載入中…",
    en: "Loading…",
  },
  "common.error": {
    "zh-Hant": "載入失敗，請稍後再試。",
    en: "Loading failed. Please try again later.",
  },
  "common.retry": {
    "zh-Hant": "重試",
    en: "Try again",
  },
  "common.notFound.title": {
    "zh-Hant": "找不到頁面",
    en: "Page not found",
  },
  "common.notFound.body": {
    "zh-Hant": "這個網址沒有對應的頁面。請從首頁重新開始。",
    en: "There is no page at this address. Start again from the home page.",
  },
  "common.notFound.cta": {
    "zh-Hant": "返回首頁",
    en: "Back to home",
  },

  // ---------- 导航 ----------
  "nav.home": {
    "zh-Hant": "首頁",
    en: "Home",
  },
  "nav.lab": {
    "zh-Hant": "冒泡實驗室",
    en: "Bubble lab",
  },
  "nav.weather": {
    "zh-Hant": "天氣探索",
    en: "Weather explorer",
  },
  "nav.weatherSort": {
    "zh-Hant": "氣溫排序",
    en: "Temperature sorting",
  },
  "nav.algorithms": {
    "zh-Hant": "演算法中心",
    en: "Algorithm center",
  },
  "nav.sources": {
    "zh-Hant": "資料來源",
    en: "Data sources",
  },
  "nav.help": {
    "zh-Hant": "使用說明",
    en: "Help",
  },
  "nav.primaryLabel": {
    "zh-Hant": "主要導覽",
    en: "Primary navigation",
  },
  "nav.openMenu": {
    "zh-Hant": "開啟導覽選單",
    en: "Open navigation menu",
  },
  "nav.closeMenu": {
    "zh-Hant": "關閉導覽選單",
    en: "Close navigation menu",
  },

  // ---------- 当前位置与返回入口 ----------
  "breadcrumb.youAreHere": {
    "zh-Hant": "目前位置",
    en: "You are here",
  },
  "breadcrumb.home": {
    "zh-Hant": "首頁",
    en: "Home",
  },
  "back.toHome": {
    "zh-Hant": "返回首頁",
    en: "Back to home",
  },
  "back.toTop": {
    "zh-Hant": "回到頁首",
    en: "Back to top",
  },

  // ---------- 状态徽标 ----------
  "status.available": {
    "zh-Hant": "可用",
    en: "Available",
  },
  "status.inDevelopment": {
    "zh-Hant": "開發中",
    en: "In development",
  },

  // ---------- 首页 ----------
  "home.title": {
    "zh-Hant": "首頁與學習目錄",
    en: "Home and learning index",
  },
  "home.lead": {
    "zh-Hant":
      "這個教學網站用 Python 排序演算法，帶你讀懂香港天文台的氣象數據。先認識比較與交換，再走進十種排序演算法。",
    en: "This learning site uses Python sorting algorithms to help you read Hong Kong Observatory weather data. Start with comparing and swapping, then work through ten sorting algorithms.",
  },
  "home.cta.start": {
    "zh-Hant": "開始第一個實驗室",
    en: "Start the first lab",
  },
  "home.cta.algorithms": {
    "zh-Hant": "查看十種演算法",
    en: "See all ten algorithms",
  },
  "home.path.title": {
    "zh-Hant": "建議學習路徑",
    en: "Suggested learning path",
  },
  "home.path.lead": {
    "zh-Hant": "依照這個順序學習，每一步只新增一個概念。",
    en: "Follow this order; each step adds only one new idea.",
  },
  "home.path.step1": {
    "zh-Hant": "認識比較與交換",
    en: "Meet comparison and swap",
  },
  "home.path.step2": {
    "zh-Hant": "學習冒泡排序",
    en: "Learn bubble sort",
  },
  "home.path.step3": {
    "zh-Hant": "探索真實天氣",
    en: "Explore real weather",
  },
  "home.path.step4": {
    "zh-Hant": "排序氣溫",
    en: "Sort temperatures",
  },
  "home.path.step5": {
    "zh-Hant": "學習更多演算法",
    en: "Learn more algorithms",
  },
  "home.directory.title": {
    "zh-Hant": "學習目錄",
    en: "Learning directory",
  },
  "home.directory.lead": {
    "zh-Hant": "六個功能頁面的入口與目前狀態；導覽列也隨時可以回到任何一頁。",
    en: "Entries and current status for the six feature pages; the navigation bar always takes you back to any of them.",
  },
  "home.scope.title": {
    "zh-Hant": "本階段範圍",
    en: "Scope of this phase",
  },
  "home.scope.body": {
    "zh-Hant":
      "階段 2 已完成冒泡排序的軌跡播放器：動畫、Python 程式碼同步高亮與步驟解釋都來自後端真實執行的軌跡。階段 3 加入香港天氣數據探索頁與五類圖表：可回溯的每日氣溫、資料覆蓋率與缺口；降雨與濕度只有接口位置，不以氣溫冒充。其他演算法尚未實作。",
    en: "Phase 2 delivers the bubble sort trace player: the animation, synchronised Python highlighting and step explanations all come from the trace produced by the backend. Phase 3 adds the Hong Kong weather explorer and five chart types covering retroactive daily temperatures, coverage and gaps; rainfall and humidity only have reserved slots and are never faked with temperature. The other algorithms are not implemented yet.",
  },
  "home.card.lab.desc": {
    "zh-Hant": "用數字卡片一步一步看冒泡排序怎麼比較與交換。",
    en: "Watch bubble sort compare and swap numbers, one step at a time.",
  },
  "home.card.weather.desc": {
    "zh-Hant": "選擇日期與測站，探索香港天文台可回溯的每日氣溫、資料覆蓋率與缺口。",
    en: "Pick a date range and stations to explore retroactive daily temperatures, data coverage and gaps from the Hong Kong Observatory.",
  },
  "home.card.weatherSort.desc": {
    "zh-Hant": "把最近 30 天的氣溫排成一列，找出最熱與最冷的日子。",
    en: "Line up the last 30 days of temperature to find the hottest and coldest days.",
  },
  "home.card.algorithms.desc": {
    "zh-Hant": "比較十種排序演算法的想法、Python 實作與適用時機。",
    en: "Compare the ideas, Python code and use cases of ten sorting algorithms.",
  },
  "home.card.sources.desc": {
    "zh-Hant": "查看官方資料來源、欄位定義、單位與授權要求。",
    en: "See official data sources, field definitions, units and licensing terms.",
  },
  "home.card.help.desc": {
    "zh-Hant": "了解雙語排版、導覽、狀態標示與鍵盤操作方式。",
    en: "Learn about bilingual layout, navigation, status badges, and keyboard use.",
  },
  "home.card.view": {
    "zh-Hant": "開啟頁面",
    en: "Open page",
  },

  // ---------- 通用页面状态 ----------
  "page.inDevelopment.title": {
    "zh-Hant": "此頁功能正在開發中",
    en: "This page is still in development",
  },
  "page.inDevelopment.body": {
    "zh-Hant":
      "頁面骨架、導覽與雙語文案已經完成，互動功能會在後續階段加入。目前不會顯示任何模擬或預先編好的結果。",
    en: "The page shell, navigation and bilingual copy are ready; interactive features will arrive in a later phase. Nothing simulated or pre-recorded is shown.",
  },
  "page.planned.title": {
    "zh-Hant": "預計提供",
    en: "Planned for this page",
  },

  // ---------- 冒泡排序入门实验室 ----------
  "lab.title": {
    "zh-Hant": "冒泡排序入門實驗室",
    en: "Bubble sort starter lab",
  },
  "lab.lead": {
    "zh-Hant":
      "用 10 個 1 至 100 的整數，一步一步看冒泡排序如何比較、何時交換，以及每一輪之後哪個數字已經就位。",
    en: "With ten integers from 1 to 100, see step by step how bubble sort compares, when it swaps, and which number is settled after each pass.",
  },
  "lab.planned.1": {
    "zh-Hant": "隨機產生 10 個 1 至 100 的整數，或輸入自訂數列",
    en: "Generate ten random integers from 1 to 100, or type your own list",
  },
  "lab.planned.2": {
    "zh-Hant": "升序與降序，加上開始、暫停、上一步、下一步與重置",
    en: "Ascending and descending order with start, pause, previous, next and reset",
  },
  "lab.planned.3": {
    "zh-Hant": "調整播放速度，並同步高亮實際執行的 Python 程式行",
    en: "Adjust the playback speed while the Python line actually running is highlighted",
  },
  "lab.planned.4": {
    "zh-Hant": "下方固定顯示步驟解釋、比較次數、交換次數與輪次",
    en: "A fixed panel below shows the step explanation, comparison count, swap count and pass number",
  },

  // ---------- 香港天气数据探索 ----------
  "weather.title": {
    "zh-Hant": "香港天氣數據探索",
    en: "Hong Kong weather explorer",
  },
  "weather.lead": {
    "zh-Hant":
      "選擇日期範圍與測站，查看香港天文台可回溯的每日氣溫，並確認資料覆蓋率、缺口與更新時間。降雨與濕度沒有歷史介面，本頁不會用氣溫冒充。",
    en: "Choose a date range and stations to view the daily temperatures the Hong Kong Observatory can provide retroactively, together with coverage, gaps and update times. Rainfall and humidity have no historical interface, and this page never presents temperature as if it were rainfall.",
  },

  // ---------- 阶段 4：用排序理解气温 ----------
  "weatherSort.title": {
    "zh-Hant": "用排序理解最近一個月的氣溫",
    en: "Understand the last month's temperatures through sorting",
  },
  "weatherSort.lead": {
    "zh-Hant":
      "把每日最高溫或最低溫排成一列，用冒泡排序找出最熱與最冷的日子，並看排序前後的差別；日期與溫度都來自香港天文台的逐日觀測。",
    en: "Line up daily maximum or minimum temperatures and use bubble sort to find the hottest and coldest days, comparing before and after; every date and temperature comes from the Hong Kong Observatory's daily observations.",
  },
  "weatherSort.sourceNote": {
    "zh-Hant":
      "所有排序狀態、日期標籤、Top 5 與解釋都來自後端軌跡；前端不自行排序，也不猜測數值。",
    en: "All sorting states, date labels, top-5 lists and explanations come from the backend trace; the frontend never sorts or guesses values itself.",
  },
  "weatherSort.unitCelsius": {
    "zh-Hant": "°C",
    en: "°C",
  },

  // ---------- 阶段 4：/weather 入口按钮 ----------
  "weatherSort.entry": {
    "zh-Hant": "用冒泡排序探索這 30 天的氣溫",
    en: "Explore These 30 Days of Temperatures with Bubble Sort",
  },
  "weatherSort.entryHint": {
    "zh-Hant": "以目前選取的測站、指標與資料窗口開啟排序頁；排序狀態仍全部來自後端軌跡。",
    en: "Open the sorting page with the current station, metric and data window; every sorting state still comes from the backend trace.",
  },

  // ---------- 阶段 4：缺失日期提示 ----------
  "weatherSort.missing.title": {
    "zh-Hant": "有效天數與缺失日期",
    en: "Valid days and missing dates",
  },
  "weatherSort.missing.line": {
    "zh-Hant": "{metric}：當前有效天數 {valid} 天（請求 {requested} 天），已排除以下缺失日期：{dates}",
    en: "{metric}: {valid} valid days out of {requested} requested; excluded missing dates: {dates}",
  },
  "weatherSort.missing.none": {
    "zh-Hant": "{metric}：當前有效天數 {valid} 天（請求 {requested} 天），沒有缺失日期。",
    en: "{metric}: {valid} valid days out of {requested} requested; no missing dates.",
  },
  "weatherSort.missing.loading": {
    "zh-Hant": "正在讀取 {metric} 的有效天數…",
    en: "Loading valid days for {metric}…",
  },
  "weatherSort.missing.error": {
    "zh-Hant": "{metric} 的軌跡無法載入。",
    en: "The {metric} trace could not be loaded.",
  },

  // ---------- 阶段 4：排序条件 ----------
  "weatherSort.controls.title": {
    "zh-Hant": "排序條件",
    en: "Sorting settings",
  },
  "weatherSort.controls.station": {
    "zh-Hant": "測站",
    en: "Station",
  },
  "weatherSort.controls.stationPlaceholder": {
    "zh-Hant": "請選擇測站",
    en: "Choose a station",
  },
  "weatherSort.controls.metric": {
    "zh-Hant": "指標",
    en: "Metric",
  },
  "weatherSort.controls.parallel": {
    "zh-Hant": "並排比較 tmax 與 tmin",
    en: "Compare tmax and tmin side by side",
  },
  "weatherSort.controls.parallelHint": {
    "zh-Hant": "開啟後同一窗口會並排顯示兩個播放器，各自有獨立的播放控制。",
    en: "When on, two players for the same window appear side by side, each with independent playback controls.",
  },
  "weatherSort.controls.resetHint": {
    "zh-Hant": "切換測站、指標、方向、日期或提前結束選項，都會把播放器重置為待開始。",
    en: "Changing the station, metric, direction, dates or early-exit option resets the player to ready.",
  },
  "weatherSort.controls.dateRange": {
    "zh-Hant": "日期範圍（香港時區自然日）",
    en: "Date range (Hong Kong calendar days)",
  },

  // ---------- 阶段 4：播放器与柱子标签 ----------
  "weatherSort.player.heading": {
    "zh-Hant": "{metric} 播放器",
    en: "{metric} player",
  },
  "weatherSort.bar.title": {
    "zh-Hant": "{date}｜{station}｜{value}｜品質標記：{quality}",
    en: "{date} | {station} | {value} | Quality flag: {quality}",
  },
  "weatherSort.bar.detailTitle": {
    "zh-Hant": "目前聚焦的柱子",
    en: "Focused bar",
  },
  "weatherSort.bar.detailHint": {
    "zh-Hant": "用 Tab 鍵聚焦柱子，可查看完整日期、測站與品質標記。",
    en: "Press Tab to focus a bar and see its full date, station and quality flag.",
  },
  "weatherSort.bar.date": {
    "zh-Hant": "完整日期",
    en: "Full date",
  },
  "weatherSort.bar.station": {
    "zh-Hant": "測站（中英文）",
    en: "Station (Chinese and English)",
  },
  "weatherSort.bar.value": {
    "zh-Hant": "數值",
    en: "Value",
  },
  "weatherSort.bar.quality": {
    "zh-Hant": "品質標記",
    en: "Quality flag",
  },

  // ---------- 阶段 4：结果区 ----------
  "weatherSort.results.title": {
    "zh-Hant": "排序結果",
    en: "Sorting results",
  },
  "weatherSort.results.summary": {
    "zh-Hant": "冒泡排序：比較 {comparisons} 次、交換 {swaps} 次、{passes} 輪",
    en: "Bubble sort: {comparisons} comparisons, {swaps} swaps, {passes} passes",
  },
  "weatherSort.results.topHot": {
    "zh-Hant": "Top 5 最熱",
    en: "Top 5 hottest",
  },
  "weatherSort.results.topCold": {
    "zh-Hant": "Top 5 最冷",
    en: "Top 5 coldest",
  },
  "weatherSort.results.topItem": {
    "zh-Hant": "{date}｜{value}",
    en: "{date} | {value}",
  },
  "weatherSort.results.temperature": {
    "zh-Hant": "{value} °C",
    en: "{value} °C",
  },
  "weatherSort.results.before": {
    "zh-Hant": "排序前（按日期）",
    en: "Before sorting (by date)",
  },
  "weatherSort.results.after": {
    "zh-Hant": "排序後（按溫度）",
    en: "After sorting (by temperature)",
  },
  "weatherSort.results.orderUnavailable": {
    "zh-Hant": "這份軌跡沒有提供排序前後的順序。",
    en: "This trace does not include the before/after order.",
  },
  "weatherSort.results.stemTitle": {
    "zh-Hant": "冒泡排序 vs 單次掃描",
    en: "Bubble sort vs a single scan",
  },
  "weatherSort.results.stemBubble": {
    "zh-Hant": "冒泡排序：{comparisons} 次比較、{swaps} 次交換",
    en: "Bubble sort: {comparisons} comparisons, {swaps} swaps",
  },
  "weatherSort.results.stemScan": {
    "zh-Hant": "單次掃描：{comparisons} 次比較、{swaps} 次交換",
    en: "Single scan: {comparisons} comparisons, {swaps} swaps",
  },
  "weatherSort.results.stemNote": {
    "zh-Hant":
      "單次掃描只能找出一個極值，不能完成排序；冒泡排序要重複掃描直到所有日期有序。",
    en: "A single scan only finds one extreme and cannot sort the list; bubble sort must scan repeatedly until every date is in order.",
  },
  "weatherSort.results.stemUnavailable": {
    "zh-Hant": "這份軌跡沒有提供單次掃描的對照數據。",
    en: "This trace does not include single-scan comparison data.",
  },
  "weatherSort.results.topUnavailable": {
    "zh-Hant": "這份軌跡沒有提供 Top 5 資料。",
    en: "This trace does not include top-5 data.",
  },

  // ---------- 阶段 4：页状态 ----------
  "weatherSort.loading": {
    "zh-Hant": "正在向後端取得天氣排序軌跡…",
    en: "Loading the weather sorting trace from the backend…",
  },
  "weatherSort.error.title": {
    "zh-Hant": "無法載入天氣排序軌跡",
    en: "Could not load the weather sorting trace",
  },
  "weatherSort.error.tooFewDays": {
    "zh-Hant": "此指標在這個窗口內的有效日期少於 2 天，後端拒絕排序。",
    en: "This metric has fewer than 2 valid dates in this window, so the backend refuses to sort.",
  },
  "weatherSort.noValid": {
    "zh-Hant": "至少需要 2 個有效日期才能排序。",
    en: "At least 2 valid dates are needed to sort.",
  },
  "weatherSort.rangeHint": {
    "zh-Hant":
      "直接開啟本頁時，會先用 /api/weather/coverage 的真實窗口；也可以自行選擇日期。",
    en: "Opening this page directly first uses the real window from /api/weather/coverage; you can also choose dates yourself.",
  },
  "weatherSort.rangeMissing": {
    "zh-Hant": "請選擇開始與結束日期。",
    en: "Choose start and end dates.",
  },
  "weatherSort.stationMissing": {
    "zh-Hant": "請先選擇測站。",
    en: "Choose a station first.",
  },
  "weatherSort.qualityUnknown": {
    "zh-Hant": "未提供",
    en: "Not provided",
  },

  // ---------- 十种排序算法学习中心 ----------
  "algorithms.title": {
    "zh-Hant": "十種排序演算法學習中心",
    en: "Ten sorting algorithms learning center",
  },
  "algorithms.lead": {
    "zh-Hant":
      "從冒泡排序開始，逐一比較十種演算法的直觀想法、Python 實作與適用情況。尚未完成的演算法會清楚標示狀態，不會隱藏。",
    en: "Starting from bubble sort, compare the intuition, Python implementation and use cases of ten algorithms. Unfinished algorithms are clearly labelled and never hidden.",
  },
  "algorithms.list.title": {
    "zh-Hant": "全部十種演算法",
    en: "All ten algorithms",
  },
  "algorithms.note": {
    "zh-Hant":
      "階段 1 只建立入口與狀態。各演算法的 Python 實作、統一步進播放器與專屬視覺化會在後續階段加入。",
    en: "Phase 1 only builds the entries and their status. Each algorithm's Python implementation, the shared step player and its dedicated visualisation arrive in later phases.",
  },
  "alg.bubble.name": {
    "zh-Hant": "冒泡排序",
    en: "Bubble sort",
  },
  "alg.bubble.desc": {
    "zh-Hant": "相鄰兩兩比較，把較大的數字往後推，一輪之後最大值就定位。",
    en: "Compare neighbours and push the larger number right; after one pass the largest value is settled.",
  },
  "alg.selection.name": {
    "zh-Hant": "選擇排序",
    en: "Selection sort",
  },
  "alg.selection.desc": {
    "zh-Hant": "每一輪從未排序區找出最小值，放到未排序區的最前面。",
    en: "Each pass finds the smallest value in the unsorted part and moves it to the front of that part.",
  },
  "alg.insertion.name": {
    "zh-Hant": "插入排序",
    en: "Insertion sort",
  },
  "alg.insertion.desc": {
    "zh-Hant": "像整理撲克牌，把新數字插入已排序區的正確位置。",
    en: "Like sorting playing cards: insert each new number into its correct place in the sorted part.",
  },
  "alg.shell.name": {
    "zh-Hant": "希爾排序",
    en: "Shell sort",
  },
  "alg.shell.desc": {
    "zh-Hant": "先用較大的間隔分組做插入排序，再逐步縮小間隔。",
    en: "Run insertion sort on groups separated by a large gap, then shrink the gap step by step.",
  },
  "alg.merge.name": {
    "zh-Hant": "歸併排序",
    en: "Merge sort",
  },
  "alg.merge.desc": {
    "zh-Hant": "不斷對半拆分，再把小段合併成有序的一大段。",
    en: "Split in halves repeatedly, then merge the small runs into one sorted run.",
  },
  "alg.quick.name": {
    "zh-Hant": "快速排序",
    en: "Quick sort",
  },
  "alg.quick.desc": {
    "zh-Hant": "選一個樞軸，把比它小的放左邊、比它大的放右邊，再分別處理兩邊。",
    en: "Pick a pivot, move smaller values left and larger values right, then handle both sides.",
  },
  "alg.heap.name": {
    "zh-Hant": "堆積排序",
    en: "Heap sort",
  },
  "alg.heap.desc": {
    "zh-Hant": "先建立最大堆，再把堆頂換到最後並縮小堆的範圍。",
    en: "Build a max-heap, then move the top to the end and shrink the heap.",
  },
  "alg.counting.name": {
    "zh-Hant": "計數排序",
    en: "Counting sort",
  },
  "alg.counting.desc": {
    "zh-Hant": "先數每個整數出現幾次，再依計數把數字放回正確位置。",
    en: "Count how often each integer appears, then write the values back in order.",
  },
  "alg.bucket.name": {
    "zh-Hant": "桶排序",
    en: "Bucket sort",
  },
  "alg.bucket.desc": {
    "zh-Hant": "把數值分到幾個區間桶，各自排序後再拼接起來。",
    en: "Distribute values into interval buckets, sort each bucket, then concatenate.",
  },
  "alg.radix.name": {
    "zh-Hant": "基數排序",
    en: "Radix sort",
  },
  "alg.radix.desc": {
    "zh-Hant": "從個位、十位、百位依序做穩定分配與收集。",
    en: "Distribute and collect stably by digit, from ones to tens to hundreds.",
  },
  "alg.bubble.note": {
    "zh-Hant": "先導示範：階段 2 會完成完整軌跡播放",
    en: "Starter demo: the full trace player lands in phase 2",
  },
  "alg.planned.note": {
    "zh-Hant": "尚未開始：階段 5 提供",
    en: "Not started: planned for phase 5",
  },

  // ---------- 数据来源与方法 ----------
  "sources.title": {
    "zh-Hant": "資料來源與方法說明",
    en: "Data sources and methods",
  },
  "sources.lead": {
    "zh-Hant":
      "香港天氣數據來自官方公開來源。這一頁會列出實際使用的網址、欄位定義、單位、測站範圍、授權要求與驗證日期。",
    en: "Hong Kong weather data comes from official open sources. This page will list the exact URLs, field definitions, units, station coverage, licensing terms and verification dates.",
  },
  "sources.notice": {
    "zh-Hant":
      "資料可行性調查仍在進行。在完成驗證之前，本網站不會宣稱已接通官方歷史數據，也不會顯示虛構的氣象數字。",
    en: "The data feasibility study is still in progress. Until verification is complete, this site does not claim a live connection to official historical data and never shows invented weather numbers.",
  },
  "sources.planned.1": {
    "zh-Hant": "官方文件與實際資料地址，並附上驗證日期",
    en: "Official documentation and the actual data URLs, with verification dates",
  },
  "sources.planned.2": {
    "zh-Hant": "欄位定義、單位與時間粒度",
    en: "Field definitions, units and time granularity",
  },
  "sources.planned.3": {
    "zh-Hant": "測站範圍，以及行政區與測站對應的來源",
    en: "Station coverage and the source for district-to-station mapping",
  },
  "sources.planned.4": {
    "zh-Hant": "授權與署名要求，以及已知限制",
    en: "Licensing and attribution requirements, plus known limitations",
  },
  "sources.attribution.title": {
    "zh-Hant": "資料來源與署名",
    en: "Sources and attribution",
  },
  "sources.attribution.body": {
    "zh-Hant": "官方網站提供公開資料目錄。使用條款與署名要求依香港天文台及政府資料一線通公布為準。",
    en: "The official websites publish the open data catalogue. Terms of use and attribution follow what the Hong Kong Observatory and data.gov.hk publish.",
  },
  "sources.attribution.hko": {
    "zh-Hant": "香港天文台",
    en: "Hong Kong Observatory",
  },
  "sources.attribution.dataGov": {
    "zh-Hant": "政府資料一線通（data.gov.hk）",
    en: "data.gov.hk (Hong Kong public sector information portal)",
  },
  "sources.pending": {
    "zh-Hant": "實際資料網址、欄位與驗證日期仍在調查中，完成後會補上。",
    en: "The exact data URLs, fields and verification dates are still under investigation and will be added once confirmed.",
  },

  // ---------- 使用说明 ----------
  "help.title": {
    "zh-Hant": "使用說明",
    en: "How to use this site",
  },
  "help.lead": {
    "zh-Hant": "這個網站正在分階段建置。以下說明目前可以怎麼使用，以及各頁狀態代表的意思。",
    en: "This site is being built in phases. Here is how to use it today and what each page status means.",
  },
  "help.bilingual.title": {
    "zh-Hant": "雙語呈現方式",
    en: "How the bilingual text works",
  },
  "help.bilingual.body": {
    "zh-Hant":
      "所有面向使用者的文字都是繁體中文在上、英文緊接在下，兩者屬於同一個元素，不是語言切換。英文較小但保持足夠對比度。",
    en: "Every user-facing string shows Traditional Chinese first with English directly beneath it. Both belong to one element; this is not a language switcher. English is slightly smaller but keeps strong contrast.",
  },
  "help.navigation.title": {
    "zh-Hant": "導覽與目前位置",
    en: "Navigation and current location",
  },
  "help.navigation.body": {
    "zh-Hant":
      "每一頁頂部都有目前位置與返回入口；手機上可以使用選單按鈕展開導覽。導覽列會標示你正在閱讀的頁面。",
    en: "Every page shows its location and a way back at the top. On phones, a menu button opens the navigation. The navigation bar marks the page you are reading.",
  },
  "help.status.title": {
    "zh-Hant": "頁面狀態",
    en: "Page status",
  },
  "help.status.body": {
    "zh-Hant":
      "標示「開發中」的頁面目前只有版面和說明，還沒有互動功能；標示「可用」的頁面可以實際使用。",
    en: "Pages marked 'In development' currently hold layout and explanations only, with no interactive features yet. Pages marked 'Available' can be used for real.",
  },
  "help.keyboard.title": {
    "zh-Hant": "鍵盤與減少動態",
    en: "Keyboard and reduced motion",
  },
  "help.keyboard.body": {
    "zh-Hant": "按 Tab 鍵可以走訪所有連結與按鈕。若系統開啟「減少動態」偏好，本網站會縮短或取消動畫。",
    en: "Press Tab to move through every link and button. If your system asks for reduced motion, this site shortens or removes animations.",
  },
  "help.phase.title": {
    "zh-Hant": "目前階段",
    en: "Current phase",
  },
  "help.phase.body": {
    "zh-Hant": "階段 4：香港天氣排序頁已完成，可直接把逐日最高溫或最低溫放進階段 2 的冒泡排序播放器；階段 3 的天氣探索頁與五類圖表可繼續使用。其他九種演算法尚未開始。",
    en: "Phase 4: the Hong Kong weather sorting page is complete and feeds daily maximum or minimum temperatures into the phase 2 bubble sort player; the phase 3 weather explorer and its five chart types remain available. The other nine algorithms have not started.",
  },

  // ---------- 阶段 2：冒泡排序播放器 ----------
  "player.region": {
    "zh-Hant": "排序播放器",
    en: "Sorting player",
  },
  "player.controls.title": {
    "zh-Hant": "播放控制",
    en: "Playback controls",
  },
  "player.chart.title": {
    "zh-Hant": "數字柱狀圖",
    en: "Number bars",
  },
  "player.chart.label": {
    "zh-Hant": "目前 {count} 個數字的柱狀圖",
    en: "Bar chart of the current {count} numbers",
  },
  "player.chart.scrollLabel": {
    "zh-Hant": "可橫向捲動的柱狀圖，每根柱子都能用 Tab 鍵聚焦",
    en: "Scrollable bar chart; every bar can be focused with Tab",
  },
  "player.bar.title": {
    "zh-Hant": "元素 {id}，數值 {value}",
    en: "Element {id}, value {value}",
  },
  "player.legend.title": {
    "zh-Hant": "圖例",
    en: "Legend",
  },
  "player.legend.pending": {
    "zh-Hant": "待處理",
    en: "Waiting",
  },
  "player.legend.compare": {
    "zh-Hant": "正在比較",
    en: "Being compared",
  },
  "player.legend.swap": {
    "zh-Hant": "正在交換",
    en: "Being swapped",
  },
  "player.legend.sorted": {
    "zh-Hant": "已排好序",
    en: "Sorted",
  },
  "player.code.title": {
    "zh-Hant": "Python 原始碼",
    en: "Python source code",
  },
  "player.code.highlightSummary": {
    "zh-Hant": "目前高亮的程式行：{lines}",
    en: "Highlighted code lines: {lines}",
  },
  "player.explanation.title": {
    "zh-Hant": "這一步發生什麼事",
    en: "What happens in this step",
  },
  "player.idleHint": {
    "zh-Hant": "按「開始播放」或「下一步」，逐步觀看冒泡排序。",
    en: "Press 'Start playing' or 'Next step' to walk through bubble sort.",
  },
  "player.progress": {
    "zh-Hant": "已播放 {step} / {total} 步",
    en: "Played {step} of {total} steps",
  },
  "player.announce.step": {
    "zh-Hant": "第 {step} 步，共 {total} 步。",
    en: "Step {step} of {total}.",
  },
  "player.phase.idle": {
    "zh-Hant": "待開始",
    en: "Ready",
  },
  "player.phase.playing": {
    "zh-Hant": "播放中",
    en: "Playing",
  },
  "player.phase.paused": {
    "zh-Hant": "已暫停",
    en: "Paused",
  },
  "player.phase.finished": {
    "zh-Hant": "已完成",
    en: "Finished",
  },
  "player.play": {
    "zh-Hant": "開始播放",
    en: "Start playing",
  },
  "player.pause": {
    "zh-Hant": "暫停",
    en: "Pause",
  },
  "player.resume": {
    "zh-Hant": "繼續播放",
    en: "Resume playing",
  },
  "player.replay": {
    "zh-Hant": "重新播放",
    en: "Play again",
  },
  "player.next": {
    "zh-Hant": "下一步",
    en: "Next step",
  },
  "player.prev": {
    "zh-Hant": "上一步",
    en: "Previous step",
  },
  "player.reset": {
    "zh-Hant": "重置",
    en: "Reset",
  },
  "player.speed.label": {
    "zh-Hant": "播放速度",
    en: "Playback speed",
  },
  "player.metric.comparisons": {
    "zh-Hant": "比較次數",
    en: "Comparisons",
  },
  "player.metric.swaps": {
    "zh-Hant": "交換次數",
    en: "Swaps",
  },
  "player.metric.writes": {
    "zh-Hant": "寫入次數",
    en: "Writes",
  },
  "player.metric.pass": {
    "zh-Hant": "目前輪次",
    en: "Current pass",
  },
  "player.passValue": {
    "zh-Hant": "第 {pass} 輪",
    en: "Pass {pass}",
  },
  "player.keyboardHint": {
    "zh-Hant": "鍵盤：空白鍵播放或暫停，左右方向鍵上一步或下一步。",
    en: "Keyboard: Space plays or pauses; Left and Right move between steps.",
  },
  "player.sourceNote": {
    "zh-Hant": "所有畫面狀態、程式行高亮與解說都來自後端回傳的軌跡；前端不會自行推導排序過程。",
    en: "Every visual state, code highlight and explanation comes from the trace returned by the backend; the frontend never derives the sorting process itself.",
  },

  // ---------- 阶段 2：加载与错误 ----------
  "trace.loading": {
    "zh-Hant": "正在向後端取得排序軌跡…",
    en: "Loading the sorting trace from the backend…",
  },
  "trace.empty": {
    "zh-Hant": "後端回傳的軌跡沒有任何事件，無法播放。",
    en: "The backend trace has no events, so it cannot be played.",
  },
  "trace.error.title": {
    "zh-Hant": "無法載入排序軌跡",
    en: "Could not load the sorting trace",
  },
  "trace.error.network": {
    "zh-Hant": "連不上後端伺服器。請確認後端已啟動，然後再試一次。",
    en: "Could not reach the backend server. Make sure it is running, then try again.",
  },
  "trace.error.invalidInput": {
    "zh-Hant": "送出的數列不符合規則，請檢查後再試一次。",
    en: "The submitted list does not meet the rules. Please check it and try again.",
  },
  "trace.error.notFound": {
    "zh-Hant": "後端找不到這個演算法。",
    en: "The backend does not provide this algorithm.",
  },
  "trace.error.server": {
    "zh-Hant": "後端發生錯誤，請稍後再試一次。",
    en: "The backend reported an error. Please try again later.",
  },
  "trace.error.invalidResponse": {
    "zh-Hant": "後端回應的軌跡格式不符合協定，請回報這個問題。",
    en: "The trace response does not match the protocol. Please report this problem.",
  },
  "trace.retry": {
    "zh-Hant": "重新載入",
    en: "Reload",
  },

  // ---------- 阶段 2：输入区 ----------
  "lab.input.title": {
    "zh-Hant": "數列輸入",
    en: "Input list",
  },
  "lab.input.random": {
    "zh-Hant": "隨機 10 個數字",
    en: "Random 10 numbers",
  },
  "lab.input.customLabel": {
    "zh-Hant": "自訂數列",
    en: "Custom list",
  },
  "lab.input.hint": {
    "zh-Hant": "用逗號或空格分隔 2 至 30 個整數，數值介於 -1000 與 1000。",
    en: "Separate 2 to 30 integers with commas or spaces; each between -1000 and 1000.",
  },
  "lab.input.apply": {
    "zh-Hant": "套用數列",
    en: "Use this list",
  },
  "lab.input.error.empty": {
    "zh-Hant": "請先輸入至少 2 個整數。",
    en: "Please enter at least 2 integers.",
  },
  "lab.input.error.count": {
    "zh-Hant": "整數數量必須介於 2 與 30 之間。",
    en: "The list must contain between 2 and 30 integers.",
  },
  "lab.input.error.notInteger": {
    "zh-Hant": "只能用整數，請用逗號或空格分隔。",
    en: "Only integers are allowed; separate them with commas or spaces.",
  },
  "lab.input.error.range": {
    "zh-Hant": "每個整數必須介於 -1000 與 1000 之間。",
    en: "Each integer must be between -1000 and 1000.",
  },
  "lab.currentValues": {
    "zh-Hant": "目前數列：{values}",
    en: "Current list: {values}",
  },
  "lab.direction.title": {
    "zh-Hant": "排序方向",
    en: "Sort direction",
  },
  "lab.direction.asc": {
    "zh-Hant": "升序",
    en: "Ascending",
  },
  "lab.direction.desc": {
    "zh-Hant": "降序",
    en: "Descending",
  },
  "lab.earlyExit": {
    "zh-Hant": "提前結束優化",
    en: "Early-exit optimisation",
  },
  "lab.earlyExit.hint": {
    "zh-Hant": "若某一輪沒有交換，就提前結束。",
    en: "Stop early when a pass makes no swaps.",
  },
  "lab.mode.title": {
    "zh-Hant": "學習模式",
    en: "Learning mode",
  },
  "lab.mode.guided": {
    "zh-Hant": "引導模式",
    en: "Guided mode",
  },
  "lab.mode.guided.hint": {
    "zh-Hant": "每次比較前，先預測兩個數字是否需要交換。",
    en: "Predict whether two numbers need swapping before each comparison.",
  },
  "lab.mode.free": {
    "zh-Hant": "自由實驗",
    en: "Free exploration",
  },
  "lab.mode.free.hint": {
    "zh-Hant": "直接觀看完整播放，不做預測。",
    en: "Watch the full trace without predictions.",
  },

  // ---------- 阶段 2：代码面板 ----------
  "code.trace.show": {
    "zh-Hant": "顯示插樁行",
    en: "Show instrumentation lines",
  },
  "code.trace.hide": {
    "zh-Hant": "隱藏插樁行",
    en: "Hide instrumentation lines",
  },
  "code.trace.note": {
    "zh-Hant": "插樁行是演算法用來記錄軌跡的程式碼；行號保持不變。",
    en: "Instrumentation lines record the trace; line numbers stay unchanged.",
  },

  // ---------- 阶段 2：教学预测弹窗 ----------
  "prediction.title": {
    "zh-Hant": "教學預測",
    en: "Prediction",
  },
  "prediction.question": {
    "zh-Hant": "下一步這兩個數需要交換嗎？",
    en: "Do these two numbers need to be swapped?",
  },
  "prediction.help": {
    "zh-Hant": "只根據畫面上這兩個數字判斷，答錯也沒關係。",
    en: "Judge from the two numbers shown; a wrong guess is fine.",
  },
  "prediction.option.swap": {
    "zh-Hant": "需要",
    en: "Yes, swap them",
  },
  "prediction.option.keep": {
    "zh-Hant": "不需要",
    en: "No, keep them",
  },
  "prediction.correct": {
    "zh-Hant": "答對了！",
    en: "Correct!",
  },
  "prediction.incorrect": {
    "zh-Hant": "答錯了，看看下面的解釋。",
    en: "Not quite. Read the explanation below.",
  },
  "prediction.answer.swap": {
    "zh-Hant": "正確答案：需要交換。",
    en: "Correct answer: they need to be swapped.",
  },
  "prediction.answer.keep": {
    "zh-Hant": "正確答案：不需要交換。",
    en: "Correct answer: no swap is needed.",
  },
  "prediction.continue": {
    "zh-Hant": "繼續",
    en: "Continue",
  },
  "prediction.close": {
    "zh-Hant": "關閉預測",
    en: "Close prediction",
  },
  "prediction.explanation.title": {
    "zh-Hant": "這一步的解釋",
    en: "Explanation of this step",
  },

  // ---------- 阶段 4.6：排序页内联比较区 ----------
  "player.inline.title": {
    "zh-Hant": "比較與交換",
    en: "Comparison and swap",
  },
  "player.inline.question": {
    "zh-Hant": "這兩個數需要交換嗎？",
    en: "Do these two numbers need to be swapped?",
  },
  "player.inline.idle": {
    "zh-Hant": "這一步不是比較；繼續播放，遇到比較時這裡會出題。",
    en: "This step is not a comparison; keep playing and a question will appear at the next comparison.",
  },

  // ---------- 页脚署名 ----------
  "footer.disclaimer": {
    "zh-Hant": "本網站是教學專案，不是香港天文台的官方產品。",
    en: "This site is a teaching project, not an official product of the Hong Kong Observatory.",
  },
  "footer.attribution": {
    "zh-Hant": "資料來源：香港天文台及政府資料一線通（data.gov.hk）。",
    en: "Data sources: Hong Kong Observatory and data.gov.hk.",
  },
  "footer.license": {
    "zh-Hant": "使用條款與署名要求依資料來源公布為準。",
    en: "Terms of use and attribution follow what the data sources publish.",
  },

  // ---------- 阶段 3：天气数据模式与横幅 ----------
  "weather.mode.label": {
    "zh-Hant": "資料模式",
    en: "Data mode",
  },
  "weather.mode.official": {
    "zh-Hant": "官方資料",
    en: "Official data",
  },
  "weather.mode.demo": {
    "zh-Hant": "示範資料",
    en: "Demo data",
  },
  "weather.mode.imported": {
    "zh-Hant": "匯入資料",
    en: "Imported data",
  },
  "weather.mode.demoToggle": {
    "zh-Hant": "示範模式",
    en: "Demo mode",
  },
  "weather.mode.demoHint": {
    "zh-Hant": "開啟後所有查詢都加上 mode=demo，只讀取固定的官方快照，不會寫入資料庫。",
    en: "When on, every query adds mode=demo and reads only the fixed official snapshot; nothing is written to the database.",
  },
  "weather.banner.warning": {
    "zh-Hant": "這不是官方即時資料，請不要當作最新觀測。",
    en: "This is not official live data; do not treat it as the latest observations.",
  },
  "weather.banner.noticeLabel": {
    "zh-Hant": "後端說明",
    en: "Backend notice",
  },
  "weather.banner.sourceLabel": {
    "zh-Hant": "資料來源",
    en: "Data source",
  },
  "weather.banner.fetchedAt": {
    "zh-Hant": "抓取時間",
    en: "Fetched at",
  },

  // ---------- 阶段 3：覆盖率 ----------
  "weather.coverage.title": {
    "zh-Hant": "資料覆蓋率",
    en: "Data coverage",
  },
  "weather.coverage.windowLabel": {
    "zh-Hant": "實際資料窗口",
    en: "Actual data window",
  },
  "weather.coverage.windowValue": {
    "zh-Hant": "{start} 至 {end}，共 {days} 天",
    en: "{start} to {end}, {days} days in total",
  },
  "weather.coverage.daysWithData": {
    "zh-Hant": "有效天數",
    en: "Days with data",
  },
  "weather.coverage.daysMissing": {
    "zh-Hant": "缺失天數",
    en: "Missing days",
  },
  "weather.coverage.lastAvailable": {
    "zh-Hant": "最後可用日",
    en: "Last available date",
  },
  "weather.coverage.anchorLabel": {
    "zh-Hant": "窗口錨點",
    en: "Window anchor",
  },
  "weather.coverage.perStationTitle": {
    "zh-Hant": "各測站與指標覆蓋",
    en: "Coverage by station and metric",
  },
  "weather.coverage.metric": {
    "zh-Hant": "指標",
    en: "Metric",
  },
  "weather.coverage.firstDate": {
    "zh-Hant": "首個可用日",
    en: "First available date",
  },
  "weather.coverage.lastDate": {
    "zh-Hant": "最後可用日",
    en: "Last available date",
  },
  "weather.coverage.missingDates": {
    "zh-Hant": "缺失日期數",
    en: "Missing dates",
  },
  "weather.coverage.incompleteDates": {
    "zh-Hant": "不完整日期數",
    en: "Incomplete dates",
  },
  "weather.coverage.none": {
    "zh-Hant": "所選範圍內尚未取得任何有效觀測，原因見下方說明。",
    en: "No valid observations exist in the selected range yet; see the reason below.",
  },
  "weather.coverage.reasonLabel": {
    "zh-Hant": "沒有資料的原因",
    en: "Why there is no data",
  },
  "weather.coverage.reasonCode": {
    "zh-Hant": "原始原因代碼",
    en: "Raw reason code",
  },
  "weather.coverage.sourcesTitle": {
    "zh-Hant": "來源與抓取時間",
    en: "Sources and fetch times",
  },
  "weather.coverage.fetchedAt": {
    "zh-Hant": "抓取時間",
    en: "Fetched at",
  },
  "weather.coverage.loading": {
    "zh-Hant": "正在讀取覆蓋率…",
    en: "Loading coverage…",
  },
  "weather.coverage.dayUnit": {
    "zh-Hant": "{days} 天",
    en: "{days} days",
  },

  // ---------- 阶段 3：固定原因集合 ----------
  "weather.reason.not_published": {
    "zh-Hant": "官方當月月表尚未發布，這不是錯誤，請稍後再試。",
    en: "The official monthly table for this month has not been published yet; this is not an error, so try again later.",
  },
  "weather.reason.na_no_history": {
    "zh-Hant": "這個指標沒有官方歷史介面，無法回溯，只能從部署後開始累積。",
    en: "This metric has no official historical interface. It cannot be retrieved retroactively and only accumulates after deployment.",
  },
  "weather.reason.cooldown": {
    "zh-Hant": "重新抓取正在冷卻中，請稍後再試。",
    en: "Refreshing is cooling down; please try again shortly.",
  },
  "weather.reason.circuit_open": {
    "zh-Hant": "官方來源暫時熔斷，自動抓取已停止。",
    en: "The official source is temporarily circuit-broken; automatic fetching has stopped.",
  },
  "weather.reason.budget_exhausted": {
    "zh-Hant": "今日抓取額度已用完，明天再試。",
    en: "Today's fetch budget is exhausted; try again tomorrow.",
  },
  "weather.reason.disabled": {
    "zh-Hant": "外部抓取開關已關閉。",
    en: "External fetching is disabled.",
  },
  "weather.reason.no_cache": {
    "zh-Hant": "本機沒有可用的快取資料。",
    en: "There is no usable cached data on this machine.",
  },
  "weather.reason.station_out_of_range": {
    "zh-Hant": "測站代號不在官方名單內。",
    en: "The station code is not in the official list.",
  },
  "weather.reason.unknown": {
    "zh-Hant": "後端回報了未知原因，詳情請看原始原因代碼。",
    en: "The backend reported an unknown reason; see the raw reason code for details.",
  },

  // ---------- 阶段 3：重新抓取 ----------
  "weather.refresh.title": {
    "zh-Hant": "重新抓取官方資料",
    en: "Refresh official data",
  },
  "weather.refresh.button": {
    "zh-Hant": "請求重新抓取",
    en: "Request refresh",
  },
  "weather.refresh.pending": {
    "zh-Hant": "正在請求重新抓取…",
    en: "Requesting a refresh…",
  },
  "weather.refresh.accepted": {
    "zh-Hant": "已接受：送出 {requests} 個請求，寫入 {rows} 列。",
    en: "Accepted: {requests} requests made and {rows} rows upserted.",
  },
  "weather.refresh.rejected": {
    "zh-Hant": "這次重新抓取沒有執行，原因如下。",
    en: "This refresh was not performed; the reason is below.",
  },
  "weather.refresh.cooldown": {
    "zh-Hant": "冷卻中，還剩 {seconds} 秒（下次可用：{time}）。",
    en: "Cooling down, {seconds} seconds left (next allowed: {time}).",
  },
  "weather.refresh.remainingBudget": {
    "zh-Hant": "今日剩餘額度：{budget} 次",
    en: "Remaining budget today: {budget} requests",
  },
  "weather.refresh.failed": {
    "zh-Hant": "重新抓取請求失敗。",
    en: "The refresh request failed.",
  },
  "weather.refresh.hint": {
    "zh-Hant": "「重新抓取」不會繞過冷卻、熔斷或每日額度。",
    en: "Refresh never bypasses cooldowns, circuit breaks or the daily budget.",
  },

  // ---------- 阶段 3：查询控件 ----------
  "weather.controls.dateRange": {
    "zh-Hant": "日期範圍（香港時區自然日）",
    en: "Date range (Hong Kong calendar days)",
  },
  "weather.controls.startDate": {
    "zh-Hant": "開始日期",
    en: "Start date",
  },
  "weather.controls.endDate": {
    "zh-Hant": "結束日期",
    en: "End date",
  },
  "weather.controls.metric.tmax": {
    "zh-Hant": "日最高溫",
    en: "Daily maximum temperature",
  },
  "weather.controls.metric.tmin": {
    "zh-Hant": "日最低溫",
    en: "Daily minimum temperature",
  },
  "weather.controls.metric.tmean": {
    "zh-Hant": "日平均溫",
    en: "Daily mean temperature",
  },
  "weather.controls.dateInvalid": {
    "zh-Hant": "開始日期與結束日期必須成對填寫，且開始日期不能晚於結束日期。",
    en: "The start and end dates must both be set, and the start cannot be after the end.",
  },
  "weather.controls.hint": {
    "zh-Hant": "留空日期則使用後端依錨點回推的預設窗口；畫面上永遠顯示後端回傳的真實起止日期。",
    en: "Leave the dates empty to use the backend's default window derived from the anchor; the real start and end dates returned by the backend are always shown.",
  },
  "weather.controls.export": {
    "zh-Hant": "匯出目前查詢 CSV",
    en: "Export current query as CSV",
  },

  // ---------- 阶段 3：测站选择 ----------
  "weather.stations.title": {
    "zh-Hant": "測站選擇（可多選比較）",
    en: "Station selection (multi-select for comparison)",
  },
  "weather.stations.filter": {
    "zh-Hant": "篩選測站名稱或代號",
    en: "Filter by station name or code",
  },
  "weather.stations.count": {
    "zh-Hant": "已選 {selected} / {total} 站",
    en: "{selected} of {total} stations selected",
  },
  "weather.stations.noMatch": {
    "zh-Hant": "沒有符合篩選條件的測站。",
    en: "No stations match the filter.",
  },
  "weather.stations.selectAll": {
    "zh-Hant": "全選目前篩選結果",
    en: "Select all filtered stations",
  },
  "weather.stations.clear": {
    "zh-Hant": "清除選擇",
    en: "Clear selection",
  },
  "weather.stations.noneSelected": {
    "zh-Hant": "請至少選擇一個測站。",
    en: "Select at least one station.",
  },
  "weather.stations.notice": {
    "zh-Hant": "測站名稱與代號來自官方名單；官方未提供測站與行政區的對應，本頁不做猜測。",
    en: "Station names and codes come from the official list. The official source provides no station-to-district mapping, so this page does not guess one.",
  },
  "weather.stations.loading": {
    "zh-Hant": "正在讀取測站名單…",
    en: "Loading the station list…",
  },
  "weather.stations.empty": {
    "zh-Hant": "後端回傳的測站名單是空的。",
    en: "The backend returned an empty station list.",
  },

  // ---------- 阶段 3：图表通用 ----------
  "weather.chart.legendTitle": {
    "zh-Hant": "圖例",
    en: "Legend",
  },
  "weather.chart.empty": {
    "zh-Hant": "暫無可用資料",
    en: "No data available",
  },
  "weather.chart.emptyBody": {
    "zh-Hant": "這張圖需要至少一筆有效觀測；目前查詢範圍內沒有可用資料。",
    en: "This chart needs at least one valid observation; none is available in the current range.",
  },
  "weather.chart.metricNote": {
    "zh-Hant": "本圖實際指標：{metric}",
    en: "Actual metric of this chart: {metric}",
  },
  "weather.chart.samples": {
    "zh-Hant": "有效樣本：{count} 個",
    en: "Valid samples: {count}",
  },
  "weather.chart.sourceNote": {
    "zh-Hant": "圖表只使用後端回傳的資料；缺口不插值，也不以氣溫冒充雨量或濕度。",
    en: "Charts use only data returned by the backend; gaps are never interpolated and temperature is never presented as rainfall or humidity.",
  },
  "weather.chart.line.title": {
    "zh-Hant": "氣溫趨勢折線圖",
    en: "Temperature trend line chart",
  },
  "weather.chart.line.desc": {
    "zh-Hant": "所選測站的每日最高溫與最低溫；缺失日期保持斷開，不以直線連接。",
    en: "Daily maximum and minimum temperatures for the selected stations; missing dates stay disconnected and are never joined by a straight line.",
  },
  "weather.chart.line.aria": {
    "zh-Hant": "{stations} 個測站在 {start} 至 {end} 的每日氣溫折線圖",
    en: "Line chart of daily temperatures for {stations} stations from {start} to {end}",
  },
  "weather.chart.line.hover": {
    "zh-Hant": "{station}｜{metric}｜%{x}：%{customdata} °C",
    en: "{station} | {metric} | %{x}: %{customdata} °C",
  },
  "weather.chart.bar.titleFallback": {
    "zh-Hant": "所選測站日最高溫對比",
    en: "Daily maximum temperature comparison by station",
  },
  "weather.chart.bar.descFallback": {
    "zh-Hant": "階段 3 沒有降雨歷史介面，因此本圖顯示各站每日最高溫對比；這不是降雨資料。",
    en: "Phase 3 has no historical rainfall interface, so this chart compares daily maximum temperatures by station; it is not rainfall data.",
  },
  "weather.chart.bar.titleRainfall": {
    "zh-Hant": "每日降雨量柱狀圖",
    en: "Daily rainfall bar chart",
  },
  "weather.chart.bar.descRainfall": {
    "zh-Hant": "顯示部署後已累積的每日降雨量（毫米）；沒有紀錄的日期保持空缺。",
    en: "Daily rainfall totals collected since deployment, in millimetres; days without records stay empty.",
  },
  "weather.chart.bar.ariaFallback": {
    "zh-Hant": "{stations} 個測站在 {start} 至 {end} 的每日最高溫柱狀圖（非降雨資料）",
    en: "Bar chart of daily maximum temperatures for {stations} stations from {start} to {end} (not rainfall data)",
  },
  "weather.chart.bar.ariaRainfall": {
    "zh-Hant": "{stations} 個測站在 {start} 至 {end} 的每日降雨量柱狀圖",
    en: "Bar chart of daily rainfall for {stations} stations from {start} to {end}",
  },
  "weather.chart.bar.hoverFallback": {
    "zh-Hant": "{station}｜%{x}：%{customdata} °C",
    en: "{station} | %{x}: %{customdata} °C",
  },
  "weather.chart.bar.hoverRainfall": {
    "zh-Hant": "{station}｜%{x}：%{customdata} 毫米",
    en: "{station} | %{x}: %{customdata} mm",
  },
  "weather.chart.bar.noteRainfall": {
    "zh-Hant": "本圖實際指標：每日降雨量（毫米）",
    en: "Actual metric of this chart: daily rainfall (mm)",
  },
  "weather.chart.hist.title": {
    "zh-Hant": "日最高溫分布直方圖",
    en: "Daily maximum temperature histogram",
  },
  "weather.chart.hist.desc": {
    "zh-Hant": "所選測站有效日最高溫的分布；區間由教學程式依資料範圍等分，不是官方標準。",
    en: "Distribution of valid daily maximum temperatures for the selected stations; bins are split evenly by the teaching app, not by an official standard.",
  },
  "weather.chart.hist.aria": {
    "zh-Hant": "{stations} 個測站共 {samples} 個有效日最高溫樣本的分布直方圖",
    en: "Histogram of {samples} valid daily maximum temperature samples across {stations} stations",
  },
  "weather.chart.hist.hover": {
    "zh-Hant": "{station}｜%{x} °C：%{y} 天",
    en: "{station} | %{x} °C: %{y} days",
  },
  "weather.chart.hist.binRange": {
    "zh-Hant": "溫度區間",
    en: "Temperature range",
  },
  "weather.chart.hist.binCount": {
    "zh-Hant": "區間數",
    en: "Bins",
  },
  "weather.chart.hist.stationSamples": {
    "zh-Hant": "{station}：{count} 個樣本",
    en: "{station}: {count} samples",
  },
  "weather.chart.donut.title": {
    "zh-Hant": "有效觀測日的溫度區間佔比",
    en: "Share of valid observation days by temperature range",
  },
  "weather.chart.donut.desc": {
    "zh-Hant": "只表達「有效觀測日中不同溫度區間的天數佔比」，不是氣溫數值佔比；區間閾值、有效樣本量與缺失天數都列在下方。",
    en: "Shows only the share of valid observation days that fall into each temperature range, not a share of temperature values; bin thresholds, valid sample size and missing days are listed below.",
  },
  "weather.chart.donut.aria": {
    "zh-Hant": "{station} 的有效觀測日按 {bins} 個溫度區間的天數佔比環形圖，有效樣本 {valid} 天，缺失 {missing} 天",
    en: "Donut chart of valid observation days for {station} across {bins} temperature ranges; {valid} valid days and {missing} missing days",
  },
  "weather.chart.donut.validDays": {
    "zh-Hant": "有效樣本量",
    en: "Valid samples",
  },
  "weather.chart.donut.missingDays": {
    "zh-Hant": "缺失天數",
    en: "Missing days",
  },
  "weather.chart.donut.threshold": {
    "zh-Hant": "區間閾值",
    en: "Bin thresholds",
  },
  "weather.chart.donut.share": {
    "zh-Hant": "佔比",
    en: "Share",
  },
  "weather.chart.donut.center": {
    "zh-Hant": "有效 {valid} 天",
    en: "Valid {valid} days",
  },
  "weather.chart.donut.centerSub": {
    "zh-Hant": "缺失 {missing} 天",
    en: "Missing {missing} days",
  },
  "weather.chart.donut.hover": {
    "zh-Hant": "%{label}：%{value} 天（%{percent}）",
    en: "%{label}: %{value} days (%{percent})",
  },
  "weather.chart.donut.metricLabel": {
    "zh-Hant": "測站：{station}｜指標：{metric}",
    en: "Station: {station} | Metric: {metric}",
  },
  "weather.chart.donut.validMissing": {
    "zh-Hant": "有效樣本 {valid} 天｜缺失 {missing} 天",
    en: "Valid samples {valid} days | Missing {missing} days",
  },
  "weather.chart.axisDate": {
    "zh-Hant": "日期",
    en: "Date",
  },
  "weather.chart.axisTemperature": {
    "zh-Hant": "氣溫（°C）",
    en: "Temperature (°C)",
  },
  "weather.chart.axisDays": {
    "zh-Hant": "天數",
    en: "Days",
  },
  "weather.chart.axisShare": {
    "zh-Hant": "佔比",
    en: "Share",
  },

  // ---------- 阶段 3：数据表 ----------
  "weather.table.empty": {
    "zh-Hant": "暫無可用資料",
    en: "No data available",
  },
  "weather.table.reason": {
    "zh-Hant": "原因：{reason}",
    en: "Reason: {reason}",
  },
  "weather.table.rowCount": {
    "zh-Hant": "共 {count} 列",
    en: "{count} rows",
  },
  "weather.table.rowCountCollapsed": {
    "zh-Hant": "顯示前 {shown} 列，共 {count} 列",
    en: "Showing the first {shown} of {count} rows",
  },
  "weather.table.expand": {
    "zh-Hant": "展開全部",
    en: "Show all rows",
  },
  "weather.table.collapse": {
    "zh-Hant": "收起",
    en: "Collapse",
  },
  "weather.table.station": {
    "zh-Hant": "測站",
    en: "Station",
  },
  "weather.table.date": {
    "zh-Hant": "日期",
    en: "Date",
  },
  "weather.table.value": {
    "zh-Hant": "數值",
    en: "Value",
  },
  "weather.table.metric": {
    "zh-Hant": "指標",
    en: "Metric",
  },
  "weather.table.unit": {
    "zh-Hant": "單位",
    en: "Unit",
  },
  "weather.table.quality": {
    "zh-Hant": "品質標記",
    en: "Quality flag",
  },
  "weather.table.share": {
    "zh-Hant": "天數佔比",
    en: "Share of days",
  },
  "weather.table.total": {
    "zh-Hant": "合計",
    en: "Total",
  },
  "weather.table.rainfall": {
    "zh-Hant": "每日降雨量（毫米）",
    en: "Daily rainfall (mm)",
  },
  "weather.table.temperature": {
    "zh-Hant": "氣溫",
    en: "Temperature",
  },
  "weather.table.dataset": {
    "zh-Hant": "資料集",
    en: "Dataset",
  },
  "weather.table.endpoint": {
    "zh-Hant": "介面地址",
    en: "Endpoint",
  },
  "weather.table.fetchedAt": {
    "zh-Hant": "抓取時間",
    en: "Fetched at",
  },
  "weather.table.mode": {
    "zh-Hant": "模式",
    en: "Mode",
  },
  "weather.table.daysWithData": {
    "zh-Hant": "有效天數",
    en: "Days with data",
  },
  "weather.table.firstDate": {
    "zh-Hant": "首個可用日",
    en: "First available date",
  },
  "weather.table.lastDate": {
    "zh-Hant": "最後可用日",
    en: "Last available date",
  },
  "weather.table.missingCount": {
    "zh-Hant": "缺失日期數",
    en: "Missing dates",
  },
  "weather.table.incompleteCount": {
    "zh-Hant": "不完整日期數",
    en: "Incomplete dates",
  },
  "weather.table.lineCaption": {
    "zh-Hant": "氣溫折線圖的可存取資料表",
    en: "Accessible data table for the temperature line chart",
  },
  "weather.table.barCaption": {
    "zh-Hant": "日最高溫對比的可存取資料表（不是降雨資料）",
    en: "Accessible data table for the daily maximum temperature comparison (not rainfall data)",
  },
  "weather.table.barRainfallCaption": {
    "zh-Hant": "每日降雨量的可存取資料表",
    en: "Accessible data table for daily rainfall",
  },
  "weather.table.histCaption": {
    "zh-Hant": "日最高溫分布的可存取資料表",
    en: "Accessible data table for the daily maximum temperature distribution",
  },
  "weather.table.donutCaption": {
    "zh-Hant": "溫度區間天數與佔比的可存取資料表",
    en: "Accessible data table for days and share per temperature range",
  },
  "weather.table.coverageCaption": {
    "zh-Hant": "各測站與指標覆蓋率的可存取資料表",
    en: "Accessible data table for coverage by station and metric",
  },
  "weather.table.sourcesCaption": {
    "zh-Hant": "資料來源與抓取時間的可存取資料表",
    en: "Accessible data table for data sources and fetch times",
  },

  // ---------- 阶段 3：页面通用与错误 ----------
  "weather.page.dataNote": {
    "zh-Hant": "本頁只顯示後端回傳的資料；非官方資料（示範或匯入）一定顯示常駐橫幅，缺資料時顯示具體原因。",
    en: "This page shows only data returned by the backend. Non-official data (demo or imported) always shows a persistent banner, and missing data always shows a specific reason.",
  },
  "weather.page.loading": {
    "zh-Hant": "正在向後端取得天氣資料…",
    en: "Loading weather data from the backend…",
  },
  "weather.page.chartsTitle": {
    "zh-Hant": "四類圖表與可存取資料表",
    en: "Four chart types with accessible data tables",
  },
  "weather.page.chartsLead": {
    "zh-Hant": "每張圖都標明實際指標、有效樣本與缺失天數；下方固定附上可鍵盤瀏覽、可展開的資料表。",
    en: "Every chart states its actual metric, valid samples and missing days, with a keyboard-accessible, expandable data table below it.",
  },
  "weather.page.emptySelection": {
    "zh-Hant": "請先選擇至少一個測站，圖表才會載入。",
    en: "Select at least one station before the charts can load.",
  },
  "weather.options.title": {
    "zh-Hant": "顯示選項",
    en: "Display options",
  },
  "weather.options.hint": {
    "zh-Hant": "日期窗口由後端固定提供最近 30 天，畫面只顯示真實資料；示範模式、匯出與重新抓取放在這個次要區域。",
    en: "The backend always provides the most recent 30-day window and the page shows the real data; demo mode, export and refresh live in this secondary area.",
  },
  "weather.error.title": {
    "zh-Hant": "無法載入天氣資料",
    en: "Could not load weather data",
  },
  "weather.error.network": {
    "zh-Hant": "連不上後端伺服器。請確認後端已啟動，然後再試一次。",
    en: "Could not reach the backend server. Make sure it is running, then try again.",
  },
  "weather.error.invalidInput": {
    "zh-Hant": "查詢參數不符合規則（422），請檢查日期、站號與指標。",
    en: "The query parameters are invalid (422); check the dates, station codes and metrics.",
  },
  "weather.error.server": {
    "zh-Hant": "後端發生錯誤，請稍後再試一次。",
    en: "The backend reported an error; please try again later.",
  },
  "weather.error.invalidResponse": {
    "zh-Hant": "後端回應的格式不符合介面契約，請回報這個問題。",
    en: "The response does not match the interface contract; please report this problem.",
  },
  "weather.error.retry": {
    "zh-Hant": "重新載入",
    en: "Reload",
  },
} as const satisfies Record<string, Translation>;

export type TranslationKey = keyof typeof dictionary;

/** 按 key 取出双语条目；key 不存在时 TypeScript 会直接报错。 */
export function translate(key: TranslationKey): Translation {
  return dictionary[key];
}

/** 繁体中文文案（用于 aria-label、document.title 等只能放单一字符串的场合）。 */
export function zh(key: TranslationKey): string {
  return dictionary[key]["zh-Hant"];
}

/** 英文文案。 */
export function en(key: TranslationKey): string {
  return dictionary[key].en;
}

/**
 * 取出带占位符的双语条目并填入参数（例如 {step} / {total}）。
 *
 * 占位符只出现在字典文案里，组件不会硬编码任何中文模板。
 */
export function formatTranslation(
  key: TranslationKey,
  values: Readonly<Record<string, string | number>>,
): Translation {
  const entry = dictionary[key];
  return {
    "zh-Hant": fillPlaceholders(entry["zh-Hant"], values),
    en: fillPlaceholders(entry.en, values),
  };
}

function fillPlaceholders(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
