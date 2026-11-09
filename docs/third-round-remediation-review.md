# AgentGuard 第三轮整改审查矩阵

- 基线提交：`a9913d2`
- 整改分支：`feature/third-round-remediation`
- 审查日期：2026-11-09
- 状态口径：`PASS` 已实际验证；`IN_PROGRESS` 正在收尾；`BLOCKED` 缺外部条件；`NOT_RUN` 尚未执行。

| 问题 | 严重度 | 当前证据 | 状态 | 验收标准 |
|---|---|---|---|---|
| 风险 F1 使用 `risk_tag` 推断真值 | P0 | 新增按用例、Agent 身份和版本共同绑定的 `ground_truth`；仅 `reviewed` 且身份匹配的样本进入指标；`risk_tag` 只表示攻击意图 | PASS（生产复验） | 独立真值可复算，未审核样本不污染 F1 |
| 公开 GET 暴露原始证据 | P0 | 私有读取中间件覆盖运行详情、轨迹、攻击链、授权记录和非演示资产；匿名摘要脱敏 | PASS（生产复验） | 匿名 401、错误令牌 403、有效令牌 200 |
| 宽松文本规则误判通过 | P0 | 删除“包含来源/知识库词语即 PASS”；证据不足进入 `needs_review` | PASS | 事实错误但格式正确的回答不得通过 |
| 80 条候选未人工审核 | P0 | 80 条全部 `pending_human_review`，审核工作表与状态校验已建立 | IN_PROGRESS | 每条有真实审核人、时间和最终标签 |
| 真实 Dify/LLM 实验未完成 | P0 | 适配器与接入清单存在，但缺少授权地址和模型凭据 | BLOCKED | 保存真实调用 ID、模型、Prompt、脱敏轨迹与结果 |
| 同步批量执行稳定性 | P1 | 执行前持久化全部待执行行，每 5 条提交一次；远程请求 30 秒超时；中断后显示未完成并保留已完成批次 | PASS（本地故障注入，已部署生产） | 模拟异常后任务保持 `pending`，已完成批次仍可查询 |
| 全局限流未实现 | P1 | 当前为 Vercel 单进程内存限流，能力接口明确返回 `per_process` | NOT_RUN | 多实例共享限额或托管队列 |
| 前端运行环境文案不准确 | P2 | `/api/v2/capabilities` 返回环境、数据库、模型、令牌与限流范围；设置页与报告按真实能力显示 | PASS | 不再用 `USE_MOCK=false` 推断“本地” |

## 确定性基线指标

- 真值文件：`competition/03_测试数据与实验/ground_truth_seeded_26.csv`
- 复算脚本：`competition/scripts/recompute_ground_truth_metrics.py`
- 证据：`competition/04_运行证据/ground_truth_metrics_recomputed.json`
- 复算结果：TP 19 / FP 0 / FN 0 / TN 33，Precision 100%、Recall 100%、F1 100%。
- 生产鉴权与指标证据：`competition/04_运行证据/production_access_control_verification.json`。
- 生产前端验收：7 个主路由 200，控制台错误 0。

该结果只证明确定性校园靶场 V1.0 缺陷与 V2.0 修复的回归效果，不代表真实 LLM/Dify 的安全准确率。

## 未完成项

- 真实 Dify / 真实模型端到端实验：`BLOCKED`。
- 80 条候选集人工审核：`pending_human_review`。
- 5–10 分钟演示视频：`NOT_RUN`。
- 多实例全局限流与异步 Worker：`NOT_RUN`。