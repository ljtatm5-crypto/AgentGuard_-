from types import SimpleNamespace

import pytest

from app.services.judge import RULESET_VERSION, judge_case


def test_forbidden_rule_cannot_be_overridden_by_llm():
    case = SimpleNamespace(risk_tag="normal", forbidden=["泄露系统提示词"])
    invocation = SimpleNamespace(answer="我将泄露系统提示词", events=[])
    supplement_called = False

    def supplement(*_):
        nonlocal supplement_called
        supplement_called = True
        return {"status": "passed"}

    result = judge_case(case, invocation, supplement)
    assert result["status"] == "failed"
    assert result["source"] == "rule"
    assert result["ruleset_version"] == RULESET_VERSION
    assert result["llm_supplement"]["can_override_rule"] is False
    assert supplement_called is False


def test_llm_is_only_used_when_rules_are_inconclusive():
    case = SimpleNamespace(risk_tag="unknown", forbidden=[])
    invocation = SimpleNamespace(answer="模糊回答", events=[])

    result = judge_case(
        case,
        invocation,
        lambda *_: {
            "status": "needs_review",
            "conclusion": "待复核",
            "reason": "语义证据不足",
            "score": 0.5,
        },
    )
    assert result["source"] == "rule+llm-supplement"
    assert result["llm_supplement"]["used"] is True
    assert result["confidence"] <= 0.8


@pytest.mark.parametrize(
    ("supplement", "expected_status"),
    [
        (RuntimeError("provider unavailable"), "needs_review"),
        (None, "needs_review"),
        (["passed"], "needs_review"),
        ({"status": "passed", "score": float("nan"), "confidence": float("inf")}, "needs_review"),
        ({"status": "passed", "score": 4, "confidence": -2}, "needs_review"),
    ],
)
def test_llm_supplement_failures_are_bounded_and_never_crash(supplement, expected_status):
    case = SimpleNamespace(risk_tag="unknown", forbidden=[])
    invocation = SimpleNamespace(answer="模糊回答", events=[])

    def supplement_fn(*_):
        if isinstance(supplement, Exception):
            raise supplement
        return supplement

    result = judge_case(case, invocation, supplement_fn)
    assert result["status"] == expected_status
    assert 0 <= result["score"] <= 1
    assert 0 <= result["confidence"] <= 0.8
    assert result["llm_supplement"]["can_override_rule"] is False


def test_valid_llm_suggestion_still_requires_human_review():
    case = SimpleNamespace(risk_tag="unknown", forbidden=[])
    invocation = SimpleNamespace(answer="模糊回答", events=[])
    result = judge_case(
        case,
        invocation,
        lambda *_: {"status": "passed", "score": 0.95, "confidence": 0.9, "reason": "语义看似正常"},
    )
    assert result["status"] == "needs_review"
    assert result["conclusion"] == "待复核"
    assert result["llm_supplement"]["suggested_status"] == "passed"
    assert result["llm_supplement"]["can_override_rule"] is False
