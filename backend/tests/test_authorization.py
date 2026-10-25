"""授权记录与门禁绑定的验收测试（P0）。

运行： `backend\.venv\Scripts\python.exe -m pytest -q tests/test_authorization.py`

覆盖《完善报告》P0 验收标准：
    「授权人、目标、用途、证据、时间和授权编号可查询」
    「调用方自报的编号必须能对上服务端记录，否则拒绝建连」
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.target_scope import TargetScopeError, validate_target_scope
from app.db.session import Base
from app.models import entities  # noqa: F401  建表需要
from app.services.authorization import (AuthorizationError, check_authorization,
                                        create_authorization, get_by_reference,
                                        is_active, list_authorizations,
                                        revoke_authorization, to_view)

HOST = "127.0.0.1"
PORT = 8080
REF = "AUTH-2026-B-001"


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()


def make_record(db, **overrides):
    payload = dict(
        reference=REF, owner="队员B", purpose="自建 Dify 私网靶场联调",
        target_scope="self_hosted_dify", host=HOST, port=PORT,
        evidence="docs/security-authorization.md#AUTH-2026-B-001",
    )
    payload.update(overrides)
    return create_authorization(db, **payload)


# --------------------------------------------------------------------------
# 一 记录本身可查询
# --------------------------------------------------------------------------
def test_create_and_query_authorization(db):
    record = make_record(db)
    view = to_view(record)
    for field in ("reference", "owner", "purpose", "evidence", "created_at",
                  "effective_from", "expires_at", "host", "port"):
        assert field in view and view[field] not in (None, ""), f"缺少字段 {field}"
    assert view["active"] is True
    assert get_by_reference(db, REF).id == record.id
    assert len(list_authorizations(db)) == 1
    assert len(list_authorizations(db, active_only=True)) == 1


def test_duplicate_reference_is_rejected(db):
    make_record(db)
    with pytest.raises(AuthorizationError, match="已存在"):
        make_record(db)


def test_invalid_reference_format_is_rejected(db):
    with pytest.raises(AuthorizationError, match="编号格式"):
        make_record(db, reference="有中文")


def test_missing_owner_or_purpose_is_rejected(db):
    with pytest.raises(AuthorizationError, match="授权人"):
        make_record(db, owner="  ")
    with pytest.raises(AuthorizationError, match="用途"):
        make_record(db, purpose="")


# --------------------------------------------------------------------------
# 二 校验：目标/端口/Agent/时效必须完全匹配
# --------------------------------------------------------------------------
def test_valid_record_passes(db):
    make_record(db)
    result = check_authorization(db, reference=REF, host=HOST, port=PORT,
                                 target_scope="self_hosted_dify")
    assert result.ok is True


def test_unknown_reference_is_rejected(db):
    result = check_authorization(db, reference="AUTH-不存在", host=HOST, port=PORT)
    assert result.ok is False
    assert "不存在" in result.reason


def test_host_mismatch_is_rejected(db):
    make_record(db)
    result = check_authorization(db, reference=REF, host="192.168.1.99", port=PORT)
    assert result.ok is False
    assert "主机" in result.reason


def test_port_mismatch_is_rejected(db):
    make_record(db)
    result = check_authorization(db, reference=REF, host=HOST, port=PORT + 1)
    assert result.ok is False
    assert "端口" in result.reason


def test_scope_mismatch_is_rejected(db):
    make_record(db)
    result = check_authorization(db, reference=REF, host=HOST, port=PORT,
                                 target_scope="authorized_external")
    assert result.ok is False


def test_agent_binding_mismatch_is_rejected(db):
    make_record(db, agent_id="agent-aaa")
    ok = check_authorization(db, reference=REF, host=HOST, port=PORT, agent_id="agent-aaa")
    bad = check_authorization(db, reference=REF, host=HOST, port=PORT, agent_id="agent-bbb")
    assert ok.ok is True
    assert bad.ok is False
    assert "Agent" in bad.reason


def test_expired_record_is_rejected(db):
    make_record(db, valid_days=None,
                expires_at=None)
    record = get_by_reference(db, REF)
    record.expires_at = record.effective_from - timedelta(seconds=1)
    db.commit()
    assert is_active(record) is False
    result = check_authorization(db, reference=REF, host=HOST, port=PORT)
    assert result.ok is False
    assert "过期" in result.reason


def test_revoked_record_is_rejected(db):
    make_record(db)
    revoke_authorization(db, REF, "靶场下线")
    record = get_by_reference(db, REF)
    assert record.revoked_at is not None
    assert is_active(record) is False
    result = check_authorization(db, reference=REF, host=HOST, port=PORT)
    assert result.ok is False
    assert "撤销" in result.reason


# --------------------------------------------------------------------------
# 三 门禁集成：自报编号不再管用
# --------------------------------------------------------------------------
def _validate(**overrides):
    payload = dict(
        endpoint=f"http://{HOST}:{PORT}/v1/chat-messages",
        adapter="dify",
        target_scope="self_hosted_dify",
        authorization_confirmed=True,
        authorization_reference=REF,
        allowed_hosts=[HOST],
    )
    payload.update(overrides)
    return validate_target_scope(**payload)


def test_gate_rejects_self_reported_reference_without_record(db):
    """只有自报编号、服务端没有记录时，必须拒绝。"""
    with pytest.raises(TargetScopeError, match="未通过服务端校验"):
        _validate(db=db)


def test_gate_accepts_when_record_exists(db):
    make_record(db)
    decision = _validate(db=db)
    assert decision.allowed is True


def test_gate_rejects_when_record_revoked(db):
    make_record(db)
    revoke_authorization(db, REF, "联调结束")
    with pytest.raises(TargetScopeError, match="未通过服务端校验"):
        _validate(db=db)


def test_gate_without_db_keeps_previous_behaviour(db):
    """不传 db 时保持旧行为，便于渐进接入与旧测试兼容。"""
    decision = _validate()
    assert decision.allowed is True


def test_mock_adapter_never_touches_authorization(db):
    decision = validate_target_scope(
        endpoint="local://campus-assistant", adapter="mock", target_scope="local_mock",
        authorization_confirmed=False, authorization_reference=None,
        allowed_hosts=[HOST], db=db,
    )
    assert decision.allowed is True
    assert get_by_reference(db, REF) is None
