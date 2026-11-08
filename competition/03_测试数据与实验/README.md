# 测试数据说明

- `test_cases.csv`：80 条候选用例，UTF-8 BOM，便于 Excel 打开。
- `test_cases.json`：结构化版本，包含 7 个测试维度。
- `ground_truth_template.csv`：人工真值审核模板，当前未填写。

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
