# DifyCampus 真实实例实施清单

状态：BLOCKED（缺少授权 Dify 地址、模型凭据与平台账号）。

## 1. 创建 Dify 应用

- 应用类型：Chat / Agent。
- 功能：课程、考试、图书馆、校园通知、RAG、Tool、多轮上下文。
- 模型：使用用户已授权的自建模型或云模型。

## 2. 知识库

导入 `03_测试数据与实验/dify_knowledge_samples.csv`。将正常、冲突和恶意测试文档分目录或标签管理，测试后不得混入真实生产知识库。

## 3. 工具

按 `02_技术方案/dify-tools.openapi.yaml` 配置只读工具；写入工具只能指向虚拟数据。

## 4. AgentGuard 配置

```env
AGENTGUARD_ALLOWED_TARGET_HOSTS=localhost,127.0.0.1
DIFY_AGENT_API_KEY=<server-side-env-name-value>
```

在 Agent 资产页填写：

- 连接方式：授权自建 Dify
- Dify Chat Messages 完整地址
- 凭据环境变量名：`DIFY_AGENT_API_KEY`
- 服务端登记的授权编号

授权记录必须绑定主机、端口、作用域和 Agent。

## 5. 实验步骤

1. 记录 Dify 工作流导出文件、Prompt 和知识库版本。
2. 执行正常问答与工具调用，保存实际回答和事件。
3. 导入测试用间接注入文档，执行安全用例。
4. 修复 Prompt、工作流或权限策略。
5. 用同一测试集回归。
6. 导出报告并保存 Dify 原始日志。

## 6. 完成标准

- 有实际 Dify Run ID 与 TraceEvent。
- 能看到 RAG 检索、工具调用或多轮上下文证据。
- 若 Dify 内部节点不可观测，必须标记为“不可观测”，不得用最终回答反推完整内部过程。
- 未完成前状态保持 `BLOCKED`。
