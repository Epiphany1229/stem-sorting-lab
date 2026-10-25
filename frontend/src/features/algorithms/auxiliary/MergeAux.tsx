/**
 * 归并排序专属视觉：区间层级 [left, mid, right]、左右读取指针、
 * 辅助合并数组 buffer 与回拷状态。
 *
 * 数据只读 auxiliary_state：left / mid / right / depth / left_ptr /
 * right_ptr / buffer（id 列表）/ buffer_index / writing_back。
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
  readIdList,
  readNumber,
  valueById,
} from "./auxRead";

const REQUIRED_FIELDS = ["left", "mid", "right", "depth"] as const;

export function MergeAux({ event, state, items }: AuxContext) {
  const aux = event?.auxiliary_state;
  const missing = missingAuxFields(aux, REQUIRED_FIELDS);
  const left = readNumber(aux, "left");
  const mid = readNumber(aux, "mid");
  const right = readNumber(aux, "right");
  const depth = readNumber(aux, "depth");
  const leftPtr = readNumber(aux, "left_ptr");
  const rightPtr = readNumber(aux, "right_ptr");
  const buffer = readIdList(aux, "buffer");
  const bufferIndex = readNumber(aux, "buffer_index");
  const writingBack = readBoolean(aux, "writing_back");
  const compared = new Set(event?.compared_indices ?? []);
  const count = state.order.length;

  const rangeText = formatAlgorithmText("merge.rangeValue", {
    left: left ?? "—",
    mid: mid ?? "—",
    right: right ?? "—",
  });
  const writingText =
    writingBack === null
      ? algorithmTextOf("merge.writingNo")
      : writingBack
        ? algorithmTextOf("merge.writingYes")
        : algorithmTextOf("merge.writingNo");
  const ariaText = formatAlgorithmText("merge.aria", {
    left: left ?? "—",
    mid: mid ?? "—",
    right: right ?? "—",
    depth: depth ?? "—",
    leftPtr: leftPtr ?? "—",
    rightPtr: rightPtr ?? "—",
    bufferIndex: bufferIndex ?? "—",
    writingBack: writingBack ? algorithmTextOf("merge.writingYes")["zh-Hant"] : algorithmTextOf("merge.writingNo")["zh-Hant"],
  });

  const gridStyle = { gridTemplateColumns: `repeat(${count}, minmax(2.25rem, 1fr))` };

  return (
    <AuxSection
      algorithm="merge"
      title={auxTitles.merge}
      eventPresent={event !== null}
      testId="aux-merge"
      legend={algorithmTextOf("merge.legend")}
    >
      <AuxFacts>
        <AuxFact
          label={algorithmTextOf("merge.range")}
          value={<BilingualText size="xs" zh={rangeText["zh-Hant"]} en={rangeText.en} />}
          testId="aux-merge-fact-range"
        />
        <AuxFact
          label={algorithmTextOf("merge.depth")}
          value={depth === null ? "—" : depth}
          testId="aux-merge-fact-depth"
        />
        <AuxFact
          label={algorithmTextOf("merge.leftPtr")}
          value={leftPtr === null ? "—" : leftPtr}
          testId="aux-merge-fact-left"
        />
        <AuxFact
          label={algorithmTextOf("merge.rightPtr")}
          value={rightPtr === null ? "—" : rightPtr}
          testId="aux-merge-fact-right"
        />
        <AuxFact
          label={algorithmTextOf("merge.bufferIndex")}
          value={bufferIndex === null ? "—" : bufferIndex}
          testId="aux-merge-fact-buffer-index"
        />
        <AuxFact
          label={algorithmTextOf("merge.writingBack")}
          value={<BilingualText size="xs" zh={writingText["zh-Hant"]} en={writingText.en} />}
          testId="aux-merge-fact-writing"
        />
      </AuxFacts>

      <AuxMissingNote fields={missing} testId="aux-merge-missing" />

      <figure
        className="algo-aux__figure"
        role="img"
        tabIndex={0}
        aria-label={ariaText["zh-Hant"]}
        data-testid="aux-merge-figure"
      >
        <div className="algo-aux__grid" style={gridStyle} data-testid="aux-merge-grid">
          {left !== null && right !== null ? (
            <div
              className="algo-merge__bracket"
              style={{ gridColumn: `${left + 1} / ${right + 2}`, gridRow: 1 }}
              data-testid="aux-merge-bracket"
            >
              <span>{`[${left}, ${mid ?? "—"}, ${right}]`}</span>
            </div>
          ) : null}
          {mid !== null && left !== null && right !== null ? (
            <div
              className="algo-merge__mid"
              style={{ gridColumn: `${mid + 1} / ${mid + 2}`, gridRow: 1 }}
              aria-hidden="true"
            />
          ) : null}
          <div style={{ gridColumn: "1 / -1", gridRow: 2 }}>
            <AuxCellRow label={auxTitles.merge["zh-Hant"]} testId="aux-merge-cells">
              {state.order.map((itemId, index) => {
                const value = itemId === null ? null : (state.values[index] ?? null);
                const isLeft = leftPtr === index;
                const isRight = rightPtr === index;
                const marker = isLeft && isRight ? "L/R" : isLeft ? "L" : isRight ? "R" : compared.has(index) ? "?" : undefined;
                const tone = compared.has(index) ? "active" : "normal";
                return (
                  <AuxCell
                    key={`${index}-${itemId ?? "hole"}`}
                    index={index}
                    value={value}
                    tone={tone}
                    marker={marker}
                    testId={`merge-cell-${index}`}
                  />
                );
              })}
            </AuxCellRow>
          </div>
        </div>

        <div className="algo-aux__buffer" data-testid="aux-merge-buffer">
          <h4 className="algo-aux__buffer-title">
            <BilingualText
              size="xs"
              zh={algorithmTextOf("merge.buffer")["zh-Hant"]}
              en={algorithmTextOf("merge.buffer").en}
            />
          </h4>
          {buffer === null ? (
            <p className="algo-aux__buffer-empty" data-testid="aux-merge-buffer-empty">
              <BilingualText
                size="xs"
                zh={algorithmTextOf("merge.emptyBuffer")["zh-Hant"]}
                en={algorithmTextOf("merge.emptyBuffer").en}
              />
            </p>
          ) : (
            <AuxCellRow label={algorithmTextOf("merge.buffer")["zh-Hant"]} testId="aux-merge-buffer-cells">
              {buffer.map((itemId, index) => (
                <AuxCell
                  key={`${itemId}-${index}`}
                  index={index}
                  value={valueById(items, itemId) ?? 0}
                  tone={bufferIndex === index ? "active" : "normal"}
                  marker={bufferIndex === index ? "▼" : undefined}
                  testId={`merge-buffer-cell-${index}`}
                />
              ))}
            </AuxCellRow>
          )}
          <p className="algo-aux__note" data-testid="aux-merge-buffer-note">
            <BilingualText size="xs" zh={writingText["zh-Hant"]} en={writingText.en} />
          </p>
          {bufferIndex !== null ? (
            <p className="algo-aux__note">
              <BilingualText
                size="xs"
                zh={formatAlgorithmText("merge.bufferIndexValue", {
                  index: formatAuxNumber(bufferIndex),
                })["zh-Hant"]}
                en={formatAlgorithmText("merge.bufferIndexValue", {
                  index: formatAuxNumber(bufferIndex),
                }).en}
              />
            </p>
          ) : null}
        </div>
      </figure>
    </AuxSection>
  );
}
