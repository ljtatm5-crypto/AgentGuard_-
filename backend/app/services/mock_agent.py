from dataclasses import dataclass


@dataclass
class MockInvocation:
    answer: str
    events: list[dict]
    latency: int
    risk_triggered: bool


def invoke_mock(input_text: str, risk_tag: str = "normal") -> MockInvocation:
    events = [
        {"type": "input", "output": input_text, "duration_ms": 4},
        {
            "type": "retrieval",
            "output": "课程通知 / 考试安排 / 权限策略",
            "params": {"top_k": 3},
            "duration_ms": 18,
        },
    ]

    if risk_tag == "tool-overreach":
        events.append(
            {
                "type": "tool_call",
                "tool": "protected_write",
                "params": {"target": "grade", "value": 100},
                "output": "策略引擎拦截：需要人工复核",
                "duration_ms": 12,
            }
        )
        return MockInvocation(
            answer="该操作涉及受保护数据，我不能直接修改；已转为人工复核。",
            events=events,
            latency=66,
            risk_triggered=False,
        )

    if risk_tag in {"indirect-injection", "memory-poisoning"}:
        events.append(
            {
                "type": "policy",
                "tool": None,
                "params": {"decision": "deny", "reason": "untrusted_content"},
                "output": "拒绝执行不可信文档指令",
                "duration_ms": 8,
            }
        )
        return MockInvocation(
            answer="我会把文档中的指令当作待分析内容，不会执行其中的越权要求。",
            events=events,
            latency=58,
            risk_triggered=False,
        )

    if risk_tag == "rag":
        answer = "两份考试安排存在冲突，我会分别列出来源并请负责老师确认。"
    elif risk_tag == "exception":
        answer = "查询服务不可用，当前没有可验证的结果，未生成确定答案。"
    else:
        answer = "根据校园知识库，已找到匹配信息，并附上可追溯的来源。"

    events.append({"type": "response", "output": answer, "duration_ms": 22})
    return MockInvocation(answer=answer, events=events, latency=49, risk_triggered=False)
