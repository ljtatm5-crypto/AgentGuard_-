# AgentGuard 智测盾 · 队员 C 交付包

**交付人**：队员 C（平台与集成负责人）
**代码基线**：`frontend-apple`（GitHub `main`）
**在线演示**：<https://ljtatm5-crypto.github.io/AgentGuard_-/>
**内容**：前端平台源码、Mock 数据、视觉系统、演示截图、报告样例、契约与运行文档

---

## 一、启动

```bash
cd frontend-apple
npm install
npm run dev            # http://127.0.0.1:5173
```

默认 `VITE_USE_MOCK=true`，无需后端即可走完整个流程。
切换真实后端：`.env` 中设 `VITE_USE_MOCK=false`，页面代码零改动。

---

## 二、本轮交付的两个状态

| 状态 | 说明 |
|---|---|
| 整合前 | 已完成 Aurora Glass 视觉系统、8 条契约路由、三栏执行工作区、Evidence Flow、Mock/API 双模式 |
| 本轮完善后 | 在既有基线上补齐 C 报告中的 P1/P2 缺口，未改动 A/B 的契约与视觉风格 |

**本轮只做增量，不重写已有模块**——所有改动可按文件对照，便于评审复核。

---

## 三、本轮改动清单

### 1. PDF 报告导出（原 P1 缺口）

| 项 | 内容 |
|---|---|
| 新增 | `src/utils/pdf.ts` — `buildReportHtml()` + `printReportHtml()` |
| 修改 | `src/pages/ReportsPage.tsx` — 抽出 `collectSnapshot()`，三种格式共用同一快照 |
| 入口 | 报告页「导出 PDF（A4 打印）」 |
| 实现 | 生成自包含 A4 文档 → 隐藏 iframe 触发打印，不引入 PDF 库、不嵌入字体 |
| 为什么这样做 | 中文不依赖字体子集，包体不增加；打印对话框「另存为 PDF」即得成品 |
| 证据 | `docs/samples/AgentGuard_测试报告样例.pdf`（306 KB，由同一函数渲染） |

### 2. 真实 404 页面（原 P2 缺口）

| 项 | 内容 |
|---|---|
| 新增 | `src/pages/NotFoundPage.tsx` |
| 修改 | `src/App.tsx` — `*` 路由由「重定向到 /overview」改为渲染 404 |
| 行为 | 显示错误路径、返回工作台、四个常用入口、Ctrl+K 提示 |
| 兼容 | 深层链接（`/runs/run-001`）仍由 SPA 正常解析，不被 404 劫持 |

### 3. 轨迹筛选与大轨迹性能（原 P2 缺口）

| 项 | 内容 |
|---|---|
| 修改 | `src/pages/RunsPage.tsx` — 新增 `TraceBrowser` 组件 |
| 新增 | `src/trace-controls.css` |
| 能力 | 按事件类型筛选（带计数）、关键词搜索（工具/输出/参数/错误）、仅看异常与拒绝、分页渲染 |
| 性能 | 首屏 60 条，其余按需追加；500+ 事件时不会一次性挂载 |
| 边界 | 搜索仅覆盖可观察字段，不涉及模型内部状态 |

### 4. 移动端与深色外观回归（原 P2 缺口）

| 项 | 内容 |
|---|---|
| 新增 | `e2e/responsive.spec.ts` — 17 项 |
| 范围 | 8 条路由 × 浅色/深色 × 390×844，断言无横向溢出且标题可见 |

### 5. 演示与工程配套

| 项 | 内容 |
|---|---|
| 新增 | `scripts/render-report-sample.ts` — 生成 PDF 样例 |
| 新增 | `scripts/shoot-completion.mjs` — 生成本轮界面截图 |
| 新增 | `playwright.local.config.ts` — 浏览器二进制受限时复用系统 Edge |
| 修改 | `README.md`、`DELIVERY.md`、`docs/` 同步 |

### 6. 第二轮自查修复（提交前）

| 问题 | 修复 |
|---|---|
| 打印后 1.5s 强制移除 iframe，Firefox/Safari 可能中断打印 | 改为监听 `afterprint` 再移除，并等 `document.fonts.ready` 后再打印 |
| 证据深链指向第 61 条之后时，分批渲染导致目标事件不渲染、无法聚焦 | 抽出 `src/utils/trace.ts` 的 `buildTraceView()`，保证聚焦事件必在渲染范围 |
| 未知路径继承 `NAV[0]`，页面标题与面包屑误显示「总览」 | `AppLayout` 对未匹配路由使用「页面未找到」 |
| 轨迹筛选逻辑混在组件里、无独立验证 | 纯函数化 + `npm run check:trace`（520 条事件 7 组断言） |
| 浅色下搜索框边界过淡；404 入口排成 3+1 | 边框改 `--line-strong`；入口卡改 2×2 |

---

## 四、验证结果（本地实测）

| 检查项 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `eslint src --max-warnings 0` | 通过 |
| `check:mock` | 通过：1 Agent / 6 用例 / 3 运行 / 49 轨迹 / 4 缺陷，证据全可追溯 |
| `check:trace` | 通过：520 条事件下首屏截断、深链聚焦、筛选组合 7 组断言 |
| `vite build` | 通过 |
| 原有回归（smoke + flows + pages + visual-system） | **30 项通过，1 项跳过**（API 模式在 Mock 环境跳过） |
| 本轮新增：404 / 轨迹筛选 / PDF | **9 项通过**（含真实打印文档内容断言） |
| 本轮新增：移动端与深色 | **17 项通过** |
| 合计 `npm run test:smoke` | **56 项通过 / 1 项跳过** |
| PDF 样例渲染 | 通过，A4 排版中文无乱码 |

> 执行环境说明：本机 Playwright 浏览器二进制下载受限，使用 `playwright.local.config.ts`
> 复用系统 Microsoft Edge 完成验证；CI 仍使用 `playwright.config.ts` + 官方 chromium。

---

## 五、目录结构

```
frontend-apple/
├─ src/
│  ├─ types/         枚举单一来源 + 团队契约类型
│  ├─ api/           唯一数据出入口（Mock/API 切换点）+ Zod 校验
│  ├─ mock/          /api/v2 全部接口 Mock + 六类 P0 种子数据
│  ├─ components/    四态容器、标签、动效壳
│  ├─ pages/         8 条路由（含 404）
│  ├─ layouts/       侧边导航 + 命令面板 + 外观切换
│  ├─ utils/         export.ts（MD/CSV）、pdf.ts（PDF）
│  ├─ tokens.css / aurora.css / workspaces.css / trace-controls.css
│  └─ main.tsx       入口（含 Mock 条件启动）
├─ e2e/              smoke / flows / pages / visual-system / api / screenshots / c-completion / responsive
├─ scripts/          check-mock、render-report-sample、shoot-completion、test-*.ps1
├─ docs/             API_CONTRACT、MOCK_SPEC、DEMO_RUNBOOK、设计说明、报告样例、截图
└─ .github/workflows ci.yml（门禁）、pages.yml（Pages 部署）
```

---

## 六、仍未闭环的事项

| 项 | 状态 | 原因 |
|---|---|---|
| 实时任务进度（SSE/轮询） | 未做 | 依赖 A 提供进度查询或事件接口 |
| 视觉回归像素门禁 | 部分 | 已有字号/溢出/组件的规则化检查，尚未把像素差异设为 CI 阻断项 |
| API 模式 8 路由全量回归 | 部分 | `e2e/api.spec.ts` 覆盖真实契约与权限，但未覆盖全部路由与导出流程 |
| 自建 Dify 页面级联调 | 待 B | 需授权编号、白名单与靶场环境 |

> 以上四项在 C 的报告中按实际状态描述，不宣称已完成。
