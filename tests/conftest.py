"""阶段 3 天气相关测试的共享 fixture：内存 SQLite + 固定配置，绝不联网。

所有测试都通过 ``httpx.MockTransport`` 注入假响应，既不需要联网，也不会
对香港天文台官方服务造成任何压力。

阶段 5.1 起：在导入测试模块**之前**把 ``AUTO_SYNC_ENABLED`` 置为 false，
并清理 settings 缓存，保证 FastAPI ``lifespan`` 不会在测试中启动后台抓取任务。
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

# 必须在 backend.app.main 被测试模块导入前设置：默认应用工厂会在 lifespan 启动自动同步
os.environ["AUTO_SYNC_ENABLED"] = "false"

from backend.app.core.settings import Settings, get_settings  # noqa: E402
from backend.app.models.db import Database, create_database  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> Iterator[None]:
    """每个测试前后清理配置单例，避免环境变量/缓存跨用例泄漏。"""
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


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
        auto_sync_enabled=False,
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
