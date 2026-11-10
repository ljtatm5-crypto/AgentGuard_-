# Langflow 适配设计（P2，本次不实现）

最后更新：2026-11-11

Langflow 适合验证不同工作流协议，但需要独立的请求/响应映射。

计划接口：

```text
POST /api/v1/run/{flow_id_or_name}
```

计划字段：

- `input_value`：当前轮用户输入；
- `session_id`：每个测试用例独立；
- `x-api-key`：服务端环境变量读取；
- `output_type` / `input_type`：按部署版本确认。

适配器需要新增：

1. `langflow_authorized` 连接模式；
2. 独立的 Flow ID 配置；
3. 响应文本提取；
4. 只在响应明确返回时记录检索/工具节点；
5. 不可观测能力显式标注；
6. 目标白名单、授权记录、DNS 固定和重定向限制复用现有门禁。

本次不实现。只有在 Dify 与 FastGPT 产生充分真实证据后，才考虑接入。