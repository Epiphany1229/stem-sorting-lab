/**
 * 可访问数据表：每张图 / 每个覆盖率区块下方附一份。
 *
 * - 真实 <table> + <caption> + th scope，屏幕阅读器可理解表头；
 * - 默认只显示前 5 行，双语「展開/收起」按钮带 aria-expanded（表格很大时先看重点）；
 * - 外层可聚焦（tabIndex=0）以便键盘横向滚动，caption 也是 region 的可读名称；
 * - 没有数据时显示「暫無可用資料」与后端 reason 的双语说明，不留空白。
 */
import { useId, useState } from "react";

import { BilingualText } from "../../i18n/BilingualText";
import type { Translation } from "../../i18n/dictionary";
import { formatTranslation } from "../../i18n/dictionary";
import { weatherReasonKey } from "./transform";

export interface DataTableColumn {
  readonly key: string;
  readonly zh: string;
  readonly en: string;
  readonly numeric?: boolean;
}

export interface DataTableRow {
  readonly key: string;
  readonly cells: readonly string[];
}

export interface DataTableProps {
  readonly testId: string;
  readonly caption: Translation;
  readonly columns: readonly DataTableColumn[];
  readonly rows: readonly DataTableRow[];
  readonly emptyReason?: string | null;
  /** 折叠时显示的行数，默认 5。 */
  readonly initialRows?: number;
}

export function DataTable({
  testId,
  caption,
  columns,
  rows,
  emptyReason = null,
  initialRows = 5,
}: DataTableProps) {
  const [expanded, setExpanded] = useState(false);
  const tableId = `weather-table-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasMoreRows = rows.length > initialRows;
  const visibleRows = hasMoreRows && !expanded ? rows.slice(0, initialRows) : rows;
  const countText = formatTranslation(
    hasMoreRows && !expanded ? "weather.table.rowCountCollapsed" : "weather.table.rowCount",
    hasMoreRows && !expanded
      ? { shown: initialRows, count: rows.length }
      : { count: rows.length },
  );

  return (
    <figure className="weather-table" data-testid={testId}>
      <div
        className="weather-table__scroll"
        tabIndex={0}
        role="region"
        aria-label={caption["zh-Hant"]}
      >
        <table className="weather-table__table" id={tableId}>
          <caption className="weather-table__caption">
            <span className="weather-table__caption-zh" lang="zh-Hant">
              {caption["zh-Hant"]}
            </span>
            <span className="weather-table__caption-en" lang="en" aria-hidden="true">
              {caption.en}
            </span>
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? "weather-table__cell--numeric" : undefined}
                >
                  <BilingualText as="span" size="xs" zh={column.zh} en={column.en} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="weather-table__empty">
                  <span className="weather-table__empty-title">
                    <BilingualText as="span" tkey="weather.table.empty" />
                  </span>
                  {emptyReason ? (
                    <span className="weather-table__empty-reason">
                      <BilingualText as="span" size="xs" tkey={weatherReasonKey(emptyReason)} />
                      <span className="weather-table__empty-code">
                        {" ("}
                        <code>{emptyReason}</code>
                        {")"}
                      </span>
                    </span>
                  ) : (
                    <span className="weather-table__empty-reason">
                      <BilingualText as="span" size="xs" tkey="weather.chart.emptyBody" />
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.key}>
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={column.numeric ? "weather-table__cell--numeric" : undefined}
                    >
                      {row.cells[index] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="weather-table__footer">
        <p className="weather-table__count">
          <BilingualText size="xs" zh={countText["zh-Hant"]} en={countText.en} />
        </p>
        {hasMoreRows ? (
          <button
            type="button"
            className="btn btn--ghost weather-table__toggle"
            aria-expanded={expanded}
            aria-controls={tableId}
            data-testid={`${testId}-toggle`}
            onClick={() => setExpanded((current) => !current)}
          >
            <BilingualText
              as="span"
              size="xs"
              tkey={expanded ? "weather.table.collapse" : "weather.table.expand"}
            />
          </button>
        ) : null}
      </div>
    </figure>
  );
}
