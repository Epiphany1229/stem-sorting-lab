"""POST /api/algorithms/bubble/trace 的接口测试：真实打端点，验证 200 结构与 422 语义。"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from backend.app.main import app

ENDPOINT = "/api/algorithms/bubble/trace"


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def _payload(
    values: Sequence[int],
    direction: str = "asc",
    early_exit: bool = True,
) -> dict[str, Any]:
    return {
        "values": list(values),
        "direction": direction,
        "options": {"early_exit": early_exit},
    }


def _post(client: TestClient, payload: dict[str, Any]) -> Response:
    return cast(Response, client.post(ENDPOINT, json=payload))


def test_endpoint_returns_contract_response(client: TestClient) -> None:
    """200 响应必须包含协议 v1 的全部顶层字段与正确的汇总。"""
    response = _post(client, _payload([5, 3, 8, 1]))
    assert response.status_code == 200
    data: dict[str, Any] = response.json()

    assert data["protocol_version"] == 1
    assert data["algorithm"] == "bubble"
    assert data["direction"] == "asc"
    assert data["options"] == {"early_exit": True}
    assert [item["id"] for item in data["items"]] == ["it-0", "it-1", "it-2", "it-3"]
    assert [item["value"] for item in data["items"]] == [5, 3, 8, 1]

    assert data["code"]["language"] == "python"
    assert data["states"][0]["values"] == [5, 3, 8, 1]
    assert data["states"][0]["order"] == ["it-0", "it-1", "it-2", "it-3"]

    summary = data["summary"]
    assert summary["final_values"] == sorted([5, 3, 8, 1])
    assert summary["state_count"] == len(data["states"])
    assert summary["event_count"] == len(data["events"])
    assert summary["writes"] == 2 * summary["swaps"]

    first_event = data["events"][0]
    assert first_event["step_id"] == 0
    assert first_event["event_type"] == "mark_sorted"
    assert first_event["explanation"]["zh-Hant"]
    assert first_event["explanation"]["en"]
    assert first_event["explanation"]["key"] == "bubble.mark_sorted.start"

    second_event = data["events"][1]
    assert second_event["event_type"] == "compare"
    assert second_event["auxiliary_state"]["comparison"]["relation"] in {"gt", "lt", "eq"}


def test_same_request_returns_identical_bytes(client: TestClient) -> None:
    """同输入同参数的两次 HTTP 响应必须逐字节相同（确定性要求）。"""
    payload = _payload([5, 3, 8, 1], direction="desc")
    first = _post(client, payload)
    second = _post(client, payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content == second.content


def test_every_event_references_existing_code_lines(client: TestClient) -> None:
    """每个事件的 code_line_ids 必须存在于 code.lines，且解释文案双语非空。"""
    data: dict[str, Any] = _post(client, _payload([4, 1, 3, 2])).json()
    line_ids = {line["line_id"] for line in data["code"]["lines"]}
    for event in data["events"]:
        assert event["code_line_ids"]
        assert all(line_id in line_ids for line_id in event["code_line_ids"])
        assert event["explanation"]["zh-Hant"]
        assert event["explanation"]["en"]
        assert event["explanation"]["key"]


@pytest.mark.parametrize(
    "payload",
    [
        {"values": [], "direction": "asc"},
        {"values": [5], "direction": "asc", "options": {"early_exit": True}},
        {"values": list(range(31)), "direction": "asc", "options": {"early_exit": True}},
        {"values": [1001, 0], "direction": "asc", "options": {"early_exit": True}},
        {"values": [-1001, 0], "direction": "asc"},
        {"values": [1.5, 2], "direction": "asc"},
        {"values": ["5", 2], "direction": "asc"},
        {"values": [1, 2], "direction": "up"},
        {"values": [1, 2]},
        {"values": [1, 2], "direction": "asc", "options": {"early_exit": "yes"}},
    ],
)
def test_invalid_input_returns_field_level_422(
    client: TestClient,
    payload: dict[str, Any],
) -> None:
    """协议 §1/§4：校验失败返回 422，detail 是字段级错误数组，绝不能 200 + 空轨迹。"""
    response = _post(client, payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert detail
    assert all("loc" in item and "msg" in item for item in detail)


def test_too_many_events_returns_422(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """事件数超过上限必须返回 422，不得截断后返回 200（此处调小上限便于触发）。"""
    monkeypatch.setattr("backend.app.services.trace_service.MAX_EVENTS", 2)
    response = _post(client, _payload([3, 1, 2]))
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


def test_health_endpoint_is_unchanged(client: TestClient) -> None:
    """接入算法路由后 /api/health 必须保持原样可用。"""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
