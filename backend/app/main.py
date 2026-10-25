"""应用工厂：只做配置读取、CORS、状态注入与路由挂载，不含教学业务逻辑。

阶段 3 起在 ``app.state`` 注入三项共享状态（测试可替换）：
- ``settings``：配置单例；
- ``database``：SQLAlchemy 数据库对象（首次访问天气接口时建表）；
- ``hko_client_factory``：HKO 客户端工厂（测试注入 MockTransport 实现离线）。

阶段 5.1 起通过 ``lifespan`` 启动后台自动同步任务（``AUTO_SYNC_ENABLED`` 控制；
测试环境默认关闭，见 ``tests/conftest.py``）。
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.algorithms import router as algorithms_router
from backend.app.api.health import router as health_router
from backend.app.api.sources import router as sources_router
from backend.app.api.weather import router as weather_router
from backend.app.api.weather_deps import default_client_factory
from backend.app.core.logging import configure_logging
from backend.app.core.settings import Settings, get_settings
from backend.app.models.db import Database, create_database
from backend.app.services.auto_sync import start_auto_sync
from backend.app.services.weather_service import ClientFactory


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """应用生命周期：启动后台自动同步任务，关闭时取消并等待其退出。"""
    settings = cast(Settings, app.state.settings)
    database = cast(Database, app.state.database)
    client_factory = cast(ClientFactory, app.state.hko_client_factory)
    task = start_auto_sync(database, settings, client_factory)
    app.state.auto_sync_task = task
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def create_app(
    settings: Settings | None = None,
    *,
    database: Database | None = None,
    client_factory: ClientFactory | None = None,
) -> FastAPI:
    """按给定（或环境变量中的）配置创建 FastAPI 应用实例。"""
    app_settings = settings if settings is not None else get_settings()
    configure_logging(app_settings.log_level)

    app = FastAPI(
        title=app_settings.app_name,
        version=app_settings.app_version,
        debug=app_settings.debug,
        lifespan=lifespan,
    )

    # 只允许 .env 中显式列出的前端地址跨域访问，不使用 "*" 通配。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    database_obj = database if database is not None else create_database(app_settings)
    app.state.settings = app_settings
    app.state.database = database_obj
    app.state.hko_client_factory = (
        client_factory
        if client_factory is not None
        else default_client_factory(app_settings, database_obj)
    )

    app.include_router(health_router)
    app.include_router(algorithms_router)
    app.include_router(weather_router)
    app.include_router(sources_router)
    return app


app = create_app()
