/**
 * 读取算法专属 `auxiliary_state` 字段的安全工具。
 *
 * 设计文档 §4 为每种算法规定了字段；但为了「缺字段也不崩溃」，
 * 这里统一返回 null，由组件显示双语缺失提示，而不是猜测或补造数据。
 */
import type { AlgorithmAuxiliaryState } from "../types";

export function readNumber(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key: string,
): number | null {
  const value = aux?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readBoolean(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key: string,
): boolean | null {
  const value = aux?.[key];
  return typeof value === "boolean" ? value : null;
}

export function readString(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key: string,
): string | null {
  const value = aux?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readIdList(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key: string,
): readonly string[] | null {
  const value = aux?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every((entry): entry is string => typeof entry === "string")) {
    return null;
  }
  return value;
}

/** 数字下标列表（例如选择排序的 finalized_before 是已排定下标数组）。 */
export function readNumberList(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key: string,
): readonly number[] | null {
  const value = aux?.[key];
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return null;
  }
  return value as number[];
}

/** groups 形如 [[0, 3, 6], [1, 4, 7], …]。 */
export function readGroups(
  aux: AlgorithmAuxiliaryState | null | undefined,
  key = "groups",
): readonly (readonly number[])[] | null {
  const value = aux?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const groups: number[][] = [];
  for (const group of value) {
    if (!Array.isArray(group) || group.length === 0) {
      return null;
    }
    if (!group.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      return null;
    }
    groups.push(group as number[]);
  }
  return groups;
}

/** 当前事件是否还完全没有任何专属字段（含 comparison 之外）。 */
export function isEmptyAux(aux: AlgorithmAuxiliaryState | null | undefined): boolean {
  if (!aux) {
    return true;
  }
  return Object.keys(aux).every((key) => key === "comparison");
}

/** 值显示：整数不带小数点，一位小数原样显示。 */
export function formatAuxNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

/** 用 id 在 items 里查数值（用于 merge buffer 等只给 id 的字段）。 */
export function valueById(
  items: readonly { readonly id: string; readonly value: number }[],
  id: string,
): number | null {
  const found = items.find((item) => item.id === id);
  return found ? found.value : null;
}

/** 收集缺失字段（返回字段名原样，用于双语提示）。 */
export function missingAuxFields(
  aux: AlgorithmAuxiliaryState | null | undefined,
  requiredKeys: readonly string[],
): string[] {
  return requiredKeys.filter((key) => {
    const value = aux?.[key];
    return value === undefined || value === null;
  });
}
