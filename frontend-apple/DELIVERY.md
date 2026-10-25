# AgentGuard 智测盾 · 队员 C 交付包

**交付人**：队员 C（平台与集成负责人）
**内容**：前端平台代码、Mock 数据、演示截图、团队契约文档
**不含**：`node_modules`（执行 `npm install` 重建）、测试临时产物

---

## 目录清单

```
AgentGuard_智测盾_队员C_交付包/
├─ README.md                  启动说明与红线约束
├─ index.html                 Vite 入口
├─ package.json               依赖与脚本
├─ package-lock.json          锁定版本
├─ tsconfig.json              TS 严格配置
├─ vite.config.ts             构建配置（含 @/ 别名）
├─ playwright.config.ts       冒烟测试配置
├─ .gitignore
│
├─ src/
│  ├─ types/
│  │  ├─ enums.ts             枚举单一来源
│  │  └─ api.ts               团队公共契约类型
│  ├─ api/
│  │  ├─ client.ts            唯一数据出入口（Mock/真实切换点）
│  │  └─ schemas.ts           Zod 运行时校验
│  ├─ mock/
│  │  ├─ browser.ts           MSW Worker 启动
│  │  ├─ handlers.ts          11 个接口 Mock 实现
│  │  └─ fixtures/            六类 P0 用例、轨迹、缺陷、攻击链
│  ├─ components/
│  │  ├─ AsyncBoundary.tsx    四态容器（loading/ready/empty/error）
│  │  └─ Tags.tsx             状态与等级标签
│  ├─ hooks/useAsync.ts       统一取数与重试
│  ├─ layouts/AppLayout.tsx   侧边导航布局
│  ├─ pages/                  6 大页面
│  ├─ App.tsx                 路由定义
│  ├─ main.tsx                入口（含 Mock 条件启动）
│  └─ styles.css
│
├─ e2e/
│  ├─ smoke.spec.ts           P0 冒烟（9 条断言）
│  └─ screenshots.spec.ts     演示截图生成
│
├─ scripts/check-mock.ts      Mock 数据完整性自检
│
├─ docs/
│  ├─ API_CONTRACT.md         团队契约评审稿（需 A/B 评审冻结）
│  ├─ MOCK_SPEC.md            Mock 数据规格与六条纪律
│  ├─ DEMO_RUNBOOK.md         演示顺序、话术、降级预案
│  └─ screenshots/            9 张演示截图
│
├─ dist/                      已构建产物（可直接静态部署）
```

---

## 启动方式

```bash
cd AgentGuard_智测盾_队员C_交付包
npm install
npx msw init public/ --save
npm run check:mock     # Mock 数据自检
npm run dev            # http://127.0.0.1:5173
```

无需后端即可完整演示。切换真实后端：改 `.env` 中 `VITE_USE_MOCK=false`。

---

## 验证命令

| 命令 | 作用 |
|---|---|
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | 类型检查 |
| `npm run build` | 生产构建 |
| `npm run check:mock` | Mock 数据完整性自检 |
| `npm run test:smoke:install` | 首次下载测试浏览器 |
| `npm run test:smoke` | P0 冒烟 + 重新生成截图 |

**最近一次全量结果**：Lint ✅ / 类型检查 ✅ / 构建 ✅ / Mock 自检 ✅ / 冒烟 17/17 ✅

---

## 分支策略

```
feature/c-*  ┐
feature/a-*  ├─► dev ──► main
feature/b-*  ┘   （联调）  （演示）
```

feature 分支不得直接合并到 `main`。仓库启用分支保护后，应限制 feature PR
只能以 `dev` 为目标分支；`main` 仅用于已验证的演示版本。

---

## 待办交接事项

1. **`API_CONTRACT.md` 需 A / B 评审冻结** —— 当前类型定义按三份分工文档推导，冻结后如有出入需同步 `src/types/api.ts`、`src/api/schemas.ts`、后端 Pydantic Model 三处
2. **后端接口就绪后**，改 `.env` 的 `VITE_USE_MOCK=false` 联调，发现字段不一致走 issue 流程，不在前端加临时字段绕过
3. **ZIP 上传前**需按封版清单核对文档、代码、截图、视频的一致性，并清理密钥与个人信息
