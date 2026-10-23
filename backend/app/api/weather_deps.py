"""天气路由共享依赖：从 ``app.state`` 取配置、数据库与 HKO 客户端工厂。

应用工厂在创建 app 时把这三样东西放进 ``app.state``，测试可以替换其中的
客户端工厂来注入 ``httpx.MockTransport``，从而做到**完全离线**。
"""

from __future__ import annotations

from typing import Annotated, cast

from fastapi import Depends, Request

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.client import HkoClient
from backend.app.models.db import Database
from backend.app.services.weather_service import ClientFactory


def get_app_settings(request: Request) -> Settings:
    """读取应用配置单例。"""
    return cast(Settings, request.app.state.settings)


def get_database(request: Request) -> Database:
    """读取数据库对象，并保证建表与官方 39 站字典已就绪（幂等）。"""
    database = cast(Database, request.app.state.database)
    database.prepare()
    return database


def get_client_factory(request: Request) -> ClientFactory:
    """读取 HKO 客户端工厂（测试可替换为 MockTransport 版本）。"""
    return cast(ClientFactory, request.app.state.hko_client_factory)


def default_client_factory(settings: Settings, database: Database) -> ClientFactory:
    """默认工厂：每次刷新创建一个独立客户端，用完即关闭。"""

    def _factory() -> HkoClient:
        return HkoClient(settings, database)

    return _factory


AppSettingsDep = Annotated[Settings, Depends(get_app_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]
ClientFactoryDep = Annotated[ClientFactory, Depends(get_client_factory)]
