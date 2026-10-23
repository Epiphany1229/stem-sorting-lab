"""官方 39 站字典的唯一加载入口。

站号、中英文名与资料起始年来自官方 API 说明书 PDF（2025-09-22 版）解析产物
``backend/app/data_sources/hko/stations.json``；本模块只负责读取与校验，
**不得**在代码里另抄一份站点常量。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Final

from backend.app.core.settings import Settings

# 写入 station.source_ref 的固定来源标记（与设计文档 §2.1 一致）
SOURCE_REF: Final = "HKO_Open_Data_API_Documentation.pdf@2025-09-22 §CLMTEMP"
# 包内置的官方字典路径（settings.station_registry_path 留空时使用）
BUNDLED_REGISTRY_PATH: Final = Path(__file__).resolve().parent / "stations.json"


class StationRegistryError(Exception):
    """站点字典缺失、格式错误或内容非法。"""


@dataclass(frozen=True)
class StationRecord:
    """一条官方测站记录。"""

    id: str
    name_en: str
    name_zh_hant: str
    start_year: int


def resolve_registry_path(settings: Settings | None = None) -> Path:
    """确定站点字典文件路径：显式配置优先，否则用包内置文件。"""
    if settings is not None and settings.station_registry_path.strip():
        path = Path(settings.station_registry_path).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if not path.is_file():
            raise StationRegistryError(f"站点字典文件不存在：{path}")
        return path
    return BUNDLED_REGISTRY_PATH


@lru_cache(maxsize=8)
def _load_registry(path_text: str) -> tuple[StationRecord, ...]:
    """按文件路径缓存解析结果，避免每次请求都读盘。"""
    path = Path(path_text)
    try:
        raw_text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:  # pragma: no cover - 仅在部署环境异常时触发
        raise StationRegistryError(f"无法读取站点字典：{path}: {exc}") from exc
    try:
        payload: object = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise StationRegistryError(f"站点字典不是合法 JSON：{path}") from exc

    if not isinstance(payload, dict):
        raise StationRegistryError("站点字典顶层必须是 JSON 对象")
    stations_raw = payload.get("stations")
    if not isinstance(stations_raw, list) or not stations_raw:
        raise StationRegistryError("站点字典缺少非空 stations 数组")

    records: list[StationRecord] = []
    seen: set[str] = set()
    for index, item in enumerate(stations_raw):
        record = _parse_station(item, index)
        if record.id in seen:
            raise StationRegistryError(f"站点代号重复：{record.id}")
        seen.add(record.id)
        records.append(record)
    return tuple(records)


def _parse_station(item: object, index: int) -> StationRecord:
    """校验并解析单条站点记录。"""
    if not isinstance(item, dict):
        raise StationRegistryError(f"stations[{index}] 不是对象")
    station_id = item.get("id")
    name_en = item.get("name_en")
    name_zh_hant = item.get("name_zh_hant")
    start_year = item.get("start_year")
    if not isinstance(station_id, str) or not station_id:
        raise StationRegistryError(f"stations[{index}].id 非法")
    if not isinstance(name_en, str) or not name_en:
        raise StationRegistryError(f"stations[{index}].name_en 非法")
    if not isinstance(name_zh_hant, str) or not name_zh_hant:
        raise StationRegistryError(f"stations[{index}].name_zh_hant 非法")
    if not isinstance(start_year, int) or isinstance(start_year, bool):
        raise StationRegistryError(f"stations[{index}].start_year 非法")
    return StationRecord(
        id=station_id,
        name_en=name_en,
        name_zh_hant=name_zh_hant,
        start_year=start_year,
    )


def load_station_registry(settings: Settings | None = None) -> list[StationRecord]:
    """返回官方 39 站（按站号排序），只读。"""
    path = resolve_registry_path(settings)
    return sorted(_load_registry(str(path)), key=lambda record: record.id)


def station_ids(settings: Settings | None = None) -> frozenset[str]:
    """返回合法站号集合，用于 CSV 导入校验。"""
    return frozenset(record.id for record in load_station_registry(settings))


def find_station(station_id: str, settings: Settings | None = None) -> StationRecord | None:
    """按站号查记录；不存在返回 None。"""
    for record in load_station_registry(settings):
        if record.id == station_id:
            return record
    return None
