# AgentGuard 智测盾

面向 AI 智能体的质量、安全与行为风险自动化验证平台骨架。

这个版本先落地方案中的 P0 闭环：

`Agent 接入 → 测试集生成 → 批量执行 → 混合判定 → 轨迹审计 → 缺陷/攻击链 → 指标与回归`

默认使用前端 Mock 数据、本地模拟 Agent、虚拟查询工具和虚拟写入工具。C 可以在后端未完成时打通全部页面路由；切换 API 模式后，后端运行数据落在 SQLite 中。

三项硬约束已经落到代码：A 的固定规则先判且 LLM 不能覆盖规则结论；B 的目标授权和主机白名单门禁；C 的 Mock 优先与完整路由契约。

## 目录

```text
agentguard/
├─ backend/                 FastAPI + SQLAlchemy + SQLite
│  ├─ app/api/              Agent、测试集、运行、指标接口
│  ├─ app/models/           六类统一数据对象
│  ├─ app/services/         模拟 Agent、执行器、判定器、种子数据
│  └─ tests/                API 冒烟测试
├─ frontend-apple/          React + TypeScript + MSW + 苹果毛玻璃桌面端
├─ docker-compose.yml       一键启动开发环境
└─ .env.example
```

## 本地启动

### 后端

需要 Python 3.11+。推荐使用 uv：

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

启动后访问 <http://localhost:8000/docs>。

### 前端

需要 Node 18+：

```powershell
cd frontend-apple
npm install
npm run dev
```

访问 <http://127.0.0.1:5173>。默认 `VITE_USE_MOCK=true`，不要求后端启动；API 模式设置
`VITE_USE_MOCK=false`，Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。Mock 与真实后端统一使用
`/api/v2` 契约。

当前路由：`/overview`、`/agents`、`/test-suites`、`/runs`、`/runs/:id`、`/findings`、`/reports`、`/settings`。

GitHub Pages 演示：<https://ljtatm5-crypto.github.io/AgentGuard_-/>

### Docker

```powershell
docker compose up --build
```

## 第一条演示链路

1. 在“Agent 资产”页确认默认的校园智能助手。
2. 在“测试集”页生成/查看六类测试用例。
3. 在“执行任务”页启动一次批量运行。
4. 打开 `/runs/:id`，查看轨迹、工具权限判定和攻击链。
5. 在“报告”页查看通过率、风险检出率和修复前后对比占位。

## 接下来接入自建 Dify 靶场

自建 Dify 已支持受控接入。将目标主机加入 `AGENTGUARD_ALLOWED_TARGET_HOSTS`，在服务端
设置 API Key 环境变量（例如 `DIFY_AGENT_API_KEY`），然后在 Agent 资产页选择
“授权自建 Dify”，填写 Chat Messages 完整地址、凭据环境变量名和授权记录编号。
适配器不跟随重定向、不读取系统代理，公网未知目标仍然拒绝。

可选自建大模型通过 `AGENTGUARD_LLM_ENABLED`、`AGENTGUARD_LLM_CHAT_URL`、
`AGENTGUARD_LLM_MODEL` 和 `AGENTGUARD_LLM_API_KEY_ENV` 配置。AI 用例必须人工确认后保存；
语义判定只能补充规则不足，不能覆盖确定性结论。

## 分支流程

唯一允许的流程是 `feature/* → dev → main`。`dev` 就是 integration 分支；Git 不允许同时存在
`dev` 与 `dev/integration` 两个 ref，因此不使用会造成引用冲突的分支名。feature 必须先进入
`dev` 联调，后端测试、前端 Mock/API 路由检查、生产构建和人工 P0 闭环全部通过后，才能合并到
`main`。详见 `CONTRIBUTING.md`。

## 方案审阅结论

方案的 P0 范围和三人分工是一致的，数据对象、接口边界和演示链路足以直接开始开发。需要注意的不是方向性问题，而是执行纪律：先冻结 Schema、固定演示数据和判定 Prompt，再扩展 Coze、MCP、多智能体等 P2 能力；所有比赛指标必须由运行记录和人工复核表产生。
