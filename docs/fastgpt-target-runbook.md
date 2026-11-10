# FastGPT 自建靶场接入 Runbook

最后更新：2026-11-11

> 当前状态：适配器与契约测试已完成；本地 Docker 不可用且未配置模型/API Key，真实 FastGPT 实验为 `BLOCKED`。
>
> 铁律：只连接自己部署或明确授权的内网 FastGPT；不得对公网 Demo 地址执行安全测试。

## 一、部署前提

推荐使用 FastGPT 官方 Docker 部署模板，固定镜像版本，并在独立目录和独立测试数据库中运行。

最低准备：

- Docker Engine 24+ 与 Compose v2；
- 至少 2 核 4 GB，RAG 场景建议 4 核 8 GB 以上；
- 一个 Chat LLM；
- 一个 Embedding 模型；
- 一个小型校园知识库；
- 一个只读工具或安全拒绝工具；
- 仅使用虚拟数据和测试账号。

本机自检：

```powershell
docker version
docker compose version
```

若 Docker 不可用，应停在契约测试阶段并标记 `BLOCKED`，不要用 Mock 结果冒充真实实验。

## 二、创建被测应用

1. 打开 FastGPT 管理界面。
2. 创建“知识库问答”或工作流应用。
3. 配置 Chat LLM 与 Embedding。
4. 导入 `backend/app/security/knowledge/normal/` 的测试知识。
5. 只注册只读工具；禁止生产写入或真实外部网站访问。
6. 发布应用并记录 `appId`。
7. 在 OpenAPI 中生成应用 API Key，`app-` 开头。

不要将 API Key、Cookie、数据库密码或真实用户数据写入前端、Git、截图或报告。

## 三、配置 AgentGuard

服务端环境变量：

```powershell
$env:AGENTGUARD_ALLOWED_TARGET_HOSTS = "localhost,127.0.0.1,192.168.1.30"
$env:AGENTGUARD_FASTGPT_KEY = "app-你的密钥"
```

`AGENTGUARD_FASTGPT_KEY` 只是示例变量名；实际名称由接入时填写的 `credential_env` 决定，但必须存在于服务端环境。

登记授权记录：

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/authorizations `
  -H "Content-Type: application/json" `
  -d "{\"reference\":\"AUTH-FASTGPT-001\",\"owner\":\"负责人\",\"purpose\":\"自建FastGPT靶场联调\",\"target_scope\":\"self_hosted_fastgpt\",\"host\":\"192.168.1.30\",\"port\":3000,\"evidence\":\"docs/fastgpt-target-runbook.md\",\"valid_days\":1}"
```

校验 Agent：

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v2/agents/validate `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"校园助手 FastGPT靶场\",\"version\":\"v2.0\",\"agent_type\":\"rag\",\"connection_mode\":\"fastgpt_authorized\",\"endpoint\":\"http://192.168.1.30:3000/api/v1/chat/completions\",\"credential_env\":\"AGENTGUARD_FASTGPT_KEY\",\"authorization_reference\":\"AUTH-FASTGPT-001\",\"authorization_confirmed\":true,\"app_id\":\"app-你的应用ID\"}"
```

启动测试：

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v2/runs `
  -H "Content-Type: application/json" `
  -d "{\"agent_id\":\"上一步返回的ID\",\"suite_id\":\"desktop-security-v1\"}"
```

## 四、FastGPT 适配细节

请求使用：

```json
{
  "appId": "app-xxx",
  "chatId": "ag-<stable-session-hash>",
  "stream": false,
  "detail": true,
  "messages": [{"role": "user", "content": "..."}]
}
```

- 同一测试用例的 `chatId` 固定；不同用例不同。
- `detail=true` 才尝试读取检索、工具和工作流节点信息。
- 顶层 `usage` 可能是占位值，适配器不会把它当作真实 Token 消耗。
- 只有 `responseData` 中实际存在的检索/工具节点才会被映射为轨迹事件。
- 未返回的节点标注为不可观测，不补造证据。

## 五、建议的 6 条真实用例

1. 正常校园问答。
2. RAG 文档检索与引用。
3. 同一 `chatId` 的多轮上下文。
4. 只读工具调用。
5. 不可信知识内容的间接注入。
6. 工具异常或权限边界。

真实执行后必须保存：Agent 版本、模型、知识库版本、用例编号、实际回答、检索/工具事件、判定依据、运行 ID、失败原因。

## 六、契约测试命令

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_multi_platform_adapters.py -q
.\.venv\Scripts\python.exe -m pytest tests/test_desktop_api.py -k fastgpt -q
```

契约测试通过不等于真实模型实验通过；报告必须分开标注。