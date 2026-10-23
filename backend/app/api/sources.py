"""数据来源路由：展示来源凭据、许可义务、熔断状态与请求统计。"""

from __future__ import annotations

from fastapi import APIRouter

from backend.app.api.weather_deps import AppSettingsDep, DatabaseDep
from backend.app.schemas.weather import SourcesResponse
from backend.app.services.weather_service import build_sources_response

router = APIRouter(prefix="/api", tags=["sources"])


@router.get("/sources", response_model=SourcesResponse, summary="数据来源、许可与请求统计")
def get_sources(settings: AppSettingsDep, database: DatabaseDep) -> SourcesResponse:
    """返回每个数据集最近一次成功抓取的凭据、许可义务与当日请求预算使用情况。"""
    return build_sources_response(database, settings)
