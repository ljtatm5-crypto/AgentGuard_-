"""Authorized evidence projection for XiaoAn diagnosis."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Agent, Finding, TestCase, TestRun, TestSuite, TraceEvent

RISK_LABELS = {
    "direct_injection": "直接提示词注入",
    "indirect_injection": "间接提示词注入",
    "memory_poisoning": "记忆污染",
    "tool_abuse": "工具越权",
    "goal_drift": "目标漂移",
    "baseline_normal": "正常业务对照",
    "exception": "工具异常",
}


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(tzinfo=value.tzinfo or timezone.utc).isoformat()


def resolve_run(db: Session, run_id: str, case_id: str | None = None) -> TestRun | None:
    row = db.get(TestRun, run_id)
    if row:
        return row
    stmt = select(TestRun).where(TestRun.task_id == run_id)
    if case_id:
        stmt = stmt.where(TestRun.case_id == case_id)
    return db.scalar(stmt.order_by(TestRun.created_at).limit(1))


def _event_card(event: TraceEvent) -> dict[str, Any]:
    kind = event.type
    if kind in {"tool_call", "tool_result"}:
        label = "工具调用" if kind == "tool_call" else "工具结果"
    elif kind == "policy_decision":
        label = "策略判定"
    elif kind == "user_input":
        label = "用户输入"
    elif kind == "retrieval":
        label = "知识检索"
    elif kind == "memory_read" or kind == "memory_write":
        label = "记忆操作"
    elif kind == "response":
        label = "Agent 响应"
    else:
        label = "异常事件"
    detail = event.output or event.error or ""
    decision = (event.params or {}).get("decision")
    if not detail:
        if kind == "tool_call":
            detail = f"发起工具 {event.tool or 'unknown'} 调用"
        elif kind == "policy_decision" and decision:
            detail = f"策略决定：{decision}"
        elif kind == "user_input":
            detail = str((event.params or {}).get("text", ""))[:500]
        else:
            detail = "事件已记录，但适配器没有提供可读输出"
    return {
        "type": kind,
        "label": label,
        "detail": detail[:1200],
        "event_ids": [event.id],
        "status": "observed",
        "tool": event.tool,
        "policy_decision": decision if decision in {"allow", "deny", "review"} else None,
        "timestamp": _iso(event.timestamp),
    }


def run_evidence(db: Session, run_id: str, case_id: str | None = None) -> dict[str, Any] | None:
    run = resolve_run(db, run_id, case_id)
    if run is None:
        return None
    case = db.get(TestCase, run.case_id)
    agent = db.get(Agent, run.agent_id)
    suite = db.get(TestSuite, run.suite_id)
    events = list(db.scalars(select(TraceEvent).where(TraceEvent.run_id == run.id).order_by(TraceEvent.timestamp, TraceEvent.id)).all())
    judge = (run.result or {}).get("judge", {}) or {}
    relevant = [
        event for event in events
        if event.type in {"user_input", "retrieval", "tool_call", "tool_result", "policy_decision", "memory_read", "memory_write", "response", "error"}
    ][:40]
    cards = [_event_card(event) for event in relevant]
    observed_risks = [card["label"] + "：" + card["detail"][:180] for card in cards if card["type"] in {"tool_call", "policy_decision", "error"}]
    return {
        "run": {
            "id": run.id,
            "task_id": run.task_id,
            "case_id": run.case_id,
            "status": run.status,
            "agent_id": run.agent_id,
            "agent_name": agent.name if agent else run.agent_id,
            "agent_version": run.agent_version,
            "suite_name": suite.name if suite else run.suite_id,
        },
        "case": {
            "id": run.case_id,
            "title": case.name if case else run.case_id,
            "risk_tag": case.risk_tag if case else "baseline_normal",
            "expected": case.expected if case else "",
            "forbidden": list(case.forbidden or []) if case else [],
            "input": case.input if case else "",
        },
        "judge": {
            "status": run.status,
            "conclusion": judge.get("conclusion"),
            "reason": judge.get("reason", "尚无判定理由"),
            "confidence": judge.get("confidence", 0),
            "source": judge.get("source", judge.get("judge_mode", "rule")),
        },
        "evidence": cards,
        "observed_risks": observed_risks,
        "trace_event_count": len(events),
        "unavailable_reason": None if events else "当前运行没有可观测轨迹事件",
    }


def finding_evidence(db: Session, finding_id: str) -> dict[str, Any] | None:
    finding = db.get(Finding, finding_id)
    if finding is None:
        return None
    evidence = run_evidence(db, finding.run_id)
    if evidence is None:
        return None
    selected_ids = [item.get("trace_event_id") for item in finding.evidence or [] if isinstance(item, dict) and item.get("trace_event_id")]
    if selected_ids:
        selected = set(selected_ids)
        evidence["evidence"] = [card for card in evidence["evidence"] if set(card["event_ids"]) & selected] or evidence["evidence"]
    evidence["finding"] = {
        "id": finding.id,
        "title": finding.title,
        "severity": finding.severity,
        "impact": finding.impact,
        "recommendation": finding.recommendation,
        "status": finding.status,
        "evidence_event_ids": selected_ids,
    }
    return evidence


def diagnosis(db: Session, *, run_id: str | None = None, finding_id: str | None = None, case_id: str | None = None) -> dict[str, Any]:
    if finding_id:
        evidence = finding_evidence(db, finding_id)
    elif run_id:
        evidence = run_evidence(db, run_id, case_id)
    else:
        evidence = None
    if evidence is None:
        return {
            "conclusion": "证据不足",
            "summary": "没有找到用户选择的运行或缺陷记录，无法判断某次工具调用已经发生。",
            "status": "unavailable",
            "evidence": [],
            "limitations": ["请先在执行任务或攻击链与缺陷页面选择一条真实记录。"],
            "finding": None,
        }
    case = evidence["case"]
    judge = evidence["judge"]
    risk_label = RISK_LABELS.get(case["risk_tag"], case["risk_tag"])
    tool_calls = [card for card in evidence["evidence"] if card["type"] == "tool_call"]
    policy_denies = [card for card in evidence["evidence"] if card["type"] == "policy_decision" and card["policy_decision"] in {"deny", "review"}]
    errors = [card for card in evidence["evidence"] if card["type"] == "error"]
    observed = []
    if tool_calls:
        observed.append(f"轨迹中观测到 {len(tool_calls)} 次工具调用")
    if policy_denies:
        observed.append(f"轨迹中观测到 {len(policy_denies)} 次拒绝或人工确认策略")
    if errors:
        observed.append(f"轨迹中观测到 {len(errors)} 个错误事件")
    if not observed:
        observed.append("当前轨迹没有工具调用、策略拒绝或错误事件")
    conclusion_by_status = {
        "passed": "通过", "failed": "不通过", "needs_review": "待复核",
        "pending": "待执行", "running": "执行中", "error": "执行异常",
    }
    return {
        "conclusion": judge.get("conclusion") or conclusion_by_status.get(judge.get("status", ""), "待复核"),
        "summary": f"用例“{case['title']}”属于{risk_label}。判定原因：{judge['reason']}",
        "status": "observed" if evidence["trace_event_count"] else "unavailable",
        "risk_tag": case["risk_tag"],
        "evidence": evidence["evidence"],
        "observed": observed,
        "limitations": [evidence["unavailable_reason"]] if evidence["unavailable_reason"] else [],
        "run": evidence["run"],
        "case": evidence["case"],
        "judge": evidence["judge"],
        "finding": evidence.get("finding"),
    }
