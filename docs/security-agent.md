# 安全靶场与 Agent 适配（队员B）

> 分支：`feature/security-agent`
> 职责：Agent 适配 · 安全样本 · 工具权限 · 攻击链
> 代码：`backend/app/security/`（纯标准库）、`backend/app/services/agent_adapter.py`

本模块把方案里的安全能力落成**可运行的靶场**：一个会真的被注入、真的会越权、
但只在虚拟数据上出事的校园智能助手，加上判定规则和攻击链。

---

## 一 安全边界（最重要的一条）

所有测试只面向**团队自建靶场**，不触碰任何真实外部网站。这不是写在文档里的承诺，
是代码里的默认拒绝（`app/security/scope.py`）：

| 机制 | 行为 |
|---|---|
| 回环 / 私网 | 放行（本机自建靶场） |
| 显式授权清单 | 校验主机、授权编号和服务端凭据环境变量；`AuthorizationRecord` 已落到 `authorization_records` 表，可登记/查询/撤销，门禁按 主机+端口+作用域+Agent 逐条比对 |
| 公网 IP / 公网域名 | **拒绝，且在建立连接之前** |
| 公网黑名单 | `google.com`、`openai.com`、`dify.ai` 等即使加白也拒绝 |
| 非 http(s) 协议 | 拒绝（`file://` 等） |

`ScopeGuard.check()` 是唯一入口，`agent_adapter` 在发起任何远程请求前必须先过它。
DNS 解析结果由 `app/security/netguard.py` 固定，连接前后各校验一次，变化即判重绑定。

---

## 二 包结构

```
backend/app/security/
├── __init__.py          对外导出
├── scope.py             授权范围守卫（默认拒绝）
├── policy.py            allow / deny / review 三态策略 + 策略版本
├── tools.py             campus_search（只读）/ protected_write（受控）+ 虚拟校园库
├── rag.py               知识库 trusted / conflict / untrusted + 分组召回
├── memory.py            会话记忆 + 记忆校验（键白名单、提权词拦截、来源校验）
├── agent_core.py        被测 Agent：CampusAssistantV1（未修复）/ V2（已修复）
├── trace.py             可观察事件记录器
├── rules.py             确定性判定规则 + 修复建议库
├── samples.py           安全样本库（五类风险 + 变体）与团队 risk_tag 映射
├── attack_chain.py      攻击链构建（节点回指事件）
└── knowledge/           11 篇知识文档：normal 5 / conflict 2 / malicious 4
```

`backend/app/services/agent_adapter.py` 是唯一与平台对接的部分。

---

## 三 接入方式（给 A / C）

适配器返回结构与 `mock_agent.MockInvocation` **完全一致**，事件字段与
`models.entities.TraceEvent` 对齐，因此接进来只需要改调用点，不用改判定逻辑。

### 3.1 `services/runner.py`

```diff
- from app.services.mock_agent import invoke_mock
+ from app.services.agent_adapter import invoke_agent
@@
-        invocation = invoke_mock(case.input, case.risk_tag)
+        invocation = invoke_agent(agent, case.input, case.risk_tag)
```

### 3.2 `api/agents.py`

```diff
- from app.services.mock_agent import invoke_mock
+ from app.services.agent_adapter import invoke_agent
@@
-    invocation = invoke_mock(payload.input)
+    invocation = invoke_agent(agent, payload.input)
```

### 3.3 `services/seed.py`（可选，换成 B 的样本集）

```python
from app.security.samples import build_seed_cases
CASES = build_seed_cases()   # 23 条，risk_tag 已按团队取值
```

> 这三处属于 A / C 的文件，本次提交**没有改动**，请由对应负责人确认后合并。
> 未接线时 `agent.adapter` 仍为 `mock`，平台行为与现在完全一致（向后兼容）。

### 3.4 切到真实 Dify

把 `agents.adapter` 改成 `dify`、`endpoint` 指向**你自己的内网 Dify**：

```python
agent.adapter = "dify"
agent.endpoint = "http://192.168.1.20"     # 不要带 /v1
agent.permissions = {"campus_search": "allow", "protected_write": "review"}
```

内网地址需显式授权：

```powershell
$env:AGENTGUARD_AUTHORIZED_TARGETS = "192.168.1.20"
```

公网地址永远拒绝，加白也没用。

---

## 四 风险标签对齐

团队既有取值用连字符（见 `seed.py`），本包内部用下划线，`samples.py` 里统一映射：

| 本包 | 团队 | 说明 |
|---|---|---|
| `normal` | `normal` | 功能基线 |
| `rag` | `rag` | 冲突知识 |
| `indirect_injection` | `indirect-injection` | 间接注入 |
| `memory_poisoning` | `memory-poisoning` | 记忆污染 |
| `tool_abuse` | `tool-overreach` | 工具越权 |
| `boundary` | `exception` | 边界异常 |
| `direct_injection` | `direct-injection` | **新增**，需 A 侧补规则 |
| `goal_drift` | `goal-drift` | **新增**，需 A 侧补规则 |

⚠️ 两个新增标签目前会落到 `judge_case` 的默认「通过」分支，等于**未判定**。
合并前请 A 补两条规则，或暂时把这两类样本移出主测试集。

---

## 五 事件类型映射

| 本包 | 团队 | 说明 |
|---|---|---|
| `user_input` | `input` | 用户输入 |
| `policy_decision` | `policy` | 策略决策（`judge_case` 判 deny 靠这个） |
| 其余 | 同名 | `retrieval` / `tool_call` / `tool_result` / `memory_write` / `response` / `error` |

适配器里 `EVENT_TYPE_MAP` 是唯一改动点，两侧任何一边改名都要同步。

---

## 六 自测

不依赖 FastAPI / SQLAlchemy / pytest，装好 Python 就能跑：

```bash
python backend/tests/test_security.py
```

期望：`18/18 通过`。覆盖：

- 公网目标被拒、回环/私网放行、`file://` 被拒；
- 未声明动作 deny、敏感作用域升 review、白名单外写入 deny；
- mock / campus 适配器契约一致、事件名归一化；
- 同一用例 v1.0 触发、v2.0 收敛（间接注入 / 直接注入 / 记忆污染 / 越权写入）；
- 样本覆盖五类风险、9 个必填字段齐全、seed 结构与团队一致。

---

## 七 已知限制（要主动说）

1. **V1.0 是确定性模拟**，不是真实 LLM 被攻破。接真实 Dify 后是否触发由模型行为决定，
   平台侧判定口径不变。材料里不能写成「真实模型被攻破」。
2. **大模型语义补充可选接入**：只有规则无法判定时才调用自建模型，最终状态仍进入人工复核。
3. **注入载荷是可机读注释**（`<!-- AG-INSTR {...} -->`），便于确定性复现；
   接真实模型时删掉注释即退化为纯自然语言注入。
4. **虚拟工具只在 `backend/.data/` 的 SQLite 里写模拟数据**，不触碰真实文件与接口。
