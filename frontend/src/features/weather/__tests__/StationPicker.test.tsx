import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { selectableStations, StationPicker } from "../StationPicker";
import { STATIONS } from "./fixtures";

function renderPicker(overrides: Partial<Parameters<typeof StationPicker>[0]> = {}) {
  const props = {
    stations: STATIONS,
    loading: false,
    error: null,
    onRetry: vi.fn(),
    selected: ["HKO"] as readonly string[],
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<StationPicker {...props} />);
  return props;
}

describe("测站选择", () => {
  it("只列出有资料的测站，且只显示中英文站名", () => {
    renderPicker();

    // VP1（available_days=0）不显示为可选项。
    expect(selectableStations(STATIONS).map((station) => station.id)).toEqual(["HKO", "KP"]);
    expect(screen.getByText("已選 1 / 2 站")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /香港天文台/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /京士柏/ })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /山頂/ })).not.toBeInTheDocument();

    // 不再展示资料起始年与可用天数。
    expect(screen.queryByText(/資料起始年/)).not.toBeInTheDocument();
    expect(screen.queryByText(/可用 \d+ 天/)).not.toBeInTheDocument();
    expect(screen.queryByText("此窗口暫無資料")).not.toBeInTheDocument();
  });

  it("勾选、全选与清除都交给页面处理（不含不可用测站）", () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole("checkbox", { name: /京士柏/ }));
    expect(props.onToggle).toHaveBeenCalledWith("KP");

    fireEvent.click(screen.getByRole("button", { name: /全選目前篩選結果/ }));
    expect(props.onSelectAll).toHaveBeenCalledWith(["HKO", "KP"]);

    fireEvent.click(screen.getByRole("button", { name: /清除選擇/ }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("筛选框按中文名或站号过滤，无结果时给出提示", () => {
    renderPicker();

    const filter = screen.getByLabelText("篩選測站名稱或代號");
    fireEvent.change(filter, { target: { value: "HKO" } });
    expect(screen.getByRole("checkbox", { name: /香港天文台/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /京士柏/ })).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: "VP1" } });
    expect(screen.getByTestId("stations-no-match")).toHaveTextContent("沒有符合篩選條件");
  });

  it("请求失败时显示错误并可重试", () => {
    const onRetry = vi.fn();
    renderPicker({ stations: undefined, error: new Error("boom"), onRetry });

    expect(screen.getByTestId("stations-error")).toHaveTextContent("連不上後端伺服器");
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
