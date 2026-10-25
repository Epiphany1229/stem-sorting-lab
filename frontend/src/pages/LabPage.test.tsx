import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import LabPage from "./LabPage";
import { traceFixture } from "../player/__tests__/traceFixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLabPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/lab"]}>
        <LabPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubSuccessfulTrace() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => traceFixture,
  }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LabPage 后端接入", () => {
  it("只把输入参数提交给后端，并用返回的轨迹渲染播放器", async () => {
    const fetchMock = stubSuccessfulTrace();
    renderLabPage();

    // 等待第一次（随机数列）请求完成，确认页面出现加载态或播放器都来自后端结果。
    await screen.findByTestId("trace-player");

    // 使用自定义数列，确认请求体与输入一致。
    fireEvent.change(screen.getByLabelText(/自訂數列/), {
      target: { value: "5, 3, 8, 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "套用數列" }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      const body = JSON.parse(String(lastCall[1]?.body)) as unknown;
      expect(body).toEqual({
        values: [5, 3, 8, 1],
        direction: "asc",
        options: { early_exit: true },
      });
    });

    await screen.findByTestId("trace-player");
    expect(screen.getAllByTestId("bar")).toHaveLength(4);
    expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 0 / 14 步");
  });

  it("输入不合法时显示双语错误，且不会发出请求", async () => {
    const fetchMock = stubSuccessfulTrace();
    renderLabPage();
    await screen.findByTestId("trace-player");
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText(/自訂數列/), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "套用數列" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("只能用整數");
    expect(alert).toHaveTextContent("Only integers are allowed");
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("后端不可用时显示明确的错误提示，绝不显示假动画", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderLabPage();

    const errorPanel = await screen.findByTestId("trace-error");
    expect(errorPanel).toHaveTextContent("無法載入排序軌跡");
    expect(errorPanel).toHaveTextContent("連不上後端伺服器");
    expect(screen.queryByTestId("trace-player")).toBeNull();
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
  });

  it("不再有引导模式开关，比较互动改为代码面板下方的内联区", async () => {
    stubSuccessfulTrace();
    renderLabPage();
    await screen.findByTestId("trace-player");

    // 阶段 4.7：弹窗式引导模式已删除，统一使用内联比较区。
    expect(screen.queryByTestId("mode-hint")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "引導模式" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("prediction-dialog")).not.toBeInTheDocument();

    const inline = screen.getByTestId("inline-compare");
    expect(inline).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("inline-compare-idle")).toBeInTheDocument();

    // 手动步进到 compare 事件：内联区出题，答题后仍可继续推进。
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("這兩個數需要交換嗎？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "需要" }));
    expect(screen.getByTestId("inline-compare-feedback")).toHaveTextContent("答對了");
    expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 2 /");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByTestId("step-progress")).toHaveTextContent("已播放 3 /");
  });
});
