"""日志骨架：按网络、数据解析、校验、算法四类错误拆分 logger。

对应需求「日志区分网络、数据解析、校验和算法错误」：各模块按职责取对应通道的
logger，避免所有日志混在同一个 logger 里无法区分来源。
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Final

# 本项目所有 logger 的统一前缀
LOGGER_NAME_PREFIX: Final = "app"
# 日志输出格式与时间格式
LOG_FORMAT: Final = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT: Final = "%Y-%m-%d %H:%M:%S"
# 默认日志级别
DEFAULT_LOG_LEVEL: Final = "INFO"


class LogChannel(str, Enum):
    """日志通道，与四类错误一一对应。"""

    # 外部数据源请求、超时、限流、熔断等网络问题
    NETWORK = "network"
    # 响应解析、字段缺失、格式不符等数据问题
    DATA = "data"
    # 用户输入与业务规则校验失败
    VALIDATION = "validation"
    # 排序算法实现与轨迹生成异常
    ALGORITHMS = "algorithms"


def _resolve_level(level: str) -> int:
    """把字符串级别（如 "INFO"）解析为 logging 的整数级别，非法值回退为 INFO。"""
    resolved = logging.getLevelName(level.strip().upper())
    return resolved if isinstance(resolved, int) else logging.INFO


def get_logger(channel: LogChannel) -> logging.Logger:
    """按通道取得 logger（如 app.network、app.data）。"""
    return logging.getLogger(f"{LOGGER_NAME_PREFIX}.{channel.value}")


def configure_logging(level: str = DEFAULT_LOG_LEVEL) -> None:
    """初始化根 logger 的控制台输出；重复调用不会叠加 handler。"""
    logging.basicConfig(
        level=_resolve_level(level),
        format=LOG_FORMAT,
        datefmt=DATE_FORMAT,
        force=True,
    )
