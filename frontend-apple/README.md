# AgentGuard 智测盾 · 前端平台

队员 C（平台与集成）交付物。执行周期 2026-10-15 — 2026-11-18。

---

## 一条命令启动

```bash
cd frontend-apple
npm install
npm run dev                    # http://127.0.0.1:5173
```

默认 `VITE_USE_MOCK=true`，页面直接可点，无需后端。

### 切换到真实后端

```bash
# 修改 .env
VITE_USE_MOCK=false
VITE_API_BASE=            # 留空时由 Vite 将 /api 代理到 http://127.0.0.1:8000
```

页面代码零改动 —— 这是全项目唯一的数据源切换点。

## GitHub Pages

GitHub Pages 地址：

<https://ljtatm5-crypto.github.io/AgentGuard_-/>

Pages 构建使用 `VITE_USE_MOCK=true` 和仓库子路径 `/AgentGuard_-/`。`main` 分支更新后，
`.github/workflows/pages.yml` 会自动构建并部署静态前端；FastAPI 后端不会运行在
GitHub Pages 上。

---

## 分支策略（硬性）

```
feature/c-*  ┐
feature/a-*  ├─► dev ──► main
feature/b-*  ┘   （联调）  （演示）
```

- feature 分支**禁止**直连 main；仓库分支保护应拒绝目标分支不是 `dev` 的 feature PR
- 合并进 `dev` 前必须通过：Lint + 类型检查 + Mock 自检 + 构建 + P0 冒烟
- `main` 只接受来自 `dev` 的 PR，用于演示基线

---

## 目录结构

```
src/
├─ types/
│  ├─ enums.ts          枚举单一来源（状态/严重等级/判定来源/风险类型）
│  └─ api.ts            团队公共契约类型
├─ api/
│  ├─ client.ts         ★ 唯一数据出入口，Mock/真实切换点
│  └─ schemas.ts        Zod 运行时校验，响应不符契约立即失败
├─ mock/
│  ├─ handlers.ts       11 个接口的 Mock 实现
│  └─ fixtures/         六类 P0 用例、轨迹事件、Finding 与攻击链
├─ components/          四态容器 AsyncBoundary、标签组件
├─ pages/               6 大页面
├─ hooks/useAsync.ts    统一取数与重试
└─ styles.css
```

---

## 六类 P0 用例（Mock 种子数据）

| 用例 | 风险类型 | 判定方式 |
|---|---|---|
| tc-p0-001 | 正常对照 | 规则 |
| tc-p0-002 | 直接提示词注入 | 规则 + 语义 |
| tc-p0-003 | 间接提示词注入 | 规则 + 语义 |
| tc-p0-004 | 记忆污染 | 规则 |
| tc-p0-005 | 工具越权 | 规则 |
| tc-p0-006 | 目标漂移 | 规则 + 语义 |

每条 Finding 的证据都可回指 `run_id + case_id + event_ids`。

Agent 资产页支持从客户界面接入对话型、RAG、工具调用和工作流智能体。当前版本先接入
本地安全沙盒完成连接测试，自建 Dify 和内部授权环境仍要求服务端网关与授权记录。

测试集页面支持固定规则模板生成，也支持在 API 模式下调用自建模型生成候选。AI 候选
必须经人工确认后保存；Mock 模式会明确标注候选未调用真实模型。

核心工作区包括紧凑 Agent 资产目录、逐条可编辑的测试工作室、三栏执行轨迹、事件级
攻击链节点图和逐用例修复差异。实时任务队列与 PDF 报告属于后续生产化范围，详见
`docs/workspace-redesign.md`。

---

## 红线约束在代码中的体现

| 约束 | 实现位置 |
|---|---|
| 规则判定优先，模型只补充 | `types/enums.ts` 的 `JudgeSource`；页面与报告显式展示判定来源与规则占比 |
| 只打自建靶场，禁止真实外部站点 | `Agent.authorized_scope.external_target_allowed` 恒为 `false`，Agent 页显式标注「禁止外部站点目标」；危险工具仅 `virtual_write` |
| 指标不得写死目标数字 | `Metrics` 中 `target_benchmarks` 与实测字段分离，页面分列渲染 |
| 不宣称读取模型不可见思维过程 | 轨迹只记录 input/retrieval/tool/policy/response/error 六类外部可观察事件 |
| 不在前端硬编码掩盖接口不一致 | Zod 校验失败抛 `CONTRACT_MISMATCH`，页面显示可读错误而非静默兜底 |

---

## 冒烟测试

```bash
npm run test:smoke:install   # 首次：下载 chromium
npm run test:smoke
npm run test:api             # 启动本地 FastAPI，验证 /api/v2 真实契约
```

覆盖：8 条契约路由可访问、导航切换、四态不卡在 loading/error、授权范围标注、攻击链证据跳转与真实 API 权限展示。

另有 `npm run test:screenshots` 可重新生成 `docs/screenshots/` 下的桌面与移动端演示截图。

---

## 与 A/B 的交接

桌面页面统一调用版本化契约 `/api/v2`，避免误连仍保留兼容行为的旧 `/api` 接口。

| 接口 | 生产者 | C 的验收方式 |
|---|---|---|
| `GET /api/v2/agents` | B | 页面能查看自建靶场资产与授权范围 |
| `GET /api/v2/test-suites` | A | 页面可选择测试集并查看版本 |
| `POST /api/v2/runs` | A | 任务不会被前端硬编码 |
| `GET /api/v2/runs/{id}` | A | 页面可定位失败原因 |
| `GET /api/v2/runs/{id}/trace` | A、B | 事件、工具、参数、错误可追溯 |
| `GET /api/v2/findings/{id}/chain` | B | 节点可定位到证据 |
| `GET /api/v2/metrics` | A | 指标来自原始记录 |

字段不一致时：建接口 issue 通知生产者，**不在前端加临时字段绕过**。
