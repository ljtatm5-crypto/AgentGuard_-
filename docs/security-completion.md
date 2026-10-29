# 队员B 完善报告执行结果（2026-10-25）

> 对应文档：《AgentGuard 智测盾 队员B 分工与完善报告》第「完善任务与验收标准」节
> 代码基线：`main 856a83a`
> 结论：**7 项中 5 项已在代码层完成并通过自测**；P0 的两项"真实 Dify 靶场实跑"依赖 Docker 与内网环境，代码侧已就绪，需在靶场机器上执行。

---

## 一 完成情况总览

| 优先级 | 任务 | 状态 | 落点 |
|---|---|---|---|
| P0 | 搭建团队自建 Dify 私网靶场 | 🟡 环境依赖 | `docs/dify-target-runbook.md`（操作步骤）+ 门禁已就绪 |
| P0 | 完成一次真实接入与调用 | 🟡 环境依赖 | `agent_adapter._invoke_remote` 已实现 dify/openai 两条真实调用路径 |
| P0 | 保存授权记录 | ✅ 完成 | `authorization_records` 表 + `/api/authorizations` |
| P1 | DNS 重绑定防护 | ✅ 完成 | `app/security/netguard.py` |
| P1 | 扩充组合风险样本 | ✅ 完成 | `samples.py::_combo_samples`（3 条多步链） |
| P1 | 攻击链因果置信度 | ✅ 完成 | `desktop_contract.finding_view` + 节点复核接口 |
| P2 | 支持更多授权 Agent 类型 | ✅ 完成 | OpenAI 兼容适配器（直连固定 IP） |

---

## 二 P0：授权记录持久化（已完成）

### 做了什么

1. **新表 `authorization_records`**
   字段：`reference`（编号，唯一）、`owner`、`purpose`、`target_scope`、`host`、`port`、
   `agent_id`（可选绑定）、`evidence`、`effective_from`、`expires_at`、`revoked_at`、`revoke_reason`。
   满足验收标准「授权人、目标、用途、证据、时间和授权编号可查询」。

2. **门禁改为查服务端记录**
   `validate_target_scope(..., db=..., agent_id=...)` 在通过白名单与 `ScopeGuard` 之后，
   还会用 `check_authorization()` 校验：编号存在、未撤销、未过期、主机一致、端口一致、
   作用域一致、Agent 绑定一致。任何一项不满足 → `TargetScopeError`，**不建立连接**。

   > 这条改动的意义：以前 `authorization_confirmed=true` + 任意非空编号就能过门禁（等于自己说自己有授权）；
   > 现在编号必须能对上服务端的一条真实记录。

3. **API**

   ```
   POST /api/authorizations                 登记（编号重复直接 400）
   GET  /api/authorizations?active_only=    查询
   GET  /api/authorizations/{reference}     按编号查
   POST /api/authorizations/{reference}/revoke  撤销
   POST /api/authorizations/check           干跑校验（不建连）
   ```

4. **接入点**
   `POST /api/agents/validate` 与 `POST /api/agents/{id}/invoke` 现在都会传 `db`，
   非 mock 适配器必须先有授权记录，否则 422/403。

### 怎么验

```powershell
backend\.venv\Scripts\python.exe -m pytest -q tests/test_authorization.py
```

覆盖 15 项：记录可查询、编号重复拒绝、主机/端口/作用域/Agent 不匹配拒绝、过期拒绝、
撤销拒绝、自报编号但无记录拒绝、有记录放行、不传 db 时保持旧行为、mock 不查授权。

手工验收：

```powershell
# 1. 登记一条授权
curl.exe -X POST http://127.0.0.1:8000/api/authorizations ^
  -H "Content-Type: application/json" ^
  -d "{\"reference\":\"AUTH-2026-B-001\",\"owner\":\"队员B\",\"purpose\":\"自建Dify联调\",\"target_scope\":\"self_hosted_dify\",\"host\":\"127.0.0.1\",\"port\":8080}"

# 2. 校验能否通过
curl.exe -X POST http://127.0.0.1:8000/api/authorizations/check ^
  -H "Content-Type: application/json" ^
  -d "{\"reference\":\"AUTH-2026-B-001\",\"host\":\"127.0.0.1\",\"port\":8080,\"target_scope\":\"self_hosted_dify\"}"
# → {"ok": true, ...}

# 3. 换个端口再试 → ok=false，reason 指出端口不一致
```

---

## 三 P1：DNS 重绑定防护（已完成）

### 问题

`ScopeGuard.check()` 是"先解析、再判断"，而 HTTP 客户端建连时会**再解析一次**。
两次解析之间域名可以从私网变成公网，校验就白做了。

### 做法

`app/security/netguard.py`：

1. `resolve_pinned(url)`：只解析一次，把结果钉住（`PinnedTarget`，含全部 IP）；
   任一解析结果是公网 → 整体拒绝。
2. `pinned_request(pin, ...)`：**直连固定 IP**，`Host` 头与 TLS `server_hostname` 仍是原域名，
   不走代理、不跟随重定向。
3. `verify_unchanged(pin)`：连接后再次解析，必须与固定值完全一致；新增、消失或变成公网
   都抛 `DnsRebindingError`。

`_invoke_remote` 里三条都用了：门禁 → `resolve_pinned` → 请求 → `verify_unchanged`。

### 怎么验

```powershell
backend\.venv\Scripts\python.exe -m pytest -q tests/test_netguard.py
```

7 项：回环固定、公网目标拒绝、公网 IP 字面量拒绝、直连固定 IP 能拿到响应、
解析变化被判定为重绑定、解析变成公网被拒绝、私网字面量正常固定。

本机已实跑：**7/7 通过**（该模块不依赖 FastAPI/SQLAlchemy，可直接
`python backend/tests/test_netguard.py`）。

---

## 四 P1：组合风险样本（已完成）

新增 3 条多步链，判定看"整条链是否被阻断"而不是单轮回答：

| 编号 | 链路 | 轮数 | 阻断规则 |
|---|---|---|---|
| `AG-C-001` | 恶意知识 → 工具越权 | 2 | `no_write_allowed`、`no_untrusted_instruction` |
| `AG-C-002` | 记忆污染 → 目标漂移 | 3 | `memory_key_not_written`、`no_sensitive_scope` |
| `AG-C-003` | 间接注入 → 记忆污染 → 越权写入 | 3 | 上述四条全覆盖 |

每条都记录 `chain_of`（由哪些单点样本串成），样本总量 23 → **26**。
限额仍为迭代 1 次、并发 ≤2、Token ≤2048。

```powershell
backend\.venv\Scripts\python.exe -m pytest -q tests/test_combo_samples.py
```

本机已实跑：**7/7 通过**。

---

## 五 P1：攻击链因果置信度（已完成）

`finding_view()` 的每个节点现在带：

| 字段 | 含义 |
|---|---|
| `basis` | `observed`（有事件证据）/ `inferred`（无证据，仅为推论） |
| `confidence` | 0—1；observed 默认 0.95，inferred 默认 0.35，修复建议 0.5 |
| `unknowns` | 该节点当前无法确认的点（例如"缺少响应事件，影响范围属推断"） |
| `confirmation` | `pending` / `confirmed` / `rejected` + 复核人、时间、备注 |

并新增链路汇总 `chain_summary`：节点数、observed/inferred 计数、已确认/已驳回数、
链路置信度（取各节点最低值）、以及一句"inferred 节点不能当作攻击成功证据"的说明。

人工复核接口：

```
POST /api/v2/findings/{finding_id}/chain/{node_id}/review
{"status": "confirmed", "reviewer": "队员A", "note": "事件证据充分"}
```

复核结论写回 `Finding.chain`，旧记录保留，同一节点只保留最新结论。

---

## 六 P2：更多授权 Agent 类型（已完成）

`openai` / `openai_compat` 适配器已实现：与 Dify 共用同一套门禁与凭据来源，
请求走 `pinned_request` 直连固定 IP，不跟随重定向、不走系统代理。

`AgentCreate.adapter` 原本就声明了 `openai`，此前会抛 `NotImplementedError`，现已补齐。

---

## 七 仍需在真实环境完成的两项

这两项**不是代码问题**，需要靶场机器：

1. **搭建自建 Dify 私网靶场**：域名只解析到私网、加入 `AGENTGUARD_ALLOWED_TARGET_HOSTS`、
   凭据放服务端环境变量。步骤见 `docs/dify-target-runbook.md`。
2. **跑一次真实接入与调用**：登记授权记录 → 配置 Agent（`adapter=dify`, `endpoint` 指向内网）
   → `POST /api/agents/validate` → `/api/v2` 发起一次运行 → 检查轨迹里有
   `input / retrieval / response` 事件，且全程没有外部请求。

> 注意：旧 API（`/api/agents/{id}/invoke`）与旧执行器仍然返回 501 并拒绝真实远程调用，
> 这是 A/C 的既有设计（"不会用模拟结果替代真实执行"），本次没有推翻。
> 真实调用走 `/api/v2` 的桌面执行链。

---

## 八 本次改动的文件

| 类型 | 文件 |
|---|---|
| 新增 | `app/security/netguard.py` |
| 新增 | `app/services/authorization.py` |
| 新增 | `app/api/authorizations.py` |
| 新增 | `tests/test_netguard.py`、`tests/test_authorization.py`、`tests/test_combo_samples.py` |
| 新增 | `docs/security-completion.md`（本文）、`docs/dify-target-runbook.md` |
| 修改 | `app/models/entities.py`（+`AuthorizationRecord`） |
| 修改 | `app/core/target_scope.py`（+服务端授权记录校验） |
| 修改 | `app/api/agents.py`（传 db，强制记录） |
| 修改 | `app/services/agent_adapter.py`（DNS 固定 + OpenAI 适配器） |
| 修改 | `app/security/samples.py`（+3 条组合链、+`chain_of` 字段） |
| 修改 | `app/services/desktop_contract.py`（因果置信度 + 复核留痕） |
| 修改 | `app/api/desktop.py`（+节点复核接口） |
| 修改 | `app/main.py`（注册授权路由）、`app/security/scope.py`（注释纠正） |
| 修改 | `docs/audit-b-scope.md`、`docs/security-agent.md`（口径纠正） |

---

## 九 验证清单（交给复核人）

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

预期：原有 58 项 + 新增 15（授权）+ 7（netguard）+ 7（组合样本）= **87 项通过**。

若只是无依赖环境快速自查：

```powershell
python backend\tests\test_netguard.py        # 7/7
python backend\tests\test_combo_samples.py   # 需 pytest 风格，可用 python -m pytest
```
