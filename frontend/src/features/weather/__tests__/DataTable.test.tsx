import { render, screen, within } from "@testing-library/react";
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
