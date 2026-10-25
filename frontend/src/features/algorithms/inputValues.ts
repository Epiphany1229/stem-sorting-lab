/**
 * 算法学习页的输入解析（纯函数，便于单测）。
 *
 * 比较类六种算法按设计文档 §6 接受整数与一位小数，范围 [-1000, 1000]，长度 2–30。
 * 这里只做输入校验与随机小数列生成，不参与任何排序或轨迹推导。
 */
import type { AlgorithmTextKey } from "./i18n";

export const MIN_VALUES = 2;
export const MAX_VALUES = 30;
export const MIN_VALUE = -1000;
export const MAX_VALUE = 1000;

export type AlgorithmValuesResult =
  | { readonly ok: true; readonly values: number[] }
  | { readonly ok: false; readonly reason: AlgorithmTextKey };

const ONE_DECIMAL = /^[+-]?\d+(?:\.\d)?$/;
const INTEGER = /^[+-]?\d+$/;

/** 解析自定义数列；支持逗号、中文逗号、顿号、空格与换行。 */
export function parseAlgorithmValues(
  text: string,
  options: { readonly allowDecimal?: boolean } = {},
): AlgorithmValuesResult {
  const allowDecimal = options.allowDecimal ?? true;
  const tokens = text
    .trim()
    .split(/[\s,，、]+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return { ok: false, reason: "controls.error.empty" };
  }

  const values: number[] = [];
  for (const token of tokens) {
    // 明确区分「不是数字」与「小数位过多」，给出更准确的双语提示。
    if (/^[+-]?\d+\.\d+$/.test(token) && !ONE_DECIMAL.test(token)) {
      return { ok: false, reason: "controls.error.decimals" };
    }
    if (!INTEGER.test(token) && !(allowDecimal && ONE_DECIMAL.test(token))) {
      return { ok: false, reason: "controls.error.notNumber" };
    }
    const value = Number(token);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "controls.error.notNumber" };
    }
    if (value < MIN_VALUE || value > MAX_VALUE) {
      return { ok: false, reason: "controls.error.range" };
    }
    values.push(value);
  }

  if (values.length < MIN_VALUES || values.length > MAX_VALUES) {
    return { ok: false, reason: "controls.error.count" };
  }

  return { ok: true, values };
}

/** 生成默认小数列（整数 1–99，避免教学页一上来就出现小数）。 */
export function generateRandomValues(
  count = 6,
  random: () => number = Math.random,
): number[] {
  const safeCount = Math.max(MIN_VALUES, Math.min(MAX_VALUES, count));
  return Array.from({ length: safeCount }, () => 1 + Math.floor(random() * 99));
}

/** 元数据里的默认数据不合法时，回退到一组固定的教学小数据（不是伪造轨迹）。 */
export const FALLBACK_VALUES: readonly number[] = [5, 3, 8, 1, 9, 2];

export function defaultValuesFrom(metadataValues: readonly number[] | undefined): number[] {
  if (
    metadataValues &&
    metadataValues.length >= MIN_VALUES &&
    metadataValues.length <= MAX_VALUES &&
    metadataValues.every(
      (value) => Number.isFinite(value) && value >= MIN_VALUE && value <= MAX_VALUE,
    )
  ) {
    return [...metadataValues];
  }
  return [...FALLBACK_VALUES];
}
