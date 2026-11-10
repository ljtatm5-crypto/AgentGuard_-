# AgentGuard 多平台适配能力矩阵

最后更新：2026-11-11

状态口径：

- `PASS`：代码、契约测试和当前可执行环境均已验证。
- `BLOCKED`：代码或文档已准备，但缺少真实靶场、模型或凭据，未产生真实模型实验。
- `DESIGNED`：只完成协议与接入设计，尚未实现。

## 一、平台组合

| 平台 | 角色 | 当前状态 | 证据 |
|---|---|---|---|
| Campus V1/V2 | 确定性安全靶场 | PASS | 26 条基线生产运行记录 |
| Dify | RAG / 多轮真实平台 | 代码与契约 PASS；真实运行 BLOCKED | `test_multi_platform_adapters.py` |
| FastGPT | RAG / 工作流跨平台实例 | 代码与契约 PASS；真实运行 BLOCKED | `test_multi_platform_adapters.py`、FastGPT 接入 API 测试 |
| Langflow | 工作流协议备选 | DESIGNED | `docs/langflow-adapter-design.md` |

## 二、可观测能力

| 能力 | Campus | Dify | FastGPT |
|---|---|---|---|
| 问答 | 支持 | 支持 | 支持 |
| 多轮会话 | 支持 | 使用 `conversation_id` | 使用 `chatId` |
| RAG 事件 | 模拟检索事件 | 平台返回 `retriever_resources` 时记录 | `detail=true` 且 `responseData` 中存在检索节点时记录 |
| 工具事件 | 模拟工具事件 | 只有响应明确返回时记录 | `responseData` 中存在工具节点时记录 |
| 工作流节点 | 有限模拟 | 依赖 Dify 实际返回 | 只做部分映射，不推断内部节点 |
| 长期记忆 | 模拟验证 | 未验证 | 未验证 |
| Token 用量 | 不适用 | 只使用平台返回的 usage | 顶层 usage 不作为真实消耗，优先读取 detail 节点用量 |

## 三、证据等级

- `observable`：本次响应至少包含检索、工具、策略或记忆事件。
- `partial`：只有输入与最终响应可观测。
- `unavailable`：请求失败或平台未返回可解析内容。

AgentGuard 只展示实际收到的事件；没有返回的检索、工具、工作流节点不会被补造成真实轨迹。

## 四、会话隔离

- 每个测试用例由执行器生成独立 `session_id`。
- Dify：第一轮发送空 `conversation_id`，成功后保存，后续轮次复用；用例结束后释放。
- FastGPT：同一用例使用稳定 `chatId`，不同用例使用不同 `chatId`；用例结束后释放。
- 网络错误或非法响应不会更新会话引用，避免错误状态污染后续轮次。

## 五、当前阻塞

1. 当前 Windows 执行环境没有可用 Docker，无法启动真实 Dify/FastGPT。
2. 未配置 `AGENTGUARD_DIFY_KEY`、`AGENTGUARD_FASTGPT_KEY` 或本地模型服务。
3. 因此真实模型实验、跨平台安全结论和准确率均不得标记为已完成。

真实靶场接入步骤见 `docs/dify-target-runbook.md` 与 `docs/fastgpt-target-runbook.md`。