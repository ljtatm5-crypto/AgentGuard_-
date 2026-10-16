from fastapi.testclient import TestClient

from app.main import app


def test_healthz():
    with TestClient(app) as client:
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_demo_contract():
    with TestClient(app) as client:
        agents = client.get("/api/agents")
        suites = client.get("/api/test-suites")
        assert agents.status_code == 200
        assert suites.status_code == 200
        assert agents.json()
        assert suites.json()[0]["cases"]
