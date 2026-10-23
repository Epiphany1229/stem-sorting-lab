"""RYES 官方日雨量回填（阶段 4 可选能力，仅 HKO 一站、每请求一天）。

接口实测（见 ``docs/weather-sort-design.md`` §0）::

    https://data.weather.gov.hk/weatherAPI/opendata/opendata.php
        ?dataType=RYES&lang=en&rformat=json&date=YYYYMMDD

返回**平铺 JSON**，日雨量在 ``HKOReadingsRainfall``（单位 mm）。
官方没有逐时/多站的历史雨量接口，因此本模块只做**按需回填**，不做常驻采集：

- 1 请求 / 天，串行走既有安全客户端（限速、预算、熔断、租约、fetch_event 全部复用）；
- 只允许 ``station=HKO``（官方 RYES 只提供天文台总部一站）；
- ``Trace``（雨量 < 0.05mm）是官方的独立特殊值，**不写 0**：本模块会跳过该日并
  明确记录为 ``trace_not_stored``，绝不伪造数值。
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient, HkoDataError
from backend.app.models.base import utc_now_naive
from backend.app.models.db import Database
from backend.app.services.hko_ingest import (
    MAX_WINDOW_DAYS,
    ParsedDailyRow,
    PendingRow,
    upsert_daily_rows,
)
from backend.app.services.weather_util import QUALITY_COMPLETE

# RYES 只提供天文台总部（HKO）一站的日雨量
RYES_STATION_ID = "HKO"
# 数据集键（写入 source_document）
RYES_DATASET_KEY = "RYES"
# 数据库中的指标名与单位
RAINFALL_METRIC = "rainfall"
RAINFALL_UNIT = "mm"
# 官方"微量"特殊值（Trace = rainfall less than 0.05 mm），必须独立标记、不得记 0
TRACE_TOKENS: frozenset[str] = frozenset({"trace"})
# 缺失标记
MISSING_TOKENS: frozenset[str] = frozenset({"***", "", "na", "n/a", "-"})


class RyesParseError(HkoDataError):
    """RYES 响应结构不符合预期。"""


@dataclass(frozen=True)
class RyesDay:
    """单日 RYES 解析结果。

    实测语义（2026-10-23 复核）：``ReportTimeInfoDate`` 是**资料所属日期**，
    ``BulletinDate``/``BulletinTime`` 是**发布时刻**（通常在次日 00:15）。
    因此校验以 ``ReportTimeInfoDate`` 为准；没有该字段时退回用 ``BulletinDate``。
    """

    requested_date: date
    bulletin_date: date | None
    report_date: date | None
    rainfall_raw: str | None
    rainfall_value: float | None
    quality_flag: str | None
    # 跳过原因：trace_not_stored / no_rainfall_field / missing_value / date_mismatch
    skip_reason: str | None = None


def _parse_date_text(raw: object) -> date | None:
    """解析官方日期文本：支持 YYYYMMDD、YYYY-MM-DD 与 YYYY/MM/DD。"""
    if isinstance(raw, date):
        return raw
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    candidates = [text]
    if len(text) == 8 and text.isdigit():
        candidates = [f"{text[:4]}-{text[4:6]}-{text[6:]}"]
    if "/" in text:
        candidates.append(text.replace("/", "-"))
    for candidate in candidates:
        try:
            return date.fromisoformat(candidate)
        except ValueError:
            continue
    return None


def _parse_bulletin_date(raw: object) -> date | None:
    """解析 ``BulletinDate``（发布日）。"""
    return _parse_date_text(raw)


def _format_numeric_raw(value: object) -> str | None:
    """把 JSON 里的数值转成原始字符串（不重新舍入、不编造精度）。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        return value.strip()
    return None


def parse_ryes_payload(payload: object, *, requested_date: date) -> RyesDay:
    """解析一天 RYES JSON；缺雨量字段或微量时返回带 ``skip_reason`` 的结果。"""
    if not isinstance(payload, dict):
        raise RyesParseError("RYES 响应不是 JSON 对象")
    bulletin = _parse_bulletin_date(payload.get("BulletinDate"))
    report = _parse_date_text(payload.get("ReportTimeInfoDate"))
    data_date = report if report is not None else bulletin
    if data_date is not None and data_date != requested_date:
        return RyesDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            rainfall_raw=None,
            rainfall_value=None,
            quality_flag=None,
            skip_reason="date_mismatch",
        )
    if "HKOReadingsRainfall" not in payload:
        return RyesDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            rainfall_raw=None,
            rainfall_value=None,
            quality_flag=None,
            skip_reason="no_rainfall_field",
        )
    raw = _format_numeric_raw(payload.get("HKOReadingsRainfall"))
    if raw is None:
        return RyesDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            rainfall_raw=None,
            rainfall_value=None,
            quality_flag=None,
            skip_reason="missing_value",
        )
    lowered = raw.casefold()
    if lowered in TRACE_TOKENS:
        return RyesDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            rainfall_raw=raw,
            rainfall_value=None,
            quality_flag="trace",
            skip_reason="trace_not_stored",
        )
    if lowered in MISSING_TOKENS:
        return RyesDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            rainfall_raw=raw,
            rainfall_value=None,
            quality_flag=None,
            skip_reason="missing_value",
        )
    try:
        numeric = float(raw)
    except ValueError as exc:
        raise RyesParseError(f"日雨量数值无法解析：{raw!r}") from exc
    return RyesDay(
        requested_date=requested_date,
        bulletin_date=bulletin,
        report_date=report,
        rainfall_raw=raw,
        rainfall_value=numeric,
        quality_flag=QUALITY_COMPLETE,
    )


@dataclass
class RainfallIngestSummary:
    """一次日雨量回填的汇总。"""

    requests: int = 0
    written: int = 0
    trace_skipped: int = 0
    missing_skipped: int = 0
    date_mismatch: int = 0
    errors: list[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0
    written_dates: list[date] = field(default_factory=list)


def _iter_days(start: date, end: date) -> list[date]:
    requested_days = (end - start).days + 1
    return [start + timedelta(days=offset) for offset in range(requested_days)]


async def ingest_rainfall_range(
    client: HkoClient,
    database: Database,
    settings: Settings,
    *,
    start: date,
    end: date,
    station: str = RYES_STATION_ID,
    on_request: Callable[[str], None] | None = None,
) -> RainfallIngestSummary:
    """按天回填 RYES 日雨量（1 请求/天），只写 ``metric='rainfall'`` 的 HKO 数据。"""
    if station != RYES_STATION_ID:
        raise ValueError(f"RYES 只提供 {RYES_STATION_ID} 的日雨量，不支持站点：{station}")
    if start > end:
        raise ValueError("start 不能晚于 end")
    if (end - start).days + 1 > MAX_WINDOW_DAYS:
        raise ValueError(f"回填区间不能超过 {MAX_WINDOW_DAYS} 天")

    started = time.monotonic()
    summary = RainfallIngestSummary()
    for index, day in enumerate(_iter_days(start, end), start=1):
        params = {
            "dataType": RYES_DATASET_KEY,
            "lang": "en",
            "rformat": "json",
            "date": day.strftime("%Y%m%d"),
        }
        fetched = await client.get_json(
            settings.hko_opendata_url,
            params=params,
            dataset_key=RYES_DATASET_KEY,
        )
        summary.requests += 1
        parsed = parse_ryes_payload(fetched.data, requested_date=day)
        if parsed.skip_reason is not None or parsed.rainfall_value is None:
            reason = parsed.skip_reason or "missing_value"
            if reason == "trace_not_stored":
                summary.trace_skipped += 1
            elif reason == "date_mismatch":
                summary.date_mismatch += 1
            else:
                summary.missing_skipped += 1
            if on_request is not None:
                on_request(f"[{index}] {day.isoformat()} 跳過：{reason}")
            continue
        written = upsert_daily_rows(
            database,
            [
                PendingRow(
                    row=ParsedDailyRow(
                        station_id=RYES_STATION_ID,
                        metric=RAINFALL_METRIC,
                        obs_date=day,
                        value_raw=parsed.rainfall_raw or "",
                        value=parsed.rainfall_value,
                        unit=RAINFALL_UNIT,
                        quality_flag=parsed.quality_flag or QUALITY_COMPLETE,
                    ),
                    source_document_id=fetched.source_document_id,
                    fetched_at=utc_now_naive(),
                )
            ],
            mode="official",
        )
        summary.written += written
        summary.written_dates.append(day)
        if on_request is not None:
            on_request(f"[{index}] {day.isoformat()} 寫入 {parsed.rainfall_raw} mm")
    summary.elapsed_seconds = time.monotonic() - started
    return summary


__all__: Sequence[str] = [
    "RAINFALL_METRIC",
    "RAINFALL_UNIT",
    "RYES_DATASET_KEY",
    "RYES_STATION_ID",
    "RainfallIngestSummary",
    "RyesDay",
    "RyesParseError",
    "ingest_rainfall_range",
    "parse_ryes_payload",
]
