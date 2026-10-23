import type { TranslationKey } from "../i18n/dictionary";
import type { PageStatus } from "../navigation";

export interface AlgorithmEntry {
  id: string;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  status: PageStatus;
  noteKey?: TranslationKey;
}

/**
 * 十种排序算法入口的单一数据源。
 * 阶段 1 只列出名称、一句话解释与状态，不生成任何排序轨迹。
 */
export const algorithms: readonly AlgorithmEntry[] = [
  {
    id: "bubble",
    nameKey: "alg.bubble.name",
    descKey: "alg.bubble.desc",
    status: "inDevelopment",
    noteKey: "alg.bubble.note",
  },
  {
    id: "selection",
    nameKey: "alg.selection.name",
    descKey: "alg.selection.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "insertion",
    nameKey: "alg.insertion.name",
    descKey: "alg.insertion.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "shell",
    nameKey: "alg.shell.name",
    descKey: "alg.shell.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "merge",
    nameKey: "alg.merge.name",
    descKey: "alg.merge.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "quick",
    nameKey: "alg.quick.name",
    descKey: "alg.quick.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "heap",
    nameKey: "alg.heap.name",
    descKey: "alg.heap.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "counting",
    nameKey: "alg.counting.name",
    descKey: "alg.counting.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "bucket",
    nameKey: "alg.bucket.name",
    descKey: "alg.bucket.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
  {
    id: "radix",
    nameKey: "alg.radix.name",
    descKey: "alg.radix.desc",
    status: "inDevelopment",
    noteKey: "alg.planned.note",
  },
] as const;
