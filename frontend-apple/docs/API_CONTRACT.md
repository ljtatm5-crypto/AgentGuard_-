# API 契约 —— 团队评审稿

**状态**：待 A / B 评审　**牵头人**：队员 C　**冻结目标**：2026-10-20

字段变更流程：先在协作频道说明 → 三人确认 → 同步更新后端 Pydantic Model、
`src/types/api.ts`、`src/api/schemas.ts` 三处，缺一不可。

---

## 通用约定

| 项 | 约定 |
|---|---|
| 时间 | ISO 8601，统一 UTC（如 `2026-10-20T02:10:08Z`） |
| 状态枚举 | `pending` / `running` / `passed` / `failed` / `needs_review` |
| 缺陷状态 | `open` / `mitigated` |
| 严重等级 | `critical` / `high` / `medium` / `low` / `info` |
| 判定来源 | `rule` / `metric` / `semantic` / `human` |
| 错误响应 | 必须含 `error_code` + `message`，可选 `detail` |

```jsonc
// 错误响应统一形态
{ "error_code": "VALIDATION_ERROR", "message": "agent_id 为必填字段", "detail": {} }
```

---

## 一、Agent 资产（B 生产）

### `GET /api/v2/agents`

返回 Agent 数组。核心字段见 `types/api.ts` 的 `Agent`。

```jsonc
{
  "id": "agt-campus-001",
  "version": "v1.2.0",
  "name": "校园智能助手",
  "agent_type": "tool",
  "endpoint": "local://campus-assistant",
  "model": "qwen2.5-7b-internal",
  "knowledge": [
    { "id": "kb-003", "name": "图书馆开放通知（含测试性恶意指令）", "version": "v0.9-test",
      "source": "靶场构造", "kind": "malicious" }
  ],
  "tools": [
    { "name": "campus_search", "description": "只读检索", "side_effect": "none" },
    { "name": "protected_write", "description": "受策略控制的虚拟写入", "side_effect": "virtual_write" }
  ],
  "permissions": { "campus_search": "allow", "protected_write": "review" },
  "validate_status": "validated",
  "authorized_scope": {
    "target_type": "internal_mock",
    "external_target_allowed": false,
    "note": "团队自建 Dify 靶场，禁止任何外部站点目标"
  }
}
```

**约束（B 红线）**
- `authorized_scope.external_target_allowed` **必须恒为 `false`**（Zod 用 `z.literal(false)` 强校验）
- `tools[].side_effect` 不允许出现 `external_write`
- 当前可执行连接使用 `local://` 安全沙盒，不含公网地址

### `POST /api/v2/agents/validate`

请求 `{ "name": "...", "endpoint": "local://...", "version": "...",
"agent_type": "conversation|rag|tool|workflow", "tools": [...], "permissions": {...} }`，
返回统一 `Agent` 对象。当前只允许本地安全沙盒，外部目标返回
`scope_public_target_denied`。

---

## 二、测试集与用例（A 生产）

### `GET /api/v2/test-suites`

```jsonc
[{ "id": "suite-p0-001", "name": "智能体安全基线测试集", "type": "security_p0",
   "version": "v1.0.0", "case_ids": ["tc-p0-001", "..."] }]
```

测试集面向客户的响应不包含内部成员、开发日期或实现分工字段；这些信息只保留在
服务端审计记录中。

### `GET /api/v2/test-suites/{id}/cases`

返回 `TestCase[]`，每条包含 `input` / `steps` / `expected` / `forbidden` / `judge` / `risk_tag` / `source` / `version`。

> `judge` 字段明确列出该用例可用的判定方式，前端据此渲染判定来源标签。
> 建议：能用 `rule` 判定的用例不要只写 `semantic` —— 这是 A 的硬性要求。

### `POST /api/v2/test-suites/generate`

请求 `{ "agent_id": "...", "test_type": "security_p0" }`，
返回 `{ "suite": {...}, "cases": [...], "review_required": false,
"generation_source": "reviewed_rule_templates", "llm_used": false }`。

**约束**：当前版本只从已审核的固定规则模板筛选用例，`llm_used` 恒为
`false`。后续接入大模型生成时必须改成候选草稿、`review_required = true`，
且未经人工审核不得进入正式执行。

---

## 三、执行任务（A 生产）

### `POST /api/v2/runs`

请求 `{ "agent_id": "...", "suite_id": "..." }` → `200` 同步返回已完成的 `TestRun`。
当前桌面版在请求内执行本地确定性靶场，因此 `completed` 可等于 `total`；后续改异步
任务模型时必须通过版本化契约变更，不得静默改变状态语义。

| 字段 | 说明 |
|---|---|
| `task_id` | 任务 ID，页面展示与追踪用 |
| `status` | 同步执行完成后为最终状态；执行异常为 `needs_review` |
| `total` / `completed` | 进度，**不得由前端估算** |
| `passed` / `failed` / `needs_review` | 仅统计已完成的用例 |

### `GET /api/v2/runs/{id}`

返回 `{ "run": TestRun, "results": JudgeResult[] }`，`results` 中每条含
`status` / `judge_source` / `reason` / `confidence` / `evidence` / `reviewed_by`。

### `POST /api/v2/runs/{id}/judge`

按固定规则重新判定，保留来源与原结论。结果中 `judge_source` 必须真实反映判定方式，
**不得把语义判定标记成规则判定**。

### `GET /api/v2/runs/{id}/trace`

返回 `TraceEvent[]`，`type` ∈ `input` / `retrieval` / `tool` / `policy` / `response` / `error`。

**约束**：只记录外部可观察行为，不记录模型不可见思维过程。

---

## 四、缺陷与攻击链（B 生产样本，A 判定）

### `GET /api/v2/findings/{id}/chain`

返回 `Finding`，含 `chain: ChainNode[]`，节点 `kind` ∈ `entry` / `behavior` / `impact` / `fix`。

**硬性要求**：每个节点的 `evidence` 必须指向真实存在的 `run_id + case_id + event_ids`。
C 侧 `npm run check:mock` 会校验这一点，无证据的节点视为不合格。

---

## 五、指标聚合（A 生产）

### `GET /api/v2/metrics`

```jsonc
{
  "total_cases": 18, "completed_cases": 16,
  "passed_cases": 11, "failed_cases": 4, "needs_review_cases": 1,
  "rule_judged_cases": 13, "semantic_judged_cases": 3,
  "avg_latency_ms": 7865,
  "risk_detection_rate": 0.8,
  "attack_success_rate_before": 0.5, "attack_success_rate_after": 0.0,
  "trace_coverage_rate": 1.0,
  "target_benchmarks": { "risk_detection_rate": 0.85, "attack_success_rate_after": 0.05 },
  "computed_from_run_ids": ["run-001", "run-002", "run-003"]
}
```

**约束**
- 所有实测值必须从原始记录计算，不得写死
- `target_benchmarks` 是比赛目标值，**与实测值严格分开**，前端分列渲染
- `computed_from_run_ids` 必填，保证指标可回溯
- 实测值无数据时返回 `null`（不是 `0`），前端展示「暂无实测值」

---

## 六、C 的承诺

所有页面只通过 `src/api/client.ts` 访问版本化桌面契约，默认 API 前缀由
`src/api/contract.ts` 统一定义为 `/api/v2`。Mock 处理器引用同一常量，
避免 Mock 已通过而真实后端仍指向旧 `/api` 接口。

| 项 | 承诺 |
|---|---|
| 不私自改 Schema | 发现不一致 → 建 issue 通知生产者，不在前端加临时字段 |
| 不硬编码掩盖 | Zod 校验失败 → 页面显示 `CONTRACT_MISMATCH`，不静默兜底 |
| 不替 A/B 补接口 | 联调期只提最小复现与 issue，不长期代写 |
