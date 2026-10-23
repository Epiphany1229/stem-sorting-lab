"""应用工厂：只做配置读取、CORS、状态注入与路由挂载，不含教学业务逻辑。

阶段 3 起在 ``app.state`` 注入三项共享状态（测试可替换）：
- ``settings``：配置单例；
- ``database``：SQLAlchemy 数据库对象（首次访问天气接口时建表）；
- ``hko_client_factory``：HKO 客户端工厂（测试注入 MockTransport 实现离线）。
"""

from __future__ import annotations

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
from backend.app.services.weather_service import ClientFactory


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
