"""阶段 5 通用轨迹端点测试：GET 清单 + POST /api/algorithms/{id}/trace。"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from backend.app.algorithms.registry import ALGORITHMS
from backend.app.main import app

CATALOG_ENDPOINT = "/api/algorithms"
NEW_ALGORITHM_IDS = ("selection", "insertion", "shell", "merge", "quick", "heap")


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def _post(
    client: TestClient,
    algorithm_id: str,
    payload: dict[str, Any],
) -> Response:
    return cast(Response, client.post(f"/api/algorithms/{algorithm_id}/trace", json=payload))


def _payload(values: list[Any], direction: str = "asc") -> dict[str, Any]:
    return {"values": values, "direction": direction, "options": {}}


@pytest.mark.parametrize("algorithm_id", sorted(ALGORITHMS))
def test_endpoint_returns_contract_trace(
    client: TestClient, algorithm_id: str
) -> None:
    """每个可用算法都必须返回协议结构（含 items/code/states/events/summary）。"""
    response = _post(client, algorithm_id, _payload([5, 3, 8, 1, 9, 2]))
    assert response.status_code == 200
    data: dict[str, Any] = response.json()

    assert data["protocol_version"] == 1
    assert data["algorithm"] == algorithm_id
    assert data["direction"] == "asc"
    assert [item["value"] for item in data["items"]] == [5, 3, 8, 1, 9, 2]
    assert data["code"]["language"] == "python"
    assert data["code"]["lines"][0]["lineno"] >= 1
    assert data["states"][0]["values"] == [5, 3, 8, 1, 9, 2]
    assert data["summary"]["final_values"] == [1, 2, 3, 5, 8, 9]
    assert data["summary"]["event_count"] == len(data["events"])
    assert data["summary"]["state_count"] == len(data["states"])

    # options：只有冒泡排序支持 early_exit。
    if algorithm_id == "bubble":
        assert data["options"] == {"early_exit": True}
    else:
        assert data["options"] == {}


def test_new_algorithms_emit_fixed_aux_fields(client: TestClient) -> None:
    """设计文档 §4：每个事件都带该算法的全部固定 aux 字段（compare 额外带 comparison）。"""
    for algorithm_id in NEW_ALGORITHM_IDS:
        data: dict[str, Any] = _post(
            client, algorithm_id, _payload([5, 3, 8, 1, 9, 2])
        ).json()
        expected = set(ALGORITHMS[algorithm_id].aux_fields)
        for event in data["events"]:
            aux = event["auxiliary_state"]
            expected_fields = expected | (
                {"comparison"} if event["event_type"] == "compare" else set()
            )
            assert set(aux) == expected_fields, (algorithm_id, event["step_id"])
            if event["event_type"] == "compare":
                comparison = aux["comparison"]
                assert comparison["relation"] in {"gt", "lt", "eq"}
                # 非冒泡比较不决定交换，因此不得出现 will_swap。
                assert "will_swap" not in comparison


def test_insertion_and_shell_states_use_null_holes(client: TestClient) -> None:
    """协议 §3.1：插入/希尔抽牌期间 order 用 null 空槽，values 同一位置也是 null。"""
    for algorithm_id in ("insertion", "shell"):
        data: dict[str, Any] = _post(
            client, algorithm_id, _payload([5, 3, 8, 1, 9, 2])
        ).json()
        hole_states = [state for state in data["states"] if None in state["order"]]
        assert hole_states, algorithm_id
        for state in data["states"]:
            assert state["order"].count(None) <= 1
            for item_id, value in zip(state["order"], state["values"], strict=True):
                assert (item_id is None) == (value is None)
        assert None not in data["states"][-1]["order"]


def test_merge_states_never_contain_holes(client: TestClient) -> None:
    """归并排序主数组始终是完整排列（buffer 写入只体现在 aux）。"""
    data: dict[str, Any] = _post(
        client, "merge", _payload([5, 3, 8, 1, 9, 2])
    ).json()
    for state in data["states"]:
        assert None not in state["order"]
        assert len(set(state["order"])) == len(state["order"])
    item_ids = {item["id"] for item in data["items"]}
    buffer_writes = [
        event
        for event in data["events"]
        if event["event_type"] == "write"
        and event["auxiliary_state"].get("writing_back") is False
    ]
    assert buffer_writes
    for event in buffer_writes:
        buffer = event["auxiliary_state"]["buffer"]
        assert buffer
        assert all(isinstance(item_id, str) and item_id for item_id in buffer)
        assert set(buffer) <= item_ids


def test_options_may_be_empty_or_missing(client: TestClient) -> None:
    """`options` 可为 {} 或省略（无 early_exit 的算法不强制该字段）。"""
    empty = _post(client, "merge", {"values": [3, 1, 2], "direction": "asc", "options": {}})
    missing = _post(client, "merge", {"values": [3, 1, 2], "direction": "asc"})
    assert empty.status_code == 200
    assert missing.status_code == 200
    assert empty.json()["summary"] == missing.json()["summary"]


def test_same_request_returns_identical_bytes(client: TestClient) -> None:
    """同输入同参数的两次 HTTP 响应必须逐字节相同（确定性要求）。"""
    payload = _payload([30.2, 29.6, 30.1, 28.0], direction="desc")
    first = _post(client, "shell", payload)
    second = _post(client, "shell", payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content == second.content


def test_one_decimal_floats_are_preserved(client: TestClient) -> None:
    """一位小数输入必须原样进入 items 与快照（不得被截断成整数）。"""
    data: dict[str, Any] = _post(
        client, "merge", _payload([30.2, 29.6, 30.1], direction="asc")
    ).json()
    assert [item["value"] for item in data["items"]] == [30.2, 29.6, 30.1]
    assert data["summary"]["final_values"] == [29.6, 30.1, 30.2]


@pytest.mark.parametrize("algorithm_id", ["bogus", "not-a-real-id", "counting", "bucket", "radix"])
def test_removed_and_unknown_algorithms_return_404(
    client: TestClient, algorithm_id: str
) -> None:
    """未知 id 返回 404；已移除的 3 个非比较类 id 现在也走同一条未知 id 路径。"""
    response = _post(client, algorithm_id, _payload([3, 1, 2]))
    assert response.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"values": [], "direction": "asc", "options": {}},
        {"values": [5], "direction": "asc", "options": {}},
        {"values": list(range(31)), "direction": "asc", "options": {}},
        {"values": [1001, 0], "direction": "asc", "options": {}},
        {"values": [-1001, 0], "direction": "asc", "options": {}},
        {"values": [30.25, 1], "direction": "asc", "options": {}},
        {"values": ["5", 1], "direction": "asc", "options": {}},
        {"values": [True, 1], "direction": "asc", "options": {}},
        {"values": [1, 2], "direction": "up", "options": {}},
        {"values": [1, 2], "options": {}},
    ],
)
def test_invalid_input_returns_field_level_422(
    client: TestClient, payload: dict[str, Any]
) -> None:
    """协议 §1/§4：校验失败返回 422，detail 为字段级错误数组。"""
    response = _post(client, "selection", payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert detail
    assert all("loc" in item and "msg" in item for item in detail)


def test_bubble_legacy_endpoint_is_unchanged(client: TestClient) -> None:
    """阶段 2 的 /bubble/trace 保持原样（整数严格模式、响应结构不变）。"""
    response = client.post(
        "/api/algorithms/bubble/trace",
        json={"values": [5, 3, 8, 1], "direction": "asc", "options": {"early_exit": True}},
    )
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    assert data["protocol_version"] == 1
    assert data["algorithm"] == "bubble"
    assert data["summary"]["final_values"] == [1, 3, 5, 8]
    # 阶段 2 的请求模型仍不接受一位小数（该端点语义未变）。
    float_response = client.post(
        "/api/algorithms/bubble/trace",
        json={"values": [30.2, 1], "direction": "asc", "options": {"early_exit": True}},
    )
    assert float_response.status_code == 422
