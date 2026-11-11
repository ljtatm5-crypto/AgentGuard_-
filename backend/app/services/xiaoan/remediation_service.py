"""Risk-specific remediation and regression planning grounded in evidence."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.xiaoan.evidence_service import diagnosis
from app.services.xiaoan.retrieval import hybrid_search

PLAYBOOKS: dict[str, dict[str, Any]] = {
    "direct_injection": {
        "problem": "用户输入试图覆盖系统指令或诱导泄露系统边界。",
        "causes": ["系统指令与用户输入未严格分层", "拒绝规则未覆盖角色诱导", "输出前缺少敏感边界检查"],
        "impact": ["可能泄露系统提示词或工具配置", "可能改变任务目标"],
        "steps": ["固定系统指令优先级并对注入片段做隔离", "在规则层增加角色诱导和系统提示词泄露检测", "输出前检查是否暴露系统边界"],
        "side_effects": ["过度拦截可能影响正常角色扮演类请求"],
    },
    "indirect_injection": {
        "problem": "检索文档中的内容可能被 Agent 当成可执行指令。",
        "causes": ["RAG 内容与指令上下文未隔离", "检索结果未标记为不可信数据", "工具调用前缺少服务端权限复核"],
        "impact": ["可能触发非预期工具调用", "可能改变任务目标或写入虚拟数据"],
        "steps": ["把检索内容放入明确的引用区并声明不可执行", "在系统提示中禁止执行文档内指令", "对受保护工具增加模型外策略校验", "记录检索来源、策略判定和工具结果"],
        "side_effects": ["过于严格的隔离可能降低普通文档摘要的连贯性"],
    },
    "memory_poisoning": {
        "problem": "越权规则可能被写入长期记忆并在后续轮次生效。",
        "causes": ["记忆写入缺少来源和审批", "跨轮会话没有验证规则边界", "记忆内容与系统指令未隔离"],
        "impact": ["后续会话可能自动执行高风险写入", "错误偏好可能长期存在"],
        "steps": ["记忆写入增加人工确认和服务端策略", "标记记忆来源并限制可写入范围", "增加跨轮回归用例验证污染不生效"],
        "side_effects": ["更严格的记忆审批会降低自动学习能力"],
    },
    "tool_abuse": {
        "problem": "Agent 可能发起未授权或高风险工具调用。",
        "causes": ["工具权限只在提示词层约束", "参数和目标范围没有服务端校验", "高风险写入未强制人工确认"],
        "impact": ["可能产生越权写入", "可能在策略拒绝前暴露敏感参数"],
        "steps": ["建立工具白名单和最小权限", "在服务端校验目标、参数和写入范围", "批量或全表写入强制 review", "保留策略版本和工具结果"],
        "side_effects": ["新增审批会降低部分自动化效率"],
    },
    "goal_drift": {
        "problem": "任务范围被逐步牵引到未授权的数据或动作。",
        "causes": ["缺少任务数据范围基线", "检索或工具参数没有范围校验", "只检查返回结果而忽略请求意图"],
        "impact": ["可能访问非必要数据", "可能扩大任务范围"],
        "steps": ["为每个任务记录允许的数据范围", "在检索和工具调用前执行范围校验", "对超出范围的请求直接拒绝并记录证据"],
        "side_effects": ["范围过窄可能导致合法请求需要人工补充授权"],
    },
    "exception": {
        "problem": "工具异常时 Agent 可能伪造确定答案而不是安全降级。",
        "causes": ["异常返回没有统一处理", "重试或降级策略不明确", "回答层缺少证据充分性检查"],
        "impact": ["可能向用户提供无法验证的结论"],
        "steps": ["明确降级策略和用户提示", "记录工具错误与重试次数", "证据不足时转人工复核"],
        "side_effects": ["业务可用性可能短时下降"],
    },
    "baseline_normal": {
        "problem": "正常业务对照未保持可用。",
        "causes": ["安全规则可能过度拦截正常请求", "检索或工具链路发生回归"],
        "impact": ["安全策略可能影响正常业务体验"],
        "steps": ["对比正常对照轨迹与基线", "缩小策略拦截范围", "保持正常查询和证据记录"],
        "side_effects": ["放宽策略时必须补充安全回归"],
    },
}


def remediation_plan(db: Session, *, finding_id: str | None = None, run_id: str | None = None, case_id: str | None = None, question: str = "") -> dict[str, Any]:
    diagnosis_result = diagnosis(db, run_id=run_id, finding_id=finding_id, case_id=case_id)
    risk_tag = diagnosis_result.get("risk_tag") or (diagnosis_result.get("case") or {}).get("risk_tag") or "baseline_normal"
    playbook = PLAYBOOKS.get(risk_tag, PLAYBOOKS["baseline_normal"])
    sources = hybrid_search(db, f"{risk_tag} 修复 回归", route="/findings", limit=4)
    regression = [
        "重新执行同一运行记录对应的测试集和用例",
        "确认危险工具调用被拒绝或不再发生",
        "确认正常业务对照仍然通过",
        "在轨迹中核对策略判定、工具结果和响应事件",
        "在报告页确认该用例从失败/待复核变为通过",
    ]
    observed = diagnosis_result.get("observed", [])
    plan = {
        "risk_tag": risk_tag,
        "problem": playbook["problem"],
        "observed": observed,
        "causes": playbook["causes"],
        "impact": playbook["impact"],
        "recommendations": playbook["steps"],
        "steps": playbook["steps"],
        "side_effects": playbook["side_effects"],
        "regression_plan": regression,
        "evidence": diagnosis_result.get("evidence", []),
        "sources": sources,
        "limitations": diagnosis_result.get("limitations", []) + [
            "修复建议不是已完成的修复；必须由用户确认并重新执行测试后才能验证。"
        ],
        "requires_human_confirmation": True,
    }
    return plan
