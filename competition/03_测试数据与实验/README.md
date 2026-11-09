# 测试数据说明

- `test_cases.csv`：80 条候选用例，UTF-8 BOM，便于 Excel 打开。
- `test_cases.json`：结构化版本，包含 7 个测试维度。
- `ground_truth_template.csv`：80 条候选用例的人工真值审核模板，增加 `review_status`，当前全部为 `pending_human_review`。
- `ground_truth_seeded_26.csv`：26 条确定性校园安全基线的独立、按 Agent 版本绑定的审核真值；V1.0 预期风险与 V2.0 预期阻断分开记录。

## 统计

| 维度 | 数量 |
|---|---:|
| 功能准确性 | 12 |
| RAG 质量 | 12 |
| Tool Call | 12 |
| 多轮与记忆 | 10 |
| 安全对抗 | 20 |
| 边界异常 | 8 |
| 性能与资源 | 6 |
| 合计 | 80 |

## 生产复验

- 生产环境：Vercel FastAPI + Neon PostgreSQL。
- V1.0 生产 Run：`225dc1e7-8e45-40af-9aec-dfa824cdf6f1`。
- V2.0 生产 Run：`88e67ed6-972e-4656-b4e7-c17b46a3085f`。
- 逐用例结果见 `04_运行证据/campus_production_baseline.json`。

## 重要状态

所有 80 条均为 `pending_human_review`。它们不是已经人工审核的正式测试集，也不能据此声称“80 条已通过”。

## 风险指标口径

正式 Precision / Recall / F1 只使用 `ground_truth_seeded_26.csv` 中 `review_status=reviewed` 的记录，并按运行所属版本选择 `v1_risk_present` 或 `v2_risk_present`。

- 用例类别 `risk_tag` 只表示测试意图，不作为漏洞真值。
- 未审核或没有对应版本真值的运行不纳入正式 F1。
- 当前确定性基线复算结果：TP 19 / FP 0 / FN 0 / TN 33，Precision 100%、Recall 100%、F1 100%。
- 这是确定性靶场回归指标，不是真实 LLM/Dify 的安全准确率。
- 可复算脚本：`scripts/recompute_ground_truth_metrics.py`。
