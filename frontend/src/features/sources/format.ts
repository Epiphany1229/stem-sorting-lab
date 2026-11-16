/**
 * /sources 的时间/主机显示工具。
 *
 * 所有动态时间统一以香港时区呈现；格式本身是数字与分隔符，语言标签由字典提供。
 */
export const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

const formatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: HONG_KONG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO 时间 → 香港时间字符串；无效或缺失返回 null。 */
export function formatHongKongDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatter.format(date);
}

/** 从官方接口地址取出主机名；解析失败时原样返回，避免页面崩溃。 */
export function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/**
 * 后端 licenses 字符串格式为「繁體中文 / English」。
 * 拆分成功返回双语两行；拆分失败返回 null，由调用方兜底为静态双语摘要。
 */
export function splitBilingualLicense(
  license: string,
): { readonly "zh-Hant": string; readonly en: string } | null {
  const separator = " / ";
  const index = license.indexOf(separator);
  if (index <= 0) {
    return null;
  }
  const zh = license.slice(0, index).trim();
  const en = license.slice(index + separator.length).trim();
  if (zh.length === 0 || en.length === 0) {
    return null;
  }
  return { "zh-Hant": zh, en };
}
