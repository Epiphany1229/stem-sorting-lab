"""单端口托管 frontend/dist 的 SPA History Fallback 测试（全部离线）。"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.core.settings import Settings
from backend.app.main import create_app
from backend.app.models.db import Database

INDEX_HTML = '<!doctype html><html><body><div id="root">SPA-INDEX</div></body></html>'
ASSET_JS = "console.log('asset-x');"


@pytest.fixture()
def fake_dist(tmp_path: Path) -> Path:
    """最小假 dist：index.html + assets/x.js + 根目录静态文件。"""
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    (assets / "x.js").write_text(ASSET_JS, encoding="utf-8")
    (dist / "robots.txt").write_text("User-agent: *\n", encoding="utf-8")
    return dist


def _client(
    weather_settings: Settings,
    weather_database: Database,
    *,
    dist: Path | None,
    serve_frontend: bool = True,
) -> TestClient:
    settings = weather_settings.model_copy(
        update={
            "serve_frontend": serve_frontend,
            "frontend_dist_dir": str(dist if dist is not None else "/nonexistent-dist"),
        }
    )
    app = create_app(settings, database=weather_database)
    return TestClient(app)


def test_root_and_spa_routes_serve_index(
    weather_settings: Settings, weather_database: Database, fake_dist: Path
) -> None:
    """根路径与任意前端 History 路由都返回 index.html。"""
    client = _client(weather_settings, weather_database, dist=fake_dist)
    for path in ("/", "/weather-sort", "/algorithms/heap", "/lab"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.headers["content-type"].startswith("text/html")
        assert "SPA-INDEX" in response.text


def test_assets_and_root_static_files_are_served(
    weather_settings: Settings, weather_database: Database, fake_dist: Path
) -> None:
    """/assets 由 StaticFiles 提供；dist 根目录静态文件也可直接访问。"""
    client = _client(weather_settings, weather_database, dist=fake_dist)

    asset = client.get("/assets/x.js")
    assert asset.status_code == 200
    assert asset.text == ASSET_JS

    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert "User-agent" in robots.text


def test_api_and_docs_are_not_swallowed_by_fallback(
    weather_settings: Settings, weather_database: Database, fake_dist: Path
) -> None:
    """API 与文档路由优先；未知 /api 路径必须是 JSON 404，不返回 index.html。"""
    client = _client(weather_settings, weather_database, dist=fake_dist)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.headers["content-type"].startswith("application/json")
    assert health.json()["status"] == "ok"

    docs = client.get("/docs")
    assert docs.status_code == 200
    assert docs.headers["content-type"].startswith("text/html")

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert openapi.headers["content-type"].startswith("application/json")

    unknown_api = client.get("/api/unknown")
    assert unknown_api.status_code == 404
    assert unknown_api.headers["content-type"].startswith("application/json")
    assert "SPA-INDEX" not in unknown_api.text

    unknown_docs = client.get("/docs/not-a-real-page")
    assert unknown_docs.status_code == 404
    assert "SPA-INDEX" not in unknown_docs.text


def test_serve_frontend_false_keeps_old_behavior(
    weather_settings: Settings, weather_database: Database, fake_dist: Path
) -> None:
    """serve_frontend=False：即使 dist 存在也不挂载，根路径仍是默认 404。"""
    client = _client(
        weather_settings, weather_database, dist=fake_dist, serve_frontend=False
    )
    assert client.get("/").status_code == 404
    assert client.get("/weather-sort").status_code == 404
    assert "SPA-INDEX" not in client.get("/").text
    # API 不受影响
    assert client.get("/api/health").status_code == 200


def test_missing_dist_does_not_change_behavior(
    weather_settings: Settings, weather_database: Database, tmp_path: Path
) -> None:
    """dist 不存在时（开发环境）：不注册任何 fallback，行为保持不变。"""
    missing = tmp_path / "no-such-dist"
    client = _client(weather_settings, weather_database, dist=missing)
    assert client.get("/").status_code == 404
    assert client.get("/weather-sort").status_code == 404
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/unknown").status_code == 404
