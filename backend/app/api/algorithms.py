"""算法轨迹路由：冒泡轨迹 + 天气轨迹 + 阶段 5 通用算法中心端点。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.api.weather_deps import AppSettingsDep, DatabaseDep
from backend.app.schemas.algorithm_trace import (
    AlgorithmListResponse,
    AlgorithmTraceRequest,
    AlgorithmTraceResponse,
)
from backend.app.schemas.trace import BubbleTraceRequest, TraceResponse
from backend.app.schemas.weather_trace import WeatherTraceRequest, WeatherTraceResponse
from backend.app.services.algorithm_trace_service import (
    UnknownAlgorithmError,
    build_algorithm_list,
    build_algorithm_trace,
)
from backend.app.services.trace_service import (
    TraceValidationError,
    build_bubble_trace,
)
from backend.app.services.weather_trace_service import build_weather_trace

router = APIRouter(prefix="/api/algorithms", tags=["algorithms"])


def _validation_error(exc: TraceValidationError) -> HTTPException:
    """把服务层校验错误转换成协议一致的 422 字段级错误数组。"""
    return HTTPException(
        status_code=422,
        detail=[
            {
                "type": "value_error",
                "loc": ["body", exc.field],
                "msg": exc.message,
            }
        ],
    )


@router.post(
    "/bubble/trace",
    response_model=TraceResponse,
    response_model_exclude_none=True,
    summary="冒泡排序真实执行轨迹",
)
def create_bubble_trace(payload: BubbleTraceRequest) -> TraceResponse:
    """由后端真实执行冒泡排序，返回逐事件轨迹、数组快照与代码行映射。"""
    try:
        return build_bubble_trace(
            values=payload.values,
            direction=payload.direction,
            early_exit=payload.options.early_exit,
        )
    except TraceValidationError as exc:
        raise _validation_error(exc) from exc


@router.post(
    "/bubble/weather-trace",
    response_model=WeatherTraceResponse,
    response_model_exclude_none=True,
    summary="真实天气数据的冒泡排序轨迹",
)
def create_weather_trace(
    payload: WeatherTraceRequest,
    settings: AppSettingsDep,
    database: DatabaseDep,
) -> WeatherTraceResponse:
    """读取指定测站/指标的逐日气温，真实执行冒泡排序并返回天气化解释。"""
    try:
        return build_weather_trace(
            database,
            settings,
            station=payload.station,
            metric=payload.metric,
            start=payload.start,
            end=payload.end,
            direction=payload.direction,
            early_exit=payload.options.early_exit,
        )
    except TraceValidationError as exc:
        raise _validation_error(exc) from exc


@router.get(
    "",
    response_model=AlgorithmListResponse,
    summary="算法清單與教學元數據",
)
def list_algorithms() -> AlgorithmListResponse:
    """返回 10 个算法（7 个可用 + 3 个开发中）及复杂度/稳定性等元数据。"""
    return build_algorithm_list()


@router.post(
    "/{algorithm_id}/trace",
    response_model=AlgorithmTraceResponse,
    response_model_exclude_none=True,
    summary="通用算法真實執行軌跡",
)
def create_algorithm_trace(
    algorithm_id: str,
    payload: AlgorithmTraceRequest,
) -> AlgorithmTraceResponse:
    """按 algorithm_id 真实执行算法并返回协议轨迹；未知/未实现返回 404。"""
    try:
        return build_algorithm_trace(
            algorithm_id=algorithm_id,
            values=payload.values,
            direction=payload.direction,
            early_exit=payload.options.early_exit,
        )
    except UnknownAlgorithmError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TraceValidationError as exc:
        raise _validation_error(exc) from exc
