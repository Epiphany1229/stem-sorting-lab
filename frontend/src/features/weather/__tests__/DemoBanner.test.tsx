import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoBanner } from "../DemoBanner";
import { SOURCES } from "./fixtures";

describe("非官方数据横幅", () => {
  it("demo 模式必须常驻显示示範資料、notice、来源与抓取时间", () => {
    render(<DemoBanner mode="demo" notice="示範資料：官方快照" sources={SOURCES} />);

    const banner = screen.getByTestId("demo-banner");
    expect(banner).toHaveAttribute("data-mode", "demo");
    expect(screen.getByText("示範資料")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByTestId("demo-banner-notice")).toHaveTextContent("示範資料：官方快照");
    expect(banner).toHaveTextContent("CLMMAXT");
    expect(banner).toHaveTextContent("2026-10-23 20:00 HKT");
  });

  it("imported 模式显示匯入資料", () => {
    render(<DemoBanner mode="imported" notice="匯入資料：使用者 CSV" />);

    expect(screen.getByTestId("demo-banner")).toHaveAttribute("data-mode", "imported");
    expect(screen.getByText("匯入資料")).toBeInTheDocument();
    expect(screen.getByText("Imported data")).toBeInTheDocument();
  });

  it("official 模式不显示横幅", () => {
    const { container } = render(<DemoBanner mode="official" notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
