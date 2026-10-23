"""CSV 导入/导出与演示数据加载。

规则（见设计文档 §6 与任务契约）：
- 支持官方 ``rformat=csv`` 原始格式（双语标题 2 行 + 字段行 + 数据 + 3 行 legend），
  也支持规范 6 列格式（``obs_date,station_id,metric,value_raw,unit,quality_flag``）；
- 逐行校验日期、站号（必须在官方 39 站名单内）、数值精度与质量标记；
- 导入行 ``mode='imported'``，与 official 分开存储、分开标注；
- 演示数据只读 ``sample_data/demo``，**不写数据库**，且必须常驻"示範資料"提示。
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.registry import (
    StationRecord,
    load_station_registry,
    station_ids,
)
from backend.app.models.base import HK_TZ, utc_now_naive
from backend.app.models.db import Database
from backend.app.schemas.weather import ImportErrorItem, SourceInfo
from backend.app.services.hko_ingest import (
    ParsedDailyRow,
    PendingRow,
    upsert_daily_rows,
)
from backend.app.services.weather_util import (
    METRIC_TMAX,
    METRIC_TMEAN,
    METRIC_TMIN,
    QUALITY_COMPLETE,
    QUALITY_INCOMPLETE,
    QUALITY_UNAVAILABLE,
    TEMPERATURE_METRICS,
    TEMPERATURE_UNIT,
    parse_iso_date,
    resolve_project_path,
)

# 规范 6 列格式（与 /api/weather/export.csv 一致）
CANONICAL_COLUMNS: tuple[str, ...] = (
    "obs_date",
    "station_id",
    "metric",
    "value_raw",
    "unit",
    "quality_flag",
)
FORMAT_OFFICIAL_CSV = "official_csv"
FORMAT_CANONICAL_CSV = "canonical_csv"
FORMAT_UNKNOWN = "unknown"

# 数值格式：保精度，禁止科学计数法
_VALUE_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d+)?$")


class _RowError(Exception):
    """单行校验失败（进入 errors 报告）。"""

    def __init__(self, reason: str, detail: str) -> None:
        self.reason = reason
        self.detail = detail
        super().__init__(f"{reason}: {detail}")


class _RowMissing(Exception):
    """单行被标记为无数据（进入 skipped 报告）。"""

    def __init__(self, reason: str, detail: str) -> None:
        self.reason = reason
        self.detail = detail
        super().__init__(f"{reason}: {detail}")


@dataclass(frozen=True)
class ImportRow:
    """一条通过校验、可写入数据库的导入行。"""

    line: int
    station_id: str
    metric: str
    obs_date: date
    value_raw: str
    value: float
    unit: str
    quality_flag: str


@dataclass
class ImportParseResult:
    """CSV 解析报告：成功行、跳过行、错误行与识别出的格式。"""

    detected_format: str
    rows: list[ImportRow] = field(default_factory=list)
    errors: list[ImportErrorItem] = field(default_factory=list)
    skipped: list[ImportErrorItem] = field(default_factory=list)


def decode_csv_bytes(content: bytes) -> str | None:
    """按常见编码解码上传内容；全部失败返回 None。"""
    for encoding in ("utf-8-sig", "utf-8", "big5", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def _read_rows(text: str) -> list[tuple[int, list[str]]]:
    """读取 CSV 为 ``(行号, 单元格)``；跳过全空行，保留真实行号。"""
    reader = csv.reader(io.StringIO(text))
    rows: list[tuple[int, list[str]]] = []
    for line_no, cells in enumerate(reader, start=1):
        if any(cell.strip() for cell in cells):
            rows.append((line_no, cells))
    return rows


def detect_metric_from_text(text: str) -> str | None:
    """从官方 CSV 的双语标题里识别指标（最高/最低/平均）。"""
    folded = text.casefold()
    if "最高" in text or "maximum" in folded:
        return METRIC_TMAX
    if "最低" in text or "minimum" in folded:
        return METRIC_TMIN
    if "平均" in text or "mean" in folded or "average" in folded:
        return METRIC_TMEAN
    return None


def _match_station_title(text: str, records: Sequence[StationRecord]) -> str | None:
    """在标题文本里查找站名；支持 API 显示名是正式名后缀的情况。"""
    folded = text.casefold()
    for record in records:
        if record.name_en and record.name_en.casefold() in folded:
            return record.id
    for record in records:
        if record.name_zh_hant and record.name_zh_hant in text:
            return record.id
    # API 的 type 文本可能用简称（例如「天文台」对应正式名「香港天文台」），
    # 只在"唯一后缀匹配"时才接受，避免按站名猜测
    fragments = [part.strip() for part in re.split(r"[-–—:：]", text) if part.strip()]
    candidates: set[str] = set()
    for fragment in fragments:
        for record in records:
            if len(record.name_zh_hant) > len(fragment) and record.name_zh_hant.endswith(fragment):
                candidates.add(record.id)
    if len(candidates) == 1:
        return candidates.pop()
    return None


def detect_station_from_text(text: str, settings: Settings) -> str | None:
    """从官方 CSV 标题识别官方站号；无法唯一确定时返回 None。"""
    return _match_station_title(text, load_station_registry(settings))


def _build_row(
    *,
    line: int,
    station_id: str,
    metric: str,
    date_text: str,
    value_raw: str,
    quality_flag: str,
    unit: str,
    allowed_ids: frozenset[str],
) -> ImportRow:
    """校验并构造一行导入数据；失败抛 ``_RowError`` / ``_RowMissing``。"""
    station = station_id.strip()
    if station not in allowed_ids:
        raise _RowError("unknown_station", f"站号不在官方 39 站名单内：{station!r}")
    normalized_metric = metric.strip().lower()
    if normalized_metric not in TEMPERATURE_METRICS:
        raise _RowError("unknown_metric", f"未知指标：{metric!r}")
    obs_date = parse_iso_date(date_text)
    if obs_date is None:
        raise _RowError("invalid_date", f"日期不合法：{date_text!r}")
    flag = quality_flag.strip() or QUALITY_COMPLETE
    if flag == QUALITY_UNAVAILABLE:
        raise _RowMissing("no_data", f"官方标记为无数据（{QUALITY_UNAVAILABLE}）")
    if flag not in {QUALITY_COMPLETE, QUALITY_INCOMPLETE}:
        raise _RowError("unknown_quality_flag", f"未知质量标记：{flag!r}")
    raw_value = value_raw.strip()
    if not _VALUE_PATTERN.match(raw_value):
        raise _RowError("invalid_value", f"数值无法解析：{raw_value!r}")
    return ImportRow(
        line=line,
        station_id=station,
        metric=normalized_metric,
        obs_date=obs_date,
        value_raw=raw_value,
        value=float(raw_value),
        unit=unit.strip() or TEMPERATURE_UNIT,
        quality_flag=flag,
    )


def parse_import_csv(content: bytes, settings: Settings) -> ImportParseResult:
    """解析导入文件，自动识别官方格式与规范 6 列格式。"""
    text = decode_csv_bytes(content)
    if text is None:
        return ImportParseResult(
            detected_format=FORMAT_UNKNOWN,
            errors=[
                ImportErrorItem(
                    line=0,
                    reason="decode_error",
                    detail="无法解码 CSV，请使用 UTF-8 / Big5 / GB18030 编码",
                )
            ],
        )
    rows = _read_rows(text)
    if not rows:
        return ImportParseResult(
            detected_format=FORMAT_UNKNOWN,
            errors=[ImportErrorItem(line=0, reason="empty_file", detail="文件没有数据行")],
        )
    if _looks_like_canonical(rows[0][1]):
        return _parse_canonical(rows, settings)
    if _looks_like_official(rows):
        return _parse_official(rows, settings)
    return ImportParseResult(
        detected_format=FORMAT_UNKNOWN,
        errors=[
            ImportErrorItem(
                line=rows[0][0],
                reason="unknown_format",
                detail="无法识别 CSV 格式（既不是官方 rformat=csv，也不是规范 6 列）",
            )
        ],
    )


def _looks_like_canonical(cells: Sequence[str]) -> bool:
    lowered = {cell.strip().lower() for cell in cells}
    return "obs_date" in lowered and "station_id" in lowered


def _looks_like_official(rows: Sequence[tuple[int, list[str]]]) -> bool:
    for _, cells in rows[:3]:
        joined = " ".join(cells).casefold()
        if "year" in joined and "value" in joined:
            return True
    return False


def _parse_canonical(
    rows: Sequence[tuple[int, list[str]]],
    settings: Settings,
) -> ImportParseResult:
    """解析规范 6 列格式（带表头）。"""
    header_line, header_cells = rows[0]
    index_map = {cell.strip().lower(): index for index, cell in enumerate(header_cells)}
    required = ("obs_date", "station_id", "metric", "value_raw")
    missing = [column for column in required if column not in index_map]
    if missing:
        return ImportParseResult(
            detected_format=FORMAT_CANONICAL_CSV,
            errors=[
                ImportErrorItem(
                    line=header_line,
                    reason="missing_column",
                    detail=f"缺少必需列：{', '.join(missing)}",
                )
            ],
        )
    allowed_ids = station_ids(settings)
    result = ImportParseResult(detected_format=FORMAT_CANONICAL_CSV)
    for line_no, cells in rows[1:]:
        try:
            row = _build_row(
                line=line_no,
                station_id=_cell(cells, index_map.get("station_id")),
                metric=_cell(cells, index_map.get("metric")),
                date_text=_cell(cells, index_map.get("obs_date")),
                value_raw=_cell(cells, index_map.get("value_raw")),
                quality_flag=_cell(cells, index_map.get("quality_flag")),
                unit=_cell(cells, index_map.get("unit")),
                allowed_ids=allowed_ids,
            )
        except _RowMissing as exc:
            result.skipped.append(
                ImportErrorItem(line=line_no, reason=exc.reason, detail=exc.detail)
            )
            continue
        except _RowError as exc:
            result.errors.append(
                ImportErrorItem(line=line_no, reason=exc.reason, detail=exc.detail)
            )
            continue
        result.rows.append(row)
    return result


def _parse_official(
    rows: Sequence[tuple[int, list[str]]],
    settings: Settings,
) -> ImportParseResult:
    """解析官方 ``rformat=csv`` 原始格式。"""
    field_index = -1
    for index, (_, cells) in enumerate(rows[:5]):
        joined = " ".join(cells).casefold()
        if "year" in joined and "value" in joined:
            field_index = index
            break
    if field_index < 0:
        return ImportParseResult(
            detected_format=FORMAT_OFFICIAL_CSV,
            errors=[
                ImportErrorItem(
                    line=rows[0][0],
                    reason="unknown_format",
                    detail="官方格式缺少字段行（年/Year …）",
                )
            ],
        )
    title_text = " ".join(" ".join(cells) for _, cells in rows[:field_index])
    station_id = detect_station_from_text(title_text, settings)
    metric = detect_metric_from_text(title_text)
    result = ImportParseResult(detected_format=FORMAT_OFFICIAL_CSV)
    if station_id is None:
        result.errors.append(
            ImportErrorItem(
                line=rows[0][0],
                reason="unknown_station",
                detail=f"无法从标题识别官方站号：{title_text.strip()[:200]}",
            )
        )
        return result
    if metric is None:
        result.errors.append(
            ImportErrorItem(
                line=rows[0][0],
                reason="unknown_metric",
                detail=f"无法从标题识别指标：{title_text.strip()[:200]}",
            )
        )
        return result
    allowed_ids = station_ids(settings)
    field_line = rows[field_index][0]
    data_lines = rows[field_index + 1 :]
    for line_no, cells in data_lines:
        first = cells[0].strip() if cells else ""
        # 数据区之后是 3 行 legend 图例，遇到非年份行即结束
        if not (len(first) == 4 and first.isdigit()):
            break
        if len(cells) < 5:
            result.errors.append(
                ImportErrorItem(
                    line=line_no, reason="invalid_row", detail="官方格式数据行不足 5 列"
                )
            )
            continue
        try:
            year = int(first)
            month = int(cells[1].strip())
            day = int(cells[2].strip())
        except ValueError:
            result.errors.append(
                ImportErrorItem(
                    line=line_no,
                    reason="invalid_date",
                    detail=f"无法解析年月日：{cells[0]!r}-{cells[1]!r}-{cells[2]!r}",
                )
            )
            continue
        try:
            row = _build_row(
                line=line_no,
                station_id=station_id,
                metric=metric,
                date_text=f"{year:04d}-{month:02d}-{day:02d}",
                value_raw=cells[3],
                quality_flag=cells[4],
                unit=TEMPERATURE_UNIT,
                allowed_ids=allowed_ids,
            )
        except _RowMissing as exc:
            result.skipped.append(
                ImportErrorItem(line=line_no, reason=exc.reason, detail=exc.detail)
            )
            continue
        except _RowError as exc:
            result.errors.append(
                ImportErrorItem(line=line_no, reason=exc.reason, detail=exc.detail)
            )
            continue
        result.rows.append(row)
    if not result.rows and not result.errors:
        result.errors.append(
            ImportErrorItem(
                line=field_line,
                reason="no_data_rows",
                detail="文件缺少数据行（可能只有标题与图例）",
            )
        )
    return result


def _cell(cells: Sequence[str], index: int | None) -> str:
    """按列下标安全取值；缺列/越界返回空字符串。"""
    if index is None or index >= len(cells):
        return ""
    return cells[index]


def apply_import(database: Database, rows: Sequence[ImportRow]) -> int:
    """把通过校验的导入行以 ``mode='imported'`` 幂等写入，返回写入行数。"""
    fetched_at = utc_now_naive()
    pending = [
        PendingRow(
            row=ParsedDailyRow(
                station_id=row.station_id,
                metric=row.metric,
                obs_date=row.obs_date,
                value_raw=row.value_raw,
                value=row.value,
                unit=row.unit,
                quality_flag=row.quality_flag,
            ),
            source_document_id=None,
            fetched_at=fetched_at,
        )
        for row in rows
    ]
    return upsert_daily_rows(database, pending, mode="imported")


def export_csv_text(records: Sequence[ParsedDailyRow]) -> str:
    """把查询结果导出为规范 6 列 CSV 文本。"""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CANONICAL_COLUMNS)
    for record in records:
        writer.writerow(
            [
                record.obs_date.isoformat(),
                record.station_id,
                record.metric,
                record.value_raw,
                record.unit,
                record.quality_flag,
            ]
        )
    return buffer.getvalue()


# ------------------------------------------------------------------ 演示数据（只读）


def demo_csv_path(settings: Settings) -> Path:
    """演示数据样本文件的绝对路径。"""
    return resolve_project_path(settings.demo_data_path)


def _demo_fetched_at(settings: Settings) -> str | None:
    """用样本文件修改时间近似"抓取时间"，仅用于展示。"""
    path = demo_csv_path(settings)
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    moment = datetime.fromtimestamp(mtime, tz=timezone.utc).astimezone(HK_TZ)
    return moment.isoformat()


def demo_notice(settings: Settings) -> str:
    """演示模式常驻提示（繁体中文 + 英文）。"""
    fetched = _demo_fetched_at(settings)
    suffix = f"，抓取時間 {fetched}" if fetched else ""
    return (
        f"示範資料：官方月表真實快照（非即時，樣本 {demo_csv_path(settings).name}{suffix}）"
        " / Demo data: real snapshot of the official monthly table, not live"
    )


IMPORTED_NOTICE = (
    "匯入資料：使用者上傳的官方 CSV，非自動抓取 / "
    "Imported data: user-uploaded official CSV, not auto-fetched"
)


def demo_source(settings: Settings) -> SourceInfo:
    """演示模式的数据来源说明。"""
    path = demo_csv_path(settings)
    return SourceInfo(
        dataset="DEMO_SNAPSHOT",
        endpoint=str(path),
        fetched_at=_demo_fetched_at(settings),
        last_modified=None,
        mode="demo",
    )


def read_demo_records(settings: Settings) -> list[ParsedDailyRow]:
    """读取演示 CSV 全部行；文件缺失或坏行时返回已解析部分（只读、不抛异常）。"""
    path = demo_csv_path(settings)
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return []
    reader = csv.DictReader(io.StringIO(text))
    records: list[ParsedDailyRow] = []
    for row in reader:
        obs_date = parse_iso_date(row.get("obs_date"))
        station_id = (row.get("station_id") or "").strip()
        metric = (row.get("metric") or "").strip().lower()
        raw_value = (row.get("value_raw") or "").strip()
        if obs_date is None or not station_id or metric not in TEMPERATURE_METRICS:
            continue
        if not _VALUE_PATTERN.match(raw_value):
            continue
        flag = (row.get("quality_flag") or "").strip() or QUALITY_COMPLETE
        if flag == QUALITY_UNAVAILABLE:
            continue
        records.append(
            ParsedDailyRow(
                station_id=station_id,
                metric=metric,
                obs_date=obs_date,
                value_raw=raw_value,
                value=float(raw_value),
                unit=(row.get("unit") or "").strip() or TEMPERATURE_UNIT,
                quality_flag=flag,
            )
        )
    return records


def demo_date_range(settings: Settings) -> tuple[date | None, date | None]:
    """演示数据的真实起止日期（用于窗口锚点）。"""
    records = read_demo_records(settings)
    if not records:
        return None, None
    dates = [record.obs_date for record in records]
    return min(dates), max(dates)


def load_demo_records(
    settings: Settings,
    *,
    start: date,
    end: date,
    stations: Sequence[str],
    metrics: Sequence[str],
) -> list[ParsedDailyRow]:
    """按窗口/站点/指标筛选演示数据（不写入数据库）。"""
    station_set = set(stations)
    metric_set = set(metrics)
    records = [
        record
        for record in read_demo_records(settings)
        if start <= record.obs_date <= end
        and record.station_id in station_set
        and record.metric in metric_set
    ]
    records.sort(key=lambda item: (item.obs_date, item.station_id, item.metric))
    return records
