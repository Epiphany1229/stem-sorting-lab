"""香港天文台（HKO）安全抓取客户端。

红线（见 ``.claude/skills/hko-safe-fetcher/SKILL.md``）：
- ``httpx.AsyncClient(trust_env=False)``：本机系统代理会中断 TLS，必须绕过；
- 同主机并发 1、请求间隔 ≥ 3s + jitter（由 :class:`HostRateLimiter` 保证）；
- 429 遵守 ``Retry-After`` 并挂起该主机；403 立即熔断；5xx/超时指数退避、有限重试；
- 每日预算、单 worker 租约、外部抓取总开关都在发请求前检查；
- 所有 HTTP 交互（含被拒绝的请求）都写 ``fetch_event``，便于排障与审计。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
from typing import Final, NoReturn

import httpx
from sqlalchemy.orm import Session

from backend.app.core.logging import LogChannel, get_logger
from backend.app.core.settings import Settings
from backend.app.data_sources.hko.limiter import HostRateLimiter, get_default_limiter
from backend.app.models.base import parse_utc_iso, utc_now_naive
from backend.app.models.db import Database
from backend.app.models.weather import FetchEvent, HttpCache, ServiceState, SourceDocument

# 网络类日志与数据类日志分开，便于按 channel 过滤
network_logger = get_logger(LogChannel.NETWORK)
data_logger = get_logger(LogChannel.DATA)

# 请求身份：诚实标识本项目，不伪装浏览器、不伪造身份
USER_AGENT: Final = "stem-sorting-weather-lab/0.1 (educational; HKO open data)"

# service_state 中使用的键名
STATE_CIRCUIT_OPEN_UNTIL: Final = "circuit_open_until"
STATE_HOST_SUSPEND_PREFIX: Final = "host_suspend_until:"
STATE_DAILY_BUDGET_PREFIX: Final = "daily_requests:"
STATE_LEASE_OWNER: Final = "fetch_lease_owner"
STATE_LEASE_EXPIRES: Final = "fetch_lease_expires_at"
STATE_LAST_REFRESH: Final = "last_refresh_at"
STATE_LAST_SUCCESS: Final = "last_fetch_success_at"

# Retry-After 无法解析时默认挂起 60 秒（保守等待，不猜测官方限流阈值）
DEFAULT_RETRY_AFTER_SECONDS: Final = 60.0


class FetchRejectReason(str, Enum):
    """抓取被拒的原因码；与 API 信封的 ``reason`` 部分取值对齐。"""

    DISABLED = "disabled"
    CIRCUIT_OPEN = "circuit_open"
    BUDGET_EXHAUSTED = "budget_exhausted"
    HOST_SUSPENDED = "host_suspended"
    LEASE_HELD = "lease_held"


class FetchRejected(Exception):
    """合规检查未通过，本次请求没有发出。"""

    def __init__(
        self,
        reason: FetchRejectReason,
        message: str,
        *,
        retry_after_seconds: float | None = None,
    ) -> None:
        self.reason = reason
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message)


class HkoFetchError(Exception):
    """网络层失败：超时、连接错误、5xx 重试耗尽、非预期状态码。"""


class HkoDataError(Exception):
    """响应体不是可解析 JSON（官方参数错误时状态码仍是 200）。"""


@dataclass(frozen=True)
class CachedResponse:
    """http_cache 中的一条缓存记录。"""

    body: str
    status: int
    etag: str | None
    last_modified: str | None


@dataclass(frozen=True)
class FetchResult:
    """一次成功抓取的结果（200 或 304 复用缓存）。"""

    dataset_key: str
    endpoint: str
    data: object
    http_status: int
    cache_hit: bool
    etag: str | None
    last_modified: str | None
    payload_sha256: str
    fetched_at: datetime
    source_document_id: int | None
    body_bytes: int


def parse_retry_after(
    value: str | None,
    *,
    now: datetime,
    default: float = DEFAULT_RETRY_AFTER_SECONDS,
) -> float:
    """解析 ``Retry-After``：支持秒数与 HTTP-date 两种写法。"""
    if value is None or not value.strip():
        return default
    text = value.strip()
    if text.isdigit():
        return float(text)
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return default
    if parsed is None:  # pragma: no cover - parsedate_to_datetime 已保证非 None
        return default
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    seconds = (parsed - now).total_seconds()
    return seconds if seconds > 0 else default


def _budget_key(now: datetime) -> str:
    """按 UTC 日期生成预算计数键。"""
    return f"{STATE_DAILY_BUDGET_PREFIX}{now.astimezone(timezone.utc).date().isoformat()}"


def _read_state(session: Session, key: str) -> str | None:
    row = session.get(ServiceState, key)
    return None if row is None else row.value


def _write_state(session: Session, key: str, value: str) -> None:
    row = session.get(ServiceState, key)
    if row is None:
        session.add(ServiceState(key=key, value=value, updated_at=utc_now_naive()))
    else:
        row.value = value
        row.updated_at = utc_now_naive()


def get_budget_used_from_session(session: Session, now: datetime) -> int:
    """在给定会话中读取当天预算计数，避免为读状态重复开关事务。"""
    raw = _read_state(session, _budget_key(now))
    if raw is None:
        return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def read_state_value(database: Database, key: str) -> str | None:
    """读取 service_state 中的一个键（供 API / CLI 使用）。"""
    with database.session() as session:
        return _read_state(session, key)


def write_state_value(database: Database, key: str, value: str) -> None:
    """写入 service_state 中的一个键。"""
    with database.session() as session:
        _write_state(session, key, value)


def get_circuit_open_until(database: Database) -> datetime | None:
    """返回熔断截止时间（UTC aware），未熔断返回 None。"""
    return parse_utc_iso(read_state_value(database, STATE_CIRCUIT_OPEN_UNTIL))


def is_circuit_open(database: Database, *, now: datetime | None = None) -> bool:
    """当前是否处于 403 熔断期。"""
    until = get_circuit_open_until(database)
    if until is None:
        return False
    current = now if now is not None else datetime.now(timezone.utc)
    return until > current


def get_host_suspend_until(database: Database, host: str) -> datetime | None:
    """返回某主机因 429 被挂起的截止时间。"""
    return parse_utc_iso(read_state_value(database, STATE_HOST_SUSPEND_PREFIX + host))


def get_budget_used(database: Database, *, now: datetime | None = None) -> int:
    """返回当天（UTC）已使用的上游请求次数。"""
    current = now if now is not None else datetime.now(timezone.utc)
    return get_budget_used_from_session_public(database, current)


def get_budget_used_from_session_public(database: Database, now: datetime) -> int:
    """读取当天预算计数（对外可用的便捷版本）。"""
    with database.session() as session:
        return get_budget_used_from_session(session, now)


def get_budget_remaining(
    settings: Settings,
    database: Database,
    *,
    now: datetime | None = None,
) -> int:
    """返回当日剩余预算（不小于 0）。"""
    return max(0, settings.fetch_daily_budget - get_budget_used(database, now=now))


def get_last_refresh_at(database: Database) -> datetime | None:
    """返回上一次成功刷新的时间。"""
    return parse_utc_iso(read_state_value(database, STATE_LAST_REFRESH))


def record_refresh_accepted(database: Database, when: datetime) -> None:
    """记录一次被接受的刷新（冷却计时起点）。"""
    write_state_value(database, STATE_LAST_REFRESH, when.isoformat())


def get_last_success_at(database: Database) -> datetime | None:
    """返回最近一次成功抓取的时间。"""
    return parse_utc_iso(read_state_value(database, STATE_LAST_SUCCESS))


def state_updated_at(database: Database, key: str) -> datetime | None:
    """读取某个 service_state 键的最后更新时间。"""
    with database.session() as session:
        row = session.get(ServiceState, key)
        return None if row is None else row.updated_at


class HkoClient:
    """带合规约束的 HKO HTTP 客户端（异步）。"""

    def __init__(
        self,
        settings: Settings,
        database: Database,
        *,
        limiter: HostRateLimiter | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        now: Callable[[], datetime] | None = None,
        owner_id: str | None = None,
    ) -> None:
        self._settings = settings
        self._db = database
        self._clock = clock
        self._sleep = sleep
        self._now = now if now is not None else self._system_now
        # 租约 owner 默认取进程号：同进程多个请求互不冲突，跨进程互斥
        self._owner_id = owner_id if owner_id is not None else f"pid-{os.getpid()}"
        self._limiter = (
            limiter
            if limiter is not None
            else get_default_limiter(
                min_interval_seconds=settings.fetch_min_interval_seconds,
                jitter_seconds=settings.fetch_jitter_seconds,
            )
        )
        # 本机实测：trust_env=True 会走注册表代理导致 TLS 中断，这里固定绕过系统代理
        self._client = httpx.AsyncClient(
            trust_env=False,
            timeout=httpx.Timeout(settings.fetch_timeout_seconds),
            headers={"User-Agent": USER_AGENT},
            transport=transport,
        )

    @staticmethod
    def _system_now() -> datetime:
        return datetime.now(timezone.utc)

    async def aclose(self) -> None:
        """关闭底层 HTTP 连接池。"""
        await self._client.aclose()

    def _aware_now(self) -> datetime:
        return self._now()

    async def get_json(
        self,
        url: str,
        *,
        params: Mapping[str, str],
        dataset_key: str,
    ) -> FetchResult:
        """发起一次受控 GET 并解析 JSON；200/304 都返回可审计结果。"""
        query_params = {key: str(value) for key, value in params.items()}
        full_url = str(httpx.URL(url).copy_with(params=query_params))
        host = httpx.URL(full_url).host
        cached = self._precheck(full_url, self._aware_now())
        headers: dict[str, str] = {}
        if cached is not None:
            if cached.etag:
                headers["If-None-Match"] = cached.etag
            if cached.last_modified:
                headers["If-Modified-Since"] = cached.last_modified

        max_attempts = max(1, self._settings.fetch_max_retries + 1)
        async with self._limiter.slot(host):
            last_error = "上游请求重试次数已用尽"
            for attempt in range(max_attempts):
                self._consume_budget(full_url, self._aware_now())
                started = self._clock()
                try:
                    response = await self._client.request(
                        "GET", url, params=query_params, headers=headers
                    )
                except httpx.TimeoutException as exc:
                    elapsed = (self._clock() - started) * 1000.0
                    self._record_event(
                        full_url,
                        None,
                        "timeout",
                        duration_ms=elapsed,
                        note=type(exc).__name__,
                    )
                    network_logger.warning("请求超时：%s（第 %d 次）", full_url, attempt + 1)
                    last_error = f"请求超时：{type(exc).__name__}"
                    if attempt == max_attempts - 1:
                        raise HkoFetchError(last_error) from exc
                    await self._sleep(self._backoff(attempt))
                    continue
                except httpx.TransportError as exc:
                    elapsed = (self._clock() - started) * 1000.0
                    self._record_event(
                        full_url,
                        None,
                        "transport_error",
                        duration_ms=elapsed,
                        note=type(exc).__name__,
                    )
                    network_logger.warning("连接失败：%s（第 %d 次）", full_url, attempt + 1)
                    last_error = f"连接失败：{type(exc).__name__}"
                    if attempt == max_attempts - 1:
                        raise HkoFetchError(last_error) from exc
                    await self._sleep(self._backoff(attempt))
                    continue

                elapsed = (self._clock() - started) * 1000.0
                status = response.status_code
                if status == 304:
                    return self._handle_not_modified(full_url, dataset_key, cached)
                if status == 200:
                    return self._handle_ok(full_url, dataset_key, response, elapsed)
                if status == 429:
                    self._handle_rate_limited(full_url, response, elapsed)
                if status == 403:
                    self._handle_forbidden(full_url, response, elapsed)
                if status >= 500:
                    self._record_event(
                        full_url,
                        status,
                        "server_error",
                        duration_ms=elapsed,
                        bytes_=len(response.content),
                    )
                    network_logger.warning("上游 5xx：%s（第 %d 次）", status, attempt + 1)
                    last_error = f"上游服务异常：HTTP {status}"
                    if attempt == max_attempts - 1:
                        raise HkoFetchError(last_error)
                    await self._sleep(self._backoff(attempt))
                    continue
                self._record_event(
                    full_url,
                    status,
                    "http_error",
                    duration_ms=elapsed,
                    bytes_=len(response.content),
                )
                raise HkoFetchError(f"上游返回非预期状态码：HTTP {status}")
            raise HkoFetchError(last_error)

    # ------------------------------------------------------------------ 内部实现

    def _backoff(self, attempt: int) -> float:
        """指数退避：base * 2**attempt（第 1 次重试等待 base 秒）。"""
        base = float(self._settings.fetch_retry_backoff_seconds)
        return base * float(2**attempt)

    def _precheck(self, full_url: str, now: datetime) -> CachedResponse | None:
        """请求前的合规检查；返回可用的条件请求缓存。"""
        try:
            with self._db.session() as session:
                if not self._settings.external_fetch_enabled:
                    raise FetchRejected(
                        FetchRejectReason.DISABLED,
                        "外部抓取已关闭（EXTERNAL_FETCH_ENABLED=false）",
                    )
                circuit_until = parse_utc_iso(_read_state(session, STATE_CIRCUIT_OPEN_UNTIL))
                if circuit_until is not None and circuit_until > now:
                    raise FetchRejected(
                        FetchRejectReason.CIRCUIT_OPEN,
                        f"熔断中，暂停自动抓取至 {circuit_until.isoformat()}",
                    )
                host = httpx.URL(full_url).host
                suspend_until = parse_utc_iso(
                    _read_state(session, STATE_HOST_SUSPEND_PREFIX + host)
                )
                if suspend_until is not None and suspend_until > now:
                    raise FetchRejected(
                        FetchRejectReason.HOST_SUSPENDED,
                        f"该主机被 429 挂起至 {suspend_until.isoformat()}",
                    )
                if get_budget_used_from_session(session, now) >= self._settings.fetch_daily_budget:
                    raise FetchRejected(
                        FetchRejectReason.BUDGET_EXHAUSTED,
                        f"当日请求预算已用尽（上限 {self._settings.fetch_daily_budget} 次）",
                    )
                self._acquire_lease(session, now)
                cached = session.get(HttpCache, full_url)
                if cached is None or not cached.body:
                    return None
                return CachedResponse(
                    body=cached.body,
                    status=cached.status,
                    etag=cached.etag,
                    last_modified=cached.last_modified,
                )
        except FetchRejected as exc:
            self._record_event(full_url, None, f"rejected:{exc.reason.value}", note=exc.message)
            if exc.reason is FetchRejectReason.HOST_SUSPENDED:
                network_logger.warning("主机挂起中，拒绝请求：%s", full_url)
            raise

    def _acquire_lease(self, session: Session, now: datetime) -> None:
        """抢占（或续期）单 worker 抓取租约；他人持有则拒绝。"""
        owner = _read_state(session, STATE_LEASE_OWNER)
        expires = parse_utc_iso(_read_state(session, STATE_LEASE_EXPIRES))
        if owner is not None and expires is not None and owner != self._owner_id and expires > now:
            raise FetchRejected(
                FetchRejectReason.LEASE_HELD,
                "另一个抓取进程持有租约，本次请求被拒绝",
            )
        _write_state(session, STATE_LEASE_OWNER, self._owner_id)
        _write_state(
            session,
            STATE_LEASE_EXPIRES,
            (now + timedelta(seconds=self._settings.fetch_lease_seconds)).isoformat(),
        )

    def _consume_budget(self, full_url: str, now: datetime) -> None:
        """每次 HTTP 尝试消耗一次预算；用尽则拒绝（不发出请求）。"""
        try:
            with self._db.session() as session:
                used = get_budget_used_from_session(session, now)
                if used >= self._settings.fetch_daily_budget:
                    raise FetchRejected(
                        FetchRejectReason.BUDGET_EXHAUSTED,
                        f"当日请求预算已用尽（上限 {self._settings.fetch_daily_budget} 次）",
                    )
                _write_state(session, _budget_key(now), str(used + 1))
        except FetchRejected as exc:
            self._record_event(full_url, None, f"rejected:{exc.reason.value}", note=exc.message)
            raise

    def _handle_ok(
        self,
        full_url: str,
        dataset_key: str,
        response: httpx.Response,
        duration_ms: float,
    ) -> FetchResult:
        """处理 200：校验 JSON、写缓存与来源凭据。"""
        raw_bytes = response.content
        try:
            payload: object = response.json()
        except ValueError as exc:
            self._record_event(
                full_url,
                200,
                "invalid_json",
                duration_ms=duration_ms,
                bytes_=len(raw_bytes),
                note="响应不是 JSON（可能是参数错误提示）",
            )
            data_logger.warning("上游返回非 JSON 正文：%s", full_url)
            raise HkoDataError("官方接口返回的不是 JSON，可能是请求参数错误") from exc

        now = self._aware_now()
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        etag = response.headers.get("etag")
        last_modified = response.headers.get("last-modified")
        body_text = response.text
        with self._db.session() as session:
            cached = session.get(HttpCache, full_url)
            if cached is None:
                session.add(
                    HttpCache(
                        url=full_url,
                        etag=etag,
                        last_modified=last_modified,
                        status=200,
                        body=body_text,
                        stored_at=now.replace(tzinfo=None),
                    )
                )
            else:
                cached.etag = etag
                cached.last_modified = last_modified
                cached.status = 200
                cached.body = body_text
                cached.stored_at = now.replace(tzinfo=None)
            document = SourceDocument(
                dataset_key=dataset_key,
                endpoint=full_url,
                http_status=200,
                etag=etag,
                last_modified=last_modified,
                retrieved_at=now.replace(tzinfo=None),
                payload_sha256=sha256,
            )
            session.add(document)
            session.flush()
            document_id = document.id
            self._record_event_in_session(
                session,
                full_url,
                200,
                "ok",
                duration_ms=duration_ms,
                bytes_=len(raw_bytes),
            )
            _write_state(session, STATE_LAST_SUCCESS, now.isoformat())
        data_logger.debug("抓取成功：%s（%d 字节）", full_url, len(raw_bytes))
        return FetchResult(
            dataset_key=dataset_key,
            endpoint=full_url,
            data=payload,
            http_status=200,
            cache_hit=False,
            etag=etag,
            last_modified=last_modified,
            payload_sha256=sha256,
            fetched_at=now.replace(tzinfo=None),
            source_document_id=document_id,
            body_bytes=len(raw_bytes),
        )

    def _handle_not_modified(
        self,
        full_url: str,
        dataset_key: str,
        cached: CachedResponse | None,
    ) -> FetchResult:
        """处理 304：复用 http_cache 中的 body，并记为 cache_hit。"""
        if cached is None:  # pragma: no cover - 条件请求头只会在有缓存时发出
            self._record_event(full_url, 304, "http_error", note="304 但没有可用缓存")
            raise HkoFetchError("收到 304 但没有可复用缓存")
        body_bytes = cached.body.encode("utf-8")
        sha256 = hashlib.sha256(body_bytes).hexdigest()
        try:
            payload: object = json.loads(cached.body)
        except json.JSONDecodeError as exc:  # pragma: no cover - 缓存只在解析成功后写入
            raise HkoDataError("缓存内容不是合法 JSON") from exc
        now = self._aware_now()
        with self._db.session() as session:
            document = SourceDocument(
                dataset_key=dataset_key,
                endpoint=full_url,
                http_status=304,
                etag=cached.etag,
                last_modified=cached.last_modified,
                retrieved_at=now.replace(tzinfo=None),
                payload_sha256=sha256,
            )
            session.add(document)
            session.flush()
            document_id = document.id
            self._record_event_in_session(session, full_url, 304, "cache_hit")
            _write_state(session, STATE_LAST_SUCCESS, now.isoformat())
        network_logger.info("条件请求命中缓存：%s", full_url)
        return FetchResult(
            dataset_key=dataset_key,
            endpoint=full_url,
            data=payload,
            http_status=304,
            cache_hit=True,
            etag=cached.etag,
            last_modified=cached.last_modified,
            payload_sha256=sha256,
            fetched_at=now.replace(tzinfo=None),
            source_document_id=document_id,
            body_bytes=0,
        )

    def _handle_rate_limited(
        self,
        full_url: str,
        response: httpx.Response,
        duration_ms: float,
    ) -> NoReturn:
        """处理 429：按 Retry-After 挂起该主机，本次不重试。"""
        header = response.headers.get("retry-after")
        now = self._aware_now()
        wait_seconds = parse_retry_after(header, now=now)
        suspend_until = now + timedelta(seconds=wait_seconds)
        host = httpx.URL(full_url).host
        with self._db.session() as session:
            _write_state(
                session,
                STATE_HOST_SUSPEND_PREFIX + host,
                suspend_until.isoformat(),
            )
            self._record_event_in_session(
                session,
                full_url,
                429,
                "rate_limited",
                duration_ms=duration_ms,
                bytes_=len(response.content),
                retry_after=header,
                note=f"挂起 {wait_seconds:.0f} 秒",
            )
        network_logger.warning(
            "上游返回 429，主机 %s 挂起 %.0f 秒（Retry-After=%s）",
            host,
            wait_seconds,
            header,
        )
        raise FetchRejected(
            FetchRejectReason.HOST_SUSPENDED,
            f"上游限流（429），主机挂起 {wait_seconds:.0f} 秒",
            retry_after_seconds=wait_seconds,
        )

    def _handle_forbidden(
        self,
        full_url: str,
        response: httpx.Response,
        duration_ms: float,
    ) -> NoReturn:
        """处理 403：立即熔断，停止自动抓取，不重试。"""
        now = self._aware_now()
        open_until = now + timedelta(minutes=self._settings.circuit_breaker_minutes)
        with self._db.session() as session:
            _write_state(session, STATE_CIRCUIT_OPEN_UNTIL, open_until.isoformat())
            self._record_event_in_session(
                session,
                full_url,
                403,
                "forbidden",
                duration_ms=duration_ms,
                bytes_=len(response.content),
                note=f"熔断至 {open_until.isoformat()}",
            )
        network_logger.error("上游返回 403，熔断至 %s，停止自动抓取", open_until.isoformat())
        raise FetchRejected(
            FetchRejectReason.CIRCUIT_OPEN,
            f"上游返回 403，自动抓取熔断至 {open_until.isoformat()}",
        )

    def _record_event(
        self,
        url: str,
        status: int | None,
        outcome: str,
        *,
        duration_ms: float | None = None,
        bytes_: int | None = None,
        retry_after: str | None = None,
        note: str | None = None,
    ) -> None:
        """单独开启事务写一条 fetch_event（用于拒绝/失败路径）。"""
        with self._db.session() as session:
            self._record_event_in_session(
                session,
                url,
                status,
                outcome,
                duration_ms=duration_ms,
                bytes_=bytes_,
                retry_after=retry_after,
                note=note,
            )

    def _record_event_in_session(
        self,
        session: Session,
        url: str,
        status: int | None,
        outcome: str,
        *,
        duration_ms: float | None = None,
        bytes_: int | None = None,
        retry_after: str | None = None,
        note: str | None = None,
    ) -> None:
        session.add(
            FetchEvent(
                ts=utc_now_naive(),
                url=url,
                status=status,
                outcome=outcome,
                duration_ms=duration_ms,
                bytes=bytes_,
                retry_after=retry_after,
                note=note,
            )
        )
