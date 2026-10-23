"""应用配置：全部通过环境变量（或 .env）读取，不提交任何真实密钥。"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """集中管理环境变量；字段名小写，对应环境变量名大写（不区分大小写）。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------- 应用基础信息 ----------
    # 应用名称，显示在 OpenAPI 文档标题与 /docs 页面
    app_name: str = "STEM Sorting & Weather Lab API"
    # 应用版本号；阶段 1 固定，后续可改为从包元数据读取
    app_version: str = "0.1.0"
    # 调试模式：true 时错误响应更详细，仅限本地开发
    debug: bool = False
    # 日志级别：DEBUG / INFO / WARNING / ERROR
    log_level: str = "INFO"
    # 允许跨域的前端地址（JSON 数组，禁止使用 "*" 通配）
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    # ---------- 数据库（阶段 1 仅占位，阶段 3 入库时启用） ----------
    # 数据库连接串；真实数据库接入前不影响启动
    database_url: str = "sqlite:///./app.db"

    # ---------- 香港天文台（HKO）数据源 ----------
    # 是否允许访问外部数据源；离线演示或测试时置为 false
    external_fetch_enabled: bool = True
    # 天文台开放数据接口基址（固定可信地址，服务端不提供任意 URL 抓取能力）
    hko_base_url: str = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"
    # 同一上游资源的抓取冷却时间（秒），用于合并并发请求、避免重复访问
    fetch_cooldown_seconds: int = 300
    # 每日上游请求总预算（次），超出后拒绝并给出可理解提示
    fetch_daily_budget: int = 500
    # 单次上游请求超时（秒）
    fetch_timeout_seconds: float = 10.0
    # 上游响应缓存有效期（秒）
    fetch_cache_ttl_seconds: int = 900
    # 连续失败达到该次数后熔断，暂停访问上游
    fetch_circuit_failure_threshold: int = 5

    # ---------- HTTP 客户端 ----------
    # 是否读取系统代理环境变量；本机实测必须为 false（系统代理会导致 TLS 中断）
    http_trust_env: bool = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """返回进程内单例配置；测试可调用 get_settings.cache_clear() 重置。"""
    return Settings()
