"""B 的安全样本、可观察轨迹和确定性判定与 A 执行器之间的接缝。"""
from __future__ import annotations

from typing import Any

from app.security.models import TraceEvent, redact
from app.security.rules import Judge
from app.security.samples import TEAM_RISK_TAG, build_samples
from app.services.agent_adapter import Invocation


def build_security_cases() -> list[dict]:
    cases = []
    for sample in build_samples():
        case = sample.to_case().to_dict()
        case["risk_tag"] = TEAM_RISK_TAG.get(sample.risk_type, sample.risk_type)
        case["expected"] = "；".join(sample.allowed)
        cases.append(case)
    return cases


def merge_security_invocations(invocations: list[Invocation]) -> Invocation:
    """多轮共享会话、保留所有轮的风险动作；答案判定使用最后一轮回答。"""
    if not invocations:
        raise ValueError("至少需要一轮执行结果")
    last = invocations[-1]
    raw = dict(last.raw)
    raw["trace_events"] = [event for inv in invocations for event in inv.raw.get("trace_events", [])]
    flags = dict(raw.get("flags") or {})
    flags["actions"] = [action for inv in invocations for action in (inv.raw.get("flags") or {}).get("actions", [])]
    raw["flags"] = flags
    raw["text"] = last.answer
    return Invocation(
        answer=last.answer, events=[event for inv in invocations for event in inv.events],
        latency=sum(inv.latency for inv in invocations),
        risk_triggered=any(inv.risk_triggered for inv in invocations),
        adapter=last.adapter, agent_version=last.agent_version, raw=raw,
    )


def judge_security_invocation(case: Any, invocation: Invocation) -> dict:
    """支持 SQLAlchemy TestCase 或 dict；未知规则和缺少规则均转人工复核。"""
    payload = case if isinstance(case, dict) else {
        field: getattr(case, field, None) for field in ("judge", "input", "forbidden", "risk_tag")
    }
    raw_events = invocation.raw.get("trace_events", [])
    events = [TraceEvent(**event) for event in raw_events]
    if not raw_events:
        return {
            "status": "needs_review", "verdict": "needs_review", "reason": "缺少安全靶场原始轨迹，需人工复核",
            "confidence": 0.0, "source": "rule", "judge_mode": "rule", "evidence": [], "rules": [], "results": [],
        }
    reply = dict(invocation.raw)
    reply["text"] = invocation.answer
    judgement = Judge().evaluate(payload, reply, events)
    result = judgement.to_dict()
    supplement_info = {"used": False, "can_override_rule": False}
    if judgement.verdict == "needs_review":
        from app.services.llm_provider import get_default_llm, semantic_supplement

        try:
            llm = get_default_llm()
            if llm.enabled:
                suggestion = semantic_supplement(llm.prompt_version)(case, invocation)
                supplement_info = {
                    "used": True,
                    "can_override_rule": False,
                    "prompt_version": llm.prompt_version,
                    "model": llm.model,
                    "suggestion": suggestion,
                }
        except Exception as exc:
            supplement_info = {
                "used": False,
                "can_override_rule": False,
                "error": f"{type(exc).__name__}: {redact(str(exc), 200)}",
            }
    result.update(
        status=judgement.status,
        source="rule+llm-supplement" if supplement_info["used"] else "rule",
        rules=result["results"],
        risk_detected=judgement.verdict == "fail",
        ground_truth_risk=str(payload.get("risk_tag", "baseline_normal")) != "baseline_normal",
        llm_supplement=supplement_info,
    )
    return result


__all__ = ["build_security_cases", "merge_security_invocations", "judge_security_invocation"]
