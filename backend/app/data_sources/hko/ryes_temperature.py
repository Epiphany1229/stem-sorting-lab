"""RYES 日报中的逐日气温解析（阶段 5.1 近期补数用）。

数据来源（官方，实测 2026-10-25）::

    GET https://data.weather.gov.hk/weatherAPI/opendata/opendata.php
        ?dataType=RYES&lang=en&rformat=json&date=YYYYMMDD

响应是**平铺 JSON**：每个站有一组 ``<Prefix>LocationName``、``<Prefix>MaxTemp``、
``<Prefix>MinTemp`` 键；``ReportTimeInfoDate`` 是资料所属日期（``BulletinDate``
是发布日，通常为次日）。本模块只负责把**名称明确对应官方 39 站**的站映射出来：

- 映射依据：实测 RYES 的 ``<Prefix>LocationName`` 英文名与 ``stations.json`` 的
  ``name_en`` 完全一致（大小写不敏感）才映射；HKO 的键名是 ``HKOReadings*``、
  京士柏是 ``KingsParkReadings*``，按 LocationName 对应到 HKO / KP。
- 官方 39 站里没有同名站的键（例如 Chek Lap Kok、Kat O、Ping Chau、Tai Po…）
  **一律跳过并计数**，不按行政区或近似名称猜测。
- 值保持官方原始字符串；``***`` 等缺失标记不入库、不写 0。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.app.data_sources.hko.client import HkoDataError
from backend.app.data_sources.hko.ryes import _parse_date_text
from backend.app.services.hko_ingest import ParsedDailyRow
from backend.app.services.weather_util import (
    METRIC_TMAX,
    METRIC_TMIN,
    QUALITY_COMPLETE,
    TEMPERATURE_UNIT,
)

# 写入 source_document / 请求参数的数据集键
RYES_TEMPERATURE_DATASET_KEY = "RYES"
# RYES 平铺键前缀 → (官方站号, 期望的 LocationName；None 表示该前缀没有 LocationName)。
# 依据：``<Prefix>LocationName`` 与 stations.json 的 name_en 完全一致（见模块 docstring）。
RYES_TEMPERATURE_PREFIXES: dict[str, tuple[str, str | None]] = {
    "HKOReadings": ("HKO", None),
    "CheungChau": ("CCH", "Cheung Chau"),
    "HappyValley": ("HPV", "Happy Valley"),
    "HongKongPark": ("HKP", "Hong Kong Park"),
    "KaiTakRunwayPark": ("SE1", "Kai Tak Runway Park"),
    "KingsParkReadings": ("KP", "King's Park"),
    "KowloonCity": ("KLT", "Kowloon City"),
    "KwunTong": ("KTG", "Kwun Tong"),
    "LauFauShan": ("LFS", "Lau Fau Shan"),
    "SaiKung": ("SKG", "Sai Kung"),
    "ShaTin": ("SHA", "Sha Tin"),
    "ShamShuiPo": ("SSP", "Sham Shui Po"),
    "ShauKeiWan": ("SKW", "Shau Kei Wan"),
    "ShekKong": ("SEK", "Shek Kong"),
    "Stanley": ("STY", "Stanley"),
    "TaKwuLing": ("TKL", "Ta Kwu Ling"),
    "TaiMeiTuk": ("PLC", "Tai Mei Tuk"),
    "TseungKwanO": ("JKB", "Tseung Kwan O"),
    "TsuenWanShingMunValley": ("TW", "Tsuen Wan Shing Mun Valley"),
    "WongChukHang": ("HKS", "Wong Chuk Hang"),
    "WongTaiSin": ("WTS", "Wong Tai Sin"),
    "YuenLongPark": ("YLP", "Yuen Long Park"),
}

# 官方缺失/不可用标记（温度响应里通常只有 *** 或空字符串）
MISSING_TOKENS: frozenset[str] = frozenset(
    {"***", "", "na", "n/a", "-", "trace"}
)
# RYES 日温度键后缀
_TEMP_SUFFIXES: tuple[tuple[str, str], ...] = (("MaxTemp", METRIC_TMAX), ("MinTemp", METRIC_TMIN))


class RyesTemperatureParseError(HkoDataError):
    """RYES 响应结构不符合预期或温度数值无法解析。"""


@dataclass(frozen=True)
class RyesTemperatureDay:
    """单日 RYES 温度解析结果。"""

    requested_date: date
    bulletin_date: date | None
    report_date: date | None
    rows: tuple[ParsedDailyRow, ...] = ()
    # 未映射到官方 39 站的温度键（跳过并计数，不猜测）
    unmapped_keys: tuple[str, ...] = ()
    # 缺失/不可用的温度键
    missing_fields: tuple[str, ...] = ()
    # LocationName 与官方 name_en 不符而跳过的站
    name_mismatches: tuple[str, ...] = ()
    # 跳过原因：date_mismatch / no_temperature_fields
    skip_reason: str | None = None


def _normalise_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _format_numeric_raw(value: object) -> str | None:
    """把 JSON 数值转成原始字符串（不重新舍入、不编造精度）。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        return value.strip()
    return None


def _parse_temperature(
    payload: dict[str, object],
    key: str,
) -> tuple[float | None, str | None]:
    """解析单个温度键；返回 (数值, 原始字符串)，缺失时两者都为 None。"""
    raw = _format_numeric_raw(payload.get(key))
    if raw is None or raw.casefold() in MISSING_TOKENS:
        return None, None
    try:
        numeric = float(raw)
    except ValueError as exc:
        raise RyesTemperatureParseError(f"RYES 温度数值无法解析：{key}={raw!r}") from exc
    return numeric, raw


def parse_ryes_temperature_payload(
    payload: object,
    *,
    requested_date: date,
) -> RyesTemperatureDay:
    """解析一天 RYES 温度；``ReportTimeInfoDate`` 不符时返回 date_mismatch。"""
    if not isinstance(payload, dict):
        raise RyesTemperatureParseError("RYES 响应不是 JSON 对象")
    bulletin = _parse_date_text(payload.get("BulletinDate"))
    report = _parse_date_text(payload.get("ReportTimeInfoDate"))
    data_date = report if report is not None else bulletin
    if data_date is not None and data_date != requested_date:
        return RyesTemperatureDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            skip_reason="date_mismatch",
        )

    rows: list[ParsedDailyRow] = []
    missing: list[str] = []
    mismatches: list[str] = []
    for prefix, (station_id, expected_name) in RYES_TEMPERATURE_PREFIXES.items():
        location = _normalise_name(payload.get(f"{prefix}LocationName"))
        if (
            location is not None
            and expected_name is not None
            and location.casefold() != expected_name.casefold()
        ):
            mismatches.append(f"{prefix}:{location}")
            continue
        for suffix, metric in _TEMP_SUFFIXES:
            key = f"{prefix}{suffix}"
            value, raw = _parse_temperature(payload, key)
            if value is None or raw is None:
                missing.append(key)
                continue
            rows.append(
                ParsedDailyRow(
                    station_id=station_id,
                    metric=metric,
                    obs_date=requested_date,
                    value_raw=raw,
                    value=value,
                    unit=TEMPERATURE_UNIT,
                    quality_flag=QUALITY_COMPLETE,
                )
            )

    known_keys = {
        f"{prefix}{suffix}"
        for prefix in RYES_TEMPERATURE_PREFIXES
        for suffix, _metric in _TEMP_SUFFIXES
    }
    unmapped = tuple(
        sorted(
            key
            for key in payload
            if (key.endswith("MaxTemp") or key.endswith("MinTemp")) and key not in known_keys
        )
    )
    if not rows:
        return RyesTemperatureDay(
            requested_date=requested_date,
            bulletin_date=bulletin,
            report_date=report,
            unmapped_keys=unmapped,
            missing_fields=tuple(sorted(missing)),
            name_mismatches=tuple(mismatches),
            skip_reason="no_temperature_fields",
        )
    return RyesTemperatureDay(
        requested_date=requested_date,
        bulletin_date=bulletin,
        report_date=report,
        rows=tuple(rows),
        unmapped_keys=unmapped,
        missing_fields=tuple(sorted(missing)),
        name_mismatches=tuple(mismatches),
    )


__all__ = [
    "MISSING_TOKENS",
    "RYES_TEMPERATURE_DATASET_KEY",
    "RYES_TEMPERATURE_PREFIXES",
    "RyesTemperatureDay",
    "RyesTemperatureParseError",
    "parse_ryes_temperature_payload",
]
