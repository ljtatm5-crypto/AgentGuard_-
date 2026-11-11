"""Product-grounded tutorial flows exposed by XiaoAn."""
from __future__ import annotations

TUTORIALS = [
    {
        "id": "first-test",
        "title": "完成第一次智能体安全测试",
        "description": "从选择 Agent 到查看总结论，完成一次可追溯测试。",
        "page": "/overview",
        "steps": [
            {"title": "确认测试对象", "detail": "打开 Agent 资产页，选择现有 Agent 或创建本地安全沙盒。", "route": "/agents", "action_label": "前往 Agent 资产"},
            {"title": "选择测试集", "detail": "在测试集页查看安全基线用例，确认覆盖范围和预期行为。", "route": "/test-suites", "action_label": "查看测试集"},
            {"title": "启动执行任务", "detail": "在执行任务页选择 Agent 和测试集，点击启动任务。", "route": "/runs", "action_label": "前往执行任务"},
            {"title": "阅读总结论", "detail": "查看未通过、通过或待确认结论，并优先处理失败项。", "route": "/runs", "action_label": "查看任务"},
            {"title": "修复后回归", "detail": "使用相同测试集复测，在报告页比较修复前后结果。", "route": "/reports", "action_label": "打开报告"},
        ],
    },
    {
        "id": "agent-integration",
        "title": "接入并校验一个 Agent",
        "description": "学习本地沙盒、Dify 和 FastGPT 的授权接入路径。",
        "page": "/agents",
        "steps": [
            {"title": "选择接入方式", "detail": "优先使用本地安全沙盒；真实平台必须选择明确授权的内部 Dify 或 FastGPT。", "route": "/agents", "action_label": "开始接入"},
            {"title": "填写目标信息", "detail": "填写内部地址、能力类型和授权记录编号，不要把 API Key 粘贴到页面。", "route": "/agents", "action_label": "填写配置"},
            {"title": "完成校验", "detail": "提交后检查 Agent 是否显示为已校验，并确认观测能力说明。", "route": "/agents", "action_label": "查看资产"},
        ],
    },
    {
        "id": "trace-diagnosis",
        "title": "阅读失败轨迹并定位证据",
        "description": "学习输入、检索、工具、策略和响应事件之间的关系。",
        "page": "/runs",
        "steps": [
            {"title": "打开任务详情", "detail": "在执行任务页点击详情与轨迹，先查看整体安全结论。", "route": "/runs", "action_label": "打开执行任务"},
            {"title": "选择失败用例", "detail": "在左侧结果列表选择失败或待复核用例。", "route": "/runs", "action_label": "查看失败项"},
            {"title": "定位关键事件", "detail": "重点查看工具调用、策略判定和工具结果，不要只看最终回答。", "route": "/runs", "action_label": "阅读轨迹"},
            {"title": "核对判定理由", "detail": "右侧判定面板会显示规则来源、置信度和证据事件编号。", "route": "/runs", "action_label": "查看判定"},
        ],
    },
    {
        "id": "remediation-regression",
        "title": "修复缺陷并完成回归",
        "description": "把失败证据转化为可执行修复和同集回归计划。",
        "page": "/findings",
        "steps": [
            {"title": "查看攻击链", "detail": "打开攻击链与缺陷页，区分已观测节点和推断关系。", "route": "/findings", "action_label": "查看缺陷"},
            {"title": "生成修复计划", "detail": "让小安基于真实 Finding 和 Trace 生成修复步骤与副作用提示。", "route": "/findings", "action_label": "询问小安"},
            {"title": "人工确认修改", "detail": "由开发者审查并实施修复，小安不能自动修改生产代码或策略。", "route": "/findings", "action_label": "查看建议"},
            {"title": "使用原测试集复测", "detail": "回到执行任务页，用同一测试集和规则重新运行。", "route": "/runs", "action_label": "开始回归"},
            {"title": "比较修复效果", "detail": "在报告页确认该用例从失败或待复核变为通过。", "route": "/reports", "action_label": "查看报告"},
        ],
    },
    {
        "id": "report-reading",
        "title": "读懂报告与回归指标",
        "description": "区分安全结论、通过率、风险指标和版本差异。",
        "page": "/reports",
        "steps": [
            {"title": "先看安全结论", "detail": "未通过表示存在明确违规；待确认不能当作通过。", "route": "/reports", "action_label": "打开报告"},
            {"title": "再看逐用例差异", "detail": "比较同一测试集的两次运行，识别已修复、仍存在和新增回归。", "route": "/reports", "action_label": "查看差异"},
            {"title": "最后看风险指标", "detail": "没有人工审核真值时，Recall、Precision 和 F1 不应作为正式成绩。", "route": "/reports", "action_label": "查看指标"},
        ],
    },
]


def tutorial_list() -> list[dict]:
    return [{key: value for key, value in item.items() if key != "steps"} | {"step_count": len(item["steps"])} for item in TUTORIALS]


def tutorial_by_id(tutorial_id: str) -> dict | None:
    return next((item for item in TUTORIALS if item["id"] == tutorial_id), None)
