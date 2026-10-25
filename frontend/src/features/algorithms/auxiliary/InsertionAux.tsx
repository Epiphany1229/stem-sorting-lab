/**
 * 插入排序专属视觉：持牌槽位、左侧已排序区、右移与插入位置。
 *
 * 数据只读事件 auxiliary_state：key_value / key_index / hole_index /
 * sorted_to / shifting / pass_index。
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
import {
  formatAuxNumber,
  missingAuxFields,
  readBoolean,
  readNumber,
} from "./auxRead";

const REQUIRED_FIELDS = [
  "pass_index",
  "key_value",
  "key_index",
  "hole_index",
  "sorted_to",
  "shifting",
] as const;

export function InsertionAux({ event, state }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const pass = readNumber(aux, "pass_index");
  const keyValue = readNumber(aux, "key_value");
  const keyIndex = readNumber(aux, "key_index");
  const holeIndex = readNumber(aux, "hole_index");
  const sortedTo = readNumber(aux, "sorted_to");
  const shifting = readBoolean(aux, "shifting");
  const compared = new Set(event?.compared_indices ?? []);

  const moveText = formatAlgorithmText("insertion.move", {
    key: keyIndex ?? "—",
    hole: holeIndex ?? "—",
  });
  const sortedText = formatAlgorithmText("insertion.sortedToValue", {
    index: sortedTo ?? "—",
  });
  const shiftingText =
    shifting === null
      ? algorithmTextOf("insertion.shiftNo")
      : shifting
        ? algorithmTextOf("insertion.shiftYes")
        : algorithmTextOf("insertion.ready");
  const ariaText = formatAlgorithmText("insertion.aria", {
    value: keyValue === null ? "—" : formatAuxNumber(keyValue),
    key: keyIndex ?? "—",
    hole: holeIndex ?? "—",
    sortedTo: sortedTo ?? "—",
    shift: shifting ? algorithmTextOf("insertion.shiftYes")["zh-Hant"] : algorithmTextOf("insertion.shiftNo")["zh-Hant"],
  });

  return (
    <AuxSection
      algorithm="insertion"
      title={auxTitles.insertion}
      eventPresent={event !== null}
      testId="aux-insertion"
      legend={algorithmTextOf("insertion.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("aux.pass")}
          value={pass === null ? "—" : pass + 1}
          testId="aux-insertion-fact-pass"
        />
        <AuxFact
          label={algorithmTextOf("insertion.heldValue")}
          value={keyValue === null ? "—" : formatAuxNumber(keyValue)}
          testId="aux-insertion-fact-held"
        />
        <AuxFact
          label={algorithmTextOf("insertion.holeIndex")}
          value={holeIndex === null ? "—" : holeIndex}
          testId="aux-insertion-fact-hole"
        />
        <AuxFact
          label={algorithmTextOf("insertion.sortedTo")}
          value={<BilingualText size="xs" zh={sortedText["zh-Hant"]} en={sortedText.en} />}
          testId="aux-insertion-fact-sorted"
        />
        <AuxFact
          label={algorithmTextOf("insertion.shifting")}
          value={<BilingualText size="xs" zh={shiftingText["zh-Hant"]} en={shiftingText.en} />}
          testId="aux-insertion-fact-status"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-insertion-missing" />

      <div className="algo-aux__held" data-testid="aux-insertion-held">
        <span className="algo-aux__held-label">
          <BilingualText
            size="xs"
            zh={algorithmTextOf("insertion.held")["zh-Hant"]}
            en={algorithmTextOf("insertion.held").en}
          />
        </span>
        <span className="algo-aux__held-value">
          {keyValue === null ? "—" : formatAuxNumber(keyValue)}
        </span>
        <span className="algo-aux__held-move">
          <BilingualText size="xs" zh={moveText["zh-Hant"]} en={moveText.en} />
        </span>
      </div>

      <figure
        className="algo-aux__figure"
        role="img"
        tabIndex={0}
        aria-label={ariaText["zh-Hant"]}
        data-testid="aux-insertion-figure"
      >
        <AuxCellRow label={auxTitles.insertion["zh-Hant"]} testId="aux-insertion-cells">
          {state.order.map((itemId, index) => {
            const value = itemId === null ? null : (state.values[index] ?? null);
            const settled = sortedTo !== null && index <= sortedTo;
            const hole = holeIndex === index;
            const isCompared = compared.has(index);

            const tone = hole
              ? "hole"
              : isCompared
                ? "active"
                : settled
                  ? "settled"
                  : "normal";
            const marker = hole ? "◌" : isCompared ? "?" : settled ? "✓" : undefined;

            return (
              <AuxCell
                key={`${index}-${itemId ?? "hole"}`}
                index={index}
                value={value}
                tone={tone}
                marker={marker}
                testId={`insertion-cell-${index}`}
              />
            );
          })}
        </AuxCellRow>
      </figure>
    </AuxSection>
  );
}
