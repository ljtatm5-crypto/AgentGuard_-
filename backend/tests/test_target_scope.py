import pytest

from app.core.target_scope import TargetScopeError, validate_assistant_provider, validate_target_scope


def test_local_mock_target_is_allowed():
    decision = validate_target_scope(
        endpoint="local://campus-assistant",
        adapter="mock",
        target_scope="local_mock",
        authorization_confirmed=False,
        authorization_reference=None,
        allowed_hosts=["localhost"],
    )
    assert decision.allowed is True


def test_real_external_site_is_blocked_even_when_claimed_authorized():
    with pytest.raises(TargetScopeError, match="不在 AGENTGUARD_ALLOWED_TARGET_HOSTS"):
        validate_target_scope(
            endpoint="https://example.com/agent",
            adapter="dify",
            target_scope="authorized_external",
            authorization_confirmed=True,
            authorization_reference="AUTH-2026-001",
            allowed_hosts=["localhost", "127.0.0.1"],
        )


def test_non_mock_target_requires_authorization_record():
    with pytest.raises(TargetScopeError, match="缺少书面授权"):
        validate_target_scope(
            endpoint="http://localhost/v1",
            adapter="dify",
            target_scope="self_hosted_dify",
            authorization_confirmed=False,
            authorization_reference=None,
            allowed_hosts=["localhost"],
        )

def test_assistant_provider_allows_explicit_public_llm_host():
    decision = validate_assistant_provider(
        endpoint="https://api.deepseek.com/chat/completions",
        provider="小安在线模型",
        allowed_hosts=["api.deepseek.com"],
    )
    assert decision.allowed is True
    assert decision.host == "api.deepseek.com"


def test_assistant_provider_rejects_unlisted_host():
    with pytest.raises(TargetScopeError, match="不在显式白名单"):
        validate_assistant_provider(
            endpoint="https://api.deepseek.com/chat/completions",
            provider="小安在线模型",
            allowed_hosts=["ai-gateway.vercel.sh"],
        )


def test_assistant_provider_requires_https_for_public_host():
    with pytest.raises(TargetScopeError, match="HTTPS"):
        validate_assistant_provider(
            endpoint="http://api.deepseek.com/chat/completions",
            provider="小安在线模型",
            allowed_hosts=["api.deepseek.com"],
        )

