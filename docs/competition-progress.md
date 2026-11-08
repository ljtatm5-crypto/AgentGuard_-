# AgentGuard 传智杯冲刺进度

最后更新：2026-11-08

状态口径：`PASS` 已实际验证；`IN_PROGRESS` 正在实现；`BLOCKED` 缺外部条件；`NOT_RUN` 尚未执行。

## 功能矩阵

| 能力 | 当前状态 | 证据/位置 | 下一步 |
|---|---|---|---|
| React 测试工作台 | PASS | `frontend-apple/src`，7 个主路由返回 200 | 保持视觉基线 |
| FastAPI `/api/v2` | PASS | `backend/app/api/desktop.py` | 保持契约兼容 |
| 确定性校园安全靶场 | PASS | `agent_adapter.py`、26 条安全用例 | 固定 V1.0/V1.1/V1.2 |
| 真实 Dify Agent | BLOCKED | 适配器、Runbook 已存在 | 需要授权 Dify 地址与模型凭据 |
| AI 用例生成 | IN_PROGRESS | `llm_provider.py`、生成/人工接受链路 | 补真实模型调用实验与来源记录 |
| 规则优先混合判定 | PASS | 规则判定与 LLM 补充分层 | 补 Rule/LLM/Hybrid 对照实验 |
| 事件级轨迹 | PASS | `TraceEvent`、三栏轨迹页 | 保持证据深链 |
| 攻击链与证据回指 | PASS | `Finding.chain`、节点复核接口 | 补三组攻击链实验报告 |
| 报告导出 | PASS | PDF/Markdown/CSV | 增加数据来源与实验范围字段核对 |
| 公开写接口控制 | PASS | `backend/app/security/access.py` | 配置生产令牌并复查 |
| 请求限流与审计 | PASS | 写中间件、结构化日志 | 后续迁移到持久化审计表 |
| 同步任务规模上限 | PASS | `AGENTGUARD_MAX_CASES_PER_RUN` | 真实模型需异步 Worker |
| PostgreSQL 持久化 | BLOCKED | 当前 Vercel 使用 `/tmp` SQLite | 接 Neon，补 Alembic 迁移 |
| 异步任务队列 | NOT_RUN | 当前同步执行 | 需持久化 Worker 或托管队列 |
| 80 条正式测试集 | NOT_RUN | 当前固定 26 条基线 | 建数据集、人工真值与审核状态 |
| 竞赛材料包 | NOT_RUN | 尚无 `competition/` | 生成文档、CSV、证据清单与脚本 |
| 线上前后端 | PASS | `agent-guard-kohl.vercel.app`、`agentguard-api-three.vercel.app` | 配生产写令牌 |

## 阶段记录

### 阶段一：公开 API 安全整改

- 新增全局写接口中间件，写操作默认需要 Bearer 操作员令牌。
- 增加请求大小限制、单实例限流、request id 与结构化审计日志。
- 同步任务增加用例数上限，避免真实模型请求长时间占用 Vercel Function。
- 前端设置页新增受控令牌入口，只保存到 sessionStorage。
- 后端 pytest、TypeScript、ESLint、Vite build 全部通过。

### 阶段二：PostgreSQL 持久化

- BLOCKED：需要 Neon/PostgreSQL 连接串与数据库迁移环境。
- 当前 Vercel 后端仍使用 `/tmp` SQLite，冷启动可能丢失运行记录。

### 阶段三：双实例验证

- 实例 A：确定性校园靶场可用。
- 实例 B：真实 Dify 校园 Agent 未接通，标记 BLOCKED。

### 阶段四：AI 用例生成与 Judge

- 已有代码与 Mock 验证，真实模型调用尚未执行。

### 阶段五：正式数据集

- 目标 80 条，尚未冻结和人工审核。

### 阶段六：攻击链

- 已有代码和单测，仍需三组现场攻击实验记录。

### 阶段七：异步执行

- 未实现 Worker；当前限制同步用例规模。

### 阶段八：前端与报告

- 基础能力完成，新增写操作令牌入口。

### 阶段九：竞赛交付

- 尚未开始打包。

## 关键阻塞

1. 缺少 Neon/PostgreSQL 凭据。
2. 缺少真实 Dify 靶场地址、模型和 API Key。
3. 人工真值与 80 条用例审核不能由 Agent 代为声称。
4. 异步 Worker 需要额外运行时或队列服务。
