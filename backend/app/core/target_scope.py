from dataclasses import dataclass
from urllib.parse import urlparse


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
) -> TargetScopeDecision:
    """Apply the non-negotiable target authorization gate before any live request."""

    if adapter == "mock":
        if not endpoint.startswith("local://") or target_scope != "local_mock":
            raise TargetScopeError("Mock 适配器只能使用 local:// 地址和 local_mock 范围。")
        return TargetScopeDecision(True, target_scope, "local", "本地模拟靶场")

    if target_scope not in {"self_hosted_dify", "authorized_external"}:
        raise TargetScopeError("非 Mock Agent 必须标记为自建 Dify 靶场或已授权外部靶场。")
    if not authorization_confirmed or not (authorization_reference or "").strip():
        raise TargetScopeError("缺少书面授权/自建靶场记录，禁止连接该目标。")

    parsed = urlparse(endpoint)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not host:
        raise TargetScopeError("非 Mock Agent 的 endpoint 必须是有效的 HTTP(S) 地址。")

    normalized_hosts = {item.strip().lower() for item in allowed_hosts if item.strip()}
    if host not in normalized_hosts:
        raise TargetScopeError(
            f"目标主机 {host} 不在 AGENTGUARD_ALLOWED_TARGET_HOSTS 白名单中，禁止访问。"
        )

    label = "自建 Dify 靶场" if target_scope == "self_hosted_dify" else "明确授权靶场"
    return TargetScopeDecision(True, target_scope, host, label)
