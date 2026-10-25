/**
 * 堆排序专属视觉：数组与二叉堆 SVG 联动。
 *
 * - 节点位置完全由数组下标决定（父 (i-1)//2、左 2i+1、右 2i+2），与后端一致；
 * - 当前节点、父节点、左右子节点分别用符号 + 文字标记，不只靠颜色；
 * - 超出 heap_size 的节点显示为「堆外/已取出」，与数组单元格同步降淡。
 *
 * 数据只读 auxiliary_state：heap_size / node_index / parent_index /
 * left_child / right_child / phase。
 */
import { BilingualText } from "../../../i18n/BilingualText";
import { algorithmTextOf, auxTitles, formatAlgorithmText } from "../i18n";
import type { AuxContext } from "../types";
import {
  AuxCell,
  AuxCellRow,
  AuxFact,
  AuxFacts,
  AuxMissingNote,
  AuxSection,
} from "./AuxPrimitives";
import { formatAuxNumber, missingAuxFields, readNumber, readString } from "./auxRead";

const REQUIRED_FIELDS = ["heap_size", "node_index", "phase"] as const;

const NODE_RADIUS = 22;
const LEVEL_GAP = 86;
const VIEW_HEIGHT_BASE = 70;

function phaseText(phase: string | null) {
  if (phase === "build") {
    return algorithmTextOf("heap.phase.build");
  }
  if (phase === "extract") {
    return algorithmTextOf("heap.phase.extract");
  }
  if (phase === "sift_down") {
    return algorithmTextOf("heap.phase.sift_down");
  }
  return null;
}

interface NodePosition {
  readonly x: number;
  readonly y: number;
  readonly level: number;
}

export function HeapAux({ event, state }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const heapSize = readNumber(aux, "heap_size");
  const nodeIndex = readNumber(aux, "node_index");
  const parentIndex = readNumber(aux, "parent_index");
  const leftChild = readNumber(aux, "left_child");
  const rightChild = readNumber(aux, "right_child");
  const phase = readString(aux, "phase");
  const phaseLabel = phaseText(phase);

  const count = state.order.length;
  const levels = Math.max(1, Math.ceil(Math.log2(count + 1)));
  const viewWidth = Math.max(680, count * 44);
  const viewHeight = VIEW_HEIGHT_BASE + (levels - 1) * LEVEL_GAP + 40;

  const positionOf = (index: number): NodePosition => {
    const level = Math.floor(Math.log2(index + 1));
    const firstOfLevel = 2 ** level - 1;
    const positionInLevel = index - firstOfLevel;
    const slots = 2 ** level;
    const x = 40 + ((positionInLevel + 0.5) * (viewWidth - 80)) / slots;
    const y = 52 + level * LEVEL_GAP;
    return { x, y, level };
  };

  const isRemoved = (index: number): boolean => heapSize !== null && index >= heapSize;
  const isNode = (index: number): boolean => nodeIndex === index;

  const phaseLabelText = phaseLabel
    ? phaseLabel["zh-Hant"]
    : (phase ?? "—");
  const ariaText = formatAlgorithmText("heap.aria", {
    size: heapSize ?? "—",
    node: nodeIndex ?? "—",
    parent: parentIndex ?? "—",
    left: leftChild ?? "—",
    right: rightChild ?? "—",
    phase: phaseLabelText,
  });

  return (
    <AuxSection
      algorithm="heap"
      title={auxTitles.heap}
      eventPresent={event !== null}
      testId="aux-heap"
      legend={algorithmTextOf("heap.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("heap.size")}
          value={heapSize === null ? "—" : heapSize}
          testId="aux-heap-fact-size"
        />
        <AuxFact
          label={algorithmTextOf("heap.node")}
          value={nodeIndex === null ? "—" : nodeIndex}
          testId="aux-heap-fact-node"
        />
        <AuxFact
          label={algorithmTextOf("heap.parent")}
          value={parentIndex === null ? "—" : parentIndex}
          testId="aux-heap-fact-parent"
        />
        <AuxFact
          label={algorithmTextOf("heap.left")}
          value={leftChild === null ? "—" : leftChild}
          testId="aux-heap-fact-left"
        />
        <AuxFact
          label={algorithmTextOf("heap.right")}
          value={rightChild === null ? "—" : rightChild}
          testId="aux-heap-fact-right"
        />
        <AuxFact
          label={algorithmTextOf("heap.phase")}
          value={
            phaseLabel ? (
              <BilingualText size="xs" zh={phaseLabel["zh-Hant"]} en={phaseLabel.en} />
            ) : (
              (phase ?? "—")
            )
          }
          testId="aux-heap-fact-phase"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-heap-missing" />

      <figure className="algo-aux__figure" data-testid="aux-heap-figure">
        <h4 className="algo-aux__subtitle">
          <BilingualText
            size="xs"
            zh={algorithmTextOf("heap.array")["zh-Hant"]}
            en={algorithmTextOf("heap.array").en}
          />
        </h4>
        <AuxCellRow label={algorithmTextOf("heap.array")["zh-Hant"]} testId="aux-heap-cells">
          {state.order.map((itemId, index) => {
            const value = itemId === null ? null : (state.values[index] ?? null);
            const removed = isRemoved(index);
            const current = isNode(index);
            const isParent = parentIndex === index;
            const isChild = leftChild === index || rightChild === index;
            const marker = removed
              ? "✕"
              : current
                ? "★"
                : isParent
                  ? "▲"
                  : leftChild === index
                    ? "L"
                    : rightChild === index
                      ? "R"
                      : isChild
                        ? "▼"
                        : undefined;
            const tone = removed
              ? "muted"
              : current
                ? "candidate"
                : isParent || isChild
                  ? "active"
                  : "normal";
            return (
              <AuxCell
                key={`${index}-${itemId ?? "hole"}`}
                index={index}
                value={value}
                tone={tone}
                marker={marker}
                dimmed={removed}
                testId={`heap-array-cell-${index}`}
              />
            );
          })}
        </AuxCellRow>

        <h4 className="algo-aux__subtitle">
          <BilingualText
            size="xs"
            zh={algorithmTextOf("heap.tree")["zh-Hant"]}
            en={algorithmTextOf("heap.tree").en}
          />
        </h4>
        <svg
          role="img"
          tabIndex={0}
          aria-label={ariaText["zh-Hant"]}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="algo-heap"
          data-testid="aux-heap-svg"
        >
          <title>{`${auxTitles.heap["zh-Hant"]}\n${auxTitles.heap.en}`}</title>

          {Array.from({ length: count }, (_, index) => {
            if (index === 0) {
              return null;
            }
            const parent = (index - 1) >> 1;
            const from = positionOf(parent);
            const to = positionOf(index);
            const activeParentEdge = index === nodeIndex && parent === parentIndex;
            const activeChildEdge =
              (parent === nodeIndex && (index === leftChild || index === rightChild));
            return (
              <line
                key={`edge-${index}`}
                className={
                  activeParentEdge || activeChildEdge
                    ? "algo-heap__edge algo-heap__edge--active"
                    : "algo-heap__edge"
                }
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                data-active={activeParentEdge || activeChildEdge ? "true" : "false"}
              />
            );
          })}

          {state.order.map((itemId, index) => {
            const position = positionOf(index);
            const value = itemId === null ? null : (state.values[index] ?? null);
            const removed = isRemoved(index);
            const current = isNode(index);
            const isParent = parentIndex === index;
            const isLeft = leftChild === index;
            const isRight = rightChild === index;
            const marker = current
              ? "★"
              : isParent
                ? "▲"
                : isLeft
                  ? "L"
                  : isRight
                    ? "R"
                    : undefined;
            const stateName = removed
              ? "removed"
              : current
                ? "current"
                : isParent
                  ? "parent"
                  : isLeft || isRight
                    ? "child"
                    : "normal";
            const nodeAria = formatAlgorithmText("heap.nodeAria", {
              index,
              value: value === null ? "—" : formatAuxNumber(value),
            })["zh-Hant"];
            return (
              <g
                key={`${index}-${itemId ?? "hole"}`}
                className={[
                  "algo-heap__node",
                  removed ? "algo-heap__node--removed" : "",
                  current ? "algo-heap__node--current" : "",
                  isParent ? "algo-heap__node--parent" : "",
                  isLeft || isRight ? "algo-heap__node--child" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-testid="heap-node"
                data-index={index}
                data-in-heap={removed ? "false" : "true"}
                data-state={stateName}
                aria-label={nodeAria}
              >
                <title>{nodeAria}</title>
                {marker ? (
                  <text className="algo-heap__marker" x={position.x} y={position.y - NODE_RADIUS - 8}>
                    {marker}
                  </text>
                ) : null}
                <circle
                  className="algo-heap__circle"
                  cx={position.x}
                  cy={position.y}
                  r={NODE_RADIUS}
                />
                <text className="algo-heap__value" x={position.x} y={position.y + 5}>
                  {formatAuxNumber(value)}
                </text>
                <text className="algo-heap__index" x={position.x} y={position.y + NODE_RADIUS + 16}>
                  {`#${index}`}
                </text>
                {removed ? (
                  <text
                    className="algo-heap__out-label"
                    x={position.x}
                    y={position.y + NODE_RADIUS + 30}
                  >
                    <tspan x={position.x} dy="0">
                      {algorithmTextOf("heap.outsideBadge")["zh-Hant"]}
                    </tspan>
                    <tspan x={position.x} dy="12">
                      {algorithmTextOf("heap.outsideBadge").en}
                    </tspan>
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </figure>
    </AuxSection>
  );
}
