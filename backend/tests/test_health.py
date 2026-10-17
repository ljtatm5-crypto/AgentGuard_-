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


def test_demo_run_uses_rules_before_llm():
    with TestClient(app) as client:
        agent = client.get("/api/agents").json()[0]
        suite = client.get("/api/test-suites").json()[0]
        response = client.post(
            "/api/runs",
            json={"agent_id": agent["id"], "suite_id": suite["id"], "mode": "demo"},
        )
        assert response.status_code == 200
        for run in response.json()["runs"]:
            judge = run["result"]["judge"]
            assert judge["source"] == "rule"
            assert judge["llm_supplement"]["used"] is False


def test_agent_api_rejects_public_target_outside_allowlist():
    with TestClient(app) as client:
        response = client.post(
            "/api/agents/validate",
            json={
                "name": "禁止连接的公网目标",
                "endpoint": "https://example.com/agent",
                "adapter": "dify",
                "target_scope": "authorized_external",
                "authorization_confirmed": True,
                "authorization_reference": "AUTH-DEMO",
            },
        )
        assert response.status_code == 422
        assert "不在 AGENTGUARD_ALLOWED_TARGET_HOSTS" in response.json()["detail"]
