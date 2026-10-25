/**
 * 选择排序专属视觉：最小值候选、扫描区间、已排定前缀。
 *
 * 数据只读事件 auxiliary_state（design §4）：min_index / scan_from / scan_to /
 * finalized_before / pass_index；缺失字段显示双语提示，不猜测。
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
import { formatAuxNumber, missingAuxFields, readNumber, readNumberList } from "./auxRead";

const REQUIRED_FIELDS = [
  "pass_index",
  "min_index",
  "scan_from",
  "scan_to",
  "finalized_before",
] as const;

export function SelectionAux({ event, state }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const pass = readNumber(aux, "pass_index");
  const minIndex = readNumber(aux, "min_index");
  const scanFrom = readNumber(aux, "scan_from");
  const scanTo = readNumber(aux, "scan_to");
  // 后端字段 finalized_before 是「已排定下标数组」（可能为空数组），不是数量。
  const finalizedBefore = readNumberList(aux, "finalized_before");
  const minValue = minIndex !== null ? (state.values[minIndex] ?? null) : null;
  const compared = new Set(event?.compared_indices ?? []);

  const candidateText = formatAlgorithmText("selection.candidateValue", {
    index: minIndex ?? "—",
    value: minValue === null ? "—" : formatAuxNumber(minValue),
  });
  const rangeText = formatAlgorithmText("selection.rangeValue", {
    from: scanFrom ?? "—",
    to: scanTo ?? "—",
  });
  const positionsText = formatAlgorithmText("selection.positions", {
    count: finalizedBefore === null ? "—" : finalizedBefore.length,
  });
  const ariaText = formatAlgorithmText("selection.aria", {
    pass: pass === null ? "—" : pass + 1,
    min: minIndex ?? "—",
    value: minValue === null ? "—" : formatAuxNumber(minValue),
    from: scanFrom ?? "—",
    to: scanTo ?? "—",
    finalized: finalizedBefore === null ? "—" : finalizedBefore.length,
  });

  return (
    <AuxSection
      algorithm="selection"
      title={auxTitles.selection}
      eventPresent={event !== null}
      testId="aux-selection"
      legend={algorithmTextOf("selection.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("aux.pass")}
          value={pass === null ? "—" : pass + 1}
          testId="aux-selection-fact-pass"
        />
        <AuxFact
          label={algorithmTextOf("selection.minCandidate")}
          value={
            <BilingualText size="xs" zh={candidateText["zh-Hant"]} en={candidateText.en} />
          }
          testId="aux-selection-fact-min"
        />
        <AuxFact
          label={algorithmTextOf("selection.scanRange")}
          value={<BilingualText size="xs" zh={rangeText["zh-Hant"]} en={rangeText.en} />}
          testId="aux-selection-fact-scan"
        />
        <AuxFact
          label={algorithmTextOf("selection.finalized")}
          value={<BilingualText size="xs" zh={positionsText["zh-Hant"]} en={positionsText.en} />}
          testId="aux-selection-fact-finalized"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-selection-missing" />

      <figure
        className="algo-aux__figure"
        role="img"
        tabIndex={0}
        aria-label={ariaText["zh-Hant"]}
        data-testid="aux-selection-figure"
      >
        <AuxCellRow label={auxTitles.selection["zh-Hant"]} testId="aux-selection-cells">
          {state.order.map((itemId, index) => {
            const value = itemId === null ? null : (state.values[index] ?? null);
            const settled = finalizedBefore?.includes(index) ?? false;
            const candidate = minIndex === index;
            const scanning =
              scanFrom !== null && scanTo !== null && index >= scanFrom && index <= scanTo;
            const isCompared = compared.has(index);

            const tone = candidate
              ? "candidate"
              : settled
                ? "settled"
                : isCompared
                  ? "active"
                  : scanning
                    ? "active"
                    : "normal";
            const marker = candidate
              ? "★"
              : settled
                ? "✓"
                : isCompared
                  ? "?"
                  : scanning
                    ? "·"
                    : undefined;

            return (
              <AuxCell
                key={`${index}-${itemId ?? "hole"}`}
                index={index}
                value={value}
                tone={tone}
                marker={marker}
                testId={`selection-cell-${index}`}
              />
            );
          })}
        </AuxCellRow>
      </figure>
    </AuxSection>
  );
}
