"""出站连接层：DNS 固定与重绑定防护（队员B / P1）。

问题
----
`ScopeGuard.check()` 用的是「先解析、再判断」：解析通过后，HTTP 客户端（httpx）
在真正建连时会**再次解析**域名。攻击者（或错误的 DNS 配置）可以在两次解析之间
把域名从私网换成公网，于是"校验时是内网、连接时是外网"，守卫被绕过。

本模块把校验结果**固定**下来：
    1. `resolve_pinned()`  —— 只在授权范围内解析一次，记录全部 IP；
    2. 调用方用 `pin` 发起请求；
    3. `verify_unchanged()` —— 请求结束后再次解析，必须与固定值完全一致；
       只要有新增、消失或变成公网的地址，一律判定为 DNS 重绑定并拒绝。

验收标准（对应《完善报告》P1）：
    「连接前后解析到同一私网地址；公网解析或变化时拒绝。」
"""
from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

from .models import ErrorCode
from .scope import ScopeDecision, ScopeGuard, ScopeViolation


class DnsRebindingError(ScopeViolation):
    """解析结果在连接前后发生变化，按越界处理。"""

    def __init__(self, host: str, before: Iterable[str], after: Iterable[str], reason: str):
        self.host = host
        self.before = tuple(before)
        self.after = tuple(after)
        self.reason = reason
        decision = ScopeDecision(
            allowed=False, host=host, classification="dns_rebinding",
            code=str(ErrorCode.SCOPE_DENIED),
            reason=f"{reason}（连接前 {list(self.before)} → 连接后 {list(self.after)}）",
            resolved_ip=",".join(self.after),
        )
        super().__init__(decision)


@dataclass(frozen=True)
class PinnedTarget:
    """一次出站目标的固定解析结果。"""

    host: str
    port: int
    scheme: str
    ip: str
    family: int
    all_ips: tuple[str, ...]
    path: str = "/"
    pinned_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def host_header(self) -> str:
        default = 443 if self.scheme == "https" else 80
        return self.host if self.port == default else f"{self.host}:{self.port}"

    def to_dict(self) -> dict:
        return {
            "host": self.host, "port": self.port, "scheme": self.scheme,
            "ip": self.ip, "family": self.family, "all_ips": list(self.all_ips),
            "path": self.path, "pinned_at": self.pinned_at,
        }


def _ip_of(value: str) -> ipaddress._BaseAddress | None:
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _is_local(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip.is_loopback:
        return True
    return any(ip.version == net.version and ip in net for net in _PRIVATE)


_PRIVATE = tuple(
    ipaddress.ip_network(cidr) for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
)


def resolve_pinned(url: str, guard: ScopeGuard | None = None) -> PinnedTarget:
    """解析一次并固定结果。任何非私网解析结果都会导致整体拒绝。"""
    guard = guard or ScopeGuard()
    decision = guard.check(url)
    if not decision.allowed:
        raise ScopeViolation(decision)

    parsed = urllib.parse.urlsplit(url.strip())
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or "").lower()
    port = parsed.port or (443 if scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    # 进程内地址不会产生真实连接，不做解析。
    if scheme == "local":
        return PinnedTarget(host or "in-process", port, scheme, "127.0.0.1", socket.AF_INET,
                            ("127.0.0.1",), path)

    literal = _ip_of(host)
    if literal is not None:
        if not _is_local(literal):
            raise ScopeViolation(ScopeDecision(
                False, host, "public", str(ErrorCode.SCOPE_PUBLIC_TARGET_DENIED),
                f"{literal} 不是回环或私网地址，拒绝", port, str(literal)))
        family = socket.AF_INET6 if literal.version == 6 else socket.AF_INET
        return PinnedTarget(host, port, scheme, str(literal), family, (str(literal),), path)

    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ScopeViolation(ScopeDecision(
            False, host, "unresolvable", str(ErrorCode.SCOPE_NOT_AUTHORIZED),
            f"无法解析授权主机 {host}：{exc}", port)) from exc

    resolved: list[tuple[str, int]] = []
    for family, _type, _proto, _canon, sockaddr in infos:
        ip = _ip_of(sockaddr[0])
        if ip is None:
            continue
        if not _is_local(ip):
            raise ScopeViolation(ScopeDecision(
                False, host, "public", str(ErrorCode.SCOPE_PUBLIC_TARGET_DENIED),
                f"{host} 解析到非私网地址 {ip}，整体拒绝（防止 DNS 分流绕过）", port, str(ip)))
        resolved.append((str(ip), family))
    if not resolved:
        raise ScopeViolation(ScopeDecision(
            False, host, "unresolvable", str(ErrorCode.SCOPE_NOT_AUTHORIZED),
            f"{host} 未解析出可用 IP，拒绝", port))

    resolved.sort()
    chosen_ip, family = resolved[0]
    return PinnedTarget(host, port, scheme, chosen_ip, family,
                        tuple(sorted({ip for ip, _ in resolved})), path)


def verify_unchanged(pin: PinnedTarget) -> None:
    """连接后复验：解析结果必须与固定值完全一致，且仍全部为私网。"""
    if pin.scheme == "local" or _ip_of(pin.host) is not None:
        return
    try:
        infos = socket.getaddrinfo(pin.host, pin.port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise DnsRebindingError(pin.host, pin.all_ips, (), f"连接后无法再次解析：{exc}") from exc

    now: list[str] = []
    for _family, _type, _proto, _canon, sockaddr in infos:
        ip = _ip_of(sockaddr[0])
        if ip is None:
            continue
        if not _is_local(ip):
            raise DnsRebindingError(pin.host, pin.all_ips, (str(ip),),
                                    f"连接后解析到非私网地址 {ip}，判定为 DNS 重绑定")
        now.append(str(ip))

    if set(now) != set(pin.all_ips):
        raise DnsRebindingError(pin.host, pin.all_ips, now,
                                "连接前后解析结果不一致，判定为 DNS 重绑定")


def pinned_request(
    pin: PinnedTarget,
    *,
    method: str = "POST",
    headers: dict[str, str] | None = None,
    body: bytes = b"",
    timeout: float = 30.0,
) -> tuple[int, bytes]:
    """直连固定 IP 的 HTTP 请求：不走代理、不跟随重定向、SNI 使用原始域名。

    与 httpx 相比这里多做了两件事：
      * TCP 目标是 `pin.ip`，第二次解析没有机会把连接引向别处；
      * `Host` 头与 TLS `server_hostname` 仍是原始域名，证书校验不被削弱。
    """
    sock = socket.create_connection((pin.ip, pin.port), timeout=timeout)
    try:
        if pin.scheme == "https":
            context = ssl.create_default_context()
            sock = context.wrap_socket(sock, server_hostname=pin.host)
        conn = http.client.HTTPConnection(pin.host, pin.port, timeout=timeout)
        conn.sock = sock  # 复用已建立的固定连接，http.client 不再自行解析
        send_headers = {"Host": pin.host_header, "Connection": "close",
                        "Accept": "application/json"}
        send_headers.update(headers or {})
        conn.request(method, pin.path, body=body, headers=send_headers)
        response = conn.getresponse()
        payload = response.read()
        status = response.status
        conn.close()
        return status, payload
    finally:
        try:
            sock.close()
        except OSError:
            pass


__all__ = ["DnsRebindingError", "PinnedTarget", "resolve_pinned", "verify_unchanged",
           "pinned_request"]
