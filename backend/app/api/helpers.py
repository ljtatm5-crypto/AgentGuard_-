from typing import Any

from app.models.entities import Agent, Finding, TestCase, TestRun, TestSuite, TraceEvent


def agent_dict(agent: Agent) -> dict[str, Any]:
    permissions = agent.permissions or {}
    return {
        "id": agent.id,
        "name": agent.name,
        "version": agent.version,
        "adapter": agent.adapter,
        "endpoint": agent.endpoint,
        "model": agent.model,
        "knowledge": agent.knowledge,
        "tools": agent.tools,
        "permissions": {key: value for key, value in permissions.items() if not key.startswith("__")},
        "target_scope": permissions.get(
            "__target_scope__", "local_mock" if agent.adapter == "mock" else "unverified"
        ),
        "authorization_confirmed": permissions.get("__authorization_confirmed__") == "true",
        "authorization_reference": permissions.get("__authorization_reference__"),
        "status": agent.status,
        "created_at": agent.created_at,
    }


def case_dict(case: TestCase) -> dict[str, Any]:
    return {
        "id": case.id,
        "suite_id": case.suite_id,
        "name": case.name,
        "type": case.type,
        "input": case.input,
        "steps": case.steps,
        "expected": case.expected,
        "forbidden": case.forbidden,
        "judge": case.judge,
        "risk_tag": case.risk_tag,
        "source": case.source,
    }


def suite_dict(suite: TestSuite, cases: list[TestCase] | None = None) -> dict[str, Any]:
    return {
        "id": suite.id,
        "name": suite.name,
        "type": suite.type,
        "version": suite.version,
        "case_ids": suite.case_ids,
        "status": suite.status,
        "created_at": suite.created_at,
        "cases": [case_dict(item) for item in cases or []],
    }


def finding_dict(finding: Finding) -> dict[str, Any]:
    return {
        "id": finding.id,
        "run_id": finding.run_id,
        "severity": finding.severity,
        "title": finding.title,
        "evidence": finding.evidence,
        "impact": finding.impact,
        "recommendation": finding.recommendation,
        "status": finding.status,
        "chain": finding.chain,
        "created_at": finding.created_at,
    }


def run_dict(run: TestRun, case: TestCase | None = None, finding: Finding | None = None) -> dict[str, Any]:
    return {
        "id": run.id,
        "task_id": run.task_id,
        "agent_id": run.agent_id,
        "suite_id": run.suite_id,
        "case_id": run.case_id,
        "case_name": case.name if case else None,
        "case_type": case.type if case else None,
        "risk_tag": case.risk_tag if case else None,
        "agent_version": run.agent_version,
        "status": run.status,
        "result": run.result,
        "score": run.score,
        "latency": run.latency,
        "created_at": run.created_at,
        "finding": finding_dict(finding) if finding else None,
    }


def trace_dict(event: TraceEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "run_id": event.run_id,
        "type": event.type,
        "timestamp": event.timestamp,
        "tool": event.tool,
        "params": event.params,
        "output": event.output,
        "error": event.error,
        "duration_ms": event.duration_ms,
    }
