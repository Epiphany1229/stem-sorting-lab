/**
 * 输入校验与随机数生成（纯函数，便于单测）。
 *
 * 校验规则来自 docs/trace-protocol.md §1/§4：2–30 个整数，每个在 [-1000, 1000]。
 * 这里只处理「输入是否合法」，绝不参与排序或轨迹推导。
 */
import type { TranslationKey } from "../i18n/dictionary";

export const MIN_LENGTH = 2;
export const MAX_LENGTH = 30;
export const MIN_VALUE = -1000;
export const MAX_VALUE = 1000;

export type CustomValuesResult =
  | { readonly ok: true; readonly values: number[] }
  | { readonly ok: false; readonly reason: TranslationKey };

/** 默认随机数：10 个 1–100 的整数（与实验指导语一致）。 */
export function generateRandomValues(
  count = 10,
  min = 1,
  max = 100,
  random: () => number = Math.random,
): number[] {
  return Array.from({ length: count }, () => {
    const span = max - min + 1;
    return min + Math.floor(random() * span);
  });
}

/** 解析自定义数列：支持逗号、中文逗号、空格、换行分隔。 */
export function parseCustomValues(text: string): CustomValuesResult {
  const tokens = text
    .trim()
    .split(/[\s,，、]+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return { ok: false, reason: "lab.input.error.empty" };
  }

  const values: number[] = [];
  for (const token of tokens) {
    if (!/^[+-]?\d+$/.test(token)) {
      return { ok: false, reason: "lab.input.error.notInteger" };
    }
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
      return { ok: false, reason: "lab.input.error.range" };
    }
    values.push(value);
  }

  if (values.length < MIN_LENGTH || values.length > MAX_LENGTH) {
    return { ok: false, reason: "lab.input.error.count" };
  }

  return { ok: true, values };
}
