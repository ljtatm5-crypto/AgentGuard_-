"""Exercise the desktop's real SQL + local B adapter path without touching a user's DB."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.desktop import router
from app.db.session import Base, get_db
from app.models.entities import Finding, TraceEvent, TestCase as CaseRecord, TestRun as RunRecord, TestSuite as SuiteRecord
from app.services.agent_adapter import reset_runtime
from app.services.desktop_contract import SEED_AGENT_IDS, SEED_SUITE_ID, ensure_desktop_data


@pytest.fixture
def desktop():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        ensure_desktop_data(db)
        application = FastAPI()
        application.include_router(router, prefix="/api/v2")
        application.dependency_overrides[get_db] = lambda: db
        with TestClient(application) as client:
            yield client, db
    reset_runtime()
    engine.dispose()


def execute(client, version):
    response = client.post("/api/v2/runs", json={"agent_id": SEED_AGENT_IDS[version], "suite_id": SEED_SUITE_ID})
    assert response.status_code == 200, response.text
    run = response.json()
    assert run["total"] > 20
    assert run["completed"] == run["total"]
    assert run["needs_review"] == 0, client.get(f"/api/v2/runs/{run['id']}").json()
    return run


def test_seed_assets_are_complete_but_have_no_invented_results(desktop):
    client, _ = desktop
    agents = client.get("/api/v2/agents").json()
    assert agents[0]["id"] == SEED_AGENT_IDS["v2.0"]
    for agent in agents:
        assert agent["authorized_scope"]["external_target_allowed"] is False
        assert agent["validate_status"] == "validated"
        assert agent["agent_type"] == "tool"
        assert agent["permissions"]["campus_search"] in {"allow", "deny", "review"}
        assert agent["permissions"]["protected_write"] in {"allow", "deny", "review"}
        assert not any(key.startswith("tool:") for key in agent["permissions"])
        assert client.get(f"/api/v2/agents/{agent['id']}").json() == agent
        assert {k["kind"] for k in agent["knowledge"]} == {"normal", "conflict", "malicious"}
    suites = client.get("/api/v2/test-suites").json()
    cases = client.get(f"/api/v2/test-suites/{SEED_SUITE_ID}/cases").json()
    assert len(suites[0]["case_ids"]) == len(cases)
    assert all(case["source"] == "manual" and case["judge"] == ["rule"] for case in cases)
    metrics = client.get("/api/v2/metrics").json()
    assert metrics["total_cases"] == 0
    assert metrics["computed_from_run_ids"] == []
    for name in ("risk_detection_rate", "attack_success_rate_before", "attack_success_rate_after", "trace_coverage_rate"):
        assert metrics[name] is None
    assert metrics["target_benchmarks"]


def test_real_execution_aggregate_evidence_rejudge_and_paired_metrics(desktop):
    client, db = desktop
    before = execute(client, "v1.0")
    assert before["failed"] > 0
    metrics_one_version = client.get("/api/v2/metrics").json()
    assert metrics_one_version["attack_success_rate_before"] is None
    assert metrics_one_version["attack_success_rate_after"] is None
    after = execute(client, "v2.0")
    assert after["failed"] < before["failed"]
    assert after["passed"] + after["failed"] == after["total"]
    all_runs = client.get("/api/v2/runs").json()
    assert {row["id"] for row in all_runs} == {before["id"], after["id"]}
    traces = client.get(f"/api/v2/runs/{before['id']}/trace").json()
    assert traces and all(e["run_id"] == before["id"] for e in traces)
    assert {e["type"] for e in traces} <= {"input", "retrieval", "tool", "policy", "response", "error"}
    event_case_ids = {e["id"]: e["case_id"] for e in traces}
    detail = client.get(f"/api/v2/runs/{before['id']}").json()
    assert detail["run"] == before
    for result in detail["results"]:
        assert result["judge_source"] == "rule"
        assert result["evidence"]["event_ids"]
        assert all(event_case_ids[event_id] == result["case_id"] for event_id in result["evidence"]["event_ids"])
    findings = client.get("/api/v2/findings").json()
    assert findings
    for finding in findings:
        assert finding["chain"]
        assert client.get(f"/api/v2/findings/{finding['id']}/chain").json() == finding
    event_count = db.scalar(select(func.count()).select_from(TraceEvent))
    finding_count = db.scalar(select(func.count()).select_from(Finding))
    rejudged = client.post(f"/api/v2/runs/{before['id']}/judge").json()
    assert [r["status"] for r in rejudged] == [r["status"] for r in detail["results"]]
    assert db.scalar(select(func.count()).select_from(TraceEvent)) == event_count
    assert db.scalar(select(func.count()).select_from(Finding)) == finding_count
    metrics = client.get("/api/v2/metrics").json()
    assert metrics["total_cases"] == before["total"] + after["total"]
    assert metrics["failed_cases"] == before["failed"] + after["failed"]
    assert metrics["rule_judged_cases"] == metrics["completed_cases"]
    assert metrics["semantic_judged_cases"] == 0
    assert metrics["trace_coverage_rate"] == 1
    assert metrics["attack_success_rate_before"] > metrics["attack_success_rate_after"]
    assert set(metrics["computed_from_run_ids"]) == {before["id"], after["id"]}


def test_template_generation_preserves_rule_origin_and_local_validation(desktop):
    client, _ = desktop
    response = client.post("/api/v2/test-suites/generate", json={"agent_id": SEED_AGENT_IDS["v2.0"], "test_type": "memory"})
    assert response.status_code == 200
    generated = response.json()
    assert generated["llm_used"] is False
    assert generated["generation_source"] == "reviewed_rule_templates"
    assert all(c["risk_tag"] == "memory_poisoning" for c in generated["cases"])
    assert client.get(f"/api/v2/test-suites/{generated['suite']['id']}/cases").json() == generated["cases"]
    local = client.post("/api/v2/agents/validate", json={
        "name": "自建靶场测试", "endpoint": "local://campus-assistant",
        "version": "v2.0", "agent_type": "rag",
    })
    assert local.status_code == 200
    assert local.json()["authorized_scope"]["target_type"] == "internal_mock"
    assert local.json()["agent_type"] == "rag"
    another = client.post("/api/v2/agents/validate", json={
        "name": "工单处理智能体", "endpoint": "local://support-workflow",
        "version": "v2.0", "agent_type": "workflow",
    })
    assert another.status_code == 200
    assert another.json()["name"] == "工单处理智能体"
    assert another.json()["agent_type"] == "workflow"
    tightened = client.post("/api/v2/agents/validate", json={
        "name": "收紧权限测试", "endpoint": "local://campus-assistant", "version": "v2.0",
        "permissions": {"campus_search": "deny"},
    })
    assert tightened.status_code == 200
    assert tightened.json()["permissions"]["campus_search"] == "deny"
    escalated = client.post("/api/v2/agents/validate", json={
        "name": "放宽权限测试", "endpoint": "local://campus-assistant", "version": "v2.0",
        "permissions": {"protected_write": "allow"},
    })
    assert escalated.status_code == 403
    assert escalated.json()["error_code"] == "policy_escalation_denied"
    denied = client.post("/api/v2/agents/validate", json={"name": "外部", "endpoint": "https://example.com"})
    assert denied.status_code == 403
    assert denied.json()["error_code"] == "scope_public_target_denied"


def test_errors_follow_c_contract(desktop):
    client, _ = desktop
    for method, path, payload, status in [
        ("get", "/api/v2/agents/missing", None, 404),
        ("get", "/api/v2/runs/missing", None, 404),
        ("get", "/api/v2/findings/missing/chain", None, 404),
        ("get", "/api/v2/test-suites/missing/cases", None, 404),
        ("post", "/api/v2/runs", {}, 422),
    ]:
        response = client.request(method, path, json=payload)
        assert response.status_code == status
        assert response.json()["error_code"]
        assert response.json()["message"]


@pytest.mark.parametrize("judge_config", [None, {}, {"rules": None}, {"rules": []}])
def test_missing_or_invalid_rules_cannot_fall_back_to_generic_pass(judge_config):
    from types import SimpleNamespace
    from app.api.desktop import judge_invocation
    from app.services.agent_adapter import Invocation

    case = SimpleNamespace(judge=judge_config, input="测试", forbidden=[], risk_tag="normal")
    invocation = Invocation(answer="知识库来源：校园公告", raw={"trace_events": []})
    result = judge_invocation(case, invocation)
    assert result["status"] == "needs_review"
    assert result["source"] == "rule"
    assert result["llm_supplement"]["used"] is False
    assert result["llm_supplement"]["can_override_rule"] is False


def test_rejudge_uses_original_snapshot_after_case_is_edited(desktop):
    client, db = desktop
    run = execute(client, "v1.0")
    original = client.get(f"/api/v2/runs/{run['id']}").json()["results"]
    original_findings = client.get("/api/v2/findings").json()
    for case in db.scalars(select(CaseRecord)).all():
        case.judge = {"rules": []}
        case.forbidden = ["知识库"]
        case.input = "修改后的无关输入"
    db.commit()
    response = client.post(f"/api/v2/runs/{run['id']}/judge")
    assert response.status_code == 200
    assert [(r["case_id"], r["status"], r["reason"]) for r in response.json()] == [
        (r["case_id"], r["status"], r["reason"]) for r in original]
    assert client.get("/api/v2/findings").json() == original_findings


@pytest.mark.parametrize("change", ["suite_version", "rules"])
def test_metrics_do_not_pair_changed_experiments(desktop, change):
    client, db = desktop
    execute(client, "v1.0")
    if change == "suite_version":
        db.get(SuiteRecord, SEED_SUITE_ID).version = "2.0"
    else:
        for case in db.scalars(select(CaseRecord)).all():
            case.judge = {**case.judge, "ruleset_version": "new-reviewed-version"}
    db.commit()
    execute(client, "v2.0")
    metrics = client.get("/api/v2/metrics").json()
    assert metrics["attack_success_rate_before"] is None
    assert metrics["attack_success_rate_after"] is None


def test_legacy_run_without_rule_snapshot_is_not_silently_rejudged(desktop):
    client, db = desktop
    run = execute(client, "v1.0")
    row = db.scalars(select(RunRecord)).first()
    row.result = {k: v for k, v in row.result.items() if k != "case_snapshot"}
    db.commit()
    response = client.post(f"/api/v2/runs/{run['id']}/judge")
    assert response.status_code == 409
    assert response.json()["error_code"] == "rule_snapshot_missing"
