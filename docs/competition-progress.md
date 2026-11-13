# AgentGuard 传智杯冲刺进度

最后更新：2026-11-12

状态口径：`PASS` 已实际验证；`IN_PROGRESS` 正在实现；`BLOCKED` 缺外部条件；`NOT_RUN` 尚未执行。

## 功能矩阵

| 能力 | 当前状态 | 证据/位置 | 下一步 |
|---|---|---|---|
| React 测试工作台 | PASS | `frontend-apple/src`，7 个生产主路由 Playwright 实际访问 | 保持视觉基线 |
| FastAPI `/api/v2` | PASS | `backend/app/api/desktop.py` | 保持契约兼容 |
| 确定性校园安全靶场 | PASS | V1.0 7/26、V2.0 26/26，52 条生产逐用例结果 | 作为现场稳定复现实例 |
| Dify 多轮会话 | PASS | `conversation_id` 契约测试通过，跨用例隔离与释放已覆盖 | 真实 Dify 模型实测仍需环境 |
| FastGPT 适配器 | PASS | `appId/chatId/detail`、检索/工具事件映射、授权与执行链契约测试通过 | 真实 FastGPT 模型实测仍 BLOCKED |
| 真实 Dify Agent | BLOCKED | 适配器、Runbook、知识与工具 OpenAPI 已准备 | 需要授权 Dify 地址、模型和 API Key |
| 真实 FastGPT Agent | BLOCKED | 适配器、Runbook、授权/执行契约已准备 | 需要 Docker、模型、Embedding、appId 和 API Key |
| AI 用例生成 | IN_PROGRESS | `llm_provider.py`、生成/人工接受链路 | 真实模型生成实验需凭据 |
| 小安教学助手 P0 | IN_PROGRESS | 独立知识库、混合检索、全局面板、教程、证据诊断、修复计划与 API 已实现；自动测试通过 | 需配置真实模型/Embedding 并完成 40+ 人工评测 |
| 规则优先混合判定 | PASS | 规则优先、LLM 只做补充 | 补 Rule/LLM/Hybrid 对照实验（需模型） |
| 事件级轨迹 | PASS | `TraceEvent`、生产运行详情、三栏轨迹页 | 保持证据深链 |
| 攻击链与证据回指 | PASS | 生产复验生成 19 条 Finding，节点保存 run/case/event ids | 补三组真实 Dify 攻击实验 |
| 报告导出 | PASS | PDF/Markdown/CSV，含数据来源与适用范围 | 保持字段核对 |
| 公开演示写权限 | PASS | 匿名创建与执行测试可用；令牌保护模式和错误令牌拒绝仍保留在代码与回归测试中 | 通过 `AGENTGUARD_ALLOW_ANONYMOUS_WRITES=false` 可恢复操作员令牌模式 |
| 公开/私有读边界 | PASS | 生产复验：匿名摘要 200，运行详情/授权记录匿名 401，错误令牌 403，正确令牌 200 | 保持自动化回归 |
| 请求限流与审计 | PASS | 写中间件、request id、结构化日志 | 后续迁移到持久化审计表 |
| 同步任务规模上限 | PASS | `AGENTGUARD_MAX_CASES_PER_RUN=40` | 真实模型需异步 Worker |
| PostgreSQL 持久化 | PASS | Neon PostgreSQL，Alembic `0003_xiaoan_assistant (head)`，跨多次重新部署读取 Run 记录 | 保持数据库备份与迁移策略 |
| 并发冷启动初始化 | PASS | PostgreSQL 事务级 advisory lock，避免重复播种 | CI 持续覆盖 |
| 异步任务队列 | NOT_RUN | 当前同步执行 | 需持久化 Worker 或托管队列 |
| 分批执行持久化 | PASS | 执行前持久化全部待执行行，每 5 条提交一次；中断后保持 `pending`，不会伪装成完整成功 | 真实模型场景仍需 Worker |
| 全局限流 | NOT_RUN | 当前为单实例内存限流 | 生产费用控制需共享限流或队列 |
| 80 条正式测试集 | IN_PROGRESS | 80 条候选通过结构校验，全部 `pending_human_review`；复核模板已增加审核状态 | 人工审核、冻结数据集 |
| 风险真值口径 | PASS | 26 条确定性基线使用按 Agent 身份与版本共同绑定的独立审核真值；`risk_tag` 不参与 F1 | 保持审核版本与复算脚本 |
| 生产前端与后端 | PASS | `agent-guard-kohl.vercel.app`、`agentguard-api-three.vercel.app` | 持续回归 |
| 竞赛材料包 | IN_PROGRESS | `competition/` 已包含说明书、技术方案、数据集、实验、证据、截图与打包脚本 | 补演示视频与人工审核记录 |

## 生产验收证据

- 前端：https://agent-guard-kohl.vercel.app
- 后端健康检查：https://agentguard-api-three.vercel.app/healthz
- API 文档：https://agentguard-api-three.vercel.app/docs
- Neon 资源：`agentguard-postgres`，免费计划，生产/预览/开发已连接。
- 前端生产部署：`dpl_9GXWdxMRNAkWRQ2iH7uxQsL2w2bE`
- 后端最新生产部署：`dpl_AS2mQGA6wwy1xxZCjQA69GQkRaeK`
- V1.0 生产 Run：`225dc1e7-8e45-40af-9aec-dfa824cdf6f1`（7 通过 / 19 失败）
- V2.0 生产 Run：`88e67ed6-972e-4656-b4e7-c17b46a3085f`（26 通过 / 0 失败）
- 跨部署持久化：`competition/04_运行证据/neon_cross_deployment_persistence.json`，`PASS`
- Alembic 当前版本：`0003_xiaoan_assistant (head)`，证据见 `competition/04_运行证据/neon_alembic.json`
- 生产鉴权与指标：`competition/04_运行证据/production_access_control_verification.json`，`PASS`
- 前端 7 路由：`/overview`、`/agents`、`/test-suites`、`/runs`、`/findings`、`/reports`、`/settings` 全部 200，控制台错误 0，截图见 `competition/04_运行证据/页面截图/`。

## 阶段记录

### 阶段一：公开 API 安全整改

- 代码默认仍要求 Bearer 操作员令牌；当前参赛演示部署显式开启公开写入，方便评委直接操作。
- 增加请求大小限制、单实例限流、request id 与结构化审计日志。
- 前端设置页令牌只保存到 `sessionStorage`。
- 生产 Vercel Secret 已配置，令牌不进入 Git。
- 验证：匿名 POST 401、错误令牌 403、有效令牌通过鉴权。

### 阶段二：PostgreSQL 持久化

- 已支持 psycopg 3、Alembic 初始迁移和跨会话持久化检查。
- 线上 Neon PostgreSQL 已建表，Alembic 当前为 `0003_xiaoan_assistant (head)`。
- 生产环境使用 Neon 外部连接池 + SQLAlchemy `NullPool`，避免 Vercel 冷启动复用已关闭的 TLS 连接。
- 两个生产 Run 记录在两次重新部署后仍可读取，跨部署持久化为 `PASS`。

### 阶段三：多平台适配与双实例验证

- 实例 A：确定性校园靶场已在生产环境实际执行，V1.0 为 7/26，V2.0 为 26/26。
- 实例 B：已准备 Dify 实施清单、知识库测试数据与工具 OpenAPI 规范；真实 Dify Agent 仍为 `BLOCKED`，缺少授权地址、模型和 API Key。
- 实例 C：FastGPT 专用适配、`appId/chatId/detail` 映射、检索/工具事件归一化、授权门禁和执行链契约测试已通过；真实 FastGPT 仍为 `BLOCKED`，当前环境没有 Docker、模型、Embedding、appId 和 API Key。
- 契约测试证据：`competition/04_运行证据/adapter_contract/contract_test_summary.json`。
- 跨平台实验状态：`competition/03_测试数据与实验/跨平台兼容性实验.md`。

### 阶段四：AI 用例生成与 Judge

- 代码与 Mock 契约通过。
- 真实模型调用尚未执行，原因是缺少模型地址、模型名和服务端 API Key；状态为 `BLOCKED`。

### 阶段五：正式数据集

- 已生成 80 条候选用例：功能 12、RAG 12、Tool 12、多轮 10、安全 20、边界 8、性能 6。
- 已生成人工真值模板并通过结构校验。
- 全部标记 `pending_human_review`，尚未冻结为正式数据集。

### 阶段六：攻击链

- 生产复验生成 19 条 Finding，节点保存 `run_id`、`case_id` 和 `trace_event_ids`。
- 观测节点与推断节点分开表达，人工复核状态可见。
- 真实 Dify 风险实验仍为 `NOT_RUN`。

### 阶段七：异步执行

- 未实现 Worker；当前通过同步任务规模上限控制 Vercel Function 占用。

### 阶段八：前端与报告

- 7 个生产路由已通过 Playwright 验收。
- 总览、执行记录、攻击链和指标表均读取真实 Neon 数据。
- PDF 已重新渲染并完成第一页视觉检查，标题重复问题已修复。

### 阶段九：竞赛交付

- 已建立 `competition/`，包含作品说明书、技术方案、架构图 PNG/SVG、80 条候选数据、实验报告、生产证据、截图、演示脚本和打包脚本。
- 演示视频和 80 条人工审核记录仍为 TODO，不能写成已完成。

## 关键阻塞

1. 当前执行环境没有可用 Docker，无法启动真实 Dify/FastGPT 靶场。
2. 缺少真实 Dify 地址、模型和 `AGENTGUARD_DIFY_KEY`；真实 Dify 端到端实验为 `BLOCKED`。
3. 缺少 FastGPT 模型、Embedding、appId、服务端凭据和授权地址；真实 FastGPT 实验为 `BLOCKED`。
4. 80 条候选用例尚未完成人工审核，不得声称“80 条已通过”。
5. 演示视频尚未录制，视频地址仍为 TODO。
6. 异步 Worker 或托管队列尚未实现；当前仅支持受控规模的同步任务。
### 阶段十：小安教学助手 P0

- 已实现独立教学知识库、按标题切片、本地哈希向量与关键词混合检索、RRF 融合和来源引用。
- 已新增 `/api/v2/assistant/*` 受控 API、会话/消息/反馈/修复计划数据表和 `0003_xiaoan_assistant` 迁移。
- 已实现全局小安面板、页面感知快捷问题、教程步骤、真实事件证据卡片、修复与回归计划。
- 匿名基础教学与私有证据诊断已区分权限；携带 Run/Finding 上下文的请求继续要求操作员鉴权。
- 当前自动测试、Mock/真实 API 契约和前端构建通过；真实 LLM/Embedding 与 40+ 人工评测尚未执行，不得写成 PASS。

## 第二轮专项审计修复（2026-11-14）

- `PASS` 证据感知判定：工具、记忆和行为类“未发现问题”规则必须具备完整可观测证据，否则强制 `needs_review`，不得将未观测等同于安全。
- `PASS` 不可观测结果会在运行详情中显示缺失证据类型，规则结果保留 `evidence_complete`、`unobservable_evidence` 和 `evidence_requirements`。
- `PASS` 本地确定性模拟器显式声明 `simulated` 工具、RAG 与记忆能力；远程 Dify/FastGPT 只在响应实际返回事件时声明 `observable`。
- `PASS` 自建 LLM、小安 LLM 与 Embedding 统一改用固定 IP 出站传输，复用 DNS 固定、连接后复验、禁止代理和禁止重定向门禁。
- `PASS` 测试集列表移除逐测试集用例 N+1 查询；公共摘要接口增加边缘缓存。
- `PASS` 生产前端环境已确认 `VITE_USE_MOCK=false`，线上调用真实 FastAPI/PostgreSQL；真实 Dify/FastGPT 模型验证仍为 `BLOCKED`。
- `PASS` 后端全量测试 161 项通过；新增 T01“工具轨迹缺失必须待复核”、未观测记忆、写入缺少策略决策、LLM 固定 IP 传输等回归测试。
- `NOT_RUN` 真实 Dify/FastGPT 端到端模型实验、80 条人工 Ground Truth 冻结、异步 Worker 与演示视频仍需外部条件。
