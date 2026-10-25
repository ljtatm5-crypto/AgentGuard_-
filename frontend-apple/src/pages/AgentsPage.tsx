import { useState } from 'react'
import { CheckCircle, PlugsConnected, Plus, ShieldCheck, X } from '@phosphor-icons/react'
import { api, ApiRequestError } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { PolicyTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import type { Agent } from '@/types/api'

const sideEffectLabel: Record<string, string> = {
  none: '只读',
  virtual_write: '虚拟写入',
  external_write: '外部写入（禁止）',
}

const AGENT_TYPES: Array<{ value: Agent['agent_type']; label: string; note: string }> = [
  { value: 'conversation', label: '对话型智能体', note: '多轮对话与问答' },
  { value: 'rag', label: '知识库 RAG', note: '检索增强问答' },
  { value: 'tool', label: '工具调用智能体', note: '可调用外部工具' },
  { value: 'workflow', label: '工作流智能体', note: '多步骤业务流程' },
]

const agentTypeLabel = Object.fromEntries(
  AGENT_TYPES.map((item) => [item.value, item.label]),
) as Record<Agent['agent_type'], string>

function mergeAgents(initial: Agent[], connected: Agent[]): Agent[] {
  const merged = [...connected, ...initial]
  return merged.filter((agent, index) => merged.findIndex((item) => item.id === agent.id) === index)
}

export default function AgentsPage() {
  const { state, retry } = useAsync(() => api.listAgents(), [])
  const [connectOpen, setConnectOpen] = useState(false)
  const [name, setName] = useState('')
  const [agentType, setAgentType] = useState<Agent['agent_type']>('conversation')
  const [model, setModel] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connected, setConnected] = useState<Agent[]>([])

  async function connectAgent() {
    setConnectError(null)
    if (!name.trim()) {
      setConnectError('请输入智能体名称')
      return
    }
    setConnecting(true)
    try {
      const created = await api.validateAgent({
        name: name.trim(),
        version: 'v2.0',
        endpoint: `local://agent-${Date.now().toString(36)}`,
        agent_type: agentType,
        model: model.trim() || 'deterministic-local-sandbox',
        permissions: {},
      })
      setConnected((items) => mergeAgents(items, [created]))
      setName('')
      setModel('')
      setConnectOpen(false)
    } catch (error) {
      setConnectError(error instanceof ApiRequestError ? error.message : '连接测试失败，请稍后重试')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="agents-page">
      <header className="page-head agent-page-head">
        <div>
          <h1>Agent 资产</h1>
          <p className="page-desc">统一管理不同智能体的版本、知识库、工具与权限；支持对话、RAG、工具调用和工作流 Agent。</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => { setConnectOpen((value) => !value); setConnectError(null) }}
          aria-expanded={connectOpen}
          aria-controls="agent-connect"
          data-testid="connect-agent-btn"
        >
          {connectOpen ? <X size={17} /> : <Plus size={17} weight="bold" />}
          {connectOpen ? '收起' : '接入智能体'}
        </button>
      </header>

      {connectOpen && (
        <section className="panel connect-panel" id="agent-connect" aria-labelledby="connect-title">
          <div className="connect-head">
            <span className="connect-icon"><PlugsConnected size={24} weight="duotone" /></span>
            <div>
              <h2 id="connect-title">连接一个新的智能体</h2>
              <p>先接入本地安全沙盒完成连接测试，再为它选择测试集和执行任务。</p>
            </div>
          </div>

          <form className="connect-form" onSubmit={(event) => { event.preventDefault(); void connectAgent() }}>
            <label>
              智能体名称
              <input
                value={name}
                onChange={(event) => { setName(event.target.value); setConnectError(null) }}
                placeholder="例如：客服助手、工单处理智能体"
                autoFocus
                data-testid="connect-agent-name"
              />
            </label>
            <label>
              能力类型
              <select
                value={agentType}
                onChange={(event) => setAgentType(event.target.value as Agent['agent_type'])}
                data-testid="connect-agent-type"
              >
                {AGENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label} · {item.note}</option>
                ))}
              </select>
            </label>
            <label>
              模型名称
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="选填，例如 qwen2.5-7b"
              />
            </label>
            <div className="connect-actions">
              <button className="btn btn-primary" type="submit" disabled={connecting} data-testid="connect-agent-submit">
                <PlugsConnected size={17} />{connecting ? '正在连接…' : '连接测试'}
              </button>
              <button className="btn" type="button" onClick={() => setConnectOpen(false)}>取消</button>
            </div>
          </form>

          <div className="connect-safety">
            <ShieldCheck size={18} weight="duotone" />
            <span>当前连接目标为本地安全沙盒；真实外部网站不可接入。</span>
          </div>
          {connectError && <p className="form-error" role="alert" data-testid="connect-agent-error">{connectError}</p>}
        </section>
      )}

      {connected.length > 0 && (
        <div className="connect-success" role="status" data-testid="connect-agent-success">
          <CheckCircle size={18} weight="fill" />
          已连接 {connected.at(-1)?.name}，可在下方资产列表继续配置测试
        </div>
      )}

      <AsyncBoundary state={state} isEmpty={(d) => d.length === 0} onRetry={retry}>
        {(agents) =>
          mergeAgents(agents, connected).map((agent) => (
            <section className="panel agent-card" key={agent.id} data-testid="agent-card">
              <div className="panel-head">
                <div>
                  <div className="agent-type-row">
                    <span className="agent-type-tag">{agentTypeLabel[agent.agent_type]}</span>
                    <span className="mono version">{agent.version}</span>
                  </div>
                  <h2>{agent.name}</h2>
                </div>
                <span className={`validate ${agent.validate_status}`}>
                  {agent.validate_status === 'validated' ? '已连接' : agent.validate_status === 'invalid' ? '连接失败' : '连接中'}
                </span>
              </div>
              <p className="page-desc">{agent.purpose}</p>
              <dl className="kv">
                <dt>接入地址</dt>
                <dd className="mono">{agent.endpoint}</dd>
                <dt>模型</dt>
                <dd className="mono">{agent.model}</dd>
              </dl>

              <h3>知识库</h3>
              {agent.knowledge.length > 0 ? (
                <div className="table-scroll" tabIndex={0} role="region" aria-label={`${agent.name}知识库`}>
                  <table>
                    <thead>
                      <tr><th>名称</th><th>版本</th><th>来源</th><th>类型</th></tr>
                    </thead>
                    <tbody>
                      {agent.knowledge.map((knowledge) => (
                        <tr key={knowledge.id}>
                          <td>{knowledge.name}</td>
                          <td className="mono">{knowledge.version}</td>
                          <td>{knowledge.source}</td>
                          <td>
                            <span className={`tag ${knowledge.kind === 'malicious' ? 'tag-danger' : knowledge.kind === 'conflict' ? 'tag-warning' : 'tag-neutral'}`}>
                              {knowledge.kind === 'normal' ? '正常' : knowledge.kind === 'conflict' ? '冲突' : '含测试性恶意指令'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-inline">暂未绑定知识库，可在接入正式环境后补充。</p>}

              <h3>工具与权限</h3>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={`${agent.name}工具与权限`}>
                <table>
                  <thead>
                    <tr><th>工具</th><th>说明</th><th>副作用</th><th>权限决策</th></tr>
                  </thead>
                  <tbody>
                    {agent.tools.map((tool) => (
                      <tr key={tool.name}>
                        <td className="mono">{tool.name}</td>
                        <td>{tool.description}</td>
                        <td>
                          <span className={tool.side_effect === 'external_write' ? 'tag tag-danger' : 'tag tag-neutral'}>
                            {sideEffectLabel[tool.side_effect]}
                          </span>
                        </td>
                        <td>{agent.permissions[tool.name] ? <PolicyTag v={agent.permissions[tool.name]} /> : '未配置'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>授权范围</h3>
              <div className="scope-box" data-testid="authorized-scope">
                <p>
                  <strong>{agent.authorized_scope.target_type === 'internal_mock' ? '本地安全沙盒' : '已授权内部环境'}</strong>
                  <span className="tag tag-danger">禁止外部站点目标</span>
                </p>
                <p className="muted">{agent.authorized_scope.note}</p>
              </div>
            </section>
          ))
        }
      </AsyncBoundary>
    </div>
  )
}
