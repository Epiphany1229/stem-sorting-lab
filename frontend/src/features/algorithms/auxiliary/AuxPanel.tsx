/**
 * 专属辅助视觉分发器：按算法 id 渲染对应组件。
 *
 * 冒泡排序没有专属组件（主柱图已完整表达），返回 null；
 * 未知/未实现算法也不会渲染任何伪造视图。
 */
import type { ComponentType } from "react";

import type { AuxAlgorithmId, AuxContext } from "../types";
import { AUX_ALGORITHM_IDS } from "../types";
import { HeapAux } from "./HeapAux";
import { InsertionAux } from "./InsertionAux";
import { MergeAux } from "./MergeAux";
import { QuickAux } from "./QuickAux";
import { SelectionAux } from "./SelectionAux";
import { ShellAux } from "./ShellAux";

const AUX_COMPONENTS: Record<AuxAlgorithmId, ComponentType<AuxContext>> = {
  selection: SelectionAux,
  insertion: InsertionAux,
  shell: ShellAux,
  merge: MergeAux,
  quick: QuickAux,
  heap: HeapAux,
};

/** 某算法是否有专属辅助视觉（冒泡没有）。 */
export function hasAuxVisual(algorithm: string): algorithm is AuxAlgorithmId {
  return (AUX_ALGORITHM_IDS as readonly string[]).includes(algorithm);
}

export interface AuxPanelProps extends AuxContext {
  readonly algorithm: AuxAlgorithmId;
}

export function AuxPanel({ algorithm, event, state, items }: AuxPanelProps) {
  const Component = AUX_COMPONENTS[algorithm];
  return (
    <div data-testid={`aux-panel-${algorithm}`}>
      <Component event={event} state={state} items={items} />
    </div>
  );
}
