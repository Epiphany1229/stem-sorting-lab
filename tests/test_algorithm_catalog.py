"""阶段 5 算法清单与注册表测试：GET /api/algorithms 的字段、状态与双语文案。"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.algorithms.registry import ALGORITHMS, PLANNED_ALGORITHMS
from backend.app.main import app

CATALOG_ENDPOINT = "/api/algorithms"
AVAILABLE_IDS = ("bubble", "selection", "insertion", "shell", "merge", "quick", "heap")
PLANNED_IDS = ("counting", "bucket", "radix")
ALGORITHM_IDS = AVAILABLE_IDS + PLANNED_IDS

# 学生可见文案必须是繁体中文；这些简体字不应出现在元数据里。
_SIMPLIFIED_CHARS = set("选择复归并计数结构过这个们为与图统计稳尔杂")

# 设计文档 §5 的稳定性口径（必须与实现一致）。
_EXPECTED_STABLE: dict[str, bool] = {
    "bubble": True,
    "selection": False,
    "insertion": True,
    "shell": False,
    "merge": True,
    "quick": False,
    "heap": False,
}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _catalog(client: TestClient) -> dict[str, Any]:
    response = client.get(CATALOG_ENDPOINT)
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    return payload


def test_catalog_lists_ten_algorithms_in_order(client: TestClient) -> None:
    """必须是 10 项：7 个可用 + 3 个开发中，顺序稳定。"""
    payload = _catalog(client)
    algorithms = payload["algorithms"]
    assert payload["protocol_version"] == 1
    assert [item["id"] for item in algorithms] == list(ALGORITHM_IDS)
    assert [item["status"] for item in algorithms] == ["available"] * 7 + ["planned"] * 3


def test_every_catalog_entry_has_required_metadata(client: TestClient) -> None:
    """每项都必须含名称/一句话解释/复杂度/空间/稳定性/适用条件/默认数据。"""
    payload = _catalog(client)
    required = {
        "id",
        "name",
        "tagline",
        "status",
        "time_complexity",
        "space_complexity",
        "stable",
        "use_cases",
        "default_values",
        "supports_early_exit",
    }
    for item in payload["algorithms"]:
        assert set(item) == required, item["id"]
        assert item["name"]["zh-Hant"] and item["name"]["en"]
        assert item["tagline"]["zh-Hant"] and item["tagline"]["en"]
        assert item["time_complexity"]["zh-Hant"] and item["time_complexity"]["en"]
        assert item["space_complexity"]["zh-Hant"] and item["space_complexity"]["en"]
        assert item["use_cases"]["zh-Hant"] and item["use_cases"]["en"]
        assert item["default_values"]
        assert isinstance(item["supports_early_exit"], bool)
        if item["status"] == "available":
            assert isinstance(item["stable"], bool)
        else:
            assert item["stable"] is None or isinstance(item["stable"], bool)


def test_catalog_bilingual_text_has_no_simplified_characters(client: TestClient) -> None:
    """学生可见的元数据文案不得出现简体字。"""
    payload = _catalog(client)
    for item in payload["algorithms"]:
        for field in ("name", "tagline", "time_complexity", "space_complexity", "use_cases"):
            zh_text: str = item[field]["zh-Hant"]
            offending = _SIMPLIFIED_CHARS.intersection(zh_text)
            assert not offending, (item["id"], field, offending)


def test_available_metadata_matches_implementation_choices(client: TestClient) -> None:
    """稳定性与提前结束支持必须与设计文档 §5 的实现口径一致。"""
    payload = _catalog(client)
    by_id = {item["id"]: item for item in payload["algorithms"]}
    for algorithm_id, stable in _EXPECTED_STABLE.items():
        assert by_id[algorithm_id]["stable"] is stable
        assert by_id[algorithm_id]["supports_early_exit"] is (algorithm_id == "bubble")
    # 冒泡/插入/归并稳定；选择/希尔/快排/堆不稳定。
    assert [by_id[algorithm_id]["stable"] for algorithm_id in AVAILABLE_IDS] == [
        True,
        False,
        True,
        False,
        True,
        False,
        False,
    ]


def test_registry_contains_seven_available_algorithms() -> None:
    """注册表只注册 7 个可用算法，且每个都有真实行映射。"""
    assert tuple(ALGORITHMS) == AVAILABLE_IDS
    for spec in ALGORITHMS.values():
        assert spec.line_map.lines
        assert spec.line_map.mappings
        assert spec.metadata.status == "available"


def test_planned_algorithms_are_not_registered_for_traces() -> None:
    """3 个非比较类算法标为 planned，不进入轨迹注册表。"""
    assert [meta.id for meta in PLANNED_ALGORITHMS] == list(PLANNED_IDS)
    assert all(meta.status == "planned" for meta in PLANNED_ALGORITHMS)
    for algorithm_id in PLANNED_IDS:
        assert algorithm_id not in ALGORITHMS
