# P0 开发基线与验收矩阵

| 责任人 | 必须先完成 | 代码落点 | 验收证据 |
|---|---|---|---|
| A | 固定规则与禁止项 | `backend/app/services/judge.py` | 规则命中不可被 LLM 覆盖的单元测试 |
| B | 自建/授权靶场和目标白名单 | `backend/app/core/target_scope.py` | 公网非白名单目标被拒绝的单元测试 |
| C | Mock 数据和全部页面路由 | `frontend-apple/src/mock`、`frontend-apple/src/App.tsx`、`frontend-apple/src/pages` | `npm run check:mock`、`npm run test:smoke` 与 `npm run build` |

## 当前 P0 页面路由

| 路由 | 页面 | Mock 数据对象 |
|---|---|---|
| `/overview` | 验证控制台 | Metrics、TestRun、Finding |
| `/agents` | Agent 资产与授权 | Agent |
| `/test-suites` | 测试集与固定规则 | TestSuite、TestCase |
| `/runs` | 批量执行列表 | TestRun |
| `/runs/:id` | 运行判定与轨迹 | TestRun、TraceEvent |
| `/findings` | 缺陷与攻击链 | Finding |
| `/reports` | 效果验证与回归 | Metrics |
| `/settings` | 团队约束与联调模式 | 环境配置 |

Mock 指标仅用于页面联调，不能写成比赛实测效果。比赛报告中的通过率、风险检出率、延迟和修复效果，必须由自建/授权靶场的真实运行记录与人工复核表产生。
