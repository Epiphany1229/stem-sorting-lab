"""天气数据路由：严格按 docs/weather-data-design.md §3 / §3.1 的字段形状返回。

所有接口都接受 ``?mode=official|demo|imported``（省略即 official），并把
``mode/notice/window/coverage/reason/sources`` 放在统一信封里。失败时尽量
返回结构化原因而不是 500。
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response

from backend.app.api.weather_deps import (
    AppSettingsDep,
    ClientFactoryDep,
    DatabaseDep,
)
from backend.app.schemas.weather import (
    CoverageResponse,
    DailyResponse,
    ImportResponse,
    RefreshRequest,
    RefreshResponse,
    StationsResponse,
    SummaryResponse,
)
from backend.app.services.hko_ingest import WindowParameterError
from backend.app.services.weather_service import (
    SelectionError,
    build_coverage_response,
    build_daily_response,
    build_export_csv,
    build_stations_response,
    build_summary_response,
    import_csv,
    run_refresh,
)

router = APIRouter(prefix="/api/weather", tags=["weather"])

ModeQuery = Literal["official", "demo", "imported"]
# 上传文件大小上限（5MB），避免一次导入过大导致内存与事务压力
MAX_IMPORT_BYTES = 5 * 1024 * 1024


def _selection_error(exc: Exception) -> HTTPException:
    """把参数类异常转换成 422，保持与算法接口一致的错误结构。"""
    return HTTPException(
        status_code=422,
        detail=[{"type": "value_error", "loc": ["query"], "msg": str(exc)}],
    )


@router.get("/stations", response_model=StationsResponse, summary="官方 39 站与可用数据范围")
def get_stations(
    settings: AppSettingsDep,
    database: DatabaseDep,
    mode: ModeQuery = "official",
) -> StationsResponse:
    """返回 39 站字典 + 各站在当前模式下的可用天数、起止日与指标。"""
    return build_stations_response(database, settings, mode=mode)


@router.get("/coverage", response_model=CoverageResponse, summary="窗口覆盖率与缺口")
def get_coverage(
    settings: AppSettingsDep,
    database: DatabaseDep,
    start: str | None = None,
    end: str | None = None,
    stations: str | None = None,
    metrics: str | None = None,
    mode: ModeQuery = "official",
) -> CoverageResponse:
    """返回真实首末可用日、每站每指标天数、缺口日期与不完整日期。"""
    try:
        return build_coverage_response(
            database,
            settings,
            mode=mode,
            start_text=start,
            end_text=end,
            stations_raw=stations,
            metrics_raw=metrics,
        )
    except (SelectionError, WindowParameterError) as exc:
        raise _selection_error(exc) from exc


@router.get("/daily", response_model=DailyResponse, summary="逐日气温序列")
def get_daily(
    settings: AppSettingsDep,
    database: DatabaseDep,
    start: str | None = None,
    end: str | None = None,
    stations: str | None = None,
    metrics: str | None = None,
    mode: ModeQuery = "official",
) -> DailyResponse:
    """返回逐日序列；``value_raw`` 保留官方原始字符串精度。"""
    try:
        return build_daily_response(
            database,
            settings,
            mode=mode,
            start_text=start,
            end_text=end,
            stations_raw=stations,
            metrics_raw=metrics,
        )
    except (SelectionError, WindowParameterError) as exc:
        raise _selection_error(exc) from exc


@router.get("/summary", response_model=SummaryResponse, summary="温度区间天数统计")
def get_summary(
    settings: AppSettingsDep,
    database: DatabaseDep,
    station: str,
    metric: Literal["tmax", "tmin", "tmean"],
    start: str | None = None,
    end: str | None = None,
    bins: Annotated[int, Query(ge=1, le=20)] = 4,
    mode: ModeQuery = "official",
) -> SummaryResponse:
    """按教学口径等分温度区间并统计天数，明确标注"非官方标准"。"""
    try:
        return build_summary_response(
            database,
            settings,
            mode=mode,
            start_text=start,
            end_text=end,
            station_id=station,
            metric=metric,
            bin_count=bins,
        )
    except (SelectionError, WindowParameterError) as exc:
        raise _selection_error(exc) from exc


@router.post("/refresh", response_model=RefreshResponse, summary="受冷却/预算/熔断约束的刷新")
async def post_refresh(
    settings: AppSettingsDep,
    database: DatabaseDep,
    client_factory: ClientFactoryDep,
    payload: RefreshRequest | None = None,
) -> RefreshResponse:
    """触发一次官方抓取；失败也返回 200 + ``accepted=false`` + 可理解原因。"""
    request_payload = payload if payload is not None else RefreshRequest()
    try:
        return await run_refresh(database, settings, client_factory, request_payload)
    except (SelectionError, WindowParameterError) as exc:
        raise _selection_error(exc) from exc


@router.post("/import", response_model=ImportResponse, summary="导入官方 CSV")
async def post_import(
    request: Request,
    settings: AppSettingsDep,
    database: DatabaseDep,
) -> ImportResponse:
    """接受官方 ``rformat=csv`` 原始格式或规范 6 列格式，返回逐行校验报告。"""
    content = await _read_uploaded_csv(request)
    try:
        return import_csv(database, settings, content=content)
    except SelectionError as exc:  # pragma: no cover - 导入流程不涉及选择参数
        raise _selection_error(exc) from exc


@router.get("/export.csv", summary="导出当前查询范围 CSV")
def get_export_csv(
    settings: AppSettingsDep,
    database: DatabaseDep,
    start: str | None = None,
    end: str | None = None,
    stations: str | None = None,
    metrics: str | None = None,
    mode: ModeQuery = "official",
) -> Response:
    """导出规范 6 列 CSV：obs_date,station_id,metric,value_raw,unit,quality_flag。"""
    try:
        text = build_export_csv(
            database,
            settings,
            mode=mode,
            start_text=start,
            end_text=end,
            stations_raw=stations,
            metrics_raw=metrics,
        )
    except (SelectionError, WindowParameterError) as exc:
        raise _selection_error(exc) from exc
    return Response(
        content=text,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="hko_weather_export.csv"',
        },
    )


# ------------------------------------------------------------------ 上传解析


async def _read_uploaded_csv(request: Request) -> bytes:
    """从 multipart/form-data（字段名 ``file``）或原始请求体读取 CSV 字节。

    说明：项目依赖里没有 ``python-multipart``，这里按 RFC 7578 的常见子集
    手工解析 multipart，避免为一个上传功能新增运行时依赖；同时保留"直接
    以 text/csv 提交原始 CSV 文本"的兼容路径。
    """
    content_type = request.headers.get("content-type", "")
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=422, detail="未收到文件内容")
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="上传文件过大（上限 5MB）")
    if content_type.split(";")[0].strip().lower() == "multipart/form-data":
        boundary = _multipart_boundary(content_type)
        if boundary is None:
            raise HTTPException(status_code=400, detail="multipart 请求缺少 boundary")
        return _extract_multipart_file(raw, boundary)
    return raw


def _multipart_boundary(content_type: str) -> str | None:
    """从 Content-Type 中取出 multipart boundary。"""
    for part in content_type.split(";"):
        candidate = part.strip()
        if candidate.lower().startswith("boundary="):
            return candidate[len("boundary=") :].strip().strip('"')
    return None


def _extract_multipart_file(raw: bytes, boundary: str) -> bytes:
    """从 multipart 请求体中提取字段名为 ``file`` 的文件内容。"""
    delimiter = b"--" + boundary.encode("utf-8")
    for part in raw.split(delimiter):
        if not part or part in {b"--\r\n", b"--", b"\r\n"}:
            continue
        if b"\r\n\r\n" not in part:
            continue
        header_block, body = part.split(b"\r\n\r\n", 1)
        headers = header_block.decode("latin-1", errors="replace")
        if 'name="file"' not in headers:
            continue
        if body.endswith(b"\r\n"):
            body = body[:-2]
        if not body:
            raise HTTPException(status_code=422, detail="上传文件为空")
        return body
    raise HTTPException(
        status_code=422,
        detail='multipart 中未找到字段名为 file 的文件（表单字段名必须是 file）',
    )
