# 快速运行指南

## 线上体验

- 前端：https://agent-guard-kohl.vercel.app
- 后端健康检查：https://agentguard-api-three.vercel.app/healthz
- API 文档：https://agentguard-api-three.vercel.app/docs

公开摘要读取无需登录。原始轨迹、运行详情、攻击链证据、授权记录和写操作需要在设置页输入 `AGENTGUARD_WRITE_TOKEN`。

## 本地运行

### 后端

```powershell
cd backend
uv sync --all-groups
$env:AGENTGUARD_ENVIRONMENT='development'
$env:AGENTGUARD_ALLOW_ANONYMOUS_WRITES='true'
uv run uvicorn app.main:app --reload --port 8000
```

### 前端

```powershell
cd frontend-apple
npm install
$env:VITE_USE_MOCK='false'
$env:VITE_API_BASE='http://127.0.0.1:8000'
npm run dev
```

### 验证

```powershell
cd backend
uv run pytest
cd ../frontend-apple
npm run typecheck
npm run lint
npm run build
npm run test:smoke
npm run test:api
```
