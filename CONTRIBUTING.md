# AgentGuard 三人协作与分支门禁

## 唯一允许的合并链

```text
feature/*  ──PR/合并──>  dev  ──完整联调通过──>  main
```

- `main`：只保留可运行、可演示的稳定版本。禁止 feature 分支直接合并到 `main`。
- `dev`：唯一集成分支。三名队员的功能分支必须先合并到这里做契约、页面和 P0 闭环联调。
- Git refs 不能同时包含 `dev` 和 `dev/integration`；后者的 integration 语义由 `dev` 承担。
- `.github/workflows/ci.yml` 会拒绝非 `feature/* → dev` 和非 `dev → main` 的 PR。
- `feature/test-engine`：队员 A，测试生成、批量执行、规则判定、指标。
- `feature/security-agent`：队员 B，Dify 靶场、Agent 适配、权限策略、攻击链。
- `feature/platform`：队员 C，前端路由、Mock 数据、展示、报告、部署。

新任务从最新 `dev` 创建功能分支：

```powershell
git switch dev
git pull --ff-only
git switch -c feature/<模块名>
```

## 合并门禁

### feature → dev

1. 与 `dev` 同步，解决 Schema、接口和前端类型冲突。
2. 运行自己模块的测试，并由另一名队员复核关键页面或接口。
3. PR 描述写明：改动对象、验证命令、截图/运行证据、已知限制。
4. 不得把未经授权的外部目标地址、API Key、Cookie 或个人数据提交进仓库。

### dev → main

必须同时满足：

```powershell
cd backend
uv run pytest

cd ..\frontend-apple
npm run typecheck
npm run check:mock
npm run test:smoke
npm run test:api
npm run build
```

还要人工走通：`Agent 接入 → 测试集 → 批量执行 → 规则判定 → 轨迹 → 攻击链 → 报告`。只有全部可运行，才允许把 `dev` 合并至 `main` 供比赛演示。

## 三条不可妥协的实现规则

### A：固定规则先判，LLM 只补充

- `expected`、`forbidden`、权限矩阵、状态码、结构校验和阈值必须写成确定性规则。
- 规则命中得到的通过/失败结论是最终结论，LLM 不得推翻。
- 只有规则返回 `inconclusive` 时才允许调用 LLM；LLM 只能给出带置信度和证据的建议，
  最终状态仍为 `needs_review`，必须由人工复核确认。
- 规则集必须有版本号，当前为 `p0-2026.10`。

### B：只测试自建或明确授权靶场

- 默认仅允许 `local://` Mock。
- 自建 Dify 或授权环境需要授权记录，并将主机显式加入 `AGENTGUARD_ALLOWED_TARGET_HOSTS`。
- 即使声称“已授权”，不在白名单的公网主机仍由后端拒绝。
- 禁止扫描、探测、攻击真实外部网站；禁止真实生产写入。实验使用虚拟文件、虚拟数据库和合成样本。

### C：Mock 优先，先打通全部路由

- 前端默认 `VITE_USE_MOCK=true`，不依赖后端即可开发和演示页面。
- 路由契约：`/overview`、`/agents`、`/test-suites`、`/runs`、`/runs/:id`、`/findings`、`/reports`、`/settings`。
- 页面和路由验收完成后，再将环境变量改为 `VITE_USE_MOCK=false` 做真实 API 联调。
- Mock 与 API 必须复用同一 TypeScript 类型，禁止页面临时硬编码另一套字段。

## 共享契约

`Agent`、`TestSuite`、`TestCase`、`TestRun`、`TraceEvent`、`Finding` 是公共对象。字段修改必须同时更新：后端 Schema、接口返回、前端类型、Mock 数据和测试。

推荐提交信息：

```text
feat(test): add deterministic judge rule
fix(security): reject target outside allowlist
feat(platform): connect findings route with mock data
```
