"""后台自动同步：启动自检 + 每 N 小时静默补齐近期逐日气温（阶段 5.1）。

设计要点：

- 由 FastAPI ``lifespan`` 以 **asyncio 后台任务**启动，不阻塞应用启动；
- 启动时与之后每 ``auto_sync_interval_hours`` 小时检查一次：
  核心测站最新温度 ``obs_date`` 落后于香港时区“昨天”，或距上次成功同步超过
  间隔，则静默执行 ``ingest-recent``（RYES 摘要补数，月表优先）；
- 全部请求仍走安全客户端（同主机并发 1、≥3s 间隔、预算、熔断、租约、审计）；
- 失败只记日志并写 ``service_state`` 的错误信息，不抛出、不崩溃进程；
- 测试环境通过 ``AUTO_SYNC_ENABLED=false`` 关闭，并可直接单测
  :func:`should_sync` / :func:`run_auto_sync` / :func:`start_auto_sync`。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from backend.app.core.logging import LogChannel, get_logger
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    HkoClient,
    read_state_value,
    write_state_value,
)
from backend.app.data_sources.hko.registry import station_ids
from backend.app.models.base import HK_TZ, parse_utc_iso, today_hk
from backend.app.models.db import Database
from backend.app.models.weather import DailyWeather
from backend.app.services.recent_ingest import (
    RecentIngestSummary,
    default_mapped_stations,
    ingest_recent_temperature,
)
from backend.app.services.weather_util import TEMPERATURE_METRICS

network_logger = get_logger(LogChannel.NETWORK)
data_logger = get_logger(LogChannel.DATA)

# service_state 键名（与客户端既有状态键并列，便于运维排查）
STATE_AUTO_SYNC_LAST_SUCCESS: str = "auto_sync_last_success_at"
STATE_AUTO_SYNC_LAST_ERROR: str = "auto_sync_last_error"

# 自动同步客户端工厂（与 API 的 ClientFactory 形状一致）
AutoSyncClientFactory = Callable[[], HkoClient]

# 失败重试之间的等待秒数（只用于同一轮内重试，仍受客户端预算与限速约束）
RETRY_BACKOFF_SECONDS = 60.0


def parse_auto_sync_stations(settings: Settings) -> tuple[str, ...]:
    """解析自动同步测站；非法/为空的配置回退到默认三站并记日志。"""
    allowed = station_ids(settings)
    ordered: list[str] = []
    for part in settings.auto_sync_stations.split(","):
        station_id = part.strip()
        if not station_id:
            continue
        if station_id not in allowed:
            network_logger.warning("自动同步配置含未知站号 %s（已忽略）", station_id)
            continue
        if station_id not in ordered:
            ordered.append(station_id)
    if not ordered:
        fallback = ("HKO", "KP", "SHA")
        network_logger.warning("自动同步测站配置为空，回退到 %s", ",".join(fallback))
        return fallback
    return tuple(ordered)


def latest_temperature_obs_date(
    database: Database,
    stations: tuple[str, ...],
    *,
    mode: str = "official",
) -> date | None:
    """核心测站（仅温度指标）的最新可用观测日。"""
    if not stations:
        return None
    with database.session() as session:
        statement = (
            select(func.max(DailyWeather.obs_date))
            .where(DailyWeather.mode == mode)
            .where(DailyWeather.station_id.in_(list(stations)))
            .where(DailyWeather.metric.in_(TEMPERATURE_METRICS))
        )
        value = session.execute(statement).scalar()
        return value if isinstance(value, date) else None


def last_auto_sync_at(database: Database) -> datetime | None:
    """上一次自动同步成功的时间（UTC aware）；没有记录返回 None。"""
    return parse_utc_iso(read_state_value(database, STATE_AUTO_SYNC_LAST_SUCCESS))


def _hk_yesterday(now: datetime | None) -> date:
    """香港时区的“昨天”。"""
    if now is None:
        return today_hk() - timedelta(days=1)
    return now.astimezone(HK_TZ).date() - timedelta(days=1)


def should_sync(
    database: Database,
    settings: Settings,
    *,
    now: datetime | None = None,
) -> bool:
    """是否需要执行一轮近期同步。

    条件（任一成立即需要）：

    - 开关关闭 / 外部抓取关闭 ⇒ 不需要；
    - 核心测站没有任何温度数据，或最新观测日早于香港时区“昨天”；
    - 距上次成功自动同步超过 ``auto_sync_interval_hours``（或从未成功过）。
    """
    if not settings.auto_sync_enabled or not settings.external_fetch_enabled:
        return False
    stations = parse_auto_sync_stations(settings)
    yesterday = _hk_yesterday(now)
    latest = latest_temperature_obs_date(database, stations)
    if latest is None or latest < yesterday:
        return True
    last_success = last_auto_sync_at(database)
    if last_success is None:
        return True
    current = now if now is not None else datetime.now(timezone.utc)
    interval = timedelta(hours=max(1, settings.auto_sync_interval_hours))
    return current - last_success > interval


async def run_auto_sync(
    database: Database,
    settings: Settings,
    client_factory: AutoSyncClientFactory,
    *,
    now: datetime | None = None,
) -> RecentIngestSummary | None:
    """执行一轮 ``ingest-recent``；失败只记日志并返回 None（不抛出）。

    ``auto_sync_stations`` 只用于“是否需要同步”的核心站判断；实际写入默认覆盖
    RYES 全部可映射站（``auto_sync_write_all_mapped=True``），避免其它只有 9 月
    数据的测站在默认窗口里整段缺 10 月。
    """
    core_stations = parse_auto_sync_stations(settings)
    write_stations = (
        default_mapped_stations()
        if settings.auto_sync_write_all_mapped
        else core_stations
    )
    end = _hk_yesterday(now)
    current = now if now is not None else datetime.now(timezone.utc)
    client = client_factory()
    try:
        summary = await ingest_recent_temperature(
            client,
            database,
            settings,
            stations=write_stations,
            end=end,
            days=max(1, settings.auto_sync_days),
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - 后台任务失败只记日志，绝不崩溃
        network_logger.warning("自動同步失敗（已跳過本輪）：%s", exc)
        write_state_value(
            database,
            STATE_AUTO_SYNC_LAST_ERROR,
            f"{current.isoformat()}: {type(exc).__name__}: {exc}",
        )
        return None
    finally:
        await client.aclose()
    if summary.errors and summary.rows_written == 0:
        network_logger.warning(
            "自動同步本輪全部失敗（%d 條錯誤，最後一條：%s）",
            len(summary.errors),
            summary.errors[-1],
        )
        write_state_value(
            database,
            STATE_AUTO_SYNC_LAST_ERROR,
            f"{current.isoformat()}: {summary.errors[-1]}",
        )
        return None
    write_state_value(database, STATE_AUTO_SYNC_LAST_SUCCESS, current.isoformat())
    write_state_value(database, STATE_AUTO_SYNC_LAST_ERROR, "")
    data_logger.info(
        "自動同步完成：%s–%s，%s",
        summary.start.isoformat(),
        summary.end.isoformat(),
        summary.describe(),
    )
    return summary


async def auto_sync_loop(
    database: Database,
    settings: Settings,
    client_factory: AutoSyncClientFactory,
) -> None:
    """后台循环：启动自检一次，之后每 interval 小时检查一次。"""
    interval_seconds = max(1, settings.auto_sync_interval_hours) * 3600
    max_attempts = max(1, settings.auto_sync_max_attempts)
    while True:
        try:
            if should_sync(database, settings):
                attempt = 0
                summary: RecentIngestSummary | None = None
                while summary is None and attempt < max_attempts:
                    attempt += 1
                    summary = await run_auto_sync(database, settings, client_factory)
                    if summary is None and attempt < max_attempts:
                        await asyncio.sleep(RETRY_BACKOFF_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - 循环内任何异常都只记录，继续下一轮
            network_logger.exception("自動同步循環異常（已跳過本次）")
        await asyncio.sleep(interval_seconds)


def _log_task_result(task: asyncio.Task[None]) -> None:
    """任务结束时记录意外异常（正常取消不记错误）。"""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        network_logger.error("自動同步任務意外結束：%s", exc)


def start_auto_sync(
    database: Database,
    settings: Settings,
    client_factory: AutoSyncClientFactory,
) -> asyncio.Task[None] | None:
    """按配置启动后台任务；关闭时返回 None（测试环境默认关闭）。"""
    if not settings.auto_sync_enabled:
        return None
    task = asyncio.create_task(
        auto_sync_loop(database, settings, client_factory),
        name="hko-auto-sync",
    )
    task.add_done_callback(_log_task_result)
    network_logger.info(
        "自動同步任務已啟動（每 %d 小時；測站 %s）",
        max(1, settings.auto_sync_interval_hours),
        ",".join(parse_auto_sync_stations(settings)),
    )
    return task


__all__ = [
    "AutoSyncClientFactory",
    "STATE_AUTO_SYNC_LAST_ERROR",
    "STATE_AUTO_SYNC_LAST_SUCCESS",
    "auto_sync_loop",
    "last_auto_sync_at",
    "latest_temperature_obs_date",
    "parse_auto_sync_stations",
    "run_auto_sync",
    "should_sync",
    "start_auto_sync",
]
