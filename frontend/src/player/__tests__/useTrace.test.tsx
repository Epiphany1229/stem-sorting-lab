import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyTraceError, fetchTrace, traceErrorKey, useTrace } from "../useTrace";
import { TraceProtocolError } from "../traceValidation";
import { traceFixture } from "./traceFixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface StubResponseInit {
  readonly ok: boolean;
  readonly status: number;
  readonly payload?: unknown;
}

function stubFetch(response: StubResponseInit | Error) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (response instanceof Error) {
      throw response;
    }
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.payload,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useTrace 数据层", () => {
  it("POST 到后端端点，并把契约响应原样交给界面", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, payload: traceFixture });

    const { result } = renderHook(
      () => useTrace({ values: [5, 3, 8, 1], direction: "asc", earlyExit: false }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.events).toHaveLength(14);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toBe("/api/algorithms/bubble/trace");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      values: [5, 3, 8, 1],
      direction: "asc",
      options: { early_exit: false },
    });
  });

  it("后端连不上时报告 network 错误，并提供双语错误文案 key", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    const { result } = renderHook(
      () => useTrace({ values: [5, 3, 8, 1], direction: "asc", earlyExit: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(classifyTraceError(result.current.error)).toBe("network");
    expect(traceErrorKey(result.current.error)).toBe("trace.error.network");
  });

  it("422 会区分成 invalidInput，其他状态码归为 server", async () => {
    stubFetch({ ok: false, status: 422 });
    const invalidInput = renderHook(
      () => useTrace({ values: [5, 3], direction: "asc", earlyExit: true }),
      { wrapper },
    );
    await waitFor(() => expect(invalidInput.result.current.isError).toBe(true));
    expect(classifyTraceError(invalidInput.result.current.error)).toBe("invalidInput");
    expect(traceErrorKey(invalidInput.result.current.error)).toBe("trace.error.invalidInput");
    invalidInput.unmount();

    stubFetch({ ok: false, status: 500 });
    const serverError = renderHook(
      () => useTrace({ values: [5, 3], direction: "asc", earlyExit: true }),
      { wrapper },
    );
    await waitFor(() => expect(serverError.result.current.isError).toBe(true));
    expect(classifyTraceError(serverError.result.current.error)).toBe("server");
  });

  it("不合契约的响应会被拒绝，而不是渲染半份轨迹", async () => {
    stubFetch({
      ok: true,
      status: 200,
      payload: { ...traceFixture, events: [{ ...traceFixture.events[0], code_line_ids: ["L999"] }] },
    });

    await expect(
      fetchTrace({ values: [5, 3, 8, 1], direction: "asc", options: { early_exit: false } }),
    ).rejects.toBeInstanceOf(TraceProtocolError);
  });

  it("compare 事件缺少 comparison 时抛协议错误", async () => {
    const compareEvent = traceFixture.events[1];
    if (!compareEvent.auxiliary_state.comparison) {
      throw new Error("fixture 的 compare 事件缺少 comparison");
    }
    const brokenEvent = {
      ...compareEvent,
      auxiliary_state: {
        pass_index: 0,
        early_exit_enabled: false,
        swapped_in_pass: false,
      },
    };

    stubFetch({
      ok: true,
      status: 200,
      payload: { ...traceFixture, events: [traceFixture.events[0], brokenEvent] },
    });

    await expect(
      fetchTrace({ values: [5, 3, 8, 1], direction: "asc", options: { early_exit: false } }),
    ).rejects.toBeInstanceOf(TraceProtocolError);
  });
});
