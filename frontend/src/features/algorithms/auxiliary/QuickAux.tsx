/**
 * 快速排序专属视觉：首元素枢轴、当前区间 [low, high]、
 * 左右指针与 Lomuto 分区边界。
 *
 * 数据只读 auxiliary_state：pivot_value / pivot_index / low / high /
 * left_ptr / right_ptr / partition_index / phase。
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

const REQUIRED_FIELDS = ["pivot_value", "pivot_index", "low", "high"] as const;

function phaseText(phase: string | null) {
  if (phase === "compare") {
    return algorithmTextOf("quick.phase.compare");
  }
  if (phase === "partition") {
    return algorithmTextOf("quick.phase.partition");
  }
  if (phase === "placed") {
    return algorithmTextOf("quick.phase.placed");
  }
  return null;
}

export function QuickAux({ event, state }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const pivotValue = readNumber(aux, "pivot_value");
  const pivotIndex = readNumber(aux, "pivot_index");
  const low = readNumber(aux, "low");
  const high = readNumber(aux, "high");
  const leftPtr = readNumber(aux, "left_ptr");
  const rightPtr = readNumber(aux, "right_ptr");
  const partitionIndex = readNumber(aux, "partition_index");
  const phase = readString(aux, "phase");
  const phaseLabel = phaseText(phase);
  const compared = new Set(event?.compared_indices ?? []);
  const count = state.order.length;

  const rangeText = formatAlgorithmText("quick.rangeValue", {
    low: low ?? "—",
    high: high ?? "—",
  });
  const ariaText = formatAlgorithmText("quick.aria", {
    pivotIndex: pivotIndex ?? "—",
    pivotValue: pivotValue === null ? "—" : formatAuxNumber(pivotValue),
    low: low ?? "—",
    high: high ?? "—",
    leftPtr: leftPtr ?? "—",
    rightPtr: rightPtr ?? "—",
    partition: partitionIndex ?? "—",
    phase: phaseLabel ? phaseLabel["zh-Hant"] : (phase ?? "—"),
  });

  const gridStyle = { gridTemplateColumns: `repeat(${count}, minmax(2.25rem, 1fr))` };

  return (
    <AuxSection
      algorithm="quick"
      title={auxTitles.quick}
      eventPresent={event !== null}
      testId="aux-quick"
      legend={algorithmTextOf("quick.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("quick.pivotValue")}
          value={
            pivotValue === null ? (
              "—"
            ) : (
              <BilingualText
                size="xs"
                zh={formatAlgorithmText("selection.candidateValue", {
                  index: pivotIndex ?? "—",
                  value: formatAuxNumber(pivotValue),
                })["zh-Hant"]}
                en={formatAlgorithmText("selection.candidateValue", {
                  index: pivotIndex ?? "—",
                  value: formatAuxNumber(pivotValue),
                }).en}
              />
            )
          }
          testId="aux-quick-fact-pivot"
        />
        <AuxFact
          label={algorithmTextOf("quick.range")}
          value={<BilingualText size="xs" zh={rangeText["zh-Hant"]} en={rangeText.en} />}
          testId="aux-quick-fact-range"
        />
        <AuxFact
          label={algorithmTextOf("quick.leftPtr")}
          value={leftPtr === null ? "—" : leftPtr}
          testId="aux-quick-fact-left"
        />
        <AuxFact
          label={algorithmTextOf("quick.rightPtr")}
          value={rightPtr === null ? "—" : rightPtr}
          testId="aux-quick-fact-right"
        />
        <AuxFact
          label={algorithmTextOf("quick.partition")}
          value={partitionIndex === null ? "—" : partitionIndex}
          testId="aux-quick-fact-partition"
        />
        <AuxFact
          label={algorithmTextOf("quick.phase")}
          value={
            phaseLabel ? (
              <BilingualText size="xs" zh={phaseLabel["zh-Hant"]} en={phaseLabel.en} />
            ) : (
              (phase ?? "—")
            )
          }
          testId="aux-quick-fact-phase"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-quick-missing" />

      <figure
        className="algo-aux__figure"
        role="img"
        tabIndex={0}
        aria-label={ariaText["zh-Hant"]}
        data-testid="aux-quick-figure"
      >
        <div className="algo-aux__grid" style={gridStyle} data-testid="aux-quick-grid">
          {low !== null && high !== null ? (
            <div
              className="algo-quick__bracket"
              style={{ gridColumn: `${low + 1} / ${high + 2}`, gridRow: 1 }}
              data-testid="aux-quick-bracket"
            >
              <span>{`[${low}, ${high}]`}</span>
            </div>
          ) : null}
          {partitionIndex !== null ? (
            <div
              className="algo-quick__partition-line"
              style={{ gridColumn: `${partitionIndex + 1} / ${partitionIndex + 2}`, gridRow: 1 }}
              aria-hidden="true"
            />
          ) : null}
          <div style={{ gridColumn: "1 / -1", gridRow: 2 }}>
            <AuxCellRow label={auxTitles.quick["zh-Hant"]} testId="aux-quick-cells">
              {state.order.map((itemId, index) => {
                const value = itemId === null ? null : (state.values[index] ?? null);
                const isPivot = pivotIndex === index;
                const isLeft = leftPtr === index;
                const isRight = rightPtr === index;
                const markers = [
                  isPivot ? "★" : null,
                  isLeft ? "L" : null,
                  isRight ? "R" : null,
                ].filter((entry): entry is string => entry !== null);
                const tone = isPivot ? "pivot" : compared.has(index) ? "active" : "normal";
                const marker = markers.length > 0 ? markers.join("") : compared.has(index) ? "?" : undefined;
                return (
                  <AuxCell
                    key={`${index}-${itemId ?? "hole"}`}
                    index={index}
                    value={value}
                    tone={tone}
                    marker={marker}
                    testId={`quick-cell-${index}`}
                  />
                );
              })}
            </AuxCellRow>
          </div>
        </div>
      </figure>
    </AuxSection>
  );
}
