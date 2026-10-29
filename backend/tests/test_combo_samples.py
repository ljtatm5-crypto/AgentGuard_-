"""组合风险样本的验收测试（P1）。

组合链不是"多跑几条单点样本"，而是要求**整条链任何一跳都不得放行**。
这里只校验样本定义本身的结构与判定规则；真实触发仍由执行器跑。
"""
from __future__ import annotations

from app.security.samples import TEAM_RISK_TAG, build_samples, build_suite

CHAIN_RULE_TYPES = {"no_write_allowed", "no_untrusted_instruction",
                    "no_sensitive_scope", "memory_key_not_written"}


def _combos():
    return [s for s in build_samples() if s.chain_of]


def test_combo_samples_exist():
    combos = _combos()
    assert len(combos) >= 3, "至少要有三条组合链"
    ids = {c.sample_id for c in combos}
    assert {"AG-C-001", "AG-C-002", "AG-C-003"} <= ids


def test_combo_chain_records_its_sources():
    for combo in _combos():
        assert len(combo.chain_of) >= 2, f"{combo.sample_id} 应至少串联两个单点样本"
        known = {s.sample_id for s in build_samples() if not s.chain_of}
        for source in combo.chain_of:
            assert source in known, f"{combo.sample_id} 引用了不存在的样本 {source}"


def test_combo_samples_are_multi_step():
    for combo in _combos():
        assert len(combo.steps) >= 2, f"{combo.sample_id} 必须多轮，否则不是链"
        for step in combo.steps:
            assert step.get("input"), f"{combo.sample_id} 有空的步骤输入"
            assert step.get("session") == "same", f"{combo.sample_id} 的步骤必须在同一会话"


def test_combo_samples_carry_blocking_rules():
    for combo in _combos():
        rule_types = {rule["type"] for rule in combo.rules}
        assert rule_types & CHAIN_RULE_TYPES, f"{combo.sample_id} 没有阻断类判定规则"
        assert combo.severity in {"high", "critical"}, f"{combo.sample_id} 严重等级偏低"


def test_combo_samples_map_to_team_risk_tags():
    for combo in _combos():
        assert combo.risk_type in TEAM_RISK_TAG, f"{combo.sample_id} 的风险类型没有团队映射"


def test_combo_samples_keep_limits():
    for combo in _combos():
        assert combo.limits["max_iterations"] == 1
        assert combo.limits["max_concurrency"] <= 2
        assert combo.limits["max_tokens"] <= 2048


def test_suite_includes_combos():
    suite, cases = build_suite()
    ids = {case.id for case in cases}
    for combo in _combos():
        assert combo.sample_id in ids
    assert len(ids) == len(cases), "用例 id 不能重复"
    assert len(suite.case_ids) == len(cases)
