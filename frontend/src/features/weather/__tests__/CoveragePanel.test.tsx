import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../api/client";
import { CoveragePanel } from "../CoveragePanel";
import { STATIONS, coverageResponse } from "./fixtures";

describe("覆盖率面板", () => {
  it("显示真实窗口、有效/缺失天数、最后可用日与各站明细", () => {
    render(
      <CoveragePanel
        coverage={coverageResponse()}
        stations={STATIONS}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("2026-09-01 至 2026-09-05，共 5 天")).toBeInTheDocument();

    // 4 = 有效天数，1 = 缺失天数；明细表里也会出现同样的数字，因此用 AllBy。
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-09-05").length).toBeGreaterThan(0);

    const coverageTable = screen.getByTestId("coverage-table");
    expect(
      within(coverageTable).getByText("各測站與指標覆蓋率的可存取資料表"),
    ).toBeInTheDocument();
    expect(within(coverageTable).getByText("共 2 列")).toBeInTheDocument();
    expect(within(coverageTable).getByText("香港天文台")).toBeInTheDocument();

    const sources = screen.getByTestId("coverage-sources");
    expect(within(sources).getByText("CLMMAXT")).toBeInTheDocument();
  });

  it("零有效天数时显示空数据说明；有 reason 时显示双语原因 + 原始代码", () => {
    render(
      <CoveragePanel
        coverage={coverageResponse({
          reason: "not_published",
          coverage: { days_with_data: 0, days_missing: 5, last_available_date: null },
        })}
        stations={STATIONS}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByTestId("coverage-none")).toBeInTheDocument();
    const reason = screen.getByTestId("coverage-reason");
    expect(reason).toHaveTextContent("官方當月月表尚未發布");
    expect(reason).toHaveTextContent("not_published");
  });

  it("加载中显示 loading；请求失败显示分类错误并可重试", () => {
    const onRetry = vi.fn();
    const { unmount } = render(
      <CoveragePanel
        coverage={undefined}
        stations={STATIONS}
        loading
        error={null}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("coverage-loading")).toBeInTheDocument();
    unmount();

    render(
      <CoveragePanel
        coverage={undefined}
        stations={STATIONS}
        loading={false}
        error={new ApiError("boom", 500)}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("coverage-error")).toHaveTextContent("後端發生錯誤");
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
