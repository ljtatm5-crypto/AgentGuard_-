# 运行证据

## 生产环境

- 前端：https://agent-guard-kohl.vercel.app
- 后端：https://agentguard-api-three.vercel.app
- 数据库：Neon PostgreSQL
- 前端生产部署：`dpl_9GXWdxMRNAkWRQ2iH7uxQsL2w2bE`
- 后端生产部署：`dpl_AS2mQGA6wwy1xxZCjQA69GQkRaeK`

## 文件

- `campus_baseline.json/csv`：本地确定性靶场 V1.0/V2.0 复现结果。
- `campus_production_baseline.json/csv`：Vercel + Neon PostgreSQL 生产复验结果，52 条逐用例记录。
- `neon_cross_deployment_persistence.json`：两个生产 Run 在两次重新部署后仍返回 200。
- `neon_alembic.json`：线上 Alembic 当前版本 `0002_case_ground_truth (head)`。
- `live_frontend_verification.json`：7 个生产主路由的 Playwright 验收结果，控制台错误为 0。
- `production_access_control_verification.json`：生产匿名/错误令牌/正确令牌、私有轨迹与正式指标验收。
- `页面截图/`：生产总览、Agent、测试集、运行记录、攻击链、报告、设置页面。
- `evidence_manifest.json`：以上文件的 SHA-256 清单。

## 关键 Run ID

- V1.0：`225dc1e7-8e45-40af-9aec-dfa824cdf6f1`，7 通过 / 19 失败。
- V2.0：`88e67ed6-972e-4656-b4e7-c17b46a3085f`，26 通过 / 0 失败。

## 数据来源

- 生产：`deterministic-production-campus-agent`
- 本地复现：`deterministic-local-campus-agent`

说明：这些是确定性校园靶场的真实执行结果，不是真实 LLM/Dify 结果。

## 当前未包含的证据

- 真实 Dify 调用日志：`BLOCKED`
- 真实大模型生成/Judge 记录：`BLOCKED`
- 80 条人工审核结果：`NOT_RUN`
- 演示视频：`TODO`