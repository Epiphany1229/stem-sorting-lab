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
    # 逐日历史月表接口基址（CLMMAXT / CLMMINT / CLMTEMP 共用）
    hko_opendata_url: str = "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php"
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
    # 同主机两次请求之间的最小间隔（秒）；合规取数硬要求 ≥ 3 秒
    fetch_min_interval_seconds: float = 3.0
    # 附加到最小间隔上的随机抖动上限（秒），避免形成固定节奏
    fetch_jitter_seconds: float = 0.6
    # 5xx / 超时的额外重试次数上限（指数退避）
    fetch_max_retries: int = 3
    # 指数退避的基准秒数（第 n 次重试等待 base * 2**n 秒）
    fetch_retry_backoff_seconds: float = 1.0
    # 收到 403 后熔断的时长（分钟）；熔断期间不再自动抓取
    circuit_breaker_minutes: float = 30.0
    # 单 worker 抓取租约的有效期（秒）；跨进程保证同时只有一个抓取者
    fetch_lease_seconds: float = 120.0
    # 是否允许演示模式（读取 sample_data/demo 下的官方快照，只读、不落库）
    demo_mode_enabled: bool = True
    # 官方 39 站字典路径；留空表示使用包内置的 stations.json
    station_registry_path: str = ""
    # 演示数据样本路径（相对仓库根目录或绝对路径）
    demo_data_path: str = "sample_data/demo/hko_demo_2026-09.csv"

    # ---------- HTTP 客户端 ----------
    # 是否读取系统代理环境变量；本机实测必须为 false（系统代理会导致 TLS 中断）
    http_trust_env: bool = False

    # ---------- 后台自动同步（阶段 5.1） ----------
    # 是否启用启动自检 + 每 N 小时一次的近期数据静默同步（测试环境必须关闭）
    auto_sync_enabled: bool = True
    # 两次检查之间的间隔小时数（默认 24h）
    auto_sync_interval_hours: int = 24
    # 每次补数的天数（默认 35，覆盖默认 30 天窗口并留冗余）
    auto_sync_days: int = 35
    # 参与自动同步的核心测站（逗号分隔，必须是官方 39 站之一）
    auto_sync_stations: str = "HKO,KP,SHA"
    # 单轮同步允许的最大尝试次数（超过即放弃本轮，只记日志）
    auto_sync_max_attempts: int = 3


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """返回进程内单例配置；测试可调用 get_settings.cache_clear() 重置。"""
    return Settings()
