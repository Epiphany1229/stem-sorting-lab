import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatTranslation } from "../../../i18n/dictionary";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableRow } from "../DataTable";

const columns: DataTableColumn[] = [
  { key: "date", zh: "日期", en: "Date" },
  { key: "value", zh: "數值", en: "Value", numeric: true },
];

const rows: DataTableRow[] = [
  { key: "a", cells: ["2026-09-01", "30.1"] },
  { key: "b", cells: ["2026-09-02", "31.4"] },
];

const manyRows: DataTableRow[] = Array.from({ length: 8 }, (_, index) => ({
  key: `row-${index}`,
  cells: [`2026-09-0${index + 1}`, `${30 + index}.0`],
}));

describe("可访问数据表", () => {
  it("有真实 table/caption/表头，并显示双语标题与行数", () => {
    render(
      <DataTable
        testId="demo-table"
        caption={formatTranslation("weather.table.lineCaption", {})}
        columns={columns}
        rows={rows}
      />,
    );

    const figure = screen.getByTestId("demo-table");
    const table = within(figure).getByRole("table");
    expect(within(table).getByText("氣溫折線圖的可存取資料表")).toBeInTheDocument();
    expect(within(table).getByText("Accessible data table for the temperature line chart")).toBeInTheDocument();

    const headers = within(table).getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveAttribute("scope", "col");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // 表头 + 2 行
    expect(within(figure).getByText("共 2 列")).toBeInTheDocument();

    const scroll = figure.querySelector('[role="region"]');
    expect(scroll).toHaveAttribute("tabindex", "0");

    // 行数不超过 5 时不需要展开按钮。
    expect(within(figure).queryByRole("button")).not.toBeInTheDocument();
  });

  it("超过 5 行时默认只显示前 5 行，可展开/收起并更新 aria-expanded", () => {
    render(
      <DataTable
        testId="collapse-table"
        caption={formatTranslation("weather.table.coverageCaption", {})}
        columns={columns}
        rows={manyRows}
      />,
    );

    const figure = screen.getByTestId("collapse-table");
    const table = within(figure).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(6); // 表头 + 前 5 行
    expect(within(figure).getByText("顯示前 5 列，共 8 列")).toBeInTheDocument();

    const toggle = within(figure).getByTestId("collapse-table-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("展開全部");
    expect(toggle.getAttribute("aria-controls")).toBe(table.id);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("收起");
    expect(within(table).getAllByRole("row")).toHaveLength(9); // 表头 + 8 行
    expect(within(figure).getByText("共 8 列")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(table).getAllByRole("row")).toHaveLength(6);
  });

  it("空数据时显示暫無可用資料、双语原因与原始 reason", () => {
    render(
      <DataTable
        testId="empty-table"
        caption={formatTranslation("weather.table.barCaption", {})}
        columns={columns}
        rows={[]}
        emptyReason="circuit_open"
      />,
    );

    const figure = screen.getByTestId("empty-table");
    expect(within(figure).getByText("暫無可用資料")).toBeInTheDocument();
    expect(within(figure).getByText("No data available")).toBeInTheDocument();
    expect(
      within(figure).getByText(/官方來源暫時熔斷，自動抓取已停止/),
    ).toBeInTheDocument();
    expect(within(figure).getByText("circuit_open")).toBeInTheDocument();
    expect(within(figure).getByText("共 0 列")).toBeInTheDocument();
  });

  it("没有 reason 的空表也给出说明，不留空白", () => {
    render(
      <DataTable
        testId="empty-no-reason"
        caption={formatTranslation("weather.table.histCaption", {})}
        columns={columns}
        rows={[]}
      />,
    );

    expect(
      screen.getByText(/這張圖需要至少一筆有效觀測/),
    ).toBeInTheDocument();
  });
});
