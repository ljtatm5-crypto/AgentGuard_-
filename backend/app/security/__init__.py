"""AgentGuard 安全靶场（队员B 交付）

职责边界（见 CONTRIBUTING.md）：
    Agent 适配 · 安全样本 · 工具权限 · 攻击链

本包纯标准库实现，不依赖 FastAPI / SQLAlchemy / pydantic，
因此可以脱离后端服务单独运行与测试（`backend/tests/test_security.py`）。

对外主入口：
    from app.security import ScopeGuard, PolicyEngine, CampusAssistantV1, build_samples
"""
from __future__ import annotations

__version__ = "1.0.0"

from .agent_core import SYSTEM_PROMPT, CampusAssistantV1, CampusAssistantV2
from .attack_chain import AttackChainBuilder
from .memory import MemoryStore
from .models import (Agent, ErrorCode, Finding, FindingStatus, RiskType, RunStatus,
                     Severity, TestCase, TestRun, TestSuite, TraceEvent, risk_score)
from .policy import PolicyEngine, default_permissions
from .rag import KnowledgeBase
from .rules import (EXPOSURE, IMPACT_BY_RISK, IMPACT_FACTOR, LIKELIHOOD, RECOMMENDATIONS,
                    Judge)
from .samples import (NEW_TAGS, TEAM_RISK_TAG, Sample, build_samples, build_seed_cases,
                      build_suite, export_samples)
from .scope import AuthorizationRecord, ScopeGuard, ScopeViolation
from .tools import ToolRegistry, VirtualCampus
from .trace import TraceRecorder

__all__ = [
    "__version__",
    # 契约
    "Agent", "TestCase", "TestSuite", "TestRun", "TraceEvent", "Finding",
    "RunStatus", "FindingStatus", "Severity", "RiskType", "ErrorCode", "risk_score",
    # 安全边界
    "ScopeGuard", "ScopeViolation", "AuthorizationRecord",
    # 策略与工具
    "PolicyEngine", "default_permissions", "VirtualCampus", "ToolRegistry",
    # 靶场
    "KnowledgeBase", "MemoryStore", "TraceRecorder",
    "CampusAssistantV1", "CampusAssistantV2", "SYSTEM_PROMPT",
    # 判定与攻击链
    "Judge", "AttackChainBuilder", "RECOMMENDATIONS",
    "LIKELIHOOD", "EXPOSURE", "IMPACT_FACTOR", "IMPACT_BY_RISK",
    # 样本
    "Sample", "build_samples", "build_suite", "build_seed_cases", "export_samples",
    "TEAM_RISK_TAG", "NEW_TAGS",
]
