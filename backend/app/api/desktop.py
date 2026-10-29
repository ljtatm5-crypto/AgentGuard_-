"""Versioned desktop API. The existing /api routes remain unchanged."""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
import re
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Agent, Finding, TestCase, TestRun, TestSuite, TraceEvent
from app.services.desktop_contract import (
    FINAL_STATUSES, SEED_SUITE_ID, agent_view, case_view,
    event_view, finding_view, iso, judge_view, metrics_view, risk_tag, run_view,
    save_chain_review, suite_view,
)


class DesktopError(Exception):
    def __init__(self, status: int, code: str, message: str, detail: dict | None = None):
        self.status, self.code, self.message, self.detail = status, code, message, detail


class DesktopRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request: Request):
            try:
                return await original(request)
            except DesktopError as exc:
                body = {"error_code": exc.code, "message": exc.message}
                if exc.detail:
                    body["detail"] = exc.detail
                return JSONResponse(status_code=exc.status, content=body)
            except RequestValidationError as exc:
                return JSONResponse(status_code=422, content={
                    "error_code": "contract_bad_type", "message": "请求字段不符合接口要求",
                    "detail": {"fields": [".".join(str(part) for part in e["loc"]) for e in exc.errors()]},
                })

        return handle


router = APIRouter(tags=["desktop-v2"], route_class=DesktopRoute)


class RunCreate(BaseModel):
    agent_id: str = Field(min_length=1)
    suite_id: str = Field(min_length=1)


class GenerateRequest(BaseModel):
    agent_id: str = Field(min_length=1)
    test_type: str = "security"
    use_ai: bool = False


class AcceptGeneratedRequest(BaseModel):
    agent_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=160)
    test_type: str = Field(min_length=1, max_length=40)
    cases: list[dict[str, Any]] = Field(min_length=1, max_length=12)


def require(db: Session, model, object_id: str, code: str, label: str):
    value = db.get(model, object_id)
    if value is None:
        raise DesktopError(404, code, f"{label}不存在")
    return value


def task_rows(db: Session, task_id: str) -> list[TestRun]:
    rows = list(db.scalars(select(TestRun).where(TestRun.task_id == task_id).order_by(TestRun.created_at, TestRun.id)).all())
    if not rows:
        # Also accept an old per-case execution id while exposing task ids to C.
        row = db.get(TestRun, task_id)
        if row:
            return task_rows(db, row.task_id)
        raise DesktopError(404, "run_not_found", "运行任务不存在")
    return rows


def events_for(db: Session, row: TestRun) -> list[TraceEvent]:
    events = list(db.scalars(select(TraceEvent).where(TraceEvent.run_id == row.id).order_by(TraceEvent.timestamp, TraceEvent.id)).all())
    return sorted(events, key=lambda event: (event.params or {}).get("desktop_sequence", len(events)))


def suite_cases(db: Session, suite: TestSuite) -> list[TestCase]:
    rows = list(db.scalars(select(TestCase).where(TestCase.suite_id == suite.id)).all())
    order = {case_id: i for i, case_id in enumerate(suite.case_ids or [])}
    return sorted(rows, key=lambda row: (order.get(row.id, len(order)), row.id))


@router.get("/agents")
def agents(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Agent).order_by(Agent.created_at.desc())).all())
    rows.sort(key=lambda a: a.id != "desktop-campus-v2")
    return [agent_view(a) for a in rows]


@router.get("/agents/{agent_id}")
def agent(agent_id: str, db: Session = Depends(get_db)):
    return agent_view(require(db, Agent, agent_id, "agent_not_found", "智能体"))


@router.post("/agents/validate")
def validate_agent(payload: dict[str, Any], db: Session = Depends(get_db)):
    """校验本地沙盒或明确授权的自建 Dify，不保存任何明文凭据。"""
    endpoint = str(payload.get("endpoint", ""))
    scope = payload.get("authorized_scope") or {}
    if not isinstance(scope, dict):
        raise DesktopError(422, "contract_bad_type", "authorized_scope 必须为对象")
    if scope.get("external_target_allowed") is True:
        raise DesktopError(403, "scope_denied", "外部目标不在授权范围内")
    name = str(payload.get("name", "")).strip()
    version = str(payload.get("version", "v2.0"))
    if not name:
        raise DesktopError(422, "contract_missing_field", "请输入智能体名称")
    if version not in {"v1.0", "v2.0"}:
        raise DesktopError(422, "contract_bad_enum", "智能体版本须为 v1.0 或 v2.0")
    agent_type = str(payload.get("agent_type", "conversation"))
    if agent_type not in {"conversation", "rag", "tool", "workflow"}:
        raise DesktopError(422, "contract_bad_enum", "智能体类型须为 conversation、rag、tool 或 workflow")

    connection_mode = str(payload.get("connection_mode", "local_sandbox"))
    if connection_mode not in {"local_sandbox", "dify_authorized"}:
        raise DesktopError(422, "contract_bad_enum", "连接方式须为 local_sandbox 或 dify_authorized")
    if connection_mode == "local_sandbox" and not endpoint.startswith("local://"):
        raise DesktopError(403, "scope_public_target_denied", "本地测试资产不能使用外部 HTTP(S) 地址")
    if connection_mode == "dify_authorized":
        from app.core.config import get_settings
        from app.core.target_scope import TargetScopeError, validate_target_scope

        authorization_reference = str(payload.get("authorization_reference", "")).strip()
        credential_env = str(payload.get("credential_env", "")).strip()
        if not payload.get("authorization_confirmed") or not authorization_reference:
            raise DesktopError(403, "scope_denied", "接入自建 Dify 前必须确认授权并填写授权记录编号")
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", credential_env):
            raise DesktopError(422, "contract_bad_enum", "凭据环境变量名格式无效")
        if not os.getenv(credential_env):
            raise DesktopError(422, "credential_missing", f"服务端环境变量 {credential_env} 未配置")
        requested_agent_id = str(payload.get("agent_id") or "").strip()
        created_id = requested_agent_id or str(uuid4())
        try:
            validate_target_scope(
                endpoint=endpoint,
                adapter="dify",
                target_scope="self_hosted_dify",
                authorization_confirmed=True,
                authorization_reference=authorization_reference,
                allowed_hosts=get_settings().allowed_target_host_list,
                db=db,
                agent_id=created_id if requested_agent_id else None,
            )
        except TargetScopeError as exc:
            raise DesktopError(403, "scope_denied", str(exc)) from exc
        permissions = {
            "tool:dify_chat": "allow",
            "__agent_type__": agent_type,
            "__target_scope__": "self_hosted_dify",
            "__authorization_confirmed__": "true",
            "__authorization_reference__": authorization_reference,
            "__credential_env__": credential_env,
        }
        from app.services.authorization import get_by_reference

        authorization = get_by_reference(db, authorization_reference)
        if authorization is not None and authorization.agent_id is None:
            authorization.agent_id = created_id
        created = Agent(
            id=created_id,
            name=name,
            version=version,
            endpoint=endpoint,
            adapter="dify",
            model=str(payload.get("model") or "dify-self-hosted"),
            knowledge=[],
            tools=[{"name": "dify_chat", "description": "调用自建 Dify 对话接口", "side_effect": "none"}],
            permissions=permissions,
            status="validated",
        )
        db.add(created)
        db.commit()
        db.refresh(created)
        return agent_view(created)

    if not re.fullmatch(r"local://[a-z0-9][a-z0-9-]{1,62}", endpoint):
        raise DesktopError(422, "contract_missing_field", "请选择安全的本地测试沙盒")
    from app.security.policy import default_permissions
    base = db.get(Agent, "desktop-campus-v2" if version == "v2.0" else "desktop-campus-v1")
    permissions = default_permissions(strict=version == "v2.0")
    supplied_permissions = payload.get("permissions") or {}
    if not isinstance(supplied_permissions, dict):
        raise DesktopError(422, "contract_bad_type", "permissions 必须为对象")
    rank = {"allow": 0, "review": 1, "deny": 2}
    known_tools = {"campus_search", "protected_write"}
    for raw_name, decision in supplied_permissions.items():
        name = str(raw_name).removeprefix("tool:")
        if name not in known_tools:
            raise DesktopError(422, "contract_bad_enum", f"不支持的工具权限：{raw_name}")
        if decision not in rank:
            raise DesktopError(422, "contract_bad_enum", f"工具 {name} 的权限必须是 allow/review/deny")
        key = f"tool:{name}"
        if rank[decision] < rank[permissions.get(key, "deny")]:
            raise DesktopError(403, "policy_escalation_denied", f"{name} 只能进一步收紧，不能放宽固定安全基线")
        permissions[key] = decision
    permissions["__agent_type__"] = agent_type

    tools = list(base.tools if base else [])
    supplied_tools = payload.get("tools")
    if supplied_tools is not None:
        if not isinstance(supplied_tools, list):
            raise DesktopError(422, "contract_bad_type", "tools 必须为数组")
        requested_tools = []
        for item in supplied_tools:
            name = item.get("name") if isinstance(item, dict) else None
            side_effect = item.get("side_effect", "none") if isinstance(item, dict) else None
            if name not in known_tools or side_effect not in {"none", "virtual_write"}:
                raise DesktopError(403, "scope_denied", "只允许注册本地只读或虚拟写入工具")
            requested_tools.append({
                "name": name,
                "description": str(item.get("description") or name),
                "side_effect": side_effect,
            })
        tools = requested_tools or tools
    knowledge = base.knowledge if base and endpoint in {"local://campus-assistant", "local://campus"} else []
    model = str(payload.get("model") or "deterministic-local-sandbox")
    created = Agent(name=name, version=version, endpoint=endpoint, adapter="campus", model=model,
                    knowledge=knowledge, tools=tools,
                    permissions=permissions, status="validated")
    db.add(created)
    db.commit()
    db.refresh(created)
    return agent_view(created)


@router.get("/test-suites")
def suites(db: Session = Depends(get_db)):
    return [suite_view(s, suite_cases(db, s)) for s in db.scalars(select(TestSuite).order_by(TestSuite.created_at.desc())).all()]


@router.get("/test-suites/{suite_id}/cases")
def cases(suite_id: str, db: Session = Depends(get_db)):
    suite = require(db, TestSuite, suite_id, "suite_not_found", "测试集")
    return [case_view(c, suite) for c in suite_cases(db, suite)]


@router.post("/test-suites/generate")
def generate_suite(payload: GenerateRequest, db: Session = Depends(get_db)):
    asset = require(db, Agent, payload.agent_id, "agent_not_found", "智能体")
    template = require(db, TestSuite, SEED_SUITE_ID, "suite_not_found", "本地模板")
    source = suite_cases(db, template)
    if payload.use_ai:
        from app.services.llm_provider import (
            LLMUnavailable,
            build_generation_prompt,
            get_default_llm,
            normalize_generated_cases,
        )

        llm = get_default_llm()
        system, user = build_generation_prompt(asset, payload.test_type, source)
        try:
            generated_payload = llm.complete_json(system=system, user=user)
            generated_cases = normalize_generated_cases(generated_payload, source)
        except LLMUnavailable as exc:
            raise DesktopError(503, "llm_not_configured", str(exc)) from exc
        draft_id = f"draft-{uuid4()}"
        return {
            "suite": {
                "id": draft_id,
                "name": f"{payload.test_type} · AI 候选测试集",
                "type": payload.test_type,
                "version": "draft",
                "case_ids": [],
            },
            "cases": [
                {
                    "id": f"{draft_id}-{index + 1}",
                    "suite_id": draft_id,
                    "title": item["name"],
                    "risk_tag": item["risk_tag"],
                    "input": item["input"],
                    "steps": item["steps"],
                    "expected": item["expected"],
                    "forbidden": item["forbidden"],
                    "judge": ["rule"],
                    "source": "ai_generated",
                    "version": "draft",
                }
                for index, item in enumerate(generated_cases)
            ],
            "review_required": True,
            "generation_source": "llm_draft",
            "llm_used": True,
            "prompt_version": llm.prompt_version,
        }
    requested = payload.test_type.lower().strip()
    aliases = {"injection": {"direct_injection", "indirect_injection"}, "注入": {"direct_injection", "indirect_injection"},
               "memory": {"memory_poisoning"}, "记忆": {"memory_poisoning"}, "permission": {"tool_abuse"}, "工具权限": {"tool_abuse"},
               "functional": {"normal"}, "功能": {"normal"}, "boundary": {"boundary"}, "异常": {"boundary"}, "rag": {"rag"}}
    if requested in aliases:
        selected = [c for c in source if c.risk_tag in aliases[requested]]
    elif requested in {"security", "mixed", "all", "安全", "综合"}:
        selected = source
    else:
        selected = [c for c in source if c.risk_tag == requested or c.type.lower() == requested]
    if not selected:
        raise DesktopError(422, "unsupported_test_type", "没有对应的本地规则模板", {"supported": sorted(aliases) + ["security", "mixed"]})
    generated = TestSuite(name=f"{payload.test_type} · 固定规则模板", type=payload.test_type, version="1.0", status="ready")
    db.add(generated)
    db.flush()
    cloned = []
    for original in selected:
        clone = TestCase(suite_id=generated.id, name=original.name, type=original.type, input=original.input,
                         steps=original.steps, expected=original.expected, forbidden=original.forbidden,
                         judge={**original.judge, "template_case_id": original.id}, risk_tag=original.risk_tag, source="manual-template")
        db.add(clone)
        db.flush()
        cloned.append(clone)
    generated.case_ids = [c.id for c in cloned]
    db.commit()
    return {"suite": suite_view(generated, cloned), "cases": [case_view(c, generated) for c in cloned],
            "review_required": False, "generation_source": "reviewed_rule_templates", "llm_used": False}


@router.post("/test-suites/accept")
def accept_generated_suite(payload: AcceptGeneratedRequest, db: Session = Depends(get_db)):
    require(db, Agent, payload.agent_id, "agent_not_found", "智能体")
    template = require(db, TestSuite, SEED_SUITE_ID, "suite_not_found", "本地模板")
    templates = suite_cases(db, template)
    suite = TestSuite(name=payload.name, type=payload.test_type, version="1.0", status="ready")
    db.add(suite)
    db.flush()
    created = []
    for index, item in enumerate(payload.cases):
        tag = risk_tag(str(item.get("risk_tag", "")))
        name = str(item.get("name") or item.get("title") or "").strip()
        input_text = str(item.get("input", "")).strip()
        expected = str(item.get("expected", "")).strip()
        if not name or not input_text or not expected:
            raise DesktopError(422, "contract_missing_field", f"第 {index + 1} 条候选缺少名称、输入或预期")
        matched_template = next((case for case in templates if risk_tag(case.risk_tag) == tag), templates[0])
        ai_original = item.get("ai_original") if isinstance(item.get("ai_original"), dict) else None
        human_modified = bool(ai_original) and any(
            ai_original.get(key) != value
            for key, value in {
                "title": name,
                "input": input_text,
                "expected": expected,
                "forbidden": item.get("forbidden") if isinstance(item.get("forbidden"), list) else [],
                "risk_tag": tag,
            }.items()
        )
        case = TestCase(
            suite_id=suite.id,
            name=name,
            type="ai_generated",
            input=input_text,
            steps=item.get("steps") if isinstance(item.get("steps"), list) else [],
            expected=expected,
            forbidden=item.get("forbidden") if isinstance(item.get("forbidden"), list) else [],
            judge={
                **dict(matched_template.judge or {}),
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "review_method": "human_accept",
                "ai_original": ai_original,
                "human_modified": human_modified,
            },
            risk_tag=tag,
            source="ai_generated",
        )
        db.add(case)
        db.flush()
        created.append(case)
    suite.case_ids = [case.id for case in created]
    db.commit()
    return {
        "suite": suite_view(suite, created),
        "cases": [case_view(case, suite) for case in created],
        "review_required": False,
        "generation_source": "human_reviewed_ai_draft",
        "llm_used": True,
    }


def judge_invocation(case: TestCase, invocation) -> dict:
    judge_config = getattr(case, "judge", None)
    if not isinstance(judge_config, dict) or "rules" not in judge_config:
        return {
            "status": "needs_review",
            "verdict": "needs_review",
            "conclusion": "待复核",
            "reason": "缺少可执行的固定规则配置，大模型不得替代规则作最终判定。",
            "score": 0.5,
            "confidence": 0.0,
            "source": "rule",
            "judge_mode": "rule",
            "evidence": [],
            "rules": [],
            "results": [],
            "ruleset_version": "missing",
            "llm_supplement": {"used": False, "can_override_rule": False},
        }
    if not isinstance(judge_config["rules"], list):
        return {
            "status": "needs_review",
            "verdict": "needs_review",
            "conclusion": "待复核",
            "reason": "固定规则配置格式无效，须由人工复核。",
            "score": 0.5,
            "confidence": 0.0,
            "source": "rule",
            "judge_mode": "rule",
            "evidence": [],
            "rules": [],
            "results": [],
            "ruleset_version": str(judge_config.get("ruleset_version", "invalid")),
            "llm_supplement": {"used": False, "can_override_rule": False},
        }
    if judge_config["rules"]:
        from app.services.security_bridge import judge_security_invocation
        result = dict(judge_security_invocation(case, invocation))
        result.setdefault("source", result.get("judge_mode", "rule"))
        result.setdefault("llm_supplement", {"used": False, "can_override_rule": False})
        result.setdefault("ruleset_version", (case.judge or {}).get("ruleset_version", "b-security-1.0"))
        result.setdefault("score", 1.0 if result["status"] == "passed" else 0.0 if result["status"] == "failed" else 0.5)
        return result
    return {
        "status": "needs_review",
        "verdict": "needs_review",
        "conclusion": "待复核",
        "reason": "固定规则集为空，大模型不得替代规则作最终判定。",
        "score": 0.5,
        "confidence": 0.0,
        "source": "rule",
        "judge_mode": "rule",
        "evidence": [],
        "rules": [],
        "results": [],
        "ruleset_version": str(judge_config.get("ruleset_version", "empty")),
        "llm_supplement": {"used": False, "can_override_rule": False},
    }


def sync_finding(db: Session, run: TestRun, case: TestCase) -> None:
    existing = db.scalars(select(Finding).where(Finding.run_id == run.id)).first()
    if run.status != "failed":
        # A rejudge is not a repair. Keep existing failures and their historical evidence.
        return
    from app.security.rules import IMPACT_BY_RISK, RECOMMENDATIONS
    original_tag = case.risk_tag.replace("-", "_")
    impact = IMPACT_BY_RISK.get(original_tag, {})
    judge = run.result.get("judge", {})
    data = {"severity": (case.judge or {}).get("severity", "high"), "title": f"{case.name} · 规则未通过",
            "evidence": judge.get("evidence", []), "impact": impact.get("note", "智能体实际行为未满足固定回归规则"),
            "recommendation": "；".join(RECOMMENDATIONS.get(original_tag, ["检查事件证据，修复后在相同规则集上重跑"])),
            "status": "open"}
    if existing:
        for key, value in data.items():
            setattr(existing, key, value)
    else:
        # Finding.chain stores human review entries, not the derived Evidence Flow.
        # Rejudging regenerates the derived nodes, so never overwrite these reviews.
        db.add(Finding(run_id=run.id, chain=[], **data))


@router.get("/runs")
def runs(db: Session = Depends(get_db)):
    grouped = defaultdict(list)
    for row in db.scalars(select(TestRun).order_by(TestRun.created_at.desc(), TestRun.id)).all():
        grouped[row.task_id].append(row)
    return [run_view(rows, db.get(TestSuite, rows[0].suite_id)) for rows in grouped.values()]


@router.post("/runs")
def create_run(payload: RunCreate, db: Session = Depends(get_db)):
    from app.services.agent_adapter import invoke_agent, release_session
    from app.services.security_bridge import merge_security_invocations

    asset = require(db, Agent, payload.agent_id, "agent_not_found", "智能体")
    suite = require(db, TestSuite, payload.suite_id, "suite_not_found", "测试集")
    if asset.adapter not in {"campus", "local", "mock", "dify"}:
        raise DesktopError(403, "scope_denied", "不支持的智能体连接类型")
    if asset.status != "validated":
        raise DesktopError(409, "agent_not_validated", "请先校验智能体配置")
    selected = suite_cases(db, suite)
    if not selected:
        raise DesktopError(422, "empty_suite", "测试集没有可执行用例")
    task_id = str(uuid4())
    rows = []
    try:
        for case in selected:
            run = TestRun(task_id=task_id, agent_id=asset.id, suite_id=suite.id, case_id=case.id,
                          agent_version=asset.version, status="running")
            db.add(run)
            db.flush()
            session_id = f"{task_id}:{case.id}"
            started = datetime.now(timezone.utc)
            # Freeze the reviewed input and rules before executing any tools. Rejudging
            # must never silently adopt an edited test case or a changed ruleset.
            snapshot = deepcopy({key: getattr(case, key) for key in
                                 ("id", "name", "type", "input", "steps", "expected", "forbidden", "risk_tag", "judge")})
            fingerprint = sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
            try:
                # Only steps with explicit input are executable turns; prose steps are instructions for readers.
                turns = [step["input"] for step in (case.steps or []) if isinstance(step, dict) and isinstance(step.get("input"), str)]
                if not turns:
                    turns = [case.input]
                invocations = [
                    invoke_agent(asset, text, case.risk_tag, session_id=session_id, db=db)
                    for text in turns
                ]
                invocation = merge_security_invocations(invocations) if len(invocations) > 1 else invocations[0]
                raw_events = {e["id"]: e for e in (getattr(invocation, "raw", {}) or {}).get("trace_events", [])}
                for sequence, item in enumerate(invocation.events):
                    event = {k: item.get(k) for k in ("type", "tool", "params", "output", "error", "duration_ms") if k in item}
                    event["params"] = {**(event.get("params") or {}), "desktop_sequence": sequence}
                    if item.get("id"):
                        event["id"] = item["id"]
                        original_time = raw_events.get(item["id"], {}).get("timestamp")
                        if original_time:
                            event["timestamp"] = datetime.fromisoformat(original_time)
                    db.add(TraceEvent(run_id=run.id, **event))
                db.flush()
                verdict = judge_invocation(SimpleNamespace(**snapshot), invocation)
                run.status = verdict["status"] if verdict["status"] in FINAL_STATUSES else "needs_review"
                run.score = verdict.get("score")
                run.latency = invocation.latency
                # Keep the original adapter evidence to reproduce judgement without executing tools again.
                raw = getattr(invocation, "raw", {}) or {}
                run.result = {"answer": invocation.answer, "judge": verdict, "adapter": asset.adapter,
                              "risk_observed": invocation.risk_triggered, "security_case": risk_tag(case.risk_tag) != "baseline_normal",
                              "suite_version": suite.version, "started_at": iso(started), "finished_at": iso(datetime.now(timezone.utc)),
                              "case_snapshot": snapshot, "rules_fingerprint": fingerprint,
                              "raw": raw}
                sync_finding(db, run, case)
            except Exception as exc:
                # Execution errors remain reviewable and cannot become an accidental pass.
                db.add(TraceEvent(run_id=run.id, type="error", output=None, error=f"{type(exc).__name__}: {exc}", params={"stage": "execution"}))
                run.status = "needs_review"
                run.result = {"judge": {"source": "rule", "status": "needs_review", "reason": f"执行异常，须复核：{type(exc).__name__}: {exc}", "confidence": 0.0},
                              "adapter": asset.adapter, "suite_version": suite.version, "finished_at": iso(datetime.now(timezone.utc)),
                              "case_snapshot": snapshot, "rules_fingerprint": fingerprint}
            finally:
                if asset.adapter in {"campus", "local"}:
                    release_session(asset.id, session_id)
            rows.append(run)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return run_view(rows, suite)


@router.get("/runs/{task_id}")
def run_detail(task_id: str, db: Session = Depends(get_db)):
    rows = task_rows(db, task_id)
    return {"run": run_view(rows, db.get(TestSuite, rows[0].suite_id)), "results": [judge_view(r, events_for(db, r)) for r in rows]}


@router.get("/runs/{task_id}/trace")
def trace(task_id: str, db: Session = Depends(get_db)):
    return [event_view(event, row) for row in task_rows(db, task_id) for event in events_for(db, row)]


@router.post("/runs/{task_id}/judge")
def rejudge(task_id: str, db: Session = Depends(get_db)):
    from app.services.agent_adapter import Invocation
    rows = task_rows(db, task_id)
    if any(not (row.result or {}).get("case_snapshot") for row in rows):
        raise DesktopError(409, "rule_snapshot_missing", "该任务没有完整的原始规则快照，请重新执行测试后复判")
    for run in rows:
        stored = run.result or {}
        case = SimpleNamespace(**stored["case_snapshot"])
        events = events_for(db, run)
        if not stored.get("answer"):
            continue
        invocation = Invocation(answer=stored["answer"], events=[{"id": e.id, "type": e.type, "tool": e.tool, "params": e.params,
                                                                "output": e.output, "error": e.error, "duration_ms": e.duration_ms or 0} for e in events],
                                latency=run.latency or 0, risk_triggered=stored.get("risk_observed", False), raw=stored.get("raw", {}))
        verdict = judge_invocation(case, invocation)
        run.status = verdict["status"]
        run.score = verdict.get("score")
        run.result = {**stored, "judge": {**verdict, "rejudged_at": iso(datetime.now(timezone.utc))}}
        sync_finding(db, run, case)
    db.commit()
    return [judge_view(row, events_for(db, row)) for row in rows]


def finding_response(db: Session, finding: Finding) -> dict:
    run = require(db, TestRun, finding.run_id, "run_not_found", "缺陷关联运行")
    snapshot = (run.result or {}).get("case_snapshot")
    case = SimpleNamespace(**snapshot) if snapshot else require(db, TestCase, run.case_id, "case_not_found", "缺陷关联用例")
    suite = require(db, TestSuite, run.suite_id, "suite_not_found", "缺陷关联测试集")
    return finding_view(finding, run, case, suite, events_for(db, run))


@router.get("/findings")
def findings(db: Session = Depends(get_db)):
    return [finding_response(db, f) for f in db.scalars(select(Finding).order_by(Finding.created_at.desc())).all()]


@router.get("/findings/{finding_id}/chain")
def chain(finding_id: str, db: Session = Depends(get_db)):
    return finding_response(db, require(db, Finding, finding_id, "finding_not_found", "缺陷"))


class ChainReviewIn(BaseModel):
    status: str = Field("confirmed", description="confirmed / rejected / pending")
    reviewer: str = Field(..., min_length=1, description="复核人")
    note: str = ""
    confidence: float | None = None


@router.post("/findings/{finding_id}/chain/{node_id}/review")
def review_chain_node(finding_id: str, node_id: str, payload: ChainReviewIn,
                      db: Session = Depends(get_db)):
    """人工确认或驳回攻击链上的某个节点（P1：推断节点需可确认/驳回）。"""
    finding = require(db, Finding, finding_id, "finding_not_found", "缺陷")
    try:
        entry = save_chain_review(
            db, finding, node_id=node_id, status=payload.status,
            reviewer=payload.reviewer, note=payload.note, confidence=payload.confidence,
        )
    except ValueError as exc:
        raise DesktopError(422, "contract_bad_enum", str(exc)) from exc
    return {"ok": True, "review": entry, "chain": finding_response(db, finding)}


@router.get("/metrics")
def metrics(db: Session = Depends(get_db)):
    return metrics_view(db)
