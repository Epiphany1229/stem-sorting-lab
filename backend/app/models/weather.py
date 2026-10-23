"""阶段 3 气象数据表模型（SQLAlchemy 2.0 声明式），与设计文档 §2 一一对应。

设计要点（违反即造假）：
- ``daily_weather.value_raw`` 保存官方原始字符串，``value`` 仅用于排序/计算；
- ``***``（无数据）行不入库，缺失就是缺失，不写 0；
- ``station`` 字典唯一来源是官方 PDF 解析出的 ``stations.json``；
- 官方未提供"测站 → 18 行政区"映射，因此不建行政区表。
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base


class Station(Base):
    """测站字典（39 站），由 stations.json 幂等 upsert 写入。"""

    __tablename__ = "station"

    # 官方站号，如 HKO / KP / VP1
    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name_en: Mapped[str] = mapped_column(String(160))
    name_zh_hant: Mapped[str] = mapped_column(String(160))
    # 官方给出的资料起始年（1884–2022 不等）
    start_year: Mapped[int] = mapped_column(Integer)
    # 固定来源标记（官方 PDF 版本）
    source_ref: Mapped[str] = mapped_column(String(240))


class SourceDocument(Base):
    """每次成功抓取的来源凭据，可审计。"""

    __tablename__ = "source_document"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # 数据集键：CLMMAXT / CLMMINT / CLMTEMP
    dataset_key: Mapped[str] = mapped_column(String(16), index=True)
    # 实际请求的完整地址（含查询参数）
    endpoint: Mapped[str] = mapped_column(Text)
    http_status: Mapped[int] = mapped_column(Integer)
    etag: Mapped[str | None] = mapped_column(String(240), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(80), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime)
    # 原始响应体的 sha256（十六进制小写）
    payload_sha256: Mapped[str] = mapped_column(String(64))


class DailyWeather(Base):
    """逐日观测（核心表）：39 站 × tmax/tmin/tmean。"""

    __tablename__ = "daily_weather"
    __table_args__ = (
        UniqueConstraint(
            "station_id",
            "metric",
            "obs_date",
            "mode",
            name="uq_daily_weather_scope",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_id: Mapped[str] = mapped_column(ForeignKey("station.id"), index=True)
    # tmax / tmin / tmean
    metric: Mapped[str] = mapped_column(String(16), index=True)
    # 观测日期（香港时区自然日）
    obs_date: Mapped[date] = mapped_column(Date, index=True)
    # 官方原始字符串，保留精度（如 "34.4"）
    value_raw: Mapped[str] = mapped_column(String(32))
    # 数值型，仅供排序/计算，不用于显示
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16), default="°C")
    # 官方质量标记：C（完整）/ #（不完整）
    quality_flag: Mapped[str] = mapped_column(String(8))
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_document.id"), nullable=True
    )
    fetched_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    # official（官方抓取）/ imported（用户导入的官方 CSV）
    mode: Mapped[str] = mapped_column(String(16), default="official")


class HourlyObservation(Base):
    """实时累积观测（降雨/湿度）：只能从部署后累积，不能回溯。"""

    __tablename__ = "hourly_observation"
    __table_args__ = (
        UniqueConstraint(
            "entity_kind",
            "entity_id",
            "metric",
            "observed_at",
            name="uq_hourly_observation_scope",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # district（降雨）/ station（湿度）
    entity_kind: Mapped[str] = mapped_column(String(16))
    # 行政区英文官方名，或站号
    entity_id: Mapped[str] = mapped_column(String(80))
    # rainfall_hourly / humidity
    metric: Mapped[str] = mapped_column(String(24))
    # 观测窗口结束时间（存储为 UTC）
    observed_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    value_raw: Mapped[str] = mapped_column(String(32))
    value: Mapped[float] = mapped_column(Float)
    # mm / percent
    unit: Mapped[str] = mapped_column(String(16))
    # 官方 FALSE/TRUE（main 字段）或 trace（<0.05mm 独立标记）
    quality_flag: Mapped[str] = mapped_column(String(16))
    fetched_at: Mapped[datetime] = mapped_column(DateTime)


class HttpCache(Base):
    """条件请求缓存：304 时复用 body，兼作离线兜底。"""

    __tablename__ = "http_cache"

    # 完整 URL（含查询参数）作为主键
    url: Mapped[str] = mapped_column(Text, primary_key=True)
    etag: Mapped[str | None] = mapped_column(String(240), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    stored_at: Mapped[datetime] = mapped_column(DateTime)


class FetchEvent(Base):
    """每次上游请求（含被拒绝的请求）的运维日志。"""

    __tablename__ = "fetch_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    url: Mapped[str] = mapped_column(Text)
    # HTTP 状态码；请求未发出时为空
    status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # ok / cache_hit / not_modified / rate_limited / forbidden / server_error /
    # timeout / transport_error / invalid_json / http_error / rejected:<code>
    outcome: Mapped[str] = mapped_column(String(32), index=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_after: Mapped[str | None] = mapped_column(String(80), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class IngestionRun(Base):
    """一次入库运行的排障记录。"""

    __tablename__ = "ingestion_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # running / ok / partial / failed
    status: Mapped[str] = mapped_column(String(16), default="running")
    requests: Mapped[int] = mapped_column(Integer, default=0)
    upserts: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class ServiceState(Base):
    """键值型服务状态：熔断截止、预算计数、刷新冷却、抓取租约。"""

    __tablename__ = "service_state"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime)
