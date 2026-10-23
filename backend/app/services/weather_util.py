"""气象模块的通用小工具：仓库根目录解析、日期解析等。

放在 services 层避免 ORM / 数据源层互相依赖；本模块不导入任何业务模块。
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

# 指标集合与官方 dataType 的对应关系（两者是同一事实的两种名字）
METRIC_TMAX = "tmax"
METRIC_TMIN = "tmin"
METRIC_TMEAN = "tmean"
TEMPERATURE_METRICS: tuple[str, ...] = (METRIC_TMAX, METRIC_TMIN, METRIC_TMEAN)
# 官方单位为摄氏度，响应里没有独立 unit 字段，需由 dataType 推断
TEMPERATURE_UNIT = "°C"
# 官方质量标记（data[4] 单字符）
QUALITY_COMPLETE = "C"
QUALITY_INCOMPLETE = "#"
QUALITY_UNAVAILABLE = "***"


def project_root() -> Path:
    """从本文件向上找到包含 pyproject.toml 的目录，即仓库根目录。"""
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "pyproject.toml").is_file():
            return candidate
    # 兜底：理论上不会走到这里（部署形态异常时仍可运行）
    return Path.cwd()


def resolve_project_path(raw: str) -> Path:
    """把配置中的相对路径解析为相对仓库根目录的绝对路径。"""
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return (project_root() / path).resolve()


def parse_iso_date(text: str | None) -> date | None:
    """解析 ``YYYY-MM-DD``，非法输入返回 None（由调用方决定报错还是忽略）。"""
    if text is None:
        return None
    try:
        return date.fromisoformat(text.strip())
    except ValueError:
        return None
