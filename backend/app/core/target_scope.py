from dataclasses import dataclass
from typing import TYPE_CHECKING
from urllib.parse import urlparse

if TYPE_CHECKING:  # 仅用于类型标注，避免运行期引入 SQLAlchemy
    from sqlalchemy.orm import Session


class TargetScopeError(ValueError):
    """Raised when a target is outside the explicitly authorized test scope."""


@dataclass(frozen=True)
class TargetScopeDecision:
    allowed: bool
    target_scope: str
    host: str
    reason: str


def validate_target_scope(
    *,
    endpoint: str,
    adapter: str,
    target_scope: str,
    authorization_confirmed: bool,
    authorization_reference: str | None,
    allowed_hosts: list[str],
    db: "Session | None" = None,
    agent_id: str | None = None,
) -> TargetScopeDecision:
    """Apply the non-negotiable target authorization gate before any live request.

    传入 `db` 时，自报的 `authorization_reference` 必须在服务端授权表里能查到
    一条仍然有效、且主机/端口/作用域/Agent 全部匹配的记录，否则拒绝建连。
    这样「调用方自己说自己有授权」不再能通过门禁。
    """

    if adapter == "mock":
        if not endpoint.startswith("local://") or target_scope != "local_mock":
            raise TargetScopeError("Mock 适配器只能使用 local:// 地址和 local_mock 范围。")
        return TargetScopeDecision(True, target_scope, "local", "本地模拟靶场")

    if target_scope not in {"self_hosted_dify", "authorized_external"}:
        raise TargetScopeError("非 Mock Agent 必须标记为自建 Dify 靶场或已授权外部靶场。")
    if not authorization_confirmed or not (authorization_reference or "").strip():
        raise TargetScopeError("缺少书面授权/自建靶场记录，禁止连接该目标。")

    try:
        parsed = urlparse(endpoint)
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError as exc:
        raise TargetScopeError("目标地址或端口格式无效。") from exc
    if parsed.scheme not in {"http", "https"} or not host:
        raise TargetScopeError("非 Mock Agent 的 endpoint 必须是有效的 HTTP(S) 地址。")
    if parsed.username is not None or parsed.password is not None or port == 0:
        raise TargetScopeError("目标地址不得包含账号密码，端口必须有效。")

    normalized_hosts = {item.strip().lower() for item in allowed_hosts if item.strip()}
    if host not in normalized_hosts:
        raise TargetScopeError(
            f"目标主机 {host} 不在 AGENTGUARD_ALLOWED_TARGET_HOSTS 白名单中，禁止访问。"
        )

    # 配置白名单不是公网测试许可。旧 API 与新适配器必须使用同一硬性边界。
    from app.security.scope import ScopeGuard

    decision = ScopeGuard(authorized=normalized_hosts).check(endpoint)
    if not decision.allowed:
        raise TargetScopeError(decision.reason)

    # 服务端授权记录：编号必须真实存在、未过期、未撤销，且目标完全匹配。
    if db is not None:
        from app.services.authorization import AuthorizationError, check_authorization

        try:
            checked = check_authorization(
                db, reference=authorization_reference, host=host,
                port=parsed.port or (443 if parsed.scheme == "https" else 80),
                target_scope=target_scope, agent_id=agent_id,
            )
        except AuthorizationError as exc:  # 数据库不可用等异常也必须拒绝
            raise TargetScopeError(f"授权记录校验失败：{exc}") from exc
        if not checked.ok:
            raise TargetScopeError(
                f"授权编号 {authorization_reference or '(缺失)'} 未通过服务端校验：{checked.reason}"
            )

    label = "自建 Dify 靶场" if target_scope == "self_hosted_dify" else "明确授权靶场"
    return TargetScopeDecision(True, target_scope, host, label)
