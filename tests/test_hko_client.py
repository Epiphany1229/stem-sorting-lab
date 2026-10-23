"""HKO 安全客户端测试：限速、并发、429/403、重试、条件请求、预算、开关、租约。

全部使用 ``httpx.MockTransport`` 注入响应，**不联网**；限速用可注入的假时钟
与假 sleep 验证，不产生真实等待。
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import func, select

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import (
    STATE_LEASE_EXPIRES,
    STATE_LEASE_OWNER,
    FetchRejected,
    FetchRejectReason,
    HkoClient,
    HkoDataError,
    HkoFetchError,
    get_budget_used,
    get_circuit_open_until,
    get_host_suspend_until,
    parse_retry_after,
    write_state_value,
)
from backend.app.data_sources.hko.limiter import HostRateLimiter
from backend.app.models.db import Database
from backend.app.models.weather import FetchEvent, HttpCache, SourceDocument

# 测试用官方接口地址与参数（与生产同一主机，但请求不会真的发出）
OPENDATA_URL = "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php"
HOST = "data.weather.gov.hk"
PARAMS: Mapping[str, str] = {
    "dataType": "CLMMAXT",
    "lang": "en",
    "rformat": "json",
    "station": "HKO",
    "year": "2026",
}

# 一份结构正确的空月表响应（data 为空 = 当月未发布）
EMPTY_PAYLOAD: dict[str, object] = {
    "type": ["日最高氣溫(攝氏度) - 天文台", "Daily Maximum Temperature (°C)"],
    "fields": [
        "年/Year",
        "月/Month",
        "日/Day",
        "數值/Value",
        "數據完整性/data Completeness",
    ],
    "data": [],
    "legend": [
        "*** 沒有數據/unavailable",
        "# 數據不完整/data incomplete",
        "C 數據完整/data Complete",
    ],
}

SAMPLE_PAYLOAD: dict[str, object] = {
    "type": ["日最高氣溫(攝氏度) - 天文台", "Daily Maximum Temperature (°C)"],
    "fields": [
        "年/Year",
        "月/Month",
        "日/Day",
        "數值/Value",
        "數據完整性/data Completeness",
    ],
    "data": [["2026", "9", "1", "34.4", "C"]],
    "legend": ["*** 沒有數據/unavailable"],
}


class FakeClock:
    """可手动推进的假单调时钟；假 sleep 会推进它。"""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now


def _fake_sleep(clock: FakeClock) -> Callable[[float], Awaitable[None]]:
    """构造"推进假时钟而不是真的等待"的 sleep。"""

    async def _sleep(seconds: float) -> None:
        clock.sleeps.append(seconds)
        clock.now += seconds

    return _sleep


def _make_limiter(clock: FakeClock, *, min_interval: float = 3.0) -> HostRateLimiter:
    return HostRateLimiter(
        min_interval_seconds=min_interval,
        jitter_seconds=0.0,
        clock=clock,
        sleep=_fake_sleep(clock),
        jitter_source=lambda: 0.0,
    )


def _make_client(
    settings: Settings,
    database: Database,
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    clock: FakeClock | None = None,
    limiter: HostRateLimiter | None = None,
) -> HkoClient:
    active_clock = clock if clock is not None else FakeClock()
    return HkoClient(
        settings,
        database,
        limiter=limiter if limiter is not None else _make_limiter(active_clock),
        transport=httpx.MockTransport(handler),
        clock=active_clock,
        sleep=_fake_sleep(active_clock),
    )


def _count_rows(
    database: Database,
    model: type[FetchEvent] | type[HttpCache] | type[SourceDocument],
) -> int:
    with database.session() as session:
        value = session.execute(select(func.count()).select_from(model)).scalar()
    return int(value) if isinstance(value, int) else 0


def _fetch_outcomes(database: Database) -> list[str]:
    with database.session() as session:
        return [str(value) for value in session.execute(select(FetchEvent.outcome)).scalars().all()]


async def test_rate_limiter_enforces_minimum_interval(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """同主机两次请求的起点间隔必须 ≥ 配置的最小间隔（3 秒）。"""
    clock = FakeClock()
    request_times: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        request_times.append(clock())
        return httpx.Response(200, json=EMPTY_PAYLOAD)

    client = _make_client(weather_settings, weather_database, handler, clock=clock)
    try:
        await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert len(request_times) == 2
    assert request_times[1] - request_times[0] >= 3.0
    # 假时钟里记录到了一次等待
    assert any(seconds >= 3.0 for seconds in clock.sleeps)


async def test_same_host_requests_are_serialized(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """同主机并发必须为 1：并发发起两个请求时，绝不能同时在途。"""
    clock = FakeClock()
    active = 0
    max_active = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0)
        active -= 1
        return httpx.Response(200, json=EMPTY_PAYLOAD)

    transport = httpx.MockTransport(handler)
    client = HkoClient(
        weather_settings,
        weather_database,
        limiter=_make_limiter(clock),
        transport=transport,
        clock=clock,
        sleep=_fake_sleep(clock),
    )
    try:
        await asyncio.gather(
            client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT"),
            client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT"),
        )
    finally:
        await client.aclose()

    assert max_active == 1


async def test_429_respects_retry_after_and_suspends_host(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """429 + Retry-After: 5 → 挂起该主机，后续请求直接拒绝且不再发 HTTP。"""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"Retry-After": "5"}, text="too many requests")

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(FetchRejected) as first:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        assert first.value.reason is FetchRejectReason.HOST_SUSPENDED
        assert first.value.retry_after_seconds == pytest.approx(5.0)
        # 第二次请求在预检查阶段就被拒绝，不再发出 HTTP
        with pytest.raises(FetchRejected) as second:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        assert second.value.reason is FetchRejectReason.HOST_SUSPENDED
    finally:
        await client.aclose()

    assert calls == 1
    suspend_until = get_host_suspend_until(weather_database, HOST)
    assert suspend_until is not None
    assert suspend_until > datetime.now(timezone.utc)
    outcomes = _fetch_outcomes(weather_database)
    assert "rate_limited" in outcomes
    assert any(value.startswith("rejected:host_suspended") for value in outcomes)


def test_parse_retry_after_supports_seconds_and_http_date() -> None:
    """Retry-After 既支持秒数，也支持 HTTP-date。"""
    now = datetime(2026, 10, 21, 7, 27, 0, tzinfo=timezone.utc)
    assert parse_retry_after("5", now=now) == pytest.approx(5.0)
    assert parse_retry_after("Wed, 21 Oct 2026 07:28:00 GMT", now=now) == pytest.approx(60.0)
    # 解析失败或已过期时回退到默认值
    assert parse_retry_after("not-a-date", now=now) == pytest.approx(60.0)
    assert parse_retry_after(None, now=now) == pytest.approx(60.0)


async def test_403_opens_circuit_breaker(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """403 立即熔断：本次报错，后续请求全部拒绝且不再发 HTTP。"""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(403, text="forbidden")

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(FetchRejected) as first:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        assert first.value.reason is FetchRejectReason.CIRCUIT_OPEN
        with pytest.raises(FetchRejected) as second:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        assert second.value.reason is FetchRejectReason.CIRCUIT_OPEN
    finally:
        await client.aclose()

    assert calls == 1
    open_until = get_circuit_open_until(weather_database)
    assert open_until is not None
    remaining = open_until - datetime.now(timezone.utc)
    assert timedelta(minutes=25) < remaining <= timedelta(minutes=31)
    assert "forbidden" in _fetch_outcomes(weather_database)


async def test_server_error_retries_limited_times(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """5xx 指数退避重试，最多额外 fetch_max_retries 次，然后报错。"""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, text="server error")

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(HkoFetchError):
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    # 首次 + 2 次重试 = 3 次尝试（fetch_max_retries=2）
    assert calls == 3
    assert _fetch_outcomes(weather_database).count("server_error") == 3


async def test_timeout_retries_limited_times(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """超时同样按有限次数重试，重试耗尽后抛出网络错误。"""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectTimeout("timeout")

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(HkoFetchError):
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert calls == 3
    assert _fetch_outcomes(weather_database).count("timeout") == 3


async def test_304_reuses_cached_body(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """首次 200 存 ETag；二次带 If-None-Match 收到 304 时复用缓存 body。"""
    calls: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        conditional = request.headers.get("if-none-match")
        calls.append(conditional)
        if conditional == '"v1"':
            return httpx.Response(304)
        return httpx.Response(200, json=SAMPLE_PAYLOAD, headers={"ETag": '"v1"'})

    client = _make_client(weather_settings, weather_database, handler)
    try:
        first = await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        second = await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert first.cache_hit is False
    assert first.http_status == 200
    assert second.cache_hit is True
    assert second.http_status == 304
    assert second.data == SAMPLE_PAYLOAD
    assert calls == [None, '"v1"']
    assert _count_rows(weather_database, HttpCache) == 1
    # 两次成功抓取都留下可审计的来源凭据
    assert _count_rows(weather_database, SourceDocument) == 2


async def test_budget_exhausted_rejects_before_request(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """每日预算耗尽后拒绝请求，且不再发出 HTTP。"""
    budget_settings = weather_settings.model_copy(update={"fetch_daily_budget": 2})
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=EMPTY_PAYLOAD)

    client = _make_client(budget_settings, weather_database, handler)
    try:
        await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
        with pytest.raises(FetchRejected) as exc_info:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert exc_info.value.reason is FetchRejectReason.BUDGET_EXHAUSTED
    assert calls == 2
    assert get_budget_used(weather_database) == 2


async def test_disabled_switch_rejects_every_request(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """EXTERNAL_FETCH_ENABLED=false 时全部拒绝，且不发 HTTP。"""
    disabled_settings = weather_settings.model_copy(update={"external_fetch_enabled": False})
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - 不应被调用
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=EMPTY_PAYLOAD)

    client = _make_client(disabled_settings, weather_database, handler)
    try:
        with pytest.raises(FetchRejected) as exc_info:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert exc_info.value.reason is FetchRejectReason.DISABLED
    assert calls == 0
    assert "rejected:disabled" in _fetch_outcomes(weather_database)


async def test_other_process_lease_blocks_fetching(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """另一个进程持有未过期租约时，本进程请求被拒绝。"""
    write_state_value(weather_database, STATE_LEASE_OWNER, "another-process")
    write_state_value(
        weather_database,
        STATE_LEASE_EXPIRES,
        (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
    )
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - 不应被调用
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=EMPTY_PAYLOAD)

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(FetchRejected) as exc_info:
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert exc_info.value.reason is FetchRejectReason.LEASE_HELD
    assert calls == 0


async def test_non_json_200_raises_data_error(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """官方参数错误时 HTTP 仍是 200 但正文是纯文本，必须识别为数据错误。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="Please include valid parameters in API request.")

    client = _make_client(weather_settings, weather_database, handler)
    try:
        with pytest.raises(HkoDataError):
            await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert "invalid_json" in _fetch_outcomes(weather_database)


async def test_success_records_cache_and_source_document(
    weather_settings: Settings,
    weather_database: Database,
) -> None:
    """200 成功时写入 http_cache、source_document 与 fetch_event。"""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=SAMPLE_PAYLOAD,
            headers={"ETag": '"abc"', "Last-Modified": "Mon, 22 Sep 2025 09:15:39 GMT"},
        )

    client = _make_client(weather_settings, weather_database, handler)
    try:
        result = await client.get_json(OPENDATA_URL, params=PARAMS, dataset_key="CLMMAXT")
    finally:
        await client.aclose()

    assert result.http_status == 200
    assert result.payload_sha256
    assert result.source_document_id is not None
    assert result.endpoint.startswith(OPENDATA_URL)
    assert "dataType=CLMMAXT" in result.endpoint
    assert _count_rows(weather_database, HttpCache) == 1
    assert _count_rows(weather_database, SourceDocument) == 1
    assert "ok" in _fetch_outcomes(weather_database)
    assert get_budget_used(weather_database) == 1
    # 熔断相关状态不应被意外设置
    assert get_circuit_open_until(weather_database) is None
