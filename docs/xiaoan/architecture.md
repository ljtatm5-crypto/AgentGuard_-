# 小安架构

## 定位

小安是 AgentGuard 的教学型 Copilot，负责教用户接入 Agent、设计测试、阅读证据、修复缺陷和完成回归。事实判定仍由 AgentGuard 固定规则引擎完成，小安不能把建议当成已修复结论。

## 运行时结构

```text
React 全局面板（页面感知）
  -> POST /api/v2/assistant/chat
  -> 会话与权限校验
  -> 混合检索（关键词 + 向量 RRF）
  -> 可选读取授权 Run/Trace/Finding
  -> 本地 grounded 回答 或 可选 LLM 结构化回答
  -> 引用来源 + 证据卡片 + 操作步骤 + 反馈
```

## 已实现模块

- `backend/app/api/assistant.py`：聊天、教程、诊断、修复、反馈、来源 API。
- `backend/app/services/xiaoan/`：知识、切片、Embedding、检索、证据、修复、回答服务。
- `backend/app/models/assistant_entities.py`：文档、切片、会话、消息、反馈和修复计划。
- `frontend-apple/src/components/xiaoan/XiaoAnPanel.tsx`：全局教学面板。
- `docs/xiaoan/`：人工可读的设计与操作文档。

## 权限边界

- 基础教学问题可以匿名提问；携带 `run_id`、`finding_id`、`case_id` 等私有上下文的请求必须通过现有操作员鉴权。
- 公开演示部署可通过 `AGENTGUARD_ALLOW_ANONYMOUS_WRITES=true` 开放受控测试。
- 小安与“被测 Agent 连接网关”使用独立的模型和 Embedding 配置。

## 生产数据库保障

`0003_xiaoan_assistant` 是正式 Alembic 迁移。为兼容已经部署、且 `AGENTGUARD_DB_AUTO_CREATE=false` 的旧实例，启动时会仅对六张新增 assistant 表执行幂等 `create_all(checkfirst=True)`；不会修改或删除现有业务表。
