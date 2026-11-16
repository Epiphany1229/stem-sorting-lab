import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourcesPage from "./SourcesPage";
import { dictionary } from "../i18n/dictionary";

const SIMPLIFIED_ONLY_CHARS =
  "这个为说时间发开关页导览标题状态钮图数据气温湿风预计划级验证盖范围测权来并启动画准确实练习单击键盘简体译户标签悬学们会东车书长门见现点听声语质问无电话让对应员设欢访网连载删闭显处线进运过还边内两写读词认识压缩张传输频视觉种类总结构术请谢试询错复杂简";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function sourceRecord(index: number) {
  const datasets = ["CLMMAXT", "CLMMINT", "CLMTEMP", "RYES", "CLMMAXT", "CLMMINT"];
  return {
    dataset: datasets[index] ?? `DS${index}`,
    endpoint: `https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=${datasets[index] ?? "X"}&station=HKO&i=${index}`,
    fetched_at: `2026-11-1${index}T07:17:55Z`,
    last_modified: null,
    mode: "official",
  };
}

/** 6 个数据集用于验证默认折叠 5 行。 */
function successPayload() {
  return {
    mode: "official",
    notice: null,
    reason: null,
    sources: Array.from({ length: 6 }, (_, index) => sourceRecord(index)),
    licenses: [
      "香港天文台非商業使用條款：須承認知識產權與復現免責聲明 / HKO non-commercial terms: acknowledge IP ownership and reproduce the disclaimer",
      "DATA.GOV.HK 使用條款：須標明來源並鳴謝政府 / data.gov.hk terms: identify the source and acknowledge the Government",
    ],
    circuit_open: false,
    circuit_open_until: null,
    request_stats: {
      total: 1318,
      today: 35,
      budget: 500,
      budget_remaining: 465,
      by_outcome: { ok: 471, transport_error: 840, timeout: 1 },
    },
    last_success_at: "2026-11-16T07:17:55Z",
  };
}

function stubFetch(payload: unknown | Error) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/sources")) {
      if (payload instanceof Error) {
        throw payload;
      }
      return jsonResponse(payload);
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/sources"]}>
      <QueryClientProvider client={client}>
        <SourcesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("/sources 資料來源與方法說明", () => {
  it("渲染完整章節、品質標記表與核對日期", () => {
    stubFetch(successPayload());
    renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "資料來源與方法說明",
    );

    for (const heading of [
      "官方來源",
      "資料方法與限速",
      "最近 30 天窗口口徑",
      "已知限制",
      "許可與署名",
      "資料狀態",
      "相關連結",
    ]) {
      expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0);
    }

    // 品質標記表：caption + C/#/*** 三種含義。
    const quality = screen.getByTestId("sources-quality-table");
    expect(within(quality).getByText("官方月表的品質標記（data Completeness）")).toBeInTheDocument();
    expect(within(quality).getByText("C")).toBeInTheDocument();
    expect(within(quality).getByText("#")).toBeInTheDocument();
    expect(within(quality).getByText("***")).toBeInTheDocument();
    const qualityText = quality.textContent ?? "";
    expect(qualityText).toContain("C：資料完整");
    expect(qualityText).toContain("#：資料不完整");
    expect(qualityText).toContain("***：沒有資料");

    // 核對日期。
    expect(screen.getByTestId("sources-verified")).toHaveTextContent("2026-11-16");
  });

  it("相關連結使用官方網址，並以新視窗安全開啟", () => {
    stubFetch(successPayload());
    renderPage();

    const links = screen.getAllByRole("link");
    const hko = links.find((link) => link.getAttribute("href") === "https://www.hko.gov.hk/");
    const dataGov = links.find((link) => link.getAttribute("href") === "https://data.gov.hk/");
    const pdf = links.find((link) =>
      link
        .getAttribute("href")
        ?.includes("HKO_Open_Data_API_Documentation.pdf"),
    );

    for (const link of [hko, dataGov, pdf]) {
      expect(link).toBeDefined();
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("成功加载时显示香港时间的同步时间、预算、服务状态与数据集表（默认 5 行）", async () => {
    stubFetch(successPayload());
    renderPage();

    const lastSuccess = await screen.findByTestId("sources-last-success");
    // 2026-11-16T07:17:55Z → 香港时间 15:17。
    expect(lastSuccess).toHaveTextContent(/2026/);
    expect(lastSuccess).toHaveTextContent(/15:17/);

    expect(screen.getByTestId("sources-request-budget")).toHaveTextContent("35 / 500");
    expect(screen.getByTestId("sources-remaining-budget")).toHaveTextContent("465");
    expect(screen.getByTestId("sources-service-status")).toHaveTextContent("正常");
    expect(screen.getByTestId("sources-mode")).toHaveTextContent("官方資料");

    // 不把 by_outcome 的原始错误计数堆给初学者。
    expect(screen.queryByText(/transport_error/)).toBeNull();
    expect(screen.queryByText("840")).toBeNull();

    const table = screen.getByTestId("sources-datasets");
    expect(within(table).getByText("資料集")).toBeInTheDocument();
    expect(within(table).getByText("接口主機")).toBeInTheDocument();
    expect(within(table).getByText("抓取時間（香港時間）")).toBeInTheDocument();
    expect(within(table).getAllByText("data.weather.gov.hk").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("CLMMAXT").length).toBeGreaterThan(0);

    // 默认折叠 5 行：表头 1 + 数据 5。
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    const toggle = within(table).getByTestId("sources-datasets-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
  });

  it("许可摘要优先来自 API，并拆成繁中在上、英文在下", async () => {
    stubFetch(successPayload());
    renderPage();

    const licenses = await screen.findByTestId("sources-licenses");
    const first = within(licenses).getByTestId("sources-license-0");
    expect(first).toHaveTextContent("香港天文台非商業使用條款");
    expect(first).toHaveTextContent("HKO non-commercial terms");
    // 免责声明始终显示。
    expect(screen.getByText(/免責聲明：本網站是教學專案/)).toBeInTheDocument();
  });

  it("API 许可为空时回退到静态双语许可文本", async () => {
    stubFetch({ ...successPayload(), licenses: [] });
    renderPage();

    const staticLicenses = await screen.findByTestId("sources-licenses-static");
    expect(staticLicenses).toHaveTextContent("香港天文台非商業使用條款");
    expect(staticLicenses).toHaveTextContent("data.gov.hk 使用條款");
  });

  it("失败时显示双语错误与重试，同时保留全部静态说明", async () => {
    const fetchMock = stubFetch(new TypeError("Failed to fetch"));
    renderPage();

    const error = await screen.findByTestId("sources-status-error");
    expect(error).toHaveTextContent("連不上後端伺服器");
    expect(error).toHaveTextContent("Could not reach the backend server");
    expect(error).toHaveTextContent("以下靜態來源與方法說明仍然有效");
    expect(screen.queryByTestId("sources-datasets")).toBeNull();

    // 静态说明不因动态失败而消失。
    expect(screen.getByRole("heading", { name: "已知限制" })).toBeInTheDocument();
    expect(screen.getByTestId("sources-quality-table")).toBeInTheDocument();

    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByTestId("sources-status-retry"));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("响应格式不符合契约时显示格式错误提示", async () => {
    stubFetch({ nonsense: true });
    renderPage();

    const error = await screen.findByTestId("sources-status-error");
    expect(error).toHaveTextContent("格式不符合預期");
    // 静态内容仍在。
    expect(screen.getByRole("heading", { name: "官方來源" })).toBeInTheDocument();
  });
});

describe("/sources 新增字典键", () => {
  const entries = Object.entries(dictionary).filter(([key]) => key.startsWith("sources."));

  it("全部是繁体中文 + 英文成对且非空", () => {
    expect(entries.length).toBeGreaterThan(45);
    for (const [key, value] of entries) {
      expect(value["zh-Hant"].trim().length, `${key} 缺少繁中`).toBeGreaterThan(0);
      expect(value.en.trim().length, `${key} 缺少英文`).toBeGreaterThan(0);
    }
  });

  it("繁体中文不含简体字", () => {
    const offenders: string[] = [];
    for (const [key, value] of entries) {
      for (const char of SIMPLIFIED_ONLY_CHARS) {
        if (value["zh-Hant"].includes(char)) {
          offenders.push(`${key} 含有简体字「${char}」`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("旧骨架键已清理", () => {
    const keys = entries.map(([key]) => key);
    expect(keys).not.toContain("sources.notice");
    expect(keys).not.toContain("sources.pending");
    expect(keys.filter((key) => key.startsWith("sources.planned."))).toEqual([]);
  });
});
