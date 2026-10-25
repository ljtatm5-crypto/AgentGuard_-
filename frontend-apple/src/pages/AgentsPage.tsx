import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle, Play, PlugsConnected, Plus, ShieldCheck, X } from '@phosphor-icons/react'
import { api, ApiRequestError, USE_MOCK } from '@/api/client'
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
  const [connectionMode, setConnectionMode] = useState<'local_sandbox' | 'dify_authorized'>('local_sandbox')
  const [name, setName] = useState('')
  const [agentType, setAgentType] = useState<Agent['agent_type']>('conversation')
  const [model, setModel] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [credentialEnv, setCredentialEnv] = useState('DIFY_AGENT_API_KEY')
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connected, setConnected] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  async function connectAgent() {
    setConnectError(null)
    if (!name.trim()) {
      setConnectError('请输入智能体名称')
      return
    }
    if (connectionMode === 'dify_authorized') {
      if (USE_MOCK) {
        setConnectError('真实 Dify 接入需要切换到 API 模式并使用后端网关')
        return
      }
      if (!endpoint.trim()) {
        setConnectError('请输入自建 Dify 的 Chat Messages 接口地址')
        return
      }
      if (!authorizationReference.trim() || !authorizationConfirmed) {
        setConnectError('请确认授权并填写授权记录编号')
        return
      }
    }
    setConnecting(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        version: 'v2.0',
        endpoint: connectionMode === 'local_sandbox'
          ? `local://agent-${Date.now().toString(36)}`
          : endpoint.trim(),
        agent_type: agentType,
        model: model.trim() || (connectionMode === 'local_sandbox' ? 'deterministic-local-sandbox' : 'dify-self-hosted'),
        permissions: {},
        connection_mode: connectionMode,
      }
      if (connectionMode === 'dify_authorized') {
        payload.credential_env = credentialEnv.trim()
        payload.authorization_reference = authorizationReference.trim()
        payload.authorization_confirmed = true
      }
      const created = await api.validateAgent(payload)
      setConnected((items) => mergeAgents(items, [created]))
      setSelectedAgentId(created.id)
      setName('')
      setModel('')
      setEndpoint('')
      setAuthorizationReference('')
      setAuthorizationConfirmed(false)
      setConnectOpen(false)
    } catch (error) {
      setConnectError(error instanceof ApiRequestError ? error.message : '资产校验失败，请稍后重试')
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
          {connectOpen ? '收起' : '创建本地测试资产'}
        </button>
      </header>

      {connectOpen && (
        <section className="panel connect-panel" id="agent-connect" aria-labelledby="connect-title">
          <div className="connect-head">
            <span className="connect-icon"><PlugsConnected size={24} weight="duotone" /></span>
            <div>
              <h2 id="connect-title">{connectionMode === 'local_sandbox' ? '创建本地测试资产' : '接入授权 Dify 智能体'}</h2>
              <p>{connectionMode === 'local_sandbox'
                ? '在本地安全沙盒完成资产校验，再为它选择测试集和执行任务。'
                : '通过服务端授权网关连接自建 Dify；凭据只从服务器环境变量读取。'}</p>
            </div>
          </div>

          <div className="connect-modes" role="group" aria-label="接入方式">
            <button
              type="button"
              className={connectionMode === 'local_sandbox' ? 'active' : ''}
              onClick={() => { setConnectionMode('local_sandbox'); setConnectError(null) }}
            >
              <strong>本地安全沙盒</strong>
              <small>无需凭据，可立即验证</small>
            </button>
            <button
              type="button"
              className={connectionMode === 'dify_authorized' ? 'active' : ''}
              onClick={() => { setConnectionMode('dify_authorized'); setConnectError(null) }}
              data-testid="connect-mode-dify"
            >
              <strong>授权自建 Dify</strong>
              <small>{USE_MOCK ? '需 API 模式与服务端凭据' : '仅允许私网或授权目标'}</small>
            </button>
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
            {connectionMode === 'dify_authorized' && (
              <div className="connect-dify-fields">
                <label>
                  Dify Chat Messages 地址
                  <input
                    value={endpoint}
                    onChange={(event) => { setEndpoint(event.target.value); setConnectError(null) }}
                    placeholder="http://内网Dify/v1/chat-messages"
                    data-testid="connect-dify-endpoint"
                  />
                </label>
                <label>
                  服务端凭据环境变量
                  <input
                    value={credentialEnv}
                    onChange={(event) => { setCredentialEnv(event.target.value); setConnectError(null) }}
                    placeholder="DIFY_AGENT_API_KEY"
                    data-testid="connect-dify-credential-env"
                  />
                </label>
                <label>
                  授权记录编号
                  <input
                    value={authorizationReference}
                    onChange={(event) => { setAuthorizationReference(event.target.value); setConnectError(null) }}
                    placeholder="例如 AUTH-2026-001"
                  />
                </label>
                <label className="connect-confirm">
                  <input
                    type="checkbox"
                    checked={authorizationConfirmed}
                    onChange={(event) => { setAuthorizationConfirmed(event.target.checked); setConnectError(null) }}
                  />
                  <span>我确认该 Dify 为自建或已获书面授权的内部目标</span>
                </label>
              </div>
            )}
            <div className="connect-actions">
              <button className="btn btn-primary" type="submit" disabled={connecting} data-testid="connect-agent-submit">
                <PlugsConnected size={17} />{connecting ? '正在校验…' : connectionMode === 'local_sandbox' ? '创建并校验' : '接入并校验'}
              </button>
              <button className="btn" type="button" onClick={() => setConnectOpen(false)}>取消</button>
            </div>
          </form>

          <div className="connect-safety">
            <ShieldCheck size={18} weight="duotone" />
            <span>{connectionMode === 'local_sandbox'
              ? '当前连接目标为本地安全沙盒；真实外部网站不可接入。'
              : 'API Key 不会传给浏览器或写入数据库，只由服务端按环境变量名读取。'}</span>
          </div>
          {connectError && <p className="form-error" role="alert" data-testid="connect-agent-error">{connectError}</p>}
        </section>
      )}

      {connected.length > 0 && (
        <div className="connect-success" role="status" data-testid="connect-agent-success">
          <CheckCircle size={18} weight="fill" />
          已创建本地测试资产 {connected.at(-1)?.name}，可在下方列表继续配置测试
        </div>
      )}

      <AsyncBoundary state={state} isEmpty={(d) => d.length === 0} onRetry={retry}>
        {(agents) => {
          const catalog = mergeAgents(agents, connected)
          const selectedAgent = catalog.find((agent) => agent.id === selectedAgentId) ?? catalog[0]
          return (
            <>
              <section className="agent-summary-strip" aria-label="Agent 资产概览">
                <div><span>接入资产</span><strong>{catalog.length}</strong></div>
                <div><span>已完成校验</span><strong>{catalog.filter((agent) => agent.validate_status === 'validated').length}</strong></div>
                <div><span>外部目标</span><strong>0</strong></div>
                <p>先选择资产查看权限与知识配置，再进入测试工作区。</p>
              </section>

              <div className="agent-catalog-grid" data-testid="agent-catalog">
                {catalog.map((agent) => (
                  <article className={`agent-tile ${selectedAgent?.id === agent.id ? 'active' : ''}`} key={agent.id}>
                    <button
                      className="agent-tile-main"
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      aria-pressed={selectedAgent?.id === agent.id}
                    >
                      <span className="agent-monogram">{agent.name.slice(0, 2)}</span>
                      <span className="agent-tile-copy">
                        <span className="agent-type-row">
                          <span className="agent-type-tag">{agentTypeLabel[agent.agent_type]}</span>
                          <span className="mono version">{agent.version}</span>
                        </span>
                        <strong>{agent.name}</strong>
                        <small>{agent.endpoint}</small>
                      </span>
                      <span className={`validate ${agent.validate_status}`}>
                        {agent.validate_status === 'validated' ? '已校验' : agent.validate_status === 'invalid' ? '校验失败' : '校验中'}
                      </span>
                    </button>
                    <div className="agent-tile-meta">
                      <span>{agent.knowledge.length} 个知识库</span>
                      <span>{agent.tools.length} 个工具</span>
                      <Link to={`/runs?agent=${agent.id}`}>开始测试 <Play size={13} weight="fill" /></Link>
                    </div>
                  </article>
                ))}
              </div>

              {selectedAgent && (
                <section className="panel agent-card agent-detail" data-testid="agent-card">
                  <div className="agent-detail-head">
                    <div>
                      <div className="agent-type-row">
                        <span className="agent-type-tag">{agentTypeLabel[selectedAgent.agent_type]}</span>
                        <span className="mono version">{selectedAgent.version}</span>
                      </div>
                      <h2>{selectedAgent.name}</h2>
                      <p>{selectedAgent.purpose}</p>
                    </div>
                    <div className="agent-detail-actions">
                      <span className={`validate ${selectedAgent.validate_status}`}>
                        {selectedAgent.validate_status === 'validated' ? '已校验' : selectedAgent.validate_status === 'invalid' ? '校验失败' : '校验中'}
                      </span>
                      <Link className="btn btn-primary" to={`/runs?agent=${selectedAgent.id}`}>
                        启动测试 <ArrowUpRight size={16} />
                      </Link>
                    </div>
                  </div>

                  <div className="agent-detail-grid">
                    <section className="agent-detail-block">
                      <span className="detail-label">连接信息</span>
                      <dl className="agent-facts">
                        <div><dt>接入地址</dt><dd className="mono">{selectedAgent.endpoint}</dd></div>
                        <div><dt>模型</dt><dd className="mono">{selectedAgent.model}</dd></div>
                        <div><dt>测试范围</dt><dd>{selectedAgent.authorized_scope.target_type === 'internal_mock' ? '本地安全沙盒' : '已授权内部环境'}</dd></div>
                      </dl>
                    </section>

                    <section className="agent-detail-block">
                      <span className="detail-label">知识库</span>
                      {selectedAgent.knowledge.length > 0 ? (
                        <ul className="agent-resource-list">
                          {selectedAgent.knowledge.map((knowledge) => (
                            <li key={knowledge.id}>
                              <span><strong>{knowledge.name}</strong><small>{knowledge.source} · {knowledge.version}</small></span>
                              <span className={`tag ${knowledge.kind === 'malicious' ? 'tag-danger' : knowledge.kind === 'conflict' ? 'tag-warning' : 'tag-neutral'}`}>
                                {knowledge.kind === 'normal' ? '正常' : knowledge.kind === 'conflict' ? '冲突' : '隔离样本'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="empty-inline">暂未绑定知识库</p>}
                    </section>

                    <section className="agent-detail-block agent-tools-block">
                      <span className="detail-label">工具与权限</span>
                      <ul className="agent-resource-list">
                        {selectedAgent.tools.map((tool) => (
                          <li key={tool.name}>
                            <span><strong className="mono">{tool.name}</strong><small>{tool.description}</small></span>
                            <span className="tool-policy">
                              <span className="tag tag-neutral">{sideEffectLabel[tool.side_effect]}</span>
                              {selectedAgent.permissions[tool.name] ? <PolicyTag v={selectedAgent.permissions[tool.name]} /> : <span className="muted">未配置</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <div className="scope-box" data-testid="authorized-scope">
                    <p>
                      <strong>授权范围</strong>
                      <span className="tag tag-danger">禁止外部站点目标</span>
                    </p>
                    <p className="muted">{selectedAgent.authorized_scope.note}</p>
                  </div>
                </section>
              )}
            </>
          )
        }}
      </AsyncBoundary>
    </div>
  )
}
