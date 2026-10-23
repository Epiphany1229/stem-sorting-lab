"""数据库引擎与会话管理：不引入迁移工具，启动时 ``create_all`` 建表。

阶段 3 使用 SQLite；``station`` 表在首次建表后用 stations.json 幂等 upsert，
保证"官方 39 站字典"只有一个来源（文件），不在代码里另抄一份常量。
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.settings import Settings
from backend.app.data_sources.hko.registry import (
    SOURCE_REF,
    load_station_registry,
)
from backend.app.models.base import Base
from backend.app.models.weather import Station


def create_engine_for_url(database_url: str) -> Engine:
    """按连接串创建 Engine；内存库固定单连接共享，文件库关闭线程检查。"""
    if database_url.startswith("sqlite"):
        kwargs: dict[str, object] = {"connect_args": {"check_same_thread": False}}
        # 内存库必须复用同一连接，否则每个会话看到的是不同的空库
        if database_url in {"sqlite://", "sqlite:///:memory:"} or ":memory:" in database_url:
            kwargs["poolclass"] = StaticPool
        return create_engine(database_url, **kwargs)
    return create_engine(database_url)


class Database:
    """持有 Engine 与 Session 工厂；``prepare()`` 保证建表与站点字典就绪。"""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.engine = create_engine_for_url(settings.database_url)
        self._session_factory = sessionmaker(
            bind=self.engine,
            expire_on_commit=False,
        )
        self._prepared = False

    @contextmanager
    def session(self) -> Iterator[Session]:
        """事务作用域：正常结束提交，异常回滚。"""
        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def prepare(self) -> None:
        """建表并用官方 39 站字典幂等 upsert；重复调用无副作用。"""
        if self._prepared:
            return
        Base.metadata.create_all(self.engine)
        seed_stations(self, self._settings)
        self._prepared = True

    def dispose(self) -> None:
        """释放连接池（CLI / 测试收尾用）。"""
        self.engine.dispose()


def create_database(settings: Settings) -> Database:
    """按配置创建数据库对象（此时还不会创建文件，直到首次 prepare/连接）。"""
    return Database(settings)


def seed_stations(database: Database, settings: Settings) -> int:
    """用 stations.json 幂等写入 39 站字典，返回写入的站数。"""
    records = load_station_registry(settings)
    with database.session() as session:
        for record in records:
            station = session.get(Station, record.id)
            if station is None:
                session.add(
                    Station(
                        id=record.id,
                        name_en=record.name_en,
                        name_zh_hant=record.name_zh_hant,
                        start_year=record.start_year,
                        source_ref=SOURCE_REF,
                    )
                )
            else:
                station.name_en = record.name_en
                station.name_zh_hant = record.name_zh_hant
                station.start_year = record.start_year
                station.source_ref = SOURCE_REF
    return len(records)


def count_stations(database: Database) -> int:
    """返回当前库中的测站数量（供健康检查/CLI 使用）。"""
    with database.session() as session:
        return len(session.execute(select(Station.id)).scalars().all())
