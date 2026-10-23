"""阶段 3 天气相关测试的共享 fixture：内存 SQLite + 固定配置，绝不联网。

所有测试都通过 ``httpx.MockTransport`` 注入假响应，既不需要联网，也不会
对香港天文台官方服务造成任何压力。
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from backend.app.core.settings import Settings
from backend.app.models.db import Database, create_database


@pytest.fixture()
def weather_settings() -> Settings:
    """离线测试用配置：内存库、无抖动、重试退避为 0，避免测试等待。"""
    return Settings(
        database_url="sqlite://",
        external_fetch_enabled=True,
        demo_mode_enabled=True,
        fetch_min_interval_seconds=3.0,
        fetch_jitter_seconds=0.0,
        fetch_max_retries=2,
        fetch_retry_backoff_seconds=0.0,
        fetch_daily_budget=20,
        fetch_timeout_seconds=5.0,
        fetch_cooldown_seconds=300,
        circuit_breaker_minutes=30.0,
    )


@pytest.fixture()
def weather_database(weather_settings: Settings) -> Iterator[Database]:
    """每个测试一个干净的内存数据库，并已写入官方 39 站字典。"""
    database = create_database(weather_settings)
    database.prepare()
    try:
        yield database
    finally:
        database.dispose()
