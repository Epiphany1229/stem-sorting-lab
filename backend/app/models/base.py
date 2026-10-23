"""ORM 基类与统一时间工具。

约定：数据库内所有 DATETIME 列一律存**不带时区的 UTC 时间**（SQLite 对带时区
 datetime 的存储行为不稳定），对外序列化时再补回 ``+00:00``。香港本地日期按
 UTC+8 计算，避免服务器时区不同导致"自然日"错位。
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Final

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """全部 ORM 模型的公共基类。"""


# 香港时区固定 UTC+8（香港无夏令时）
HK_TZ: Final = timezone(timedelta(hours=8))


def utc_now_naive() -> datetime:
    """返回当前 UTC 时间（不带时区），用于写入数据库。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_iso(value: datetime | None) -> str | None:
    """把数据库里的裸 UTC datetime 序列化为带 ``+00:00`` 的 ISO 字符串。"""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc).isoformat()


def parse_utc_iso(text: str | None) -> datetime | None:
    """解析 ``service_state`` 中保存的 ISO 时间字符串，失败返回 None。"""
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def utc_iso_now() -> str:
    """返回当前 UTC 时间的 ISO 字符串（带时区），用于 service_state。"""
    return datetime.now(timezone.utc).isoformat()


def today_hk() -> date:
    """返回香港时区的今天（自然日）。"""
    return datetime.now(HK_TZ).date()


def to_hk_iso(value: datetime | None) -> str | None:
    """把裸 UTC datetime 转成香港时间 ISO 字符串，用于刷新时间等展示字段。"""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc).astimezone(HK_TZ).isoformat()
