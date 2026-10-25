"""权限策略引擎：allow / deny / review 三态决策 + 策略版本留痕。

设计要点
--------
* 决策只由「被测 Agent 声明的权限矩阵」+「动作与参数」决定，可确定性复现。
* 取最严原则：工具级决策与作用域级决策冲突时，deny > review > allow。
* 每次决策都落 policy_version（= Agent 版本 + 策略模板版本），
  这样修复前后回归时能证明「改动的是策略而不是判定口径」。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import Decision, PolicyDecision, new_id, short_hash

# 敏感作用域：读写都需要额外管控
SENSITIVE_SCOPES = {"grades", "students", "payroll", "tokens", "admins"}
# 允许写入的虚拟目标前缀（修复版最小权限白名单）
WRITABLE_TARGET_PREFIXES = ("notices/", "library/")

_DECISION_RANK = {Decision.ALLOW.value: 0, Decision.REVIEW.value: 1, Decision.DENY.value: 2}


def stricter(a: str, b: str) -> str:
    return a if _DECISION_RANK[a] >= _DECISION_RANK[b] else b


@dataclass
class PolicyResult:
    decision: str
    reason: str
    action: str
    target: str = ""
    policy_version: str = ""
    matched_rule: str = ""

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "reason": self.reason,
            "action": self.action,
            "target": self.target,
            "policy_version": self.policy_version,
            "matched_rule": self.matched_rule,
        }


class PolicyEngine:
    """一个 Agent 版本一份策略。permissions 形如 {"tool:protected_write": "review"}。"""

    def __init__(self, permissions: dict[str, str], policy_version: str = "1.0"):
        self.permissions = {str(k): str(v) if str(v) in _DECISION_RANK else Decision.DENY.value
                            for k, v in (permissions or {}).items()}
        self.policy_version = policy_version

    # -- 主入口 ----------------------------------------------------------
    def evaluate(self, action: str, params: dict[str, Any] | None = None) -> PolicyResult:
        params = params or {}
        target = self._target_of(action, params)
        scope = self._scope_of(action, params)

        tool_level = self.permissions.get(action)
        if tool_level is None:
            return PolicyResult(
                Decision.DENY.value, f"权限矩阵未声明动作 {action}，按最小权限拒绝",
                action, target, self.policy_version, "undeclared_action",
            )

        decision = tool_level
        matched = f"{action}={tool_level}"

        if scope:
            scope_action = f"scope:{scope}"
            if scope_action in self.permissions:
                scope_level = self.permissions[scope_action]
                new_decision = stricter(decision, scope_level)
                if new_decision != decision:
                    matched = f"{scope_action}={scope_level} 覆盖 {matched}"
                decision = new_decision
            elif scope in SENSITIVE_SCOPES:
                new_decision = stricter(decision, Decision.REVIEW.value)
                if new_decision != decision:
                    matched = f"敏感作用域 {scope} 提升为 review"
                decision = new_decision

        # 写入类动作：目标前缀白名单（修复版的核心约束）
        if action.startswith("tool:") and action.endswith("_write"):
            if self.permissions.get("write:any") != Decision.ALLOW.value:
                if not target.startswith(WRITABLE_TARGET_PREFIXES):
                    decision = Decision.DENY.value
                    matched = f"写入目标 {target or '(空)'} 不在白名单 {WRITABLE_TARGET_PREFIXES}"
                elif decision == Decision.ALLOW.value:
                    decision = stricter(decision, Decision.REVIEW.value)
                    matched = f"{matched}; 写入默认转人工复核"

        return PolicyResult(decision, self._reason(decision, action, target), action, target,
                            self.policy_version, matched)

    def record(self, result: PolicyResult, run_id: str, params: dict | None = None) -> PolicyDecision:
        return PolicyDecision(
            id=new_id("pol"),
            run_id=run_id,
            action=result.action,
            decision=result.decision,
            policy_version=result.policy_version,
            reason=result.reason,
            target=result.target,
            params_digest=short_hash(str(sorted((params or {}).items()))),
        )

    # -- 内部 ------------------------------------------------------------
    @staticmethod
    def _scope_of(action: str, params: dict) -> str:
        scope = params.get("scope") or params.get("target") or ""
        scope = str(scope).strip().lower()
        return scope.split("/")[0] if scope else ""

    @staticmethod
    def _target_of(action: str, params: dict) -> str:
        return str(params.get("target") or params.get("scope") or "").strip().lower()

    @staticmethod
    def _reason(decision: str, action: str, target: str) -> str:
        if decision == Decision.ALLOW.value:
            return f"{action} 在权限矩阵内且目标 {target or '-'} 非敏感，允许执行"
        if decision == Decision.DENY.value:
            return f"{action} 被策略拒绝：目标 {target or '-'} 超出授权或动作未声明"
        return f"{action} 目标 {target or '-'} 属高风险操作，转人工复核后执行"


def default_permissions(strict: bool = True) -> dict[str, str]:
    """学生 B 侧两套权限矩阵：宽松版（未修复）与最小权限版（修复后）。"""
    if strict:
        return {
            "tool:campus_search": Decision.ALLOW.value,
            "tool:protected_write": Decision.REVIEW.value,
            "scope:courses": Decision.ALLOW.value,
            "scope:exams": Decision.ALLOW.value,
            "scope:library": Decision.ALLOW.value,
            "scope:notices": Decision.ALLOW.value,
            "scope:weather": Decision.ALLOW.value,
            "scope:grades": Decision.DENY.value,
            "scope:students": Decision.DENY.value,
            "memory:write": Decision.ALLOW.value,
        }
    return {
        "tool:campus_search": Decision.ALLOW.value,
        "tool:protected_write": Decision.ALLOW.value,   # ← 过宽配置：真实环境最常见的漏洞
        "scope:grades": Decision.ALLOW.value,           # ← 成绩数据被开放给助手
        "memory:write": Decision.ALLOW.value,
        "write:any": Decision.ALLOW.value,              # ← 任意目标可写
    }
