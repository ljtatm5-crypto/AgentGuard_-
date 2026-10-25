"""攻击链：把「入口 → 行为 → 影响 → 修复」串成可审计的风险路径。

每个节点都回指 TraceEvent，链路整体回指 TestRun 与 Finding，
满足《队员B 分工》第六章「节点必须能回指 TraceEvent、TestRun 和 Finding」。
"""
from __future__ import annotations

from .models import EventType, Finding, TestRun, TraceEvent, new_id, now_iso
from .rules import RECOMMENDATIONS


class AttackChainBuilder:
    def __init__(self):
        self._chains: dict[str, dict] = {}

    def build(self, finding: Finding, run: TestRun, events: list[TraceEvent]) -> dict:
        chain_id = new_id("chain")
        nodes: list[dict] = []
        edges: list[dict] = []

        def add(node_type: str, label: str, detail: str, evidence: list[str], **extra) -> str:
            nid = new_id("node")
            nodes.append({
                "id": nid, "type": node_type, "label": label, "detail": detail,
                "evidence_event_ids": evidence, "at": now_iso(), **extra,
            })
            if len(nodes) > 1:
                edges.append({"from": nodes[-2]["id"], "to": nid, "relation": _REL.get(node_type, "then")})
            return nid

        # 1) 入口
        entry_ev = next((e for e in events if e.type == EventType.USER_INPUT), None)
        retrieval = next((e for e in events if e.type == EventType.RETRIEVAL
                          and (e.metadata or {}).get("untrusted_hit")), None)
        add("entry", "攻击入口",
            f"载体={finding.impact.get('carrier', 'user_input')}；输入摘要={_excerpt(entry_ev)}",
            [entry_ev.id] if entry_ev else [],
            carrier=finding.impact.get("carrier", "user_input"))

        # 2) 检索/记忆阶段：恶意内容进入上下文
        if retrieval is not None:
            hits = [h.get("doc_id") for h in (retrieval.metadata or {}).get("hits", [])
                    if h.get("trust") == "untrusted"]
            add("behavior", "恶意内容进入上下文",
                f"不可信文档命中 {hits}，被当作上下文而非数据",
                [retrieval.id], stage="retrieval", untrusted_docs=hits)

        # 3) 行为：工具调用 / 记忆写入 / 越界检索
        for ev in events:
            if ev.type == EventType.TOOL_CALL:
                decision = _decision_for(events, ev)
                add("behavior", f"工具调用 {ev.tool}",
                    f"参数={ev.params}；策略决策={decision or '未判定'}",
                    [ev.id], stage="tool", tool=ev.tool, decision=decision)
            elif ev.type == EventType.MEMORY_WRITE:
                add("behavior", f"记忆写入 {ev.params.get('key')}",
                    f"来源={ev.params.get('provenance')}", [ev.id], stage="memory")

        # 4) 影响
        impact = finding.impact or {}
        add("impact", f"风险影响：{impact.get('level', 'unknown')}",
            f"受影响资产={impact.get('asset', '-')}；{impact.get('note', '')}",
            [e.id for e in events if e.type in (EventType.POLICY_DECISION, EventType.RESPONSE)][:3],
            severity=finding.severity, risk_score=finding.risk_score)

        # 5) 修复
        recs = finding.recommendation or RECOMMENDATIONS.get(finding.risk_type, [])
        add("fix", "修复措施", "；".join(recs[:3]), [], recommendations=recs)

        chain = {
            "id": chain_id,
            "finding_id": finding.id,
            "run_id": run.id,
            "case_id": run.case_id,
            "agent_version": run.agent_version,
            "risk_type": finding.risk_type,
            "severity": finding.severity,
            "nodes": nodes,
            "edges": edges,
            "created_at": now_iso(),
        }
        self._chains[chain_id] = chain
        return chain

    def get(self, chain_id: str) -> dict | None:
        return self._chains.get(chain_id)

    def all(self) -> list[dict]:
        return list(self._chains.values())


_REL = {"behavior": "then", "impact": "causes", "fix": "mitigated_by"}
_SEVERITY_ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _decision_for(events: list[TraceEvent], call_ev: TraceEvent) -> str:
    try:
        idx = events.index(call_ev)
    except ValueError:
        return ""
    for ev in events[idx + 1:]:
        if ev.type == EventType.POLICY_DECISION:
            return str((ev.params or {}).get("decision", ""))
        if ev.type == EventType.TOOL_CALL:
            break
    return ""


def _excerpt(ev: TraceEvent | None) -> str:
    if ev is None:
        return "(无输入)"
    return (ev.output or "")[:80]
