import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StationPicker } from "../StationPicker";
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
  it("显示中英文名、起始年、可用天数，并标注不可用测站", () => {
    renderPicker();

    expect(screen.getByText("已選 1 / 3 站")).toBeInTheDocument();
    expect(screen.getByText("資料起始年 1884")).toBeInTheDocument();
    expect(screen.getByText("可用 5 天")).toBeInTheDocument();
    // VP1 在窗口内没有资料，必须明确标注。
    expect(screen.getByText("此窗口暫無資料")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /香港天文台/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /山頂/ })).not.toBeChecked();
  });

  it("勾选、全选与清除都交给页面处理", () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole("checkbox", { name: /京士柏/ }));
    expect(props.onToggle).toHaveBeenCalledWith("KP");

    fireEvent.click(screen.getByRole("button", { name: /全選目前篩選結果/ }));
    expect(props.onSelectAll).toHaveBeenCalledWith(["HKO", "KP", "VP1"]);

    fireEvent.click(screen.getByRole("button", { name: /清除選擇/ }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("筛选框按中文名或站号过滤", () => {
    renderPicker();

    const filter = screen.getByLabelText("篩選測站名稱或代號");
    fireEvent.change(filter, { target: { value: "VP1" } });

    expect(screen.getByRole("checkbox", { name: /山頂/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /香港天文台/ })).not.toBeInTheDocument();
  });

  it("请求失败时显示错误并可重试", () => {
    const onRetry = vi.fn();
    renderPicker({ stations: undefined, error: new Error("boom"), onRetry });

    expect(screen.getByTestId("stations-error")).toHaveTextContent("連不上後端伺服器");
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
