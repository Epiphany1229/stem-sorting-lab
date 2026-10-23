"""合规限速器：同主机并发 1、两次请求起点间隔 ≥ 最小间隔、附加随机抖动。

设计依据 ``.claude/skills/hko-safe-fetcher/SKILL.md``：同主机并发 1、间隔 ≥ 3 秒
+ 少量 jitter。时钟与 sleep 都可注入，测试用假时钟即可离线验证限速行为。
"""

from __future__ import annotations

import asyncio
import random
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

# 单调时钟：不受系统时间调整影响
Clock = Callable[[], float]
# 异步等待函数（测试可替换为"只推进假时钟"的实现）
Sleep = Callable[[float], Awaitable[None]]
# 抖动来源：必须返回 [0, jitter_seconds] 内的非负值
JitterSource = Callable[[], float]


class HostRateLimiter:
    """按主机（host）串行化请求，并保证请求起点的最小间隔。"""

    def __init__(
        self,
        *,
        min_interval_seconds: float,
        jitter_seconds: float,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
        jitter_source: JitterSource | None = None,
    ) -> None:
        self._min_interval = max(0.0, min_interval_seconds)
        self._jitter_seconds = max(0.0, jitter_seconds)
        self._clock = clock
        self._sleep = sleep
        self._jitter_source = jitter_source if jitter_source is not None else self._default_jitter
        # 每个主机一把锁 + 上一次请求起点（单调时钟秒）
        self._locks: dict[str, asyncio.Lock] = {}
        self._last_start: dict[str, float] = {}

    def _default_jitter(self) -> float:
        if self._jitter_seconds <= 0:
            return 0.0
        return random.uniform(0.0, self._jitter_seconds)

    def _lock_for(self, host: str) -> asyncio.Lock:
        """取得（必要时创建）该主机的并发锁。"""
        lock = self._locks.get(host)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[host] = lock
        return lock

    @asynccontextmanager
    async def slot(self, host: str) -> AsyncIterator[None]:
        """占用一次请求机会；持锁期间即"该主机唯一在途请求"。"""
        lock = self._lock_for(host)
        async with lock:
            now = self._clock()
            last = self._last_start.get(host)
            if last is not None:
                wait_seconds = last + self._min_interval + self._jitter_source() - now
                if wait_seconds > 0:
                    await self._sleep(wait_seconds)
            self._last_start[host] = self._clock()
            yield


# 进程内全局单例：所有 HKO 客户端共享同一个限速节奏
_DEFAULT_LIMITER: HostRateLimiter | None = None
_DEFAULT_LIMITER_CONFIG: tuple[float, float] | None = None


def get_default_limiter(
    *,
    min_interval_seconds: float,
    jitter_seconds: float,
) -> HostRateLimiter:
    """返回进程内单例限速器；配置变化时按新配置重建。"""
    global _DEFAULT_LIMITER, _DEFAULT_LIMITER_CONFIG
    config = (min_interval_seconds, jitter_seconds)
    if _DEFAULT_LIMITER is None or config != _DEFAULT_LIMITER_CONFIG:
        _DEFAULT_LIMITER = HostRateLimiter(
            min_interval_seconds=min_interval_seconds,
            jitter_seconds=jitter_seconds,
        )
        _DEFAULT_LIMITER_CONFIG = config
    return _DEFAULT_LIMITER


def reset_default_limiter() -> None:
    """清空全局单例（测试隔离用）。"""
    global _DEFAULT_LIMITER, _DEFAULT_LIMITER_CONFIG
    _DEFAULT_LIMITER = None
    _DEFAULT_LIMITER_CONFIG = None
