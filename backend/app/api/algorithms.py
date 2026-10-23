"""算法轨迹路由：阶段 2 只暴露冒泡排序的真实执行轨迹。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.schemas.trace import BubbleTraceRequest, TraceResponse
from backend.app.services.trace_service import (
    TraceValidationError,
    build_bubble_trace,
)

router = APIRouter(prefix="/api/algorithms", tags=["algorithms"])


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
        raise HTTPException(
            status_code=422,
            detail=[
                {
                    "type": "value_error",
                    "loc": ["body", exc.field],
                    "msg": exc.message,
                }
            ],
        ) from exc
