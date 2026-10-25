/**
 * 希尔排序专属视觉：当前 gap、分组连线、组内插入位置。
 *
 * 数据只读 auxiliary_state：gap / gap_index / groups / group_index /
 * key_value / hole_index。同组元素用连线与 G 标签双重编码，不只靠颜色。
 */
import { BilingualText } from "../../../i18n/BilingualText";
import { algorithmTextOf, auxTitles, formatAlgorithmText } from "../i18n";
import type { AuxContext } from "../types";
import { AuxFact, AuxFacts, AuxMissingNote, AuxSection } from "./AuxPrimitives";
import {
  formatAuxNumber,
  missingAuxFields,
  readGroups,
  readNumber,
} from "./auxRead";

const REQUIRED_FIELDS = ["gap", "gap_index", "groups", "group_index"] as const;

const CELL_WIDTH = 52;
const CELL_GAP = 12;
const CELL_HEIGHT = 56;
const CELL_Y = 150;
const START_X = 40;
const VIEW_HEIGHT = 250;

export function ShellAux({ event, state }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const gap = readNumber(aux, "gap");
  const gapIndex = readNumber(aux, "gap_index");
  const groups = readGroups(aux, "groups");
  const groupIndex = readNumber(aux, "group_index");
  const keyValue = readNumber(aux, "key_value");
  const holeIndex = readNumber(aux, "hole_index");

  const count = state.order.length;
  const slot = CELL_WIDTH + CELL_GAP;
  const viewWidth = Math.max(660, count * slot + START_X * 2);
  const xOf = (index: number) => START_X + index * slot + CELL_WIDTH / 2;
  const groupOfIndex = (index: number): number => {
    if (!groups) {
      return -1;
    }
    return groups.findIndex((group) => group.includes(index));
  };

  const ariaText = formatAlgorithmText("shell.aria", {
    gap: gap ?? "—",
    gapIndex: gapIndex ?? "—",
    groupIndex: groupIndex === null ? "—" : groupIndex + 1,
    groupCount: groups?.length ?? "—",
  });

  return (
    <AuxSection
      algorithm="shell"
      title={auxTitles.shell}
      eventPresent={event !== null}
      testId="aux-shell"
      legend={algorithmTextOf("shell.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("shell.gapIndex")}
          value={gapIndex === null ? "—" : gapIndex + 1}
          testId="aux-shell-fact-gap-index"
        />
        <AuxFact
          label={algorithmTextOf("shell.gap")}
          value={gap === null ? "—" : gap}
          testId="aux-shell-fact-gap"
        />
        <AuxFact
          label={algorithmTextOf("shell.groupCount")}
          value={groups === null ? "—" : groups.length}
          testId="aux-shell-fact-group-count"
        />
        <AuxFact
          label={algorithmTextOf("shell.groupIndex")}
          value={
            groupIndex === null ? (
              "—"
            ) : (
              <BilingualText
                size="xs"
                zh={formatAlgorithmText("shell.currentGroupValue", { n: groupIndex + 1 })["zh-Hant"]}
                en={formatAlgorithmText("shell.currentGroupValue", { n: groupIndex + 1 }).en}
              />
            )
          }
          testId="aux-shell-fact-group"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-shell-missing" />

      <figure className="algo-aux__figure" data-testid="aux-shell-figure">
        <svg
          role="img"
          tabIndex={0}
          aria-label={ariaText["zh-Hant"]}
          viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
          className="algo-shell"
          data-testid="aux-shell-svg"
        >
          <title>{`${auxTitles.shell["zh-Hant"]}\n${auxTitles.shell.en}`}</title>

          {groups?.map((group, index) => {
            const positions = group.filter((position) => position >= 0 && position < count);
            if (positions.length === 0) {
              return null;
            }
            const left = xOf(Math.min(...positions));
            const right = xOf(Math.max(...positions));
            const lane = index % 3;
            const bracketY = 118 - lane * 22;
            const current = groupIndex === index;
            return (
              <g
                key={`group-${index}`}
                data-testid="aux-shell-group"
                data-group-index={index}
                data-current={current ? "true" : "false"}
                className={current ? "algo-shell__group algo-shell__group--current" : "algo-shell__group"}
              >
                <path
                  className="algo-shell__bracket"
                  d={`M ${left} ${bracketY + 6} V ${bracketY} H ${right} V ${bracketY + 6}`}
                />
                <text className="algo-shell__group-label" x={left - 4} y={bracketY - 6}>
                  {`G${index + 1}`}
                </text>
              </g>
            );
          })}

          {state.order.map((itemId, index) => {
            const value = itemId === null ? null : (state.values[index] ?? null);
            const group = groupOfIndex(index);
            const currentGroup = groupIndex !== null && group === groupIndex;
            const isHole = holeIndex === index;
            const marker = isHole ? "◌" : currentGroup ? "◆" : undefined;
            return (
              <g
                key={`${index}-${itemId ?? "hole"}`}
                className={[
                  "algo-shell__cell",
                  currentGroup ? "algo-shell__cell--current" : "",
                  group >= 0 ? `algo-shell__cell--group-${group % 4}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-testid={`shell-cell-${index}`}
                data-index={index}
                data-group={group >= 0 ? group : ""}
                data-current-group={currentGroup ? "true" : "false"}
              >
                <title>{`${index}: ${formatAuxNumber(value)}`}</title>
                <rect
                  className="algo-shell__rect"
                  x={xOf(index) - CELL_WIDTH / 2}
                  y={CELL_Y}
                  width={CELL_WIDTH}
                  height={CELL_HEIGHT}
                  rx={8}
                />
                <text className="algo-shell__index" x={xOf(index)} y={CELL_Y - 22}>
                  {index}
                </text>
                {marker ? (
                  <text className="algo-shell__marker" x={xOf(index)} y={CELL_Y - 6}>
                    {marker}
                  </text>
                ) : null}
                <text className="algo-shell__value" x={xOf(index)} y={CELL_Y + 34}>
                  {formatAuxNumber(value)}
                </text>
                {group >= 0 ? (
                  <text
                    className="algo-shell__group-tag"
                    x={xOf(index) + CELL_WIDTH / 2 - 8}
                    y={CELL_Y + CELL_HEIGHT - 6}
                    textAnchor="end"
                  >
                    {`G${group + 1}`}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </figure>

      {keyValue !== null ? (
        <p className="algo-aux__note" data-testid="aux-shell-held">
          <BilingualText
            size="xs"
            zh={formatAlgorithmText("shell.heldValue", { value: formatAuxNumber(keyValue) })["zh-Hant"]}
            en={formatAlgorithmText("shell.heldValue", { value: formatAuxNumber(keyValue) }).en}
          />
        </p>
      ) : null}
    </AuxSection>
  );
}
