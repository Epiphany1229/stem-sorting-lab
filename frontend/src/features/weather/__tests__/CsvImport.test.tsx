import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CsvImport } from "../CsvImport";
import { importResponse } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; payload?: unknown }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.payload,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderImport(onImported = vi.fn()) {
  render(
    <CsvImport onImported={onImported} />,
    { wrapper },
  );
  return onImported;
}

function csvFile(): File {
  return new File(["date,station,metric,value,flag\n2026-09-01,HKO,tmax,30.1,C\n"], "hko.csv", {
    type: "text/csv",
  });
}

describe("CSV 导入", () => {
  it("未选择文件时提示，不发请求", () => {
    const fetchMock = stubFetch({ ok: true, status: 200, payload: importResponse() });
    renderImport();

    fireEvent.submit(
      screen.getByTestId("import-submit").closest("form") as HTMLFormElement,
    );

    expect(screen.getByTestId("import-local-error")).toHaveTextContent("請先選擇一個 CSV 檔案");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("上传成功后展示逐行校验报告，并通知页面切换 mode=imported", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, payload: importResponse() });
    const onImported = renderImport();

    const input = screen.getByLabelText("選擇 CSV 檔案") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });
    fireEvent.submit(screen.getByTestId("import-submit").closest("form") as HTMLFormElement);

    const report = await screen.findByTestId("import-report");
    expect(report).toHaveTextContent("成功匯入 12 列");
    expect(report).toHaveTextContent("略過 2 列");
    expect(report).toHaveTextContent("官方原始 CSV");
    expect(report).toHaveTextContent("匯入完成");
    expect(screen.getByTestId("import-error-count")).toHaveTextContent("共 2 個錯誤");

    const errorsTable = screen.getByTestId("import-errors-table");
    expect(within(errorsTable).getByText("CSV 匯入錯誤明細的可存取資料表")).toBeInTheDocument();
    expect(within(errorsTable).getByText("unknown_station")).toBeInTheDocument();
    expect(within(errorsTable).getByText("共 2 列")).toBeInTheDocument();

    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledWith(importResponse());

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("/api/weather/import");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    // multipart 的 Content-Type 由浏览器补 boundary，前端不能手写。
    expect((init as RequestInit).headers).toEqual({ Accept: "application/json" });
  });

  it("后端失败时显示分类后的双语错误，不静默", async () => {
    stubFetch({ ok: false, status: 500 });
    renderImport();

    const input = screen.getByLabelText("選擇 CSV 檔案") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });
    fireEvent.submit(screen.getByTestId("import-submit").closest("form") as HTMLFormElement);

    const alert = await screen.findByTestId("import-error");
    expect(alert).toHaveTextContent("匯入失敗");
    expect(alert).toHaveTextContent("後端發生錯誤");
    expect(screen.queryByTestId("import-report")).not.toBeInTheDocument();
  });

  it("422 会被归类为参数错误", async () => {
    stubFetch({ ok: false, status: 422 });
    renderImport();

    const input = screen.getByLabelText("選擇 CSV 檔案") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });
    fireEvent.submit(screen.getByTestId("import-submit").closest("form") as HTMLFormElement);

    await waitFor(() =>
      expect(screen.getByTestId("import-error")).toHaveTextContent("查詢參數不符合規則"),
    );
  });
});
