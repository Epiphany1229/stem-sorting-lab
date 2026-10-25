import type { TranslationKey } from "./i18n/dictionary";

export type PageStatus = "available" | "inDevelopment";

export interface NavItem {
  /** React Router 路径 */
  path: string;
  /** 导航栏短标签字典 key */
  navKey: TranslationKey;
  /** 页面主标题字典 key */
  titleKey: TranslationKey;
  /** 首页目录卡片的一句话说明字典 key */
  descriptionKey?: TranslationKey;
  /** 本阶段该页面的状态 */
  status: PageStatus;
}

/**
 * 七个页面的单一数据源：导航、面包屑、document.title 与首页目录都从这里读取，
 * 避免同一个页面在多个地方出现不一致的名称或状态。
 */
export const navItems: readonly NavItem[] = [
  { path: "/", navKey: "nav.home", titleKey: "home.title", status: "available" },
  {
    path: "/lab",
    navKey: "nav.lab",
    titleKey: "lab.title",
    descriptionKey: "home.card.lab.desc",
    // 阶段 2 已交付：冒泡轨迹播放、代码同步高亮、预测弹窗均可真实使用
    status: "available",
  },
  {
    path: "/weather",
    navKey: "nav.weather",
    titleKey: "weather.title",
    descriptionKey: "home.card.weather.desc",
    // 阶段 3 已交付：覆盖率、5 类图表、CSV 导入与演示模式
    status: "available",
  },
  {
    path: "/weather-sort",
    navKey: "nav.weatherSort",
    titleKey: "weatherSort.title",
    descriptionKey: "home.card.weatherSort.desc",
    // 阶段 4 已交付：真实天气轨迹接入冒泡播放器
    status: "available",
  },
  {
    path: "/algorithms",
    navKey: "nav.algorithms",
    titleKey: "algorithms.title",
    descriptionKey: "home.card.algorithms.desc",
    // 阶段 5A 产品收敛：算法中心只提供 7 种比较类排序，全部可用
    status: "available",
  },
  {
    path: "/sources",
    navKey: "nav.sources",
    titleKey: "sources.title",
    descriptionKey: "home.card.sources.desc",
    status: "inDevelopment",
  },
  {
    path: "/help",
    navKey: "nav.help",
    titleKey: "help.title",
    descriptionKey: "home.card.help.desc",
    status: "available",
  },
];

/** 首页目录要展示的功能页面（首页本身不重复列出）。 */
export const directoryItems: readonly NavItem[] = navItems.filter((item) => item.path !== "/");
