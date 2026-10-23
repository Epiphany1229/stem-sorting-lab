"""香港天文台逐日气温月表的解析、入库、窗口与覆盖率计算。

数据语义红线（见 ``.claude/skills/hko-safe-fetcher/SKILL.md``）：
- 逐日最高/最低/平均温只有月表接口；**当月返回 ``data: []``**（HTTP 仍 200），
  必须识别为"未发布"，不是错误、不是空成功；
- ``***``（无数据）行不入库；``#``（不完整）照常入库并保留质量标记；
- 数值保留官方原始字符串，``float`` 只作计算；
- 同日同站 ``tmax`` 必须 ≥ ``tmin``，违反时记质量问题但**不丢行**。
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Final

from sqlalchemy import func, select

from backend.app.core.logging import LogChannel, get_logger
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    FetchRejected,
    HkoClient,
    HkoDataError,
    HkoFetchError,
)
from backend.app.models.base import today_hk, utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, IngestionRun
from backend.app.services.weather_util import (
    QUALITY_COMPLETE,
    QUALITY_INCOMPLETE,
    QUALITY_UNAVAILABLE,
    TEMPERATURE_UNIT,
    parse_iso_date,
)

data_logger = get_logger(LogChannel.DATA)
validation_logger = get_logger(LogChannel.VALIDATION)

# 指标 → 官方 dataType（三者共用同一测站清单与响应结构）
METRIC_TO_DATATYPE: Final[dict[str, str]] = {
    "tmax": "CLMMAXT",
    "tmin": "CLMMINT",
    "tmean": "CLMTEMP",
}
# 官方 dataType → 指标
DATATYPE_TO_METRIC: Final[dict[str, str]] = {
    datatype: metric for metric, datatype in METRIC_TO_DATATYPE.items()
}
# 默认窗口天数与最大可查询天数（防止一次拉取过大区间）
DEFAULT_WINDOW_DAYS: Final = 30
MAX_WINDOW_DAYS: Final = 366
# 官方数值格式：允许负号与小数，禁止科学计数法（保精度）
_VALUE_PATTERN: Final = re.compile(r"^[+-]?\d+(?:\.\d+)?$")


class HkoPayloadError(Exception):
    """官方响应结构符合 HTTP 但不是预期的月表 JSON。"""


class WindowParameterError(Exception):
    """查询窗口参数非法（起止缺失、起晚于止、区间过大）。"""


@dataclass(frozen=True)
class ParsedDailyRow:
    """一行逐日观测（官方原始字符串 + 数值 + 质量标记）。"""

    station_id: str
    metric: str
    obs_date: date
    value_raw: str
    value: float
    unit: str
    quality_flag: str


@dataclass(frozen=True)
class ParseIssue:
    """解析时发现的问题行（跳过并记原因）。"""

    line: int
    reason: str
    detail: str


@dataclass
class MonthlyParseResult:
    """一次月表响应的解析结果。"""

    station_id: str
    metric: str
    dataset_key: str
    published: bool
    rows: list[ParsedDailyRow] = field(default_factory=list)
    issues: list[ParseIssue] = field(default_factory=list)
    missing_count: int = 0
    reason: str | None = None


@dataclass(frozen=True)
class PairingIssue:
    """同日同站 tmax < tmin 的质量问题（不丢行，只记录）。"""

    station_id: str
    obs_date: date
    tmax_raw: str
    tmin_raw: str

    def describe(self) -> str:
        return (
            f"{self.station_id} {self.obs_date.isoformat()} "
            f"tmax={self.tmax_raw} < tmin={self.tmin_raw}"
        )


@dataclass(frozen=True)
class PendingRow:
    """待写入的一行：原始行 + 来源凭据 + 抓取时间。"""

    row: ParsedDailyRow
    source_document_id: int | None
    fetched_at: datetime


@dataclass
class IngestSummary:
    """一次入库运行的汇总。"""

    requests: int = 0
    rows_parsed: int = 0
    upserted: int = 0
    skipped: int = 0
    cache_hits: int = 0
    published_datasets: int = 0
    not_published: list[str] = field(default_factory=list)
    quality_issues: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0
    ingestion_run_id: int | None = None


def _coerce_int_text(raw: object) -> int | None:
    """把官方 JSON 里的年/月/日（字符串或数字）转成 int。"""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if text.isdigit():
            return int(text)
    return None


def _split_row(raw_row: object) -> tuple[object, object, object, object, object] | None:
    """把一行数据拆成前 5 列；结构不符返回 None。"""
    if not isinstance(raw_row, list) or len(raw_row) < 5:
        return None
    return raw_row[0], raw_row[1], raw_row[2], raw_row[3], raw_row[4]


def parse_monthly_payload(
    payload: object,
    *,
    station_id: str,
    metric: str,
    requested_year: int | None = None,
) -> MonthlyParseResult:
    """解析 ``opendata.php?rformat=json`` 的月表响应。

    ``data: []`` 返回 ``published=False``（未发布），不抛异常。
    """
    dataset_key = METRIC_TO_DATATYPE.get(metric)
    if dataset_key is None:
        raise HkoPayloadError(f"未知指标：{metric}")
    if not isinstance(payload, dict):
        raise HkoPayloadError("官方响应不是 JSON 对象")
    data = payload.get("data")
    if data is None:
        raise HkoPayloadError("官方响应缺少 data 字段")
    if not isinstance(data, list):
        raise HkoPayloadError("官方响应 data 不是数组")
    fields = payload.get("fields")
    if fields is not None and not isinstance(fields, list):
        raise HkoPayloadError("官方响应 fields 不是数组")

    result = MonthlyParseResult(
        station_id=station_id,
        metric=metric,
        dataset_key=dataset_key,
        published=bool(data),
        reason=None if data else "not_published",
    )
    if not data:
        data_logger.info("%s/%s 返回空数组（当月月表未发布）", station_id, dataset_key)
        return result

    for index, raw_row in enumerate(data):
        line_no = index + 1
        columns = _split_row(raw_row)
        if columns is None:
            result.issues.append(
                ParseIssue(line=line_no, reason="invalid_row", detail="数据行不足 5 列")
            )
            continue
        year_raw, month_raw, day_raw, value_raw, flag_raw = columns
        year = _coerce_int_text(year_raw)
        month = _coerce_int_text(month_raw)
        day = _coerce_int_text(day_raw)
        if year is None or month is None or day is None:
            result.issues.append(
                ParseIssue(
                    line=line_no,
                    reason="invalid_date",
                    detail=f"无法解析日期：{year_raw!r}-{month_raw!r}-{day_raw!r}",
                )
            )
            continue
        try:
            obs_date = date(year, month, day)
        except ValueError:
            result.issues.append(
                ParseIssue(
                    line=line_no,
                    reason="invalid_date",
                    detail=f"日期不存在：{year}-{month}-{day}",
                )
            )
            continue
        if requested_year is not None and obs_date.year != requested_year:
            result.issues.append(
                ParseIssue(
                    line=line_no,
                    reason="year_mismatch",
                    detail=f"请求 {requested_year} 年却返回 {obs_date.year} 年",
                )
            )
        flag = "" if flag_raw is None else str(flag_raw).strip()
        if flag == QUALITY_UNAVAILABLE:
            # *** 代表"无数据"：不入库，只计入缺失
            result.missing_count += 1
            continue
        if flag not in {QUALITY_COMPLETE, QUALITY_INCOMPLETE}:
            result.issues.append(
                ParseIssue(
                    line=line_no,
                    reason="unknown_quality_flag",
                    detail=f"未知质量标记：{flag!r}",
                )
            )
            continue
        raw_value = "" if value_raw is None else str(value_raw).strip()
        if not _VALUE_PATTERN.match(raw_value):
            result.issues.append(
                ParseIssue(
                    line=line_no,
                    reason="invalid_value",
                    detail=f"数值无法解析：{raw_value!r}",
                )
            )
            continue
        result.rows.append(
            ParsedDailyRow(
                station_id=station_id,
                metric=metric,
                obs_date=obs_date,
                value_raw=raw_value,
                value=float(raw_value),
                unit=TEMPERATURE_UNIT,
                quality_flag=flag,
            )
        )

    data_logger.info(
        "%s/%s 解析完成：%d 行有效，%d 行缺失，%d 行问题",
        station_id,
        dataset_key,
        len(result.rows),
        result.missing_count,
        len(result.issues),
    )
    return result


def find_pairing_issues(rows: Sequence[ParsedDailyRow]) -> list[PairingIssue]:
    """检查同日同站 ``tmax < tmin``；只报告问题，不丢弃数据。"""
    grouped: dict[tuple[str, date], dict[str, ParsedDailyRow]] = {}
    for row in rows:
        if row.metric not in {"tmax", "tmin"}:
            continue
        grouped.setdefault((row.station_id, row.obs_date), {})[row.metric] = row
    issues: list[PairingIssue] = []
    for (station_id, obs_date), metrics in sorted(grouped.items()):
        tmax = metrics.get("tmax")
        tmin = metrics.get("tmin")
        if tmax is not None and tmin is not None and tmax.value < tmin.value:
            issues.append(
                PairingIssue(
                    station_id=station_id,
                    obs_date=obs_date,
                    tmax_raw=tmax.value_raw,
                    tmin_raw=tmin.value_raw,
                )
            )
    return issues


def upsert_daily_rows(
    database: Database,
    pending: Sequence[PendingRow],
    *,
    mode: str,
) -> int:
    """幂等 upsert：同 (station, metric, date, mode) 覆盖，行数不增长。"""
    written = 0
    if not pending:
        return written
    with database.session() as session:
        for item in pending:
            row = item.row
            statement = select(DailyWeather).where(
                DailyWeather.station_id == row.station_id,
                DailyWeather.metric == row.metric,
                DailyWeather.obs_date == row.obs_date,
                DailyWeather.mode == mode,
            )
            existing = session.execute(statement).scalar_one_or_none()
            if existing is None:
                session.add(
                    DailyWeather(
                        station_id=row.station_id,
                        metric=row.metric,
                        obs_date=row.obs_date,
                        value_raw=row.value_raw,
                        value=row.value,
                        unit=row.unit,
                        quality_flag=row.quality_flag,
                        source_document_id=item.source_document_id,
                        fetched_at=item.fetched_at,
                        mode=mode,
                    )
                )
            else:
                existing.value_raw = row.value_raw
                existing.value = row.value
                existing.unit = row.unit
                existing.quality_flag = row.quality_flag
                existing.source_document_id = item.source_document_id
                existing.fetched_at = item.fetched_at
            written += 1
    return written


def _start_run(database: Database) -> int:
    """创建一次 ingestion_run 记录并返回主键。"""
    with database.session() as session:
        run = IngestionRun(
            started_at=utc_now_naive(),
            status="running",
            requests=0,
            upserts=0,
            skipped=0,
            message=None,
        )
        session.add(run)
        session.flush()
        return run.id


def _finish_run(database: Database, run_id: int, summary: IngestSummary) -> None:
    """回填 ingestion_run 的结果与统计。"""
    status = "ok"
    if summary.errors:
        status = "partial" if summary.upserted else "failed"
    message = (
        f"requests={summary.requests}; upserts={summary.upserted}; "
        f"skipped={summary.skipped}; cache_hits={summary.cache_hits}; "
        f"issues={len(summary.quality_issues)}"
    )
    if summary.errors:
        message += f"; last_error={summary.errors[-1][:300]}"
    with database.session() as session:
        run = session.get(IngestionRun, run_id)
        if run is None:  # pragma: no cover - 正常流程不会发生
            return
        run.finished_at = utc_now_naive()
        run.status = status
        run.requests = summary.requests
        run.upserts = summary.upserted
        run.skipped = summary.skipped
        run.message = message


async def ingest_year(
    client: HkoClient,
    database: Database,
    settings: Settings,
    *,
    stations: Sequence[str],
    metrics: Sequence[str],
    year: int,
    mode: str = "official",
    on_request: Callable[[str], None] | None = None,
) -> IngestSummary:
    """抓取指定站 × 指标 × 年份并幂等入库（省略 month 一次取整年）。

    ``on_request`` 可选进度回调：每完成一个上游请求调用一次，用于 CLI 打印摘要。
    """
    started = time.monotonic()
    summary = IngestSummary(ingestion_run_id=_start_run(database))
    request_index = 0
    try:
        for station_id in stations:
            pending: list[PendingRow] = []
            for metric in metrics:
                dataset_key = METRIC_TO_DATATYPE[metric]
                params = {
                    "dataType": dataset_key,
                    "lang": "en",
                    "rformat": "json",
                    "station": station_id,
                    "year": str(year),
                }
                request_started = time.monotonic()
                try:
                    fetched = await client.get_json(
                        settings.hko_opendata_url,
                        params=params,
                        dataset_key=dataset_key,
                    )
                except (FetchRejected, HkoFetchError, HkoDataError) as exc:
                    summary.errors.append(f"{station_id}/{dataset_key}: {exc}")
                    raise
                request_elapsed_ms = (time.monotonic() - request_started) * 1000.0
                request_index += 1
                summary.requests += 1
                if fetched.cache_hit:
                    summary.cache_hits += 1
                parsed = parse_monthly_payload(
                    fetched.data,
                    station_id=station_id,
                    metric=metric,
                    requested_year=year,
                )
                summary.rows_parsed += len(parsed.rows)
                summary.skipped += parsed.missing_count + len(parsed.issues)
                if parsed.published:
                    summary.published_datasets += 1
                else:
                    summary.not_published.append(f"{station_id}/{dataset_key}")
                if on_request is not None:
                    on_request(
                        f"[{request_index}] {station_id}/{dataset_key} "
                        f"HTTP {fetched.http_status} 行數={len(parsed.rows)} "
                        f"缺失={parsed.missing_count} 問題={len(parsed.issues)} "
                        f"快取命中={fetched.cache_hit} 耗時={request_elapsed_ms:.0f}ms"
                    )
                for issue in parsed.issues:
                    validation_logger.warning(
                        "%s/%s 第 %d 行被跳过：%s（%s）",
                        station_id,
                        dataset_key,
                        issue.line,
                        issue.reason,
                        issue.detail,
                    )
                pending.extend(
                    PendingRow(
                        row=row,
                        source_document_id=fetched.source_document_id,
                        fetched_at=fetched.fetched_at,
                    )
                    for row in parsed.rows
                )
            pairing_issues = find_pairing_issues([item.row for item in pending])
            for pairing_issue in pairing_issues:
                summary.quality_issues.append(pairing_issue.describe())
                validation_logger.warning(
                    "质量问题（最高温 < 最低温）：%s", pairing_issue.describe()
                )
            summary.upserted += upsert_daily_rows(database, pending, mode=mode)
    finally:
        summary.elapsed_seconds = time.monotonic() - started
        run_id = summary.ingestion_run_id
        if run_id is not None:
            _finish_run(database, run_id, summary)
    return summary


# ---------------------------------------------------------------------------- 窗口


@dataclass(frozen=True)
class WindowRange:
    """查询窗口：真实起止日期、锚点与请求天数。"""

    start: date
    end: date
    anchor: date
    requested_days: int


def default_window_anchor(database: Database, *, mode: str = "official") -> date | None:
    """返回库内某模式下"最后可用日"（各站各指标最大值）。"""
    with database.session() as session:
        statement = select(func.max(DailyWeather.obs_date)).where(DailyWeather.mode == mode)
        value = session.execute(statement).scalar()
        return value if isinstance(value, date) else None


def has_any_data(database: Database, *, mode: str = "official") -> bool:
    """库内某模式下是否存在任何逐日数据。"""
    with database.session() as session:
        statement = (
            select(DailyWeather.id).where(DailyWeather.mode == mode).limit(1)
        )
        return session.execute(statement).first() is not None


def resolve_window(
    *,
    start: date | None,
    end: date | None,
    anchor: date | None,
    today: date | None = None,
) -> WindowRange:
    """解析查询窗口：显式起止优先，否则以锚点回推最近 30 天（含锚点）。"""
    if (start is None) != (end is None):
        raise WindowParameterError("start 与 end 必须同时提供")
    if start is not None and end is not None:
        if start > end:
            raise WindowParameterError("start 不能晚于 end")
        requested = (end - start).days + 1
        if requested > MAX_WINDOW_DAYS:
            raise WindowParameterError(f"查询区间不能超过 {MAX_WINDOW_DAYS} 天")
        effective_anchor = anchor if anchor is not None and start <= anchor <= end else end
        return WindowRange(
            start=start,
            end=end,
            anchor=effective_anchor,
            requested_days=requested,
        )
    today_value = today if today is not None else today_hk()
    ending = anchor if anchor is not None else today_value - timedelta(days=1)
    starting = ending - timedelta(days=DEFAULT_WINDOW_DAYS - 1)
    return WindowRange(
        start=starting,
        end=ending,
        anchor=ending,
        requested_days=DEFAULT_WINDOW_DAYS,
    )


def parse_window_dates(
    start_text: str | None,
    end_text: str | None,
) -> tuple[date | None, date | None]:
    """把查询参数里的日期字符串转成 date；非法值抛出 ``WindowParameterError``。"""
    start = parse_iso_date(start_text)
    end = parse_iso_date(end_text)
    if start_text is not None and start is None:
        raise WindowParameterError(f"start 不是合法日期：{start_text}")
    if end_text is not None and end is None:
        raise WindowParameterError(f"end 不是合法日期：{end_text}")
    return start, end


# ---------------------------------------------------------------------------- 查询


def query_daily_records(
    database: Database,
    *,
    start: date,
    end: date,
    stations: Sequence[str],
    metrics: Sequence[str],
    mode: str,
) -> list[ParsedDailyRow]:
    """按窗口/站点/指标/模式查询逐日记录（按日期、站号、指标排序）。"""
    if not stations or not metrics:
        return []
    with database.session() as session:
        statement = (
            select(DailyWeather)
            .where(
                DailyWeather.obs_date >= start,
                DailyWeather.obs_date <= end,
                DailyWeather.mode == mode,
                DailyWeather.station_id.in_(list(stations)),
                DailyWeather.metric.in_(list(metrics)),
            )
            .order_by(
                DailyWeather.obs_date,
                DailyWeather.station_id,
                DailyWeather.metric,
            )
        )
        rows = session.execute(statement).scalars().all()
        return [
            ParsedDailyRow(
                station_id=row.station_id,
                metric=row.metric,
                obs_date=row.obs_date,
                value_raw=row.value_raw,
                value=row.value,
                unit=row.unit,
                quality_flag=row.quality_flag,
            )
            for row in rows
        ]


@dataclass(frozen=True)
class StationCoverage:
    """某站某指标在窗口内的覆盖明细。"""

    station_id: str
    metric: str
    days_with_data: int
    first_date: date | None
    last_date: date | None
    missing_dates: list[date]
    incomplete_dates: list[date]


@dataclass(frozen=True)
class CoverageSummary:
    """窗口覆盖率汇总。"""

    days_with_data: int
    days_missing: int
    last_available_date: date | None
    per_station: list[StationCoverage]


def compute_coverage(
    records: Sequence[ParsedDailyRow],
    *,
    start: date,
    end: date,
    stations: Sequence[str],
    metrics: Sequence[str],
) -> CoverageSummary:
    """计算真实覆盖：有数据天数、缺口日期、不完整日期与最后可用日。"""
    requested_days = (end - start).days + 1
    window_dates = [start + timedelta(days=offset) for offset in range(requested_days)]
    by_scope: dict[tuple[str, str], dict[date, str]] = {}
    for record in records:
        by_scope.setdefault((record.station_id, record.metric), {})[record.obs_date] = (
            record.quality_flag
        )
    per_station: list[StationCoverage] = []
    for station_id in stations:
        for metric in metrics:
            observed = by_scope.get((station_id, metric), {})
            observed_dates = sorted(observed)
            per_station.append(
                StationCoverage(
                    station_id=station_id,
                    metric=metric,
                    days_with_data=len(observed_dates),
                    first_date=observed_dates[0] if observed_dates else None,
                    last_date=observed_dates[-1] if observed_dates else None,
                    missing_dates=[day for day in window_dates if day not in observed],
                    incomplete_dates=[
                        day
                        for day in observed_dates
                        if observed[day] == QUALITY_INCOMPLETE
                    ],
                )
            )
    all_dates = {record.obs_date for record in records}
    return CoverageSummary(
        days_with_data=len(all_dates),
        days_missing=max(0, requested_days - len(all_dates)),
        last_available_date=max(all_dates) if all_dates else None,
        per_station=per_station,
    )


@dataclass(frozen=True)
class TemperatureBin:
    """温度区间统计的一档。"""

    index: int
    lower: float
    upper: float
    days: int


@dataclass(frozen=True)
class TemperatureSummary:
    """温度区间统计结果。"""

    bins: list[TemperatureBin]
    valid_days: int
    missing_days: int


def summarize_temperature(
    records: Sequence[ParsedDailyRow],
    *,
    bin_count: int,
    requested_days: int,
) -> TemperatureSummary:
    """把有效观测值等分成 ``bin_count`` 个区间并统计天数。

    说明：这是**教学口径**的等分区间，不是官方气候统计标准；调用方必须把
    ``threshold_note`` 双语说明传给前端。
    """
    values = sorted(record.value for record in records)
    if not values:
        return TemperatureSummary(bins=[], valid_days=0, missing_days=requested_days)
    if bin_count < 1:
        raise WindowParameterError("bins 必须 ≥ 1")
    lowest = values[0]
    highest = values[-1]
    if lowest == highest:
        bins = [TemperatureBin(index=0, lower=lowest, upper=highest, days=len(values))]
        return TemperatureSummary(
            bins=bins,
            valid_days=len(values),
            missing_days=max(0, requested_days - len(values)),
        )
    width = (highest - lowest) / bin_count
    counts = [0] * bin_count
    for value in values:
        if value >= highest:
            index = bin_count - 1
        else:
            index = int((value - lowest) / width)
            index = min(max(index, 0), bin_count - 1)
        counts[index] += 1
    bins = []
    for index in range(bin_count):
        lower = round(lowest + width * index, 2)
        upper = round(highest if index == bin_count - 1 else lowest + width * (index + 1), 2)
        bins.append(TemperatureBin(index=index, lower=lower, upper=upper, days=counts[index]))
    return TemperatureSummary(
        bins=bins,
        valid_days=len(values),
        missing_days=max(0, requested_days - len(values)),
    )
