# 自建 Dify 私网靶场 Runbook（队员B · P0）

> 目标：在**自己完全可控**的网络里跑起一个 Dify，让 AgentGuard 真的连上去执行一次，
> 并留下授权记录与轨迹证据。
>
> 铁律：只连自己的机器/内网。任何公网地址都会被 `ScopeGuard` 直接拒绝，加白也没用。

---

## 一 准备环境

| 项 | 要求 |
|---|---|
| 机器 | 你的笔记本 / 实验室服务器 / 云主机（**仅内网可达**） |
| Docker | Docker Desktop 或 docker + compose |
| 网络 | 靶场域名只解析到私网地址（如 `dify.lab.local → 192.168.1.20`） |
| 端口 | 例：`http://192.168.1.20:8080`（或反代到 80） |

起服务：

```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker compose up -d
```

浏览器打开 `http://192.168.1.20`（或本机 `http://localhost`），完成管理员初始化。

---

## 二 建一个可被测的应用

1. **创建应用** → 聊天助手（Chat App），命名 `校园助手 · 靶场`。
2. **系统提示词**：把 `backend/app/security/agent_core.py` 里 `SYSTEM_PROMPT` 的内容贴进去，
   保留 `AG-SYS-BOUNDARY` 这个标记（判定引擎靠它识别提示词泄露）。
3. **知识库**：新建「校园知识库」，先只传 `backend/app/security/knowledge/normal/` 5 篇。
   演示间接注入时再传 `malicious/` 4 篇（它们带测试声明，只进这个靶场库）。
4. **发布** → 左侧「访问 API」，复制 **API 密钥**（`app-` 开头）。

> 密钥不要写进任何文档或截图。下一步放进服务端环境变量。

---

## 三 配置 AgentGuard

### 3.1 环境变量（在跑后端的机器上）

```powershell
# 允许访问的内网主机（必须包含靶场主机）
$env:AGENTGUARD_ALLOWED_TARGET_HOSTS = "localhost,127.0.0.1,192.168.1.20"

# Dify 应用密钥，只从环境变量读
$env:AGENTGUARD_DIFY_KEY = "app-你的密钥"
```

`backend/.env` 里也可以写（二者等价，注意 `.env` 不要提交）：

```
AGENTGUARD_ALLOWED_TARGET_HOSTS=localhost,127.0.0.1,192.168.1.20
```

### 3.2 登记授权记录（P0 的核心）

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/authorizations ^
  -H "Content-Type: application/json" ^
  -d "{\"reference\":\"AUTH-2026-B-001\",\"owner\":\"队员B\",\"purpose\":\"自建Dify靶场联调\",\"target_scope\":\"self_hosted_dify\",\"host\":\"192.168.1.20\",\"port\":8080,\"evidence\":\"docs/dify-target-runbook.md\"}"
```

返回里应包含 `reference`、`owner`、`expires_at`、`active: true`。

### 3.3 配置并校验 Agent

Dify 资产 ID 由服务端生成。若授权记录尚未绑定 Agent，首次校验成功后会将它绑定到新资产。
如需把授权预先绑定到固定资产 ID，可在请求中额外提供 `"agent_id":"<固定UUID>"`。

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/agents/validate ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"校园助手 · Dify靶场\",\"adapter\":\"dify\",\"endpoint\":\"http://192.168.1.20:8080/v1/chat-messages\",\"target_scope\":\"self_hosted_dify\",\"authorization_confirmed\":true,\"authorization_reference\":\"AUTH-2026-B-001\",\"permissions\":{\"__credential_env__\":\"AGENTGUARD_DIFY_KEY\"}}"
```

- 成功 → `{"valid": true, ...}`
- 报「未通过服务端校验」→ 授权记录的主机/端口和 endpoint 对不上
- 报「不在白名单」→ `AGENTGUARD_ALLOWED_TARGET_HOSTS` 没加这个主机

### 3.4 真跑一次

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v2/runs ^
  -H "Content-Type: application/json" ^
  -d "{\"agent_id\":\"<上一步返回的 id>\",\"suite_id\":\"desktop-security-v1\"}"
```

然后查轨迹：

```powershell
curl.exe http://127.0.0.1:8000/api/v2/runs/<task_id>
```

---

## 四 验收：这次真实调用要证明什么

| 检查点 | 怎么看 | 通过标准 |
|---|---|---|
| 目标确实是私网 | 授权记录 + `GET /api/authorizations/AUTH-2026-B-001` | host 是 `192.168.x.x` 或内网域名 |
| 有输入/检索/响应轨迹 | `/api/v2/runs/{id}` 的 events | 三类事件都在，且带时间与耗时 |
| 没有外部请求 | 靶场机器上抓包或看 Dify 访问日志 | 只有来自 AgentGuard 的请求 |
| 授权可追溯 | 运行记录能对上授权编号 | 报告里能写出 `AUTH-2026-B-001` |
| 拒绝有效 | 把授权撤销后再跑一次 | 直接 403，不发起请求 |

撤销测试：

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/authorizations/AUTH-2026-B-001/revoke ^
  -H "Content-Type: application/json" -d "{\"reason\":\"验收结束\"}"
```

再跑一次运行，应当被门禁拦住——**这一步是给评委看的重点**：
权限不是文档里写的，是能被撤销、撤销后立刻失效的。

---

## 五 常见问题

**Q：DNS 解析到公网了怎么办？**
`netguard.resolve_pinned` 会整体拒绝。检查 `/etc/hosts` 或内网 DNS，确保只解析到私网。

**Q：能不能直接用 `cloud.dify.ai`？**
不能。它在公网黑名单里，`ScopeGuard` 硬拒绝，加白也无效。

**Q：旧 API `/api/agents/{id}/invoke` 为什么还是 501？**
旧执行器明确拒绝真实远程调用（"不用模拟结果替代真实执行"）。真实调用走 `/api/v2`。

**Q：Dify 跑在 Docker 里，后端在宿主机，怎么连？**
用 `host.docker.internal` 反过来不行——是**后端连 Dify**，所以填 Dify 容器的宿主机映射端口，
例如 `http://192.168.1.20:8080` 或 `http://127.0.0.1:8080`（端口已映射到宿主机）。
