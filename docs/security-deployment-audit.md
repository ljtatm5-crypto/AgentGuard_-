# AgentGuard 安全与部署审计

审计日期：2026-11-08  
审计范围：FastAPI `/api` 与 `/api/v2`、授权记录、Agent 接入、LLM/Dify 调用边界、Vercel 部署配置。

## 结论

公开读接口可以继续服务于比赛演示；所有写接口现在默认拒绝匿名调用。只有配置服务端操作员令牌，或在本地/测试环境显式开启匿名写入时，才允许创建任务、生成用例、修改授权记录等操作。

CORS 仅用于浏览器跨域策略，不作为身份认证。

## 发现与处理

| 等级 | 问题 | 位置 | 处理状态 |
|---|---|---|---|
| P0 | 授权记录可匿名创建和撤销 | `backend/app/api/authorizations.py` | 已由全局写接口中间件保护 |
| P0 | 测试任务、用例生成、复核等写接口可匿名调用 | `backend/app/api/desktop.py`、其余 API | 已由全局写接口中间件保护 |
| P0 | 生产默认允许测试触发高成本执行 | 应用配置 | 默认改为只读；写操作需要令牌 |
| P1 | 没有速率限制 | 应用入口 | 已增加按操作员/实例的滑动窗口限制 |
| P1 | 没有请求体大小限制 | 应用入口 | 已增加默认 1 MiB 上限 |
| P1 | 缺少写操作审计 | 应用入口 | 已增加结构化审计日志与 request id |
| P1 | 同步批量执行没有规模上限 | `backend/app/api/desktop.py` | 已增加 `AGENTGUARD_MAX_CASES_PER_RUN`，默认 40 |
| P1 | Vercel `/tmp` SQLite 不持久 | 部署配置 | 未解决，迁移 Neon PostgreSQL 为下一阶段 |
| P1 | 真实模型任务仍需异步 Worker | 执行链路 | 未完成；当前先限制同步任务规模 |
| P2 | 审计日志只进入运行日志，未持久化 | 应用入口 | 待接 PostgreSQL 审计表 |
| P2 | 限流为单实例内存实现 | 应用入口 | Vercel 多实例下需改用外部限流/网关 |

## 最小安全方案

1. Vercel 后端设置 `AGENTGUARD_ENVIRONMENT=production`。
2. 设置 `AGENTGUARD_WRITE_TOKEN`，类型使用 sensitive/encrypted，不写入前端构建变量。
3. 保持 `AGENTGUARD_ALLOW_ANONYMOUS_WRITES=false`。
4. 演示人员在设置页输入操作员令牌，令牌仅保存在浏览器 sessionStorage。
5. 本地测试若要跳过登录，可显式设置 `AGENTGUARD_ALLOW_ANONYMOUS_WRITES=true`，生产环境禁止。

## 验证记录

| 检查 | 结果 |
|---|---|
| 公共 GET 不需要令牌 | PASS |
| POST 无令牌返回 401 | PASS |
| POST 错误令牌返回 403 | PASS |
| POST 正确令牌可执行 | PASS |
| 本地显式匿名模式可用 | PASS |
| 超过写操作频率返回 429 | PASS |
| 超过请求体上限返回 413 | PASS |
| 后端 pytest 全量 | PASS（107 项） |
| TypeScript typecheck | PASS |
| ESLint | PASS |
| Vite production build | PASS |

## 仍未解决

- PostgreSQL 持久化：需要 Neon/Vercel 集成凭据与数据库迁移。
- 多实例一致限流：需要外部存储或边缘网关。
- 持久化审计表：随 PostgreSQL 迁移一并实现。
- 真实 Dify/LLM 实验：需要授权靶场地址与模型凭据，当前标记 BLOCKED，不伪造结果。
