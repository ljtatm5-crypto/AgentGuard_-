# AgentGuard 智测盾竞赛交付包

本目录按传智杯路径二“智能体测试工具开发”组织。

## 目录

- `01_作品介绍文档/`：作品说明书
- `02_技术方案/`：架构、AI 能力、创新点与流程图
- `03_测试数据与实验/`：80 条候选用例、人工真值模板、实验分析
- `04_运行证据/`：确定性校园靶场真实运行记录
- `05_演示与使用说明/`：快速运行、安全边界、视频脚本
- `06_源码与开源说明/`：仓库地址
- `07_作品声明/`：原创与获奖情况
- `scripts/`：数据校验、基线实验、文档渲染、生产截图、证据清单和打包脚本

## 可复现脚本

- `validate_dataset.mjs`：校验 80 条候选用例结构与分类统计。
- `run_campus_baseline.py`：本地或生产 API 的 V1.0/V2.0 确定性靶场实验。
- `render_documents.mjs`：从 Markdown 生成 HTML、A4 PDF 和第一页 PNG。
- `capture_live_evidence.mjs`：Playwright 验收生产 7 个路由并截图。
- `build_evidence_manifest.mjs`：生成运行证据 SHA-256 清单。
- `run_all_checks.ps1`：执行本地全量门禁。
- `package_submission.ps1`：从 Git HEAD 生成最终 ZIP。

## 当前事实

- 确定性校园 Agent 的 26 条安全基线已在 Vercel + Neon PostgreSQL 生产环境执行：V1.0 为 7/26 通过，V2.0 为 26/26 通过。
- 两个生产 Run ID 经历重新部署后仍可读取，证明记录持久化在 Neon 而不是临时 SQLite。
- 80 条正式候选用例已生成并通过结构校验，但全部标记为 `pending_human_review`；人工审核仍未完成。
- 真实 Dify / 真实大模型实验尚未执行，原因为缺少授权靶场地址和模型凭据，状态为 `BLOCKED`。
- 生产前端 7 个主路由均已通过 Playwright 实际访问，控制台错误为 0。
- 不得把 Mock、规则模板或确定性靶场结果写成真实大模型测试结果。
