"""健康检查路由：阶段 1 仅用于验证服务可启动、可被测试客户端访问。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.app.core.settings import Settings, get_settings

router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    """GET /api/health 的响应结构。"""

    # 服务状态，正常时为 "ok"
    status: str
    # 当前后端版本号
    version: str


@router.get("/health", response_model=HealthResponse, summary="服务健康检查")
def read_health(
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    """返回服务状态与版本号；不访问数据库或任何外部数据源。"""
    return HealthResponse(status="ok", version=settings.app_version)
