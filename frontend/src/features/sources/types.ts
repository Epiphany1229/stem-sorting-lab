/**
 * /sources 页面使用的数据状态类型（对应后端 GET /api/sources）。
 *
 * `by_outcome` 保留在类型里以便调试，但界面不展示原始错误计数。
 */
export interface SourceRecord {
  readonly dataset: string;
  readonly endpoint: string;
  readonly fetched_at: string;
  readonly last_modified?: string | null;
  readonly mode?: string;
}

export interface RequestStats {
  readonly total: number;
  readonly today: number;
  readonly budget: number;
  readonly budget_remaining: number;
  readonly by_outcome?: Readonly<Record<string, number>>;
}

export interface SourcesStatus {
  readonly mode: string;
  readonly notice: string | null;
  readonly reason: string | null;
  readonly sources: readonly SourceRecord[];
  readonly licenses: readonly string[];
  readonly circuit_open: boolean;
  readonly circuit_open_until: string | null;
  readonly request_stats: RequestStats;
  readonly last_success_at: string | null;
}
