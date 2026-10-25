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

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
from backend.app.services.weather_util import resolve_project_path


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

    # 单端口演示：所有 API/文档路由注册完后再挂前端 dist 与 SPA fallback。
    _mount_frontend(app, app_settings)
    return app


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    """若配置开启且 dist 存在，挂载静态资源并注册 SPA History Fallback。

    - ``/assets`` 交给 StaticFiles；
    - 根目录其它静态文件（favicon、vite.svg 等）由 catch-all 直接返回；
    - 其余未知 GET 路径返回 ``index.html``（History 路由）；
    - ``api`` / ``docs`` / ``redoc`` / ``openapi.json`` 前缀**不吞**：返回 404，
      交给已注册的 API/文档路由或保持 JSON 404 语义；
    - ``serve_frontend=False`` 或 dist 不存在时完全不注册，行为与开发环境一致。
    """
    if not settings.serve_frontend:
        return
    dist_dir = resolve_project_path(settings.frontend_dist_dir)
    index_file = dist_dir / "index.html"
    if not index_file.is_file():
        return
    dist_root = dist_dir.resolve()
    assets_dir = dist_root / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="frontend-assets",
        )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> Response:
        first_segment = full_path.split("/", 1)[0]
        if first_segment in {"api", "docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            candidate = (dist_root / full_path).resolve()
            if candidate.is_relative_to(dist_root) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(index_file)


app = create_app()
