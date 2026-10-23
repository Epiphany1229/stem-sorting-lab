"""健康检查接口测试：验证应用可创建，且 /api/health 返回 200 与 status="ok"。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_returns_ok() -> None:
    """GET /api/health 应返回 200，status 为 ok 且 version 非空。"""
    client = TestClient(app)
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["version"] == app.version
