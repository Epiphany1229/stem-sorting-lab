"""近期逐日气温补数：用 RYES 日报补齐最近窗口（阶段 5.1）。

背景（Lead 已实测，不要重复探测）：

- 官方逐日月表（CLMMAXT/CLMMINT）**按月发布**；2026-10 月表尚未发布（JSON/CSV
  都只有表头），因此月表无法提供 10 月的逐日温度。
- RYES 日报（``dataType=RYES&date=YYYYMMDD``）提供多站逐日最高/最低温，可用于
  补齐最近日期；``ReportTimeInfoDate`` 是资料所属日期，必须与请求日一致。

合规与口径：

- **1 请求/天**，逐日串行，全部走既有安全客户端（限速、预算、熔断、租约、审计）；
- 月表是更权威的最终版本：如果某站某指标某天已经有月表来源（source_document
  ``dataset_key ∈ CLMMAXT/CLMMINT/CLMTEMP``）的 official 行，**不覆盖**，只写 RYES
  缺失的日期（避免用后续可能修订的日报覆盖月表）；
- 幂等 upsert：同一 (station, metric, date, mode) 重复运行行数不增长；
- 不伪造 10 月月表数据：本模块只写 RYES 实际返回的值。
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    FetchRejected,
    HkoClient,
    HkoDataError,
    HkoFetchError,
)
from backend.app.data_sources.hko.registry import station_ids
from backend.app.data_sources.hko.ryes_temperature import (
    RYES_TEMPERATURE_DATASET_KEY,
    parse_ryes_temperature_payload,
)
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, SourceDocument
from backend.app.services.hko_ingest import (
    MAX_WINDOW_DAYS,
    METRIC_TO_DATATYPE,
    PendingRow,
    upsert_daily_rows,
)
from backend.app.services.weather_util import TEMPERATURE_METRICS

# 月表来源（更权威的最终版本）：这些 source_document 已有的行不被 RYES 覆盖
MONTHLY_DATASETS: frozenset[str] = frozenset(METRIC_TO_DATATYPE.values())


@dataclass
class RecentIngestSummary:
    """一次近期补数的汇总（CLI / 自动同步共用）。"""

    start: date
    end: date
    stations: tuple[str, ...]
    days_requested: int
    requests: int = 0
    days_written: int = 0
    rows_parsed: int = 0
    rows_written: int = 0
    skipped_days: int = 0
    date_mismatch: int = 0
    missing_only_days: int = 0
    monthly_authoritative_skipped: int = 0
    unmapped_key_count: int = 0
    name_mismatches: int = 0
    cache_hits: int = 0
    errors: list[str] = field(default_factory=list)
    written_dates: list[date] = field(default_factory=list)
    elapsed_seconds: float = 0.0

    def describe(self) -> str:
        """单行摘要（CLI 与自动同步日志共用）。"""
        return (
            f"請求 {self.requests} 次，寫入 {self.rows_written} 行 / {self.days_written} 天"
            f"（月表優先跳過 {self.monthly_authoritative_skipped} 行，"
            f"缺失/日期不符跳過 {self.skipped_days} 天，"
            f"未映射鍵 {self.unmapped_key_count} 個，快取命中 {self.cache_hits} 次）"
        )


def parse_recent_stations(raw: str, settings: Settings) -> tuple[str, ...]:
    """解析逗号分隔站号并按官方 39 站字典校验（去重、保序）。"""
    allowed = station_ids(settings)
    ordered: list[str] = []
    for part in raw.split(","):
        station_id = part.strip()
        if not station_id:
            continue
        if station_id not in allowed:
            raise ValueError(f"未知站号：{station_id}（合法站号见 stations.json）")
        if station_id not in ordered:
            ordered.append(station_id)
    if not ordered:
        raise ValueError("至少需要一个测站")
    return tuple(ordered)


def _monthly_authoritative_keys(
    database: Database,
    *,
    start: date,
    end: date,
    stations: Sequence[str],
    metrics: Sequence[str],
) -> set[tuple[str, str, date]]:
    """查询窗口内已有月表来源的 (station, metric, date) 集合。"""
    keys: set[tuple[str, str, date]] = set()
    with database.session() as session:
        statement = (
            select(DailyWeather.station_id, DailyWeather.metric, DailyWeather.obs_date)
            .join(SourceDocument, DailyWeather.source_document_id == SourceDocument.id)
            .where(
                DailyWeather.mode == "official",
                SourceDocument.dataset_key.in_(sorted(MONTHLY_DATASETS)),
                DailyWeather.obs_date >= start,
                DailyWeather.obs_date <= end,
                DailyWeather.station_id.in_(list(stations)),
                DailyWeather.metric.in_(list(metrics)),
            )
        )
        for row in session.execute(statement):
            station_id, metric, obs_date = row[0], row[1], row[2]
            keys.add((str(station_id), str(metric), obs_date))
    return keys


def _validate_request(
    settings: Settings,
    *,
    stations: Sequence[str],
    days: int,
) -> tuple[str, ...]:
    if days < 1 or days > MAX_WINDOW_DAYS:
        raise ValueError(f"days 必须在 1–{MAX_WINDOW_DAYS} 之间")
    allowed = station_ids(settings)
    ordered: list[str] = []
    for station_id in stations:
        if station_id not in allowed:
            raise ValueError(f"未知站号：{station_id}（合法站号见 stations.json）")
        if station_id not in ordered:
            ordered.append(station_id)
    if not ordered:
        raise ValueError("至少需要一个测站")
    return tuple(ordered)


async def ingest_recent_temperature(
    client: HkoClient,
    database: Database,
    settings: Settings,
    *,
    stations: Sequence[str],
    end: date,
    days: int,
    on_request: Callable[[str], None] | None = None,
) -> RecentIngestSummary:
    """逐日请求 RYES，把请求站点的 tmax/tmin 幂等补进 official 数据。"""
    station_tuple = _validate_request(settings, stations=stations, days=days)
    start = end - timedelta(days=days - 1)
    summary = RecentIngestSummary(
        start=start,
        end=end,
        stations=station_tuple,
        days_requested=days,
    )
    started = time.monotonic()
    monthly_keys = _monthly_authoritative_keys(
        database,
        start=start,
        end=end,
        stations=station_tuple,
        metrics=TEMPERATURE_METRICS,
    )
    requested_stations = set(station_tuple)
    for index, day in enumerate(
        (start + timedelta(days=offset) for offset in range(days)), start=1
    ):
        params = {
            "dataType": RYES_TEMPERATURE_DATASET_KEY,
            "lang": "en",
            "rformat": "json",
            "date": day.strftime("%Y%m%d"),
        }
        summary.requests += 1
        try:
            fetched = await client.get_json(
                settings.hko_opendata_url,
                params=params,
                dataset_key=RYES_TEMPERATURE_DATASET_KEY,
            )
        except FetchRejected:
            # 限速/预算/熔断/租约：必须整体停止，不再继续打官方接口。
            raise
        except (HkoFetchError, HkoDataError) as exc:
            summary.errors.append(f"{day.isoformat()}: {exc}")
            if on_request is not None:
                on_request(f"[{index}/{days}] {day.isoformat()} 失敗：{exc}")
            continue
        if fetched.cache_hit:
            summary.cache_hits += 1
        try:
            parsed = parse_ryes_temperature_payload(
                fetched.data, requested_date=day
            )
        except HkoDataError as exc:
            summary.errors.append(f"{day.isoformat()}: {exc}")
            if on_request is not None:
                on_request(f"[{index}/{days}] {day.isoformat()} 解析失敗：{exc}")
            continue
        summary.unmapped_key_count += len(parsed.unmapped_keys)
        summary.name_mismatches += len(parsed.name_mismatches)
        if parsed.skip_reason == "date_mismatch":
            summary.date_mismatch += 1
            summary.skipped_days += 1
            if on_request is not None:
                on_request(
                    f"[{index}/{days}] {day.isoformat()} 跳過：ReportTimeInfoDate 不符"
                )
            continue
        rows_parsed = [
            row for row in parsed.rows if row.station_id in requested_stations
        ]
        summary.rows_parsed += len(rows_parsed)
        if not rows_parsed:
            summary.missing_only_days += 1
            summary.skipped_days += 1
            if on_request is not None:
                on_request(f"[{index}/{days}] {day.isoformat()} 跳過：無可用溫度")
            continue
        fetched_at = utc_now_naive()
        pending: list[PendingRow] = []
        for row in rows_parsed:
            key = (row.station_id, row.metric, day)
            if key in monthly_keys:
                summary.monthly_authoritative_skipped += 1
                continue
            pending.append(
                PendingRow(
                    row=row,
                    source_document_id=fetched.source_document_id,
                    fetched_at=fetched_at,
                )
            )
        written = upsert_daily_rows(database, pending, mode="official")
        summary.rows_written += written
        if pending:
            summary.days_written += 1
            summary.written_dates.append(day)
        else:
            summary.skipped_days += 1
        if on_request is not None:
            on_request(
                f"[{index}/{days}] {day.isoformat()} 寫入 {written} 行"
                f"（月表優先 {len(rows_parsed) - len(pending)} 行）"
            )
    summary.elapsed_seconds = time.monotonic() - started
    return summary


__all__ = [
    "MONTHLY_DATASETS",
    "RecentIngestSummary",
    "ingest_recent_temperature",
    "parse_recent_stations",
]
