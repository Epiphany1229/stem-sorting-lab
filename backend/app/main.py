"""应用工厂：只做配置读取、CORS 与路由挂载，不含任何教学业务逻辑。"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.algorithms import router as algorithms_router
from backend.app.api.health import router as health_router
from backend.app.core.logging import configure_logging
from backend.app.core.settings import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
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

    app.include_router(health_router)
    app.include_router(algorithms_router)
    return app


app = create_app()
