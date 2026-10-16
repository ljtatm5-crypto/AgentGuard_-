# AgentGuard 智测盾

面向 AI 智能体的质量、安全与行为风险自动化验证平台骨架。

这个版本先落地方案中的 P0 闭环：

`Agent 接入 → 测试集生成 → 批量执行 → 混合判定 → 轨迹审计 → 缺陷/攻击链 → 指标与回归`

默认使用本地模拟 Agent、虚拟查询工具和虚拟写入工具，所有数据落在 SQLite 中。这样可以先把演示链路跑通，再替换 Dify/OpenAI 适配器，不会让外部服务成为开发阻塞点。

## 目录

```text
agentguard/
├─ backend/                 FastAPI + SQLAlchemy + SQLite
│  ├─ app/api/              Agent、测试集、运行、指标接口
│  ├─ app/models/           六类统一数据对象
│  ├─ app/services/         模拟 Agent、执行器、判定器、种子数据
│  └─ tests/                API 冒烟测试
├─ frontend/                Vue 3 + TypeScript + Element Plus + ECharts
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
cd frontend
npm install
npm run dev
```

访问 <http://localhost:5173>。Vite 会把 `/api` 代理到 `http://localhost:8000`。

### Docker

```powershell
docker compose up --build
```

## 第一条演示链路

1. 在“Agent 资产”页确认默认的校园智能助手。
2. 在“测试集”页生成/查看六类测试用例。
3. 在“执行任务”页启动一次批量运行。
4. 打开某条失败用例，查看轨迹、工具权限判定和攻击链。
5. 在“报告”页查看通过率、风险检出率和修复前后对比占位。

## 接下来接入真实 Dify

先实现 `backend/app/services/agent_adapter.py`，让它实现 `AgentAdapter` 协议，再在 `services/runner.py` 中按 Agent 的 `adapter` 字段选择 `mock` 或 `dify`。统一响应必须转换成 `TraceEvent`，前端和报告层不直接依赖 Dify 返回格式。

## 方案审阅结论

方案的 P0 范围和三人分工是一致的，数据对象、接口边界和演示链路足以直接开始开发。需要注意的不是方向性问题，而是执行纪律：先冻结 Schema、固定演示数据和判定 Prompt，再扩展 Coze、MCP、多智能体等 P2 能力；所有比赛指标必须由运行记录和人工复核表产生。
