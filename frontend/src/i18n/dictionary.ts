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
      "階段 1 只建立專案骨架、七頁導覽與雙語基礎。排序動畫、Python 程式碼高亮與氣象圖表尚未實作，因此相關頁面會標示「開發中」。",
    en: "Phase 1 builds only the project shell, seven-page navigation and the bilingual foundation. Sorting animations, Python code highlighting and weather charts are not implemented yet, so those pages carry an 'In development' badge.",
  },
  "home.card.lab.desc": {
    "zh-Hant": "用數字卡片一步一步看冒泡排序怎麼比較與交換。",
    en: "Watch bubble sort compare and swap numbers, one step at a time.",
  },
  "home.card.weather.desc": {
    "zh-Hant": "選擇日期與測站，探索香港天文台的氣溫、濕度與雨量。",
    en: "Pick a date range and stations to explore temperature, humidity and rainfall from the Hong Kong Observatory.",
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
      "選擇日期範圍與測站，查看香港天文台的氣溫、相對濕度與雨量，並確認資料覆蓋率與更新時間。",
    en: "Choose a date range and stations to view temperature, relative humidity and rainfall from the Hong Kong Observatory, together with data coverage and update times.",
  },
  "weather.planned.1": {
    "zh-Hant": "日期範圍與測站選擇，並顯示實際起止日期",
    en: "Date range and station selection, showing the actual start and end dates",
  },
  "weather.planned.2": {
    "zh-Hant": "多測站比較與資料覆蓋率說明",
    en: "Multi-station comparison with data coverage notes",
  },
  "weather.planned.3": {
    "zh-Hant": "折線、柱狀、直方、散點與佔比圖表，支援圖例開關與懸停提示",
    en: "Line, bar, histogram, scatter and share charts with legend toggles and hover hints",
  },
  "weather.planned.4": {
    "zh-Hant": "圖表下方的可存取資料表與 CSV 匯出",
    en: "An accessible data table below each chart, plus CSV export",
  },
  "weather.planned.5": {
    "zh-Hant": "每張圖都標明資料來源、更新時間與缺失天數",
    en: "Every chart states its data source, update time and number of missing days",
  },

  // ---------- 用排序理解气温 ----------
  "weatherSort.title": {
    "zh-Hant": "用排序理解最近一個月的氣溫",
    en: "Understand the last month's temperatures through sorting",
  },
  "weatherSort.lead": {
    "zh-Hant":
      "把每日最高溫或最低溫排成一列，用冒泡排序找出最熱與最冷的日子，並看排序前後的差別。",
    en: "Line up daily maximum or minimum temperatures and use bubble sort to find the hottest and coldest days, comparing before and after.",
  },
  "weatherSort.planned.1": {
    "zh-Hant": "日最高溫與日最低溫一鍵切換，可選升序或降序",
    en: "Switch between daily maximum and minimum temperature, ascending or descending",
  },
  "weatherSort.planned.2": {
    "zh-Hant": "每根柱子保留日期、測站與溫度，交換後仍然正確配對",
    en: "Each bar keeps its date, station and temperature, and stays correctly paired after a swap",
  },
  "weatherSort.planned.3": {
    "zh-Hant": "與冒泡實驗室共用同一個播放器與 Python 程式高亮",
    en: "Share one player and Python highlighting with the bubble lab",
  },
  "weatherSort.planned.4": {
    "zh-Hant": "排序前後對比、最熱與最冷的日子，以及比較與交換次數",
    en: "Before-and-after comparison, hottest and coldest days, and comparison and swap counts",
  },
  "weatherSort.planned.5": {
    "zh-Hant": "說明哪些日期因為缺值而被排除",
    en: "Explain which dates were excluded because of missing values",
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
    "zh-Hant": "階段 1：專案骨架、七頁導覽與雙語基礎。排序視覺化、程式碼同步與氣象圖表尚未開始。",
    en: "Phase 1: project shell, seven-page navigation and the bilingual foundation. Sorting visualisation, code synchronisation and weather charts have not started yet.",
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
