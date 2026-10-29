"""授权范围守卫（ScopeGuard）—— 本模块是队员B 的安全底线。

硬性规则（对应《项目方案》第十一章与《队员B 分工》第 7、11 章）
------------------------------------------------------------
1. 默认拒绝：只要目标不是「本机 / 私网 / 显式授权清单」，一律拒绝，不做任何请求。
2. 公共域名与公网 IP 属于绝对禁区：真实外部网站永远不能被测试。
3. 拒绝发生在「建立连接之前」，不是靠事后检查日志。
4. 未来远程适配器须另验服务端白名单与授权记录；当前只启用进程内靶场。

这意味着：即便调用方传入了 `https://www.example.com`，本模块也会在
任何远程调用实现之前抛 ScopeViolation。当前适配器完全没有 HTTP 请求代码。
"""
from __future__ import annotations

import ipaddress
import os
import socket
import urllib.parse
from dataclasses import dataclass, field
from typing import Iterable

from .models import ErrorCode, now_iso


class ScopeViolation(Exception):
    """目标超出授权范围。属于安全拒绝，不是普通异常。"""

    def __init__(self, decision: "ScopeDecision"):
        self.decision = decision
        super().__init__(f"[{decision.code}] {decision.reason} -> {decision.host}")

    def to_dict(self) -> dict:
        return {
            "error": {
                "code": str(ErrorCode.SCOPE_DENIED),
                "message": self.decision.reason,
                "host": self.decision.host,
                "classification": self.decision.classification,
            }
        }


@dataclass(frozen=True)
class ScopeDecision:
    allowed: bool
    host: str
    classification: str        # loopback | private | authorized | public | unresolvable | bad_scheme
    code: str
    reason: str
    port: int | None = None
    resolved_ip: str = ""

    def to_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "host": self.host,
            "port": self.port,
            "classification": self.classification,
            "code": self.code,
            "reason": self.reason,
            "resolved_ip": self.resolved_ip,
        }


@dataclass
class AuthorizationRecord:
    """授权留痕：谁授权了哪个目标、用于什么目的、有据可查。"""

    target: str
    owner: str
    purpose: str
    evidence: str = ""
    recorded_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict:
        return {
            "target": self.target,
            "owner": self.owner,
            "purpose": self.purpose,
            "evidence": self.evidence,
            "recorded_at": self.recorded_at,
        }


_LOOPBACK_NAMES = {"localhost", "127.0.0.1", "::1"}
_LOCAL_RUNTIME_NAMES = {"host.docker.internal", "host.lima.internal"}
_ALLOWED_SCHEMES = {"http", "https"}
_PRIVATE_NETWORKS = tuple(ipaddress.ip_network(cidr) for cidr in
                          ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"))

# 即使被误加入授权清单也必须拒绝的常见公网站点（双保险）
_PUBLIC_DENYLIST_SUFFIXES = (
    "google.com", "baidu.com", "bing.com", "github.com", "openai.com", "dify.ai",
    "cloud.dify.ai", "qq.com", "weibo.com", "taobao.com", "zhihu.com", "csdn.net",
)


def _default_authorized() -> set[str]:
    raw = os.environ.get("AGENTGUARD_AUTHORIZED_TARGETS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


class ScopeGuard:
    """所有出站请求的唯一闸门。适配器不得绕开本类直接发请求。"""

    def __init__(self, authorized: Iterable[str] | None = None, strict: bool | None = None):
        self.authorized = {a.strip().lower() for a in (authorized or [])} | _default_authorized()
        self.strict = True  # 公网拒绝不可被环境变量或参数关闭。
        self.records: list[AuthorizationRecord] = []

    # -- 核心判定 --------------------------------------------------------
    def check(self, url: str) -> ScopeDecision:
        if not url or not isinstance(url, str):
            return ScopeDecision(False, "", "bad_scheme", str(ErrorCode.SCOPE_DENIED), "目标地址为空，拒绝请求")

        try:
            parsed = urllib.parse.urlsplit(url.strip())
        except ValueError:
            return ScopeDecision(False, url[:80], "bad_scheme", str(ErrorCode.SCOPE_DENIED), "无法解析的目标地址")

        # 进程内直调：不产生任何网络请求，视为最安全的自建场景
        if parsed.scheme.lower() == "local":
            return ScopeDecision(True, (parsed.netloc or "in-process"), "in_process",
                                 str(ErrorCode.OK), "进程内调用，不产生出站请求")

        if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
            return ScopeDecision(
                False, parsed.netloc, "bad_scheme", str(ErrorCode.SCOPE_DENIED),
                f"仅允许 http/https 协议，收到 {parsed.scheme!r}",
            )
        host = (parsed.hostname or "").lower()
        if not host:
            return ScopeDecision(False, parsed.netloc, "bad_scheme", str(ErrorCode.SCOPE_DENIED), "目标缺少主机名")
        try:
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
        except ValueError:
            return ScopeDecision(False, host, "bad_scheme", str(ErrorCode.SCOPE_DENIED), "目标端口无效")
        if parsed.port == 0:
            return ScopeDecision(False, host, "bad_scheme", str(ErrorCode.SCOPE_DENIED), "目标端口无效")
        if parsed.username is not None or parsed.password is not None:
            return ScopeDecision(False, host, "bad_scheme", str(ErrorCode.SCOPE_DENIED), "目标地址不得包含账号或密码", port)

        # 授权清单不能绕过公网地址检查。
        netloc = f"{host}:{port}".lower()
        if any(host == d or host.endswith("." + d) for d in _PUBLIC_DENYLIST_SUFFIXES):
            return ScopeDecision(False, host, "public", str(ErrorCode.SCOPE_PUBLIC_TARGET_DENIED),
                                 "公网网站禁止测试，即使列入授权清单也拒绝", port)

        # 2) 本机回环：自建靶场，放行
        if host in _LOOPBACK_NAMES:
            return ScopeDecision(True, host, "loopback", str(ErrorCode.OK), "本机回环，视为自建靶场", port)

        # 3) 字面量 IP：只放行回环与 RFC 1918 / IPv6 ULA 私网
        #    （169.254/16 与 fe80::/10 链路本地默认拒绝，避免把本地设备当成靶场）
        ip = self._as_ip(host)
        if ip is not None:
            return self._judge_ip(host, ip, port, resolved=False)

        # 未授权域名连 DNS 查询也不触发；仅已知内网靶场可进入解析。
        if host not in self.authorized and netloc not in self.authorized and host not in _LOCAL_RUNTIME_NAMES:
            return ScopeDecision(False, host, "public", str(ErrorCode.SCOPE_NOT_AUTHORIZED),
                                 "非授权公网或未知主机，禁止测试真实外部网站", port)
        # 4) 已授权域名仍须全部解析为内网地址。
        try:
            infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        except OSError:
            return ScopeDecision(
                False, host, "unresolvable", str(ErrorCode.SCOPE_NOT_AUTHORIZED),
                f"无法解析授权主机 {host}；无法验证内网范围，拒绝", port,
            )
        ips = {self._as_ip(info[4][0]) for info in infos}
        ips.discard(None)
        if not ips:
            return ScopeDecision(False, host, "unresolvable", str(ErrorCode.SCOPE_NOT_AUTHORIZED),
                                 f"{host} 未解析出可用 IP，拒绝", port)
        # 只要有任一公网解析结果，整体拒绝（防止 DNS 分流绕过）
        for one in ips:
            decision = self._judge_ip(host, one, port, resolved=True)
            if not decision.allowed:
                return decision
        return ScopeDecision(True, host, "private", str(ErrorCode.OK),
                             "域名解析到私网地址，视为内网靶场", port, ",".join(sorted(map(str, ips))))

    def assert_allowed(self, url: str) -> ScopeDecision:
        decision = self.check(url)
        if not decision.allowed:
            raise ScopeViolation(decision)
        return decision

    def record_authorization(self, target: str, owner: str, purpose: str, evidence: str = "") -> AuthorizationRecord:
        rec = AuthorizationRecord(target=target, owner=owner, purpose=purpose, evidence=evidence)
        self.records.append(rec)
        return rec

    # -- 内部 ------------------------------------------------------------
    @staticmethod
    def _as_ip(host: str) -> ipaddress._BaseAddress | None:
        try:
            return ipaddress.ip_address(host)
        except ValueError:
            return None

    def _judge_ip(self, host: str, ip, port: int, resolved: bool) -> ScopeDecision:
        # IPv4 映射 IPv6 按实际 IPv4 地址判断，不能绕过公网/特殊地址禁令。
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if ip.is_loopback:
            return ScopeDecision(True, host, "loopback", str(ErrorCode.OK), "回环地址，自建靶场", port, str(ip))
        if ip.is_unspecified or ip.is_multicast or ip.is_reserved:
            return ScopeDecision(False, host, "public", str(ErrorCode.SCOPE_PUBLIC_TARGET_DENIED),
                                 "未指定、组播或保留地址不是可用靶场", port, str(ip))
        if any(ip.version == network.version and ip in network for network in _PRIVATE_NETWORKS):
            return ScopeDecision(True, host, "private", str(ErrorCode.OK),
                                 "私网地址，视为内网自建靶场" + ("（受控授权）" if resolved else ""), port, str(ip))
        return ScopeDecision(
            False, host, "public", str(ErrorCode.SCOPE_PUBLIC_TARGET_DENIED),
            f"{ip} 不属于回环或允许的私网地址：本平台绝不测试真实外部网站", port, str(ip),
        )

    def describe(self) -> dict:
        """给前端/报告展示当前安全边界。"""
        return {
            "strict": self.strict,
            "authorized_targets": sorted(self.authorized),
            "allowed_classes": ["loopback", "private", "authorized"],
            "denied_classes": ["public"],
            "public_denylist": list(_PUBLIC_DENYLIST_SUFFIXES),
            "policy": "默认拒绝：非本机/非私网/非显式授权目标一律不发起请求",
        }
