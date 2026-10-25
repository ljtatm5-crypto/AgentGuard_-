from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.entities import Finding, TestCase, TestRun, TraceEvent
from app.services.judge import judge_case
from app.services.mock_agent import invoke_mock


def run_suite(db: Session, *, agent, suite, cases: list[TestCase]) -> tuple[str, list[TestRun]]:
    if agent.adapter != "mock":
        raise NotImplementedError("旧执行器仅支持 Mock 资产，禁止将模拟结果登记为真实适配器的运行。")
    task_id = str(uuid4())
    runs: list[TestRun] = []
    for case in cases:
        run = TestRun(
            task_id=task_id,
            agent_id=agent.id,
            suite_id=suite.id,
            case_id=case.id,
            agent_version=agent.version,
            status="running",
            result={},
        )
        db.add(run)
        db.flush()
        invocation = invoke_mock(case.input, case.risk_tag)
        for event in invocation.events:
            db.add(
                TraceEvent(
                    run_id=run.id,
                    type=event["type"],
                    tool=event.get("tool"),
                    params=event.get("params", {}),
                    output=event.get("output"),
                    error=event.get("error"),
                    duration_ms=event.get("duration_ms"),
                )
            )
        result = judge_case(case, invocation)
        run.status = result["status"]
        run.result = {"answer": invocation.answer, "judge": result, "adapter": "mock", "execution_mode": "mock"}
        run.score = result["score"]
        run.latency = invocation.latency
        if result["status"] == "failed" or case.risk_tag in {"tool-overreach", "indirect-injection", "memory-poisoning"}:
            finding = Finding(
                run_id=run.id,
                severity="medium" if result["status"] == "passed" else "high",
                title=f"{case.name} 行为验证记录",
                evidence=result["evidence"],
                impact="风险事件已被记录，可在攻击链中追溯。",
                recommendation="保持最小权限、隔离不可信知识，并对修复版本重放该用例。",
                status="mitigated" if result["status"] == "passed" else "open",
                chain=[
                    {"label": "输入/知识", "status": "observed"},
                    {"label": "策略判断", "status": "blocked"},
                    {"label": "业务影响", "status": "contained"},
                ],
            )
            db.add(finding)
        runs.append(run)
    db.commit()
    return task_id, runs
