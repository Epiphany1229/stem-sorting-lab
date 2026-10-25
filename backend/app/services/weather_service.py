"""天气 API 的业务编排层：窗口解析、模式数据读取、覆盖率、汇总与刷新。

模式红线（见设计文档 §6）：
- ``official`` 无数据时**不得**回退演示数据，必须返回空数据 + ``reason``；
- ``demo`` 只读 ``sample_data/demo`` 下的官方快照，不写数据库，``notice`` 非空；
- ``imported`` 读 ``daily_weather`` 中 ``mode='imported'`` 的行，与 official 分开。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from backend.app.core.logging import LogChannel, get_logger
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    FetchRejected,
    FetchRejectReason,
    HkoClient,
    HkoDataError,
    HkoFetchError,
    get_budget_remaining,
    get_circuit_open_until,
    get_last_refresh_at,
    get_last_success_at,
    is_circuit_open,
    record_refresh_accepted,
)
from backend.app.data_sources.hko.registry import load_station_registry
from backend.app.models.base import to_utc_iso, today_hk
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather, FetchEvent, SourceDocument
from backend.app.schemas.weather import (
    CoverageInfo,
    CoverageResponse,
    DailyResponse,
    DailyRow,
    ImportResponse,
    ModeCode,
    PerStationCoverage,
    ReasonCode,
    RefreshRequest,
    RefreshResponse,
    RequestStats,
    SourceInfo,
    SourcesResponse,
    StationInfo,
    StationsResponse,
    SummaryBin,
    SummaryResponse,
    ThresholdNote,
    WindowInfo,
)
from backend.app.services.hko_ingest import (
    CoverageSummary,
    HkoPayloadError,
    ParsedDailyRow,
    WindowRange,
    compute_coverage,
    default_window_anchor,
    has_any_data,
    ingest_year,
    parse_window_dates,
    query_daily_records,
    resolve_window,
    summarize_temperature,
)
from backend.app.services.weather_import import (
    IMPORTED_NOTICE,
    apply_import,
    demo_date_range,
    demo_notice,
    demo_source,
    export_csv_text,
    load_demo_records,
    parse_import_csv,
)
from backend.app.services.weather_util import (
    TEMPERATURE_METRICS,
    TEMPERATURE_UNIT,
)

validation_logger = get_logger(LogChannel.VALIDATION)

# 刷新时可接受的客户端工厂（测试注入 MockTransport 客户端）
ClientFactory = Callable[[], HkoClient]

# 教学口径的区间说明：必须声明"非官方标准"
THRESHOLD_NOTE = ThresholdNote(
    zh_hant="區間由教學程式依實際觀測值範圍等分，非官方氣候統計標準",
    en="Bins are computed by the teaching app from the observed range; not an official standard",
)
# 刷新默认站点（库内无数据时）
DEFAULT_REFRESH_STATIONS: tuple[str, ...] = ("HKO",)
# 许可证义务提示（HKO 非商业使用条件 + data.gov.hk 使用条款）
LICENSES: tuple[str, ...] = (
    "香港天文台（Hong Kong Observatory）非商業用途使用條件：須註明知識產權擁有者、"
    "復現免責聲明，並不得聲稱獲天文台認可 / HKO non-commercial terms: acknowledge HKO "
    "as IP owner, reproduce the disclaimer, and do not imply endorsement",
    "DATA.GOV.HK 使用條款：須清楚標明資料來源並鳴謝政府及相關機構 / data.gov.hk terms: "
    "clearly identify the data source and acknowledge the Government and relevant organisations",
)


class SelectionError(Exception):
    """站点/指标选择参数非法。"""


@dataclass
class ModeData:
    """某模式下的窗口数据、来源与原因码。"""

    records: list[ParsedDailyRow]
    notice: str | None
    sources: list[SourceInfo]
    reason: ReasonCode | None


# ------------------------------------------------------------------ 选择参数解析


def _split_csv(raw: str | None) -> list[str]:
    if raw is None:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _dedupe(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def parse_station_selection(raw: str | None, settings: Settings) -> list[str]:
    """解析 ``stations=HKO,KP``；省略时返回全部 39 站。"""
    all_ids = [record.id for record in load_station_registry(settings)]
    requested = _split_csv(raw)
    if not requested:
        return all_ids
    allowed = set(all_ids)
    unknown = [station_id for station_id in requested if station_id not in allowed]
    if unknown:
        raise SelectionError(f"未知站号：{', '.join(unknown)}")
    return _dedupe(requested)


def parse_metric_selection(raw: str | None) -> list[str]:
    """解析 ``metrics=tmax,tmin``；省略时返回全部温度指标。"""
    requested = _split_csv(raw)
    if not requested:
        return list(TEMPERATURE_METRICS)
    allowed = set(TEMPERATURE_METRICS)
    unknown = [metric for metric in requested if metric not in allowed]
    if unknown:
        raise SelectionError(f"未知指标：{', '.join(unknown)}")
    return _dedupe(requested)


def ensure_station(station_id: str, settings: Settings) -> str:
    """校验单个站号（summary 接口用）。"""
    allowed = {record.id for record in load_station_registry(settings)}
    if station_id not in allowed:
        raise SelectionError(f"未知站号：{station_id}")
    return station_id


def ensure_metric(metric: str) -> str:
    """校验单个指标（summary 接口用）。"""
    if metric not in TEMPERATURE_METRICS:
        raise SelectionError(f"未知指标：{metric}")
    return metric


# ------------------------------------------------------------------ 窗口与覆盖


def build_window(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start: date | None,
    end: date | None,
) -> WindowRange:
    """按模式确定窗口锚点（official/imported 取库内最后可用日，demo 取样本末日）。"""
    if mode == "demo":
        _, demo_last = demo_date_range(settings)
        anchor = demo_last
    else:
        anchor = default_window_anchor(database, mode=mode)
    return resolve_window(start=start, end=end, anchor=anchor)


def build_window_from_query(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start_text: str | None,
    end_text: str | None,
) -> WindowRange:
    """从查询字符串解析起止日期并构造窗口。"""
    start, end = parse_window_dates(start_text, end_text)
    return build_window(database, settings, mode=mode, start=start, end=end)


def _window_info(window: WindowRange) -> WindowInfo:
    return WindowInfo(
        start=window.start,
        end=window.end,
        anchor=window.anchor,
        requested_days=window.requested_days,
    )


def _coverage_info(summary: CoverageSummary) -> CoverageInfo:
    return CoverageInfo(
        days_with_data=summary.days_with_data,
        days_missing=summary.days_missing,
        last_available_date=summary.last_available_date,
        per_station=[
            PerStationCoverage(
                station_id=item.station_id,
                metric=item.metric,
                days_with_data=item.days_with_data,
                first_date=item.first_date,
                last_date=item.last_date,
                missing_dates=item.missing_dates,
                incomplete_dates=item.incomplete_dates,
            )
            for item in summary.per_station
        ],
    )


# ------------------------------------------------------------------ 来源


def build_official_sources(database: Database) -> list[SourceInfo]:
    """每个数据集取最近一次成功抓取的来源凭据。"""
    with database.session() as session:
        statement = (
            select(SourceDocument)
            .order_by(SourceDocument.retrieved_at.desc(), SourceDocument.id.desc())
            .limit(400)
        )
        documents = session.execute(statement).scalars().all()
    latest: dict[str, SourceInfo] = {}
    for document in documents:
        if document.dataset_key in latest:
            continue
        latest[document.dataset_key] = SourceInfo(
            dataset=document.dataset_key,
            endpoint=document.endpoint,
            fetched_at=to_utc_iso(document.retrieved_at),
            last_modified=document.last_modified,
            mode="official",
        )
    return sorted(latest.values(), key=lambda item: item.dataset)


def build_imported_sources(database: Database) -> list[SourceInfo]:
    """导入模式的来源说明（没有官方抓取凭据）。"""
    with database.session() as session:
        statement = select(func.max(DailyWeather.fetched_at)).where(
            DailyWeather.mode == "imported"
        )
        latest = session.execute(statement).scalar()
    fetched_at = to_utc_iso(latest) if isinstance(latest, datetime) else None
    return [
        SourceInfo(
            dataset="CSV_IMPORT",
            endpoint="user_upload",
            fetched_at=fetched_at,
            last_modified=None,
            mode="imported",
        )
    ]


# ------------------------------------------------------------------ 模式数据


def resolve_reason(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    records: Sequence[ParsedDailyRow],
    has_data: bool,
) -> ReasonCode | None:
    """无数据时给出可理解的原因码；有数据返回 None。"""
    if records:
        return None
    if mode == "demo":
        if not settings.demo_mode_enabled:
            return "disabled"
        return "station_out_of_range" if has_data else "no_cache"
    if mode == "imported":
        return "station_out_of_range" if has_data else "no_cache"
    if not settings.external_fetch_enabled:
        return "disabled"
    if is_circuit_open(database):
        return "circuit_open"
    if get_budget_remaining(settings, database) <= 0:
        return "budget_exhausted"
    return "station_out_of_range" if has_data else "no_cache"


def load_mode_data(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    window: WindowRange,
    stations: Sequence[str],
    metrics: Sequence[str],
) -> ModeData:
    """按模式读取窗口内的逐日数据、来源与原因码。"""
    if mode == "demo":
        if not settings.demo_mode_enabled:
            return ModeData(
                records=[],
                notice=demo_notice(settings),
                sources=[demo_source(settings)],
                reason="disabled",
            )
        all_demo = load_demo_records(
            settings,
            start=window.start,
            end=window.end,
            stations=stations,
            metrics=metrics,
        )
        has_data = bool(demo_date_range(settings)[1])
        return ModeData(
            records=all_demo,
            notice=demo_notice(settings),
            sources=[demo_source(settings)],
            reason=resolve_reason(
                database, settings, mode=mode, records=all_demo, has_data=has_data
            ),
        )
    if mode == "imported":
        imported = query_daily_records(
            database,
            start=window.start,
            end=window.end,
            stations=stations,
            metrics=metrics,
            mode="imported",
        )
        return ModeData(
            records=imported,
            notice=IMPORTED_NOTICE,
            sources=build_imported_sources(database),
            reason=resolve_reason(
                database,
                settings,
                mode=mode,
                records=imported,
                has_data=has_any_data(database, mode="imported"),
            ),
        )
    official = query_daily_records(
        database,
        start=window.start,
        end=window.end,
        stations=stations,
        metrics=metrics,
        mode="official",
    )
    return ModeData(
        records=official,
        notice=None,
        sources=build_official_sources(database),
        reason=resolve_reason(
            database,
            settings,
            mode=mode,
            records=official,
            has_data=has_any_data(database, mode="official"),
        ),
    )


# ------------------------------------------------------------------ 各接口组装


def build_stations_response(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
) -> StationsResponse:
    """39 站 + 各站可用天数/起止日/指标，按模式统计。"""
    if mode == "demo":
        if settings.demo_mode_enabled:
            demo_records = load_demo_records(
                settings,
                start=date.min,
                end=date.max,
                stations=[record.id for record in load_station_registry(settings)],
                metrics=list(TEMPERATURE_METRICS),
            )
        else:
            demo_records = []
        aggregates = _aggregate_records(demo_records)
        notice: str | None = demo_notice(settings)
        sources = [demo_source(settings)]
        reason: ReasonCode | None = None if settings.demo_mode_enabled else "disabled"
    elif mode == "imported":
        aggregates = _aggregate_db(database, mode="imported")
        notice = IMPORTED_NOTICE
        sources = build_imported_sources(database)
        reason = (
            None if has_any_data(database, mode="imported") else "no_cache"
        )
    else:
        aggregates = _aggregate_db(database, mode="official")
        notice = None
        sources = build_official_sources(database)
        reason = None
        if not has_any_data(database, mode="official"):
            if not settings.external_fetch_enabled:
                reason = "disabled"
            elif is_circuit_open(database):
                reason = "circuit_open"
            elif get_budget_remaining(settings, database) <= 0:
                reason = "budget_exhausted"
            else:
                reason = "no_cache"
    stations = []
    for record in load_station_registry(settings):
        info = aggregates.get(record.id)
        stations.append(
            StationInfo(
                id=record.id,
                name_en=record.name_en,
                name_zh_hant=record.name_zh_hant,
                start_year=record.start_year,
                available_days=0 if info is None else info[0],
                first_date=None if info is None else info[1],
                last_date=None if info is None else info[2],
                metrics=[] if info is None else info[3],
            )
        )
    return StationsResponse(
        mode=mode,
        notice=notice,
        reason=reason,
        stations=stations,
        sources=sources,
    )


def _aggregate_records(
    records: Sequence[ParsedDailyRow],
) -> dict[str, tuple[int, date | None, date | None, list[str]]]:
    """内存聚合：站号 → (可用天数, 首日, 末日, 指标列表)。"""
    by_station: dict[str, list[ParsedDailyRow]] = {}
    for record in records:
        by_station.setdefault(record.station_id, []).append(record)
    result: dict[str, tuple[int, date | None, date | None, list[str]]] = {}
    for station_id, station_records in by_station.items():
        dates = sorted({record.obs_date for record in station_records})
        metrics = sorted({record.metric for record in station_records})
        result[station_id] = (len(dates), dates[0], dates[-1], metrics)
    return result


def _aggregate_db(
    database: Database,
    *,
    mode: str,
) -> dict[str, tuple[int, date | None, date | None, list[str]]]:
    """数据库聚合：逐站统计可用天数/首末日/指标列表。"""
    with database.session() as session:
        date_statement = (
            select(
                DailyWeather.station_id,
                func.min(DailyWeather.obs_date),
                func.max(DailyWeather.obs_date),
                func.count(func.distinct(DailyWeather.obs_date)),
            )
            .where(DailyWeather.mode == mode)
            # 只按 API 支持的指标统计，避免 RYES rainfall 行把 available_days 与首末日带偏
            .where(DailyWeather.metric.in_(TEMPERATURE_METRICS))
            .group_by(DailyWeather.station_id)
        )
        metric_statement = (
            select(DailyWeather.station_id, DailyWeather.metric)
            .where(DailyWeather.mode == mode)
            .where(DailyWeather.metric.in_(TEMPERATURE_METRICS))
            .distinct()
        )
        date_rows = session.execute(date_statement).all()
        metric_rows = session.execute(metric_statement).all()
    metrics_by_station: dict[str, set[str]] = {}
    for station_id, metric in metric_rows:
        # 只暴露当前 API 支持的指标：数据库里可能还会有 RYES 回填的 rainfall 等非温度指标，
        # 但阶段 3 的查询接口只认 tmax/tmin/tmean，透传给前端会破坏契约校验。
        if str(metric) not in TEMPERATURE_METRICS:
            continue
        metrics_by_station.setdefault(str(station_id), set()).add(str(metric))
    result: dict[str, tuple[int, date | None, date | None, list[str]]] = {}
    for station_id, first_date, last_date, count in date_rows:
        key = str(station_id)
        result[key] = (
            int(count),
            first_date if isinstance(first_date, date) else None,
            last_date if isinstance(last_date, date) else None,
            sorted(metrics_by_station.get(key, set())),
        )
    return result


def build_coverage_response(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start_text: str | None,
    end_text: str | None,
    stations_raw: str | None,
    metrics_raw: str | None,
) -> CoverageResponse:
    """GET /api/weather/coverage 的响应。"""
    stations = parse_station_selection(stations_raw, settings)
    metrics = parse_metric_selection(metrics_raw)
    window = build_window_from_query(
        database, settings, mode=mode, start_text=start_text, end_text=end_text
    )
    mode_data = load_mode_data(
        database,
        settings,
        mode=mode,
        window=window,
        stations=stations,
        metrics=metrics,
    )
    coverage = compute_coverage(
        mode_data.records,
        start=window.start,
        end=window.end,
        stations=stations,
        metrics=metrics,
    )
    return CoverageResponse(
        mode=mode,
        notice=mode_data.notice,
        window=_window_info(window),
        coverage=_coverage_info(coverage),
        reason=mode_data.reason,
        sources=mode_data.sources,
    )


def build_daily_response(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start_text: str | None,
    end_text: str | None,
    stations_raw: str | None,
    metrics_raw: str | None,
) -> DailyResponse:
    """GET /api/weather/daily 的响应（含 precision_policy=raw_string）。"""
    stations = parse_station_selection(stations_raw, settings)
    metrics = parse_metric_selection(metrics_raw)
    window = build_window_from_query(
        database, settings, mode=mode, start_text=start_text, end_text=end_text
    )
    mode_data = load_mode_data(
        database,
        settings,
        mode=mode,
        window=window,
        stations=stations,
        metrics=metrics,
    )
    coverage = compute_coverage(
        mode_data.records,
        start=window.start,
        end=window.end,
        stations=stations,
        metrics=metrics,
    )
    return DailyResponse(
        mode=mode,
        notice=mode_data.notice,
        window=_window_info(window),
        coverage=_coverage_info(coverage),
        reason=mode_data.reason,
        precision_policy="raw_string",
        data=[
            DailyRow(
                obs_date=record.obs_date,
                station_id=record.station_id,
                metric=record.metric,
                value_raw=record.value_raw,
                value=record.value,
                unit=record.unit,
                quality_flag=record.quality_flag,
            )
            for record in mode_data.records
        ],
        sources=mode_data.sources,
    )


def _format_degrees(value: float) -> str:
    return f"{value:g}"


def build_summary_response(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start_text: str | None,
    end_text: str | None,
    station_id: str,
    metric: str,
    bin_count: int,
) -> SummaryResponse:
    """GET /api/weather/summary 的响应：温度区间天数统计。"""
    ensure_station(station_id, settings)
    ensure_metric(metric)
    window = build_window_from_query(
        database, settings, mode=mode, start_text=start_text, end_text=end_text
    )
    mode_data = load_mode_data(
        database,
        settings,
        mode=mode,
        window=window,
        stations=[station_id],
        metrics=[metric],
    )
    coverage = compute_coverage(
        mode_data.records,
        start=window.start,
        end=window.end,
        stations=[station_id],
        metrics=[metric],
    )
    summary = summarize_temperature(
        mode_data.records,
        bin_count=bin_count,
        requested_days=window.requested_days,
    )
    bins = [
        SummaryBin(
            index=item.index,
            lower=item.lower,
            upper=item.upper,
            label_zh_hant=f"{_format_degrees(item.lower)}–{_format_degrees(item.upper)}{TEMPERATURE_UNIT}",
            label_en=f"{_format_degrees(item.lower)}–{_format_degrees(item.upper)}{TEMPERATURE_UNIT}",
            days=item.days,
        )
        for item in summary.bins
    ]
    return SummaryResponse(
        mode=mode,
        notice=mode_data.notice,
        window=_window_info(window),
        coverage=_coverage_info(coverage),
        reason=mode_data.reason,
        station_id=station_id,
        metric=metric,
        bins=bins,
        valid_days=summary.valid_days,
        missing_days=summary.missing_days,
        threshold_note=THRESHOLD_NOTE,
        sources=mode_data.sources,
    )


def build_export_csv(
    database: Database,
    settings: Settings,
    *,
    mode: ModeCode,
    start_text: str | None,
    end_text: str | None,
    stations_raw: str | None,
    metrics_raw: str | None,
) -> str:
    """GET /api/weather/export.csv 的文本内容（规范 6 列）。"""
    stations = parse_station_selection(stations_raw, settings)
    metrics = parse_metric_selection(metrics_raw)
    window = build_window_from_query(
        database, settings, mode=mode, start_text=start_text, end_text=end_text
    )
    mode_data = load_mode_data(
        database,
        settings,
        mode=mode,
        window=window,
        stations=stations,
        metrics=metrics,
    )
    return export_csv_text(mode_data.records)


def import_csv(
    database: Database,
    settings: Settings,
    *,
    content: bytes,
) -> ImportResponse:
    """POST /api/weather/import：解析校验后以 imported 模式幂等入库。"""
    parsed = parse_import_csv(content, settings)
    accepted = apply_import(database, parsed.rows) if parsed.rows else 0
    return ImportResponse(
        accepted_rows=accepted,
        skipped_rows=len(parsed.skipped),
        errors=parsed.errors,
        detected_format=parsed.detected_format,
        skipped=parsed.skipped,
    )


# ------------------------------------------------------------------ 刷新


def _stations_with_official_data(database: Database) -> list[str]:
    with database.session() as session:
        statement = (
            select(DailyWeather.station_id)
            .where(DailyWeather.mode == "official")
            .distinct()
            .order_by(DailyWeather.station_id)
        )
        return [str(value) for value in session.execute(statement).scalars().all()]


def _refresh_years(database: Database, payload: RefreshRequest) -> list[int]:
    """刷新年份：显式指定优先，否则当前年（必要时补库内锚点年）。"""
    if payload.year is not None:
        return [payload.year]
    current = today_hk().year
    years = [current]
    anchor = default_window_anchor(database, mode="official")
    if anchor is not None and anchor.year != current:
        years.append(anchor.year)
    return years


def _rejection_reason(reason: FetchRejectReason) -> str:
    """把客户端拒绝原因映射为刷新接口的原因字符串。"""
    if reason is FetchRejectReason.DISABLED:
        return "disabled"
    if reason is FetchRejectReason.CIRCUIT_OPEN:
        return "circuit_open"
    if reason is FetchRejectReason.BUDGET_EXHAUSTED:
        return "budget_exhausted"
    # 主机挂起 / 租约被他人持有：本质是"暂时不能抓取"，按冷却处理
    return "cooldown"


def _refresh_targets(
    database: Database,
    settings: Settings,
    payload: RefreshRequest,
) -> tuple[list[str], list[str]]:
    if payload.stations:
        stations = [
            ensure_station(station_id, settings) for station_id in _dedupe(payload.stations)
        ]
    else:
        existing = _stations_with_official_data(database)
        stations = existing if existing else list(DEFAULT_REFRESH_STATIONS)
    if payload.metrics:
        metrics = [ensure_metric(metric) for metric in _dedupe(payload.metrics)]
    else:
        metrics = list(TEMPERATURE_METRICS)
    return stations, metrics


async def run_refresh(
    database: Database,
    settings: Settings,
    client_factory: ClientFactory,
    payload: RefreshRequest,
) -> RefreshResponse:
    """执行一次受冷却/预算/熔断约束的刷新；失败也返回结构化结果。"""
    now = datetime.now(timezone.utc)
    remaining_budget = get_budget_remaining(settings, database)
    if not settings.external_fetch_enabled:
        return RefreshResponse(
            accepted=False,
            reason="disabled",
            next_allowed_at=None,
            remaining_budget=remaining_budget,
            requests_made=0,
            rows_upserted=0,
            message="外部抓取已關閉 / External fetching is disabled",
        )
    if is_circuit_open(database, now=now):
        return RefreshResponse(
            accepted=False,
            reason="circuit_open",
            next_allowed_at=get_circuit_open_until(database),
            remaining_budget=remaining_budget,
            requests_made=0,
            rows_upserted=0,
            message="上游曾返回 403，熔斷中 / Circuit open after HTTP 403",
        )
    if remaining_budget <= 0:
        return RefreshResponse(
            accepted=False,
            reason="budget_exhausted",
            next_allowed_at=None,
            remaining_budget=0,
            requests_made=0,
            rows_upserted=0,
            message="當日請求預算已用盡 / Daily fetch budget exhausted",
        )
    last_refresh = get_last_refresh_at(database)
    if last_refresh is not None:
        next_allowed = last_refresh + timedelta(seconds=settings.fetch_cooldown_seconds)
        if now < next_allowed:
            return RefreshResponse(
                accepted=False,
                reason="cooldown",
                next_allowed_at=next_allowed,
                remaining_budget=remaining_budget,
                requests_made=0,
                rows_upserted=0,
                message=None,
            )
    stations, metrics = _refresh_targets(database, settings, payload)
    years = _refresh_years(database, payload)
    requests_made = 0
    rows_upserted = 0
    not_published: list[str] = []
    client = client_factory()
    try:
        for year in years:
            summary = await ingest_year(
                client,
                database,
                settings,
                stations=stations,
                metrics=metrics,
                year=year,
                mode="official",
            )
            requests_made += summary.requests
            rows_upserted += summary.upserted
            not_published.extend(summary.not_published)
    except FetchRejected as exc:
        validation_logger.warning("刷新被拒绝：%s（%s）", exc.reason.value, exc.message)
        return RefreshResponse(
            accepted=False,
            reason=_rejection_reason(exc.reason),
            next_allowed_at=None,
            remaining_budget=get_budget_remaining(settings, database),
            requests_made=requests_made,
            rows_upserted=rows_upserted,
            message=exc.message,
        )
    except (HkoFetchError, HkoDataError, HkoPayloadError) as exc:
        validation_logger.warning("刷新失败：%s", exc)
        return RefreshResponse(
            accepted=False,
            reason="no_cache",
            next_allowed_at=None,
            remaining_budget=get_budget_remaining(settings, database),
            requests_made=requests_made,
            rows_upserted=rows_upserted,
            message=f"抓取失敗，未寫入新資料 / Fetch failed: {exc}",
        )
    finally:
        await client.aclose()
    record_refresh_accepted(database, now)
    message = f"已完成 {requests_made} 次上游請求，寫入 {rows_upserted} 行 / Done"
    if not_published:
        message += (
            "；部分資料集當月尚未發布 / some datasets not yet published this month"
        )
    return RefreshResponse(
        accepted=True,
        reason=None,
        next_allowed_at=now + timedelta(seconds=settings.fetch_cooldown_seconds),
        remaining_budget=get_budget_remaining(settings, database),
        requests_made=requests_made,
        rows_upserted=rows_upserted,
        message=message,
    )


# ------------------------------------------------------------------ 来源页


def build_sources_response(
    database: Database,
    settings: Settings,
) -> SourcesResponse:
    """GET /api/sources：来源凭据、许可、熔断状态与请求统计。"""
    now = datetime.now(timezone.utc)
    circuit_until = get_circuit_open_until(database)
    circuit_open = is_circuit_open(database, now=now)
    stats = _request_stats(database, settings, now=now)
    reason: ReasonCode | None = None
    if not settings.external_fetch_enabled:
        reason = "disabled"
    elif circuit_open:
        reason = "circuit_open"
    elif get_budget_remaining(settings, database) <= 0:
        reason = "budget_exhausted"
    return SourcesResponse(
        mode="official",
        notice=None,
        reason=reason,
        sources=build_official_sources(database),
        licenses=list(LICENSES),
        circuit_open=circuit_open,
        circuit_open_until=circuit_until,
        request_stats=stats,
        last_success_at=get_last_success_at(database),
    )


def _request_stats(
    database: Database,
    settings: Settings,
    *,
    now: datetime,
) -> RequestStats:
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).replace(
        tzinfo=None
    )
    with database.session() as session:
        total_statement = select(func.count()).select_from(FetchEvent)
        total_value = session.execute(total_statement).scalar()
        today_statement = (
            select(func.count()).select_from(FetchEvent).where(FetchEvent.ts >= day_start)
        )
        today_value = session.execute(today_statement).scalar()
        outcome_statement = select(FetchEvent.outcome, func.count()).group_by(
            FetchEvent.outcome
        )
        outcome_rows = session.execute(outcome_statement).all()
    by_outcome = {str(outcome): int(count) for outcome, count in outcome_rows}
    return RequestStats(
        total=int(total_value) if isinstance(total_value, int) else 0,
        today=int(today_value) if isinstance(today_value, int) else 0,
        budget=settings.fetch_daily_budget,
        budget_remaining=get_budget_remaining(settings, database, now=now),
        by_outcome=by_outcome,
    )


# 让工具函数在模块内可达（保持导入清晰）
__all__ = [
    "ClientFactory",
    "ModeData",
    "SelectionError",
    "build_coverage_response",
    "build_daily_response",
    "build_export_csv",
    "build_sources_response",
    "build_stations_response",
    "build_summary_response",
    "build_window",
    "build_window_from_query",
    "ensure_metric",
    "ensure_station",
    "import_csv",
    "load_mode_data",
    "parse_metric_selection",
    "parse_station_selection",
    "resolve_reason",
    "run_refresh",
]
