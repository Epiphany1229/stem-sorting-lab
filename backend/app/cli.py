"""命令行入口：初始化数据库、抓取官方逐日气温并入库。

用法::

    python -m backend.app.cli init-db
    python -m backend.app.cli ingest --stations HKO,KP,SHA --metrics tmax,tmin,tmean --year 2026
    python -m backend.app.cli ingest --stations HKO --metrics tmax,tmin --dry-run

注意：真实抓取会按合规间隔（默认 3 秒 + jitter）串行请求，不会并发、不会压测。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence
from datetime import date, timedelta

from backend.app.core.settings import Settings, get_settings
from backend.app.data_sources.hko.client import (
    FetchRejected,
    HkoClient,
    HkoDataError,
    HkoFetchError,
)
from backend.app.data_sources.hko.registry import load_station_registry
from backend.app.data_sources.hko.ryes import (
    RYES_STATION_ID,
    ingest_rainfall_range,
)
from backend.app.models.base import today_hk
from backend.app.models.db import count_stations, create_database
from backend.app.services.hko_ingest import METRIC_TO_DATATYPE, ingest_year
from backend.app.services.recent_ingest import (
    default_mapped_stations,
    ingest_recent_temperature,
    parse_recent_stations,
)
from backend.app.services.weather_util import TEMPERATURE_METRICS


def build_parser() -> argparse.ArgumentParser:
    """构造命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="python -m backend.app.cli",
        description="STEM 天气实验室后端命令行工具",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-db", help="建表并写入官方 39 站字典")

    ingest = subparsers.add_parser("ingest", help="抓取官方逐日气温并入库")
    ingest.add_argument(
        "--stations",
        default="HKO",
        help="逗号分隔的官方站号（默认 HKO）",
    )
    ingest.add_argument(
        "--metrics",
        default="tmax,tmin,tmean",
        help="逗号分隔的指标：tmax,tmin,tmean",
    )
    ingest.add_argument(
        "--year",
        type=int,
        default=None,
        help="要抓取的年份（默认当前香港年份）",
    )
    ingest.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将要发起的请求，不联网也不写库",
    )

    rainfall = subparsers.add_parser(
        "ingest-rainfall",
        help="按天回填 RYES 官方日雨量（仅 HKO，1 请求/天，非默认执行）",
    )
    rainfall.add_argument("--start", required=True, help="起始日期 YYYY-MM-DD（含）")
    rainfall.add_argument("--end", required=True, help="结束日期 YYYY-MM-DD（含）")
    rainfall.add_argument(
        "--station",
        default=RYES_STATION_ID,
        help="官方 RYES 只提供 HKO 一站（其他站号会被拒绝）",
    )
    rainfall.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将发起的请求，不联网也不写库",
    )

    recent = subparsers.add_parser(
        "ingest-recent",
        help="用 RYES 日报补齐最近 N 天的逐日气温（1 请求/天，月表优先）",
    )
    recent.add_argument(
        "--days",
        type=int,
        default=35,
        help="回填天数（默认 35，包含结束日）",
    )
    recent.add_argument(
        "--stations",
        default=None,
        help="逗号分隔的官方站号；省略时写入 RYES 可映射的全部站（当前 22 个）",
    )
    recent.add_argument(
        "--end",
        default=None,
        help="结束日期 YYYY-MM-DD（默认香港时区的昨天）",
    )
    recent.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将发起的请求，不联网也不写库",
    )
    return parser


def _split_stations(raw: str, settings: Settings) -> list[str]:
    """解析并校验站号，返回去重后的列表。"""
    records = load_station_registry(settings)
    allowed = {record.id for record in records}
    requested = [part.strip() for part in raw.split(",") if part.strip()]
    if not requested:
        requested = ["HKO"]
    unknown = [station_id for station_id in requested if station_id not in allowed]
    if unknown:
        raise ValueError(f"未知站号：{', '.join(unknown)}（合法站号见 stations.json）")
    ordered: list[str] = []
    for station_id in requested:
        if station_id not in ordered:
            ordered.append(station_id)
    return ordered


def _split_metrics(raw: str) -> list[str]:
    """解析并校验指标列表。"""
    allowed = set(TEMPERATURE_METRICS)
    requested = [part.strip().lower() for part in raw.split(",") if part.strip()]
    if not requested:
        raise ValueError("--metrics 不能为空")
    unknown = [metric for metric in requested if metric not in allowed]
    if unknown:
        raise ValueError(f"未知指标：{', '.join(unknown)}（合法值：tmax,tmin,tmean）")
    ordered: list[str] = []
    for metric in requested:
        if metric not in ordered:
            ordered.append(metric)
    return ordered


def _print_plan(
    settings: Settings,
    stations: Sequence[str],
    metrics: Sequence[str],
    year: int,
) -> None:
    """--dry-run：只列出将发起的请求，不联网。"""
    total = len(stations) * len(metrics)
    print(f"[dry-run] 目标：{len(stations)} 站 × {len(metrics)} 指标 = {total} 次请求")
    print(f"[dry-run] 接口：{settings.hko_opendata_url}")
    print(
        f"[dry-run] 合规：同主机并发 1，最小间隔 {settings.fetch_min_interval_seconds}s"
        f" + jitter ≤ {settings.fetch_jitter_seconds}s"
    )
    for station_id in stations:
        for metric in metrics:
            dataset_key = METRIC_TO_DATATYPE[metric]
            print(
                f"[dry-run] GET dataType={dataset_key} station={station_id} "
                f"year={year}（省略 month，一次取整年）"
            )


def _run_ingest(args: argparse.Namespace) -> int:
    """执行 ingest 子命令。"""
    settings = get_settings()
    year = int(args.year) if args.year is not None else today_hk().year
    stations = _split_stations(str(args.stations), settings)
    metrics = _split_metrics(str(args.metrics))
    if bool(args.dry_run):
        _print_plan(settings, stations, metrics, year)
        return 0

    database = create_database(settings)
    database.prepare()
    client = HkoClient(settings, database)

    async def _run() -> None:
        try:
            summary = await ingest_year(
                client,
                database,
                settings,
                stations=stations,
                metrics=metrics,
                year=year,
                on_request=print,
            )
        finally:
            await client.aclose()
        print(
            f"[完成] 請求 {summary.requests} 次，寫入 {summary.upserted} 行，"
            f"跳過 {summary.skipped} 行，快取命中 {summary.cache_hits} 次，"
            f"耗時 {summary.elapsed_seconds:.1f}s"
        )
        if summary.quality_issues:
            print(f"[質量問題] {len(summary.quality_issues)} 條：")
            for issue in summary.quality_issues:
                print(f"  - {issue}")
        if summary.unsupported:
            print(
                "[不受支持] 官方接口拒絕以下數據集（PDF 名單仍有，但當前 API 不接受，已跳過）："
                + ", ".join(summary.unsupported)
            )
        if summary.not_published:
            print(
                "[未發布] 以下資料集暫無資料（當月月表未發布，不是錯誤）："
                + ", ".join(summary.not_published)
            )
        print(f"[資料庫] 目前共 {count_stations(database)} 個測站")

    try:
        asyncio.run(_run())
    except FetchRejected as exc:
        print(f"[拒絕] {exc.reason.value}: {exc.message}", file=sys.stderr)
        return 1
    except (HkoFetchError, HkoDataError) as exc:
        print(f"[失敗] {exc}", file=sys.stderr)
        return 1
    finally:
        database.dispose()
    return 0


def _parse_cli_date(raw: object, field_name: str) -> date:
    """解析 YYYY-MM-DD 形式的命令行日期。"""
    text = str(raw)
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field_name} 不是合法日期（要求 YYYY-MM-DD）：{text}") from exc


def _run_ingest_rainfall(args: argparse.Namespace) -> int:
    """执行 ingest-rainfall 子命令：按天回填 RYES 日雨量（仅 HKO）。"""
    settings = get_settings()
    start = _parse_cli_date(args.start, "--start")
    end = _parse_cli_date(args.end, "--end")
    station = str(args.station)
    if station != RYES_STATION_ID:
        raise ValueError(f"RYES 只提供 {RYES_STATION_ID} 的日雨量（官方仅一站）")
    if start > end:
        raise ValueError("--start 不能晚于 --end")
    total = (end - start).days + 1
    if bool(args.dry_run):
        print(f"[dry-run] 目標：{total} 天 × 1 請求/天 = {total} 次請求（僅 {station}）")
        print(f"[dry-run] 接口：{settings.hko_opendata_url}?dataType=RYES&date=YYYYMMDD")
        print(
            f"[dry-run] 合規：同主機並發 1，最小間隔 {settings.fetch_min_interval_seconds}s"
            f" + jitter ≤ {settings.fetch_jitter_seconds}s；不做常駐守護"
        )
        for offset in range(total):
            day = start + timedelta(days=offset)
            print(f"[dry-run] GET dataType=RYES date={day.strftime('%Y%m%d')}")
        return 0

    database = create_database(settings)
    database.prepare()
    client = HkoClient(settings, database)

    async def _run() -> None:
        try:
            summary = await ingest_rainfall_range(
                client,
                database,
                settings,
                start=start,
                end=end,
                station=station,
                on_request=print,
            )
        finally:
            await client.aclose()
        print(
            f"[完成] 請求 {summary.requests} 次，寫入 {summary.written} 行（metric=rainfall），"
            f"Trace 跳過 {summary.trace_skipped} 天，缺失跳過 {summary.missing_skipped} 天，"
            f"日期不符 {summary.date_mismatch} 天，耗時 {summary.elapsed_seconds:.1f}s"
        )

    try:
        asyncio.run(_run())
    except FetchRejected as exc:
        print(f"[拒絕] {exc.reason.value}: {exc.message}", file=sys.stderr)
        return 1
    except (HkoFetchError, HkoDataError) as exc:
        print(f"[失敗] {exc}", file=sys.stderr)
        return 1
    finally:
        database.dispose()
    return 0


def _run_ingest_recent(args: argparse.Namespace) -> int:
    """执行 ingest-recent：用 RYES 日报补齐最近 N 天（月表优先，1 请求/天）。"""
    settings = get_settings()
    days = int(args.days)
    if days < 1:
        raise ValueError("--days 必须为正整数")
    if args.stations is None:
        stations = default_mapped_stations()
    else:
        stations = parse_recent_stations(str(args.stations), settings)
    if args.end is not None:
        end = _parse_cli_date(args.end, "--end")
    else:
        end = today_hk() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    if bool(args.dry_run):
        print(
            f"[dry-run] 目標：{days} 天 × 1 請求/天 = {days} 次請求"
            f"（{start.isoformat()} .. {end.isoformat()}）"
        )
        print(
            f"[dry-run] 測站 {len(stations)} 個：{', '.join(stations)}"
            "（僅寫入這些站的 tmax/tmin）"
        )
        print(
            f"[dry-run] 接口：{settings.hko_opendata_url}?dataType=RYES&date=YYYYMMDD"
        )
        print(
            f"[dry-run] 合規：同主機並發 1，最小間隔 {settings.fetch_min_interval_seconds}s"
            f" + jitter ≤ {settings.fetch_jitter_seconds}s；月表已有數據的日期不覆蓋"
        )
        for offset in range(days):
            day = start + timedelta(days=offset)
            print(f"[dry-run] GET dataType=RYES date={day.strftime('%Y%m%d')}")
        return 0

    database = create_database(settings)
    database.prepare()
    client = HkoClient(settings, database)

    async def _run() -> None:
        try:
            summary = await ingest_recent_temperature(
                client,
                database,
                settings,
                stations=stations,
                end=end,
                days=days,
                on_request=print,
            )
        finally:
            await client.aclose()
        print(f"[完成] {summary.describe()}")
        print(
            f"[窗口] {summary.start.isoformat()} .. {summary.end.isoformat()}，"
            f"實際新增/覆蓋日期 {len(summary.written_dates)} 天"
        )
        if summary.date_mismatch:
            print(f"[日期不符] {summary.date_mismatch} 天（ReportTimeInfoDate 與請求日不同）")
        if summary.monthly_authoritative_skipped:
            print(
                "[月表優先] 跳過 "
                f"{summary.monthly_authoritative_skipped} 行（這些日期已有更權威月表資料）"
            )
        if summary.errors:
            print(f"[錯誤] {len(summary.errors)} 條：")
            for error in summary.errors[:10]:
                print(f"  - {error}")

    try:
        asyncio.run(_run())
    except FetchRejected as exc:
        print(f"[拒絕] {exc.reason.value}: {exc.message}", file=sys.stderr)
        return 1
    except (HkoFetchError, HkoDataError) as exc:
        print(f"[失敗] {exc}", file=sys.stderr)
        return 1
    finally:
        database.dispose()
    return 0


def _run_init_db() -> int:
    """执行 init-db 子命令：建表并写入官方 39 站。"""
    settings = get_settings()
    database = create_database(settings)
    try:
        database.prepare()
        print(f"[完成] 資料庫已就緒：{settings.database_url}")
        print(f"[完成] 官方測站數：{count_stations(database)}")
    finally:
        database.dispose()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """命令行主入口，返回进程退出码。"""
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "init-db":
            return _run_init_db()
        if args.command == "ingest":
            return _run_ingest(args)
        if args.command == "ingest-rainfall":
            return _run_ingest_rainfall(args)
        if args.command == "ingest-recent":
            return _run_ingest_recent(args)
    except ValueError as exc:
        print(f"[參數錯誤] {exc}", file=sys.stderr)
        return 2
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
