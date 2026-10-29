# 队员 C：桌面版前端交互集成交付

位置：`D:\传智杯agent\agentguard\frontend-apple`。

## 完成的交互

- 保留原六条页面路由、侧栏文案与已有测试标识。
- 桌面端唯一 API 前缀统一为 `/api/v2`，Mock 与真实请求共用 `src/api/contract.ts` 中的路由常量。
- 资产页保留自建／授权内部靶场范围展示，校验状态使用中文；资产知识库与权限表、测试集表、任务与判定表、缺陷表、版本对照表均使用可键盘访问的 `.table-scroll` 容器。
- 测试集查看用例与攻击链详情可展开、切换和收起。
- 创建任务前校验 Agent 与测试集选择；加载期间禁用选择器；资产接口失败可重试。创建成功刷新任务列表并打开返回的运行 ID，保持服务返回的实际状态。
- 任务页“刷新”同时更新列表、当前判定和轨迹，未产生结论时展示说明。
- 攻击链使用真实路由链接 `/runs?run=…&case=…&events=…`。任务页读取查询参数、加载对应运行、标记用例与轨迹事件，并滚动聚焦；刷新页面仍可定位。找不到原证据会给出说明，“清除定位”保留已选任务。
- `AsyncBoundary` 支持骨架、可重试错误和通用空态，保留原有 loading/error/empty/retry 测试标识。
- 报告按钮读取导出时的指标、运行、缺陷与每次运行的详情，在浏览器实际下载 Markdown 和 UTF-8 BOM CSV。也提供两种格式的单独下载按钮。详情局部失败会在报告注明缺失运行，不伪造结论。
- 导出标注 `Mock 示例数据` 或 `本地 API 运行数据`；包含运行/测试集版本、判定理由与来源、证据事件、人工复核字段、指标口径与限制。目标值单列，不当作实际结果。
- 导出不读取 Agent 凭据或原始工具参数；选定文本字段过滤常见令牌，CSV 转义引号、逗号、换行，并防止文本单元格公式注入。

## CSS 接口

全局视觉由主 agent 维护。本次复用现有 class，并增加：

| 选择器 | 用途 |
| --- | --- |
| `.agents-page` / `.suites-page` / `.runs-page` / `.findings-page` / `.reports-page` | 次级页面根节点 |
| `.table-scroll` | 各表格独立水平滚动；需 `max-width:100%; overflow-x:auto; min-width:0` |
| `.panel-toolbar` / `.detail-head` / `.btn-icon` | 标题、操作与详情收起按钮 |
| `.skeleton-stack` / `.skeleton-line` / `.skeleton-wide` / `.skeleton-short` | 加载骨架 |
| `.state-loading` / `.state-icon` | 状态容器与 Phosphor 图标 |
| `.trace-focus-banner` / `.trace-focused` / `.trace-case-focused` | 证据提示、轨迹事件、判定行强调 |
| `.launch-panel` / `.run-progress` | 启动区与任务完成进度，`--run-progress` 为百分比 |
| `.export-panel` / `.export-actions` / `.export-status` | 下载操作与结果反馈 |
| `.sr-only` / `.eyebrow` | 隐藏操作列标题、详情运行 ID |

定位滚动遵守系统减少动态效果偏好。表格滚动容器有 `tabIndex=0` 和说明，图标按钮都有可读名称。

## 验证

新增 `e2e/flows.spec.ts`，覆盖：用例展开收起、选择校验和任务创建、证据跳转与刷新保留、两种文件的实际下载与来源标识、390px 任务页无横向溢出。原 `e2e/smoke.spec.ts` 保留。

集成后运行：`npm run typecheck`、`npm run check:mock`、`npm run test:smoke`。浏览器验收由主 agent 与整体视觉检查一并执行，避免多个进程争用 5173 端口。

## 范围与限制

- 本次已把 API 客户端、Mock 路由与真实接口统一到 `/api/v2`，并补齐生成接口的运行时校验。
- Mock 新建任务的进度取决于 Mock 提供的状态；页面不会自行变更成“通过”。实时 API 也必须返回真实状态。
- 指标聚合范围由 `computed_from_run_ids` 指定，不保证与当前运行列表全部记录相同，报告显式说明这一点。
- 本地 API 可能使用模拟适配器。页面及导出不将其称为外部 Dify 实测结果。
- 两个下载由一次点击触发；如浏览器限制多文件下载，可用成功后的单独下载按钮取得同一快照文件。
- 文本令牌过滤属于常见格式防护，不代表能够识别所有个人信息或自定义凭据；后端仍负责采集端脱敏。

---

## 补充轮次：PDF 报告、404、轨迹筛选与响应式回归

本轮在既有交互上做增量，未改动 A/B 契约、未调整视觉基调。

### PDF 报告

- 新增 `src/utils/pdf.ts`：`buildReportHtml(snapshot)` 生成自包含 A4 文档，
  `printReportHtml(html)` 通过隐藏 iframe 触发打印。
- 选择打印而非嵌入 PDF 库：中文不依赖字体子集，包体零增长；iframe 方案可避开
  异步取数之后的弹窗拦截。
- `ReportsPage` 抽出 `collectSnapshot()`，Markdown / CSV / PDF 共用同一份快照，
  三种格式字段与口径一致。
- 生成器复用 `export.ts` 的 `redactReportText()`，报告内容按不可信文本转义，
  避免 Agent 输出中的标签破坏排版。
- `scripts/render-report-sample.ts` 可用同一函数产出 `docs/samples/AgentGuard_测试报告样例.pdf`。

### 404

- 新增 `src/pages/NotFoundPage.tsx`，`App.tsx` 的 `*` 路由由重定向改为渲染 404。
- GitHub Pages 把 `index.html` 复制为 `404.html`，深层链接仍由 SPA 解析，
  只有真正不匹配的路径才落到 404，不影响既有直达链接。

### 轨迹筛选

- `RunsPage` 抽出 `TraceBrowser`，提供类型筛选、关键词搜索、仅看异常与分页渲染。
- 首屏 60 条，其余按需追加；500+ 事件场景不会一次性挂载 DOM。
- 搜索只覆盖输入、检索、工具、策略、响应、错误等可观察字段，不涉及模型内部状态。
- 证据定位（`?case=&events=`）逻辑保持不变，筛选默认全开时不干扰跳转高亮。

### 新增 CSS 接口

| 选择器 | 用途 |
| --- | --- |
| `.trace-controls` / `.trace-type-chips` / `.trace-tools` | 轨迹筛选容器与控件 |
| `.trace-search` / `.trace-issue-toggle` / `.trace-count` | 搜索框、异常开关、结果计数 |
| `.trace-empty` / `.trace-more` | 无匹配出口、分批加载按钮 |
| `.notfound-page` / `.notfound-card` / `.notfound-links` | 404 页面 |

注意：项目全局存在 `label { flex-direction: column }`，横向排列的 label 必须显式声明
`flex-direction: row`，否则图标与文字会竖排。

### 验证

- `e2e/c-completion.spec.ts`：8 项（404 三条、轨迹筛选四条、PDF 入口一条）。
- `e2e/responsive.spec.ts`：17 项（8 路由 × 浅色/深色 + 深色外观生效）。
- 原 `smoke` / `flows` / `pages` / `visual-system` 共 30 项保持通过。
