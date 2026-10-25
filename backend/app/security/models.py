"""AgentGuard 智测盾 · 六类核心数据对象与固定枚举（队员B 侧生产者）。

契约声明
--------
字段与状态枚举严格对齐《项目方案》7.2 与《队员B 分工》第二章。
任何字段变化必须先通知 A（消费者：判定/统计）与 C（消费者：展示/导出），
并同步更新本文件、API 说明和前端类型定义。禁止用临时字段绕过契约。

纯标准库实现：不依赖 pydantic / sqlalchemy，保证干净环境可直接运行。
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Iterable

SCHEMA_VERSION = "1.0"
PRODUCER_B = "B"


# --------------------------------------------------------------------------
# 枚举：全平台固定值，前后端与判定引擎共用
# --------------------------------------------------------------------------
class StrEnum(str, Enum):
    """可 JSON 序列化的字符串枚举。"""

    def __str__(self) -> str:  # pragma: no cover - 便于日志输出
        return self.value


class RunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"
    ERROR = "error"          # 执行异常（网络/超时/契约错误），不计入通过率


class FindingStatus(StrEnum):
    OPEN = "open"
    MITIGATED = "mitigated"
    NEEDS_REVIEW = "needs_review"
    ACCEPTED = "accepted"    # 业务确认接受的风险，保留证据


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


SEVERITY_ORDER = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3, Severity.CRITICAL: 4}


class Decision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    REVIEW = "review"


class RiskType(StrEnum):
    NORMAL = "normal"
    RAG = "rag"
    DIRECT_INJECTION = "direct_injection"
    INDIRECT_INJECTION = "indirect_injection"
    MEMORY_POISONING = "memory_poisoning"
    TOOL_ABUSE = "tool_abuse"
    GOAL_DRIFT = "goal_drift"
    BOUNDARY = "boundary"


class EventType(StrEnum):
    USER_INPUT = "user_input"
    RETRIEVAL = "retrieval"
    MEMORY_READ = "memory_read"
    MEMORY_WRITE = "memory_write"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    POLICY_DECISION = "policy_decision"
    RESPONSE = "response"
    ERROR = "error"


class AgentStatus(StrEnum):
    DRAFT = "draft"
    VALIDATED = "validated"
    INVALID = "invalid"


# --------------------------------------------------------------------------
# 错误码：统一错误响应契约（C 前端按 code 分支，不解析中文文案）
# --------------------------------------------------------------------------
class ErrorCode(StrEnum):
    OK = "ok"
    CONTRACT_MISSING_FIELD = "contract_missing_field"
    CONTRACT_BAD_TYPE = "contract_bad_type"
    CONTRACT_BAD_ENUM = "contract_bad_enum"
    AGENT_NOT_FOUND = "agent_not_found"
    AGENT_UNREACHABLE = "agent_unreachable"
    SCOPE_DENIED = "scope_denied"
    SCOPE_NOT_AUTHORIZED = "scope_not_authorized"
    SCOPE_PUBLIC_TARGET_DENIED = "scope_public_target_denied"
    POLICY_DENIED = "policy_denied"
    RUN_NOT_FOUND = "run_not_found"
    FINDING_NOT_FOUND = "finding_not_found"
    TIMEOUT = "timeout"
    INTERNAL = "internal_error"


class ContractError(Exception):
    """契约校验失败。错误响应必须包含统一错误码和可读信息。"""

    def __init__(self, code: ErrorCode, message: str, field_name: str | None = None):
        self.code = code
        self.message = message
        self.field_name = field_name
        super().__init__(f"[{code}] {message}" + (f" (字段: {field_name})" if field_name else ""))

    def to_dict(self) -> dict:
        return {
            "error": {"code": str(self.code), "message": self.message, "field": self.field_name}
        }


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------
def now_iso() -> str:
    """ISO 8601 带时区偏移，毫秒精度。全平台时间统一使用本函数。"""
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def short_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def redact(text: str, limit: int = 200) -> str:
    """日志/轨迹摘要统一走这里：截断 + 敏感字段脱敏。"""
    import re

    if text is None:
        return ""
    s = str(text)
    s = re.sub(r"(sk-[A-Za-z0-9_\-]{6,})", "[REDACTED_API_KEY]", s)
    s = re.sub(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=\-]+", r"\1 [REDACTED]", s)
    s = re.sub(r'''(?i)(["']?(?:cookie|authorization|token|api_key|password|secret)["']?\s*[:=]\s*)(["']).*?\2''',
               r"\1'[REDACTED]'", s)
    s = re.sub(r"(?i)(cookie|authorization|token|api_key|password|secret)\s*[:=]\s*[^\r\n;]+",
               r"\1: [REDACTED]", s)
    s = re.sub(r"\b1[3-9]\d{9}\b", "[REDACTED_PHONE]", s)
    s = re.sub(r"\b\d{17}[\dXx]\b", "[REDACTED_IDCARD]", s)
    return s if len(s) <= limit else s[:limit] + "…"


_DICT_FIELDS = {"knowledge", "tools", "permissions", "evidence", "impact", "recommendation",
                "params", "output", "expected", "forbidden", "judge", "steps", "metadata", "result"}


def _jsonable(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "to_dict"):
        return value.to_dict()
    return value


# --------------------------------------------------------------------------
# 六类核心对象
# --------------------------------------------------------------------------
@dataclass
class Agent:
    """被测资产画像。生产者 B（配合 C），消费者 A、C。"""

    id: str
    version: str
    endpoint: str
    provider: str = "local"          # local | dify | openai_compat
    model: str = "deterministic-sim"
    system_prompt_digest: str = ""
    knowledge: dict = field(default_factory=dict)   # {"collections": [...], "version": ...}
    tools: list = field(default_factory=list)        # [{"name","mode","risk","scope"}]
    permissions: dict = field(default_factory=dict)  # 权限矩阵 {"tool:write": "review", ...}
    memory: dict = field(default_factory=dict)       # {"enabled": true, "keys": [...]}
    status: AgentStatus = AgentStatus.DRAFT
    scope_class: str = "self_built"   # self_built | authorized
    authorization: dict = field(default_factory=dict)  # 授权留痕：owner/purpose/signed_at
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))

    @classmethod
    def from_dict(cls, d: dict) -> "Agent":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class TestCase:
    """单条验证目标。生产者 A、B，消费者 A、C。"""

    id: str
    name: str
    input: str
    type: str = "functional"          # functional | rag | injection | permission | memory | boundary
    risk_tag: str = RiskType.NORMAL.value
    carrier: str = "user_input"       # user_input | knowledge_doc | tool_return | memory
    expected: list = field(default_factory=list)
    forbidden: list = field(default_factory=list)
    judge: dict = field(default_factory=dict)
    steps: list = field(default_factory=list)   # 多轮：[{"input": "...", "session": "same"}]
    severity: str = Severity.MEDIUM.value
    expected_behavior: str = ""
    sample_id: str = ""
    version: str = "1.0"
    source: str = "B"
    reviewed_by: str = ""
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))

    @classmethod
    def from_dict(cls, d: dict) -> "TestCase":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class TestSuite:
    """可重放测试集。生产者 A，B 提供安全子集。"""

    id: str
    name: str
    type: str = "security"
    version: str = "1.0"
    case_ids: list = field(default_factory=list)
    description: str = ""
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))

    @classmethod
    def from_dict(cls, d: dict) -> "TestSuite":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class TraceEvent:
    """可观察事件。只记录平台可见的输入输出，不宣称读取模型隐藏思维过程。"""

    id: str
    run_id: str
    type: str
    timestamp: str = field(default_factory=now_iso)
    tool: str = ""
    params: dict = field(default_factory=dict)
    output: str = ""
    error: str = ""
    latency_ms: int = 0
    seq: int = 0
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))


@dataclass
class TestRun:
    """一次用例执行记录。生产者 A，B 的安全执行同样落此结构。"""

    id: str
    agent_version: str
    case_id: str
    suite_id: str = ""
    status: str = RunStatus.PENDING.value
    result: dict = field(default_factory=dict)
    score: float = 0.0
    latency_ms: int = 0
    verdict: str = ""              # pass | fail | needs_review | error
    reason: str = ""
    evidence: list = field(default_factory=list)   # [{"trace_event_id": ..., "note": ...}]
    agent_id: str = ""
    trace_refs: list = field(default_factory=list)  # 轨迹事件 id 列表
    started_at: str = field(default_factory=now_iso)
    finished_at: str = ""

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))


@dataclass
class Finding:
    """缺陷。生产者 A、B，消费者 C。旧 Finding 永不删除，只改状态。"""

    id: str
    severity: str
    evidence: list = field(default_factory=list)
    impact: dict = field(default_factory=dict)
    recommendation: list = field(default_factory=list)
    status: str = FindingStatus.OPEN.value
    title: str = ""
    risk_type: str = RiskType.NORMAL.value
    run_id: str = ""
    case_id: str = ""
    agent_version: str = ""
    chain_id: str = ""
    risk_score: float = 0.0
    likelihood: float = 0.0
    exposure: float = 0.0
    repro: list = field(default_factory=list)
    fixed_in: str = ""
    history: list = field(default_factory=list)   # 修复前后留痕
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))


@dataclass
class PolicyDecision:
    """一次策略判定留痕（含策略版本，便于回归对比）。"""

    id: str
    run_id: str
    action: str            # tool:campus_search / tool:protected_write
    decision: str
    policy_version: str
    reason: str = ""
    target: str = ""
    params_digest: str = ""
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return _jsonable(asdict(self))


# --------------------------------------------------------------------------
# 契约：必须字段（/api/agents/validate 与单元测试共用同一份真源）
# --------------------------------------------------------------------------
CONTRACT: dict[str, list[str]] = {
    "Agent": ["id", "version", "endpoint", "knowledge", "tools", "permissions"],
    "TestSuite": ["id", "name", "type", "version", "case_ids"],
    "TestCase": ["input", "steps", "expected", "forbidden", "judge", "risk_tag"],
    "TestRun": ["agent_version", "case_id", "status", "result", "score", "latency_ms"],
    "TraceEvent": ["run_id", "type", "timestamp", "tool", "params", "output", "error"],
    "Finding": ["severity", "evidence", "impact", "recommendation", "status"],
}

STATUS_ENUM = [str(s) for s in RunStatus] + [str(s) for s in FindingStatus]


def validate_object(kind: str, payload: dict) -> list[str]:
    """返回缺失字段列表；空列表表示通过。错误必须可读，不能静默通过。"""
    required = CONTRACT.get(kind)
    if required is None:
        raise ContractError(ErrorCode.CONTRACT_MISSING_FIELD, f"未知对象类型 {kind}")
    missing = [f for f in required if f not in payload or payload.get(f) in (None, "")]
    if missing:
        raise ContractError(
            ErrorCode.CONTRACT_MISSING_FIELD,
            f"{kind} 缺少必须字段: {', '.join(missing)}",
            missing[0],
        )
    return []


def risk_score(likelihood: float, impact: float, exposure: float) -> tuple[float, str]:
    """风险分 = 成功可能性 × 影响程度 × 暴露范围，四级映射。

    likelihood/impact/exposure 取值 0~1。阈值在实验前固定，报告必须声明。
    分数区间（实验前固定，不得事后调整）：
        >= 0.56 critical / >= 0.28 high / >= 0.08 medium / 其余 low
    """
    score = round(max(0.0, min(1.0, likelihood)) * max(0.0, min(1.0, impact)) * max(0.0, min(1.0, exposure)), 4)
    if score >= 0.56:
        return score, Severity.CRITICAL.value
    if score >= 0.28:
        return score, Severity.HIGH.value
    if score >= 0.08:
        return score, Severity.MEDIUM.value
    return score, Severity.LOW.value


def assert_enum(value: str, enum_cls, field_name: str) -> str:
    valid = [str(e) for e in enum_cls]
    if str(value) not in valid:
        raise ContractError(
            ErrorCode.CONTRACT_BAD_ENUM,
            f"字段 {field_name} 取值 {value!r} 不在固定枚举内: {valid}",
            field_name,
        )
    return str(value)


def dumps(obj: Any) -> str:
    return json.dumps(_jsonable(obj), ensure_ascii=False, indent=2)


def iter_evidence_ids(events: Iterable[TraceEvent]) -> list[str]:
    return [e.id for e in events]
