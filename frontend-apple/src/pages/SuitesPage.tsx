import { useState } from 'react'
import { CheckCircle, Plus, Sparkle, X } from '@phosphor-icons/react'
import { api, ApiRequestError, USE_MOCK } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { JudgeSourceTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { RISK_TAG_LABELS } from '@/types/enums'

const SUITE_TYPE_LABELS: Record<string, string> = {
  security_p0: '安全与行为风险',
  mixed: '综合质量与安全',
  security: '安全回归',
}

export default function SuitesPage() {
  const suites = useAsync(() => api.listSuites(), [])
  const agents = useAsync(() => api.listAgents(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [testType, setTestType] = useState('security')
  const [useAi, setUseAi] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generation, setGeneration] = useState<Awaited<ReturnType<typeof api.generateSuite>> | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const cases = useAsync(
    () => (selected ? api.listCases(selected) : Promise.resolve([])),
    [selected],
  )

  const availableAgents = agents.state.phase === 'ready' ? agents.state.data : []
  const effectiveAgentId = agentId || availableAgents[0]?.id || ''

  async function generateSuite() {
    setGenerationError(null)
    if (!effectiveAgentId) {
      setGenerationError('请先选择智能体')
      return
    }
    setGenerating(true)
    try {
      const result = await api.generateSuite({
        agent_id: effectiveAgentId,
        test_type: testType,
        use_ai: useAi,
      })
      setGeneration(result)
      if (!result.review_required) {
        suites.retry()
        setSelected(result.suite.id)
      }
    } catch (error) {
      setGenerationError(error instanceof ApiRequestError ? error.message : '测试集生成失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  async function acceptGenerated() {
    if (!generation?.review_required || !effectiveAgentId) return
    setGenerating(true)
    setGenerationError(null)
    try {
      const accepted = await api.acceptGeneratedSuite({
        agent_id: effectiveAgentId,
        name: `${testType} · AI 审核测试集`,
        test_type: testType,
        cases: generation.cases,
      })
      setGeneration(accepted)
      suites.retry()
      setSelected(accepted.suite.id)
    } catch (error) {
      setGenerationError(error instanceof ApiRequestError ? error.message : '候选测试集保存失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="suites-page">
      <header className="page-head suite-page-head">
        <div>
          <h1>测试集</h1>
          <p className="page-desc">
            覆盖提示词注入、知识库风险、工具越权、记忆污染与任务漂移，并提供正常业务对照。
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { setGenerateOpen((value) => !value); setGenerationError(null) }} aria-expanded={generateOpen} aria-controls="suite-generator" data-testid="generate-suite-btn">
          {generateOpen ? <X size={17} /> : <Plus size={17} weight="bold" />}
          {generateOpen ? '收起' : '生成测试集'}
        </button>
      </header>

      {generateOpen && (
        <section className="panel suite-generator" id="suite-generator" aria-labelledby="suite-generator-title">
          <div className="generator-head">
            <span className="generator-icon"><Sparkle size={23} weight="duotone" /></span>
            <div>
              <h2 id="suite-generator-title">生成新的测试集</h2>
              <p>固定规则模板可以立即保存；自建模型生成的 AI 候选必须先经过人工确认。</p>
            </div>
          </div>
          <form className="generator-form" onSubmit={(event) => { event.preventDefault(); void generateSuite() }}>
            <label>
              被测智能体
              <select value={effectiveAgentId} onChange={(event) => setAgentId(event.target.value)} disabled={agents.state.phase !== 'ready'} data-testid="generate-suite-agent">
                {availableAgents.length === 0 && <option value="">暂无可选智能体</option>}
                {availableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <label>
              覆盖范围
              <select value={testType} onChange={(event) => setTestType(event.target.value)} data-testid="generate-suite-type">
                <option value="security">完整安全回归</option>
                <option value="injection">提示词注入</option>
                <option value="memory">记忆污染</option>
                <option value="permission">工具权限</option>
                <option value="functional">正常业务对照</option>
              </select>
            </label>
            <label className="generator-ai-toggle">
              <input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)} />
              <span>
                <strong>使用自建模型生成 AI 候选</strong>
                <small>{USE_MOCK ? 'Mock 模式仅演示流程，不伪装真实模型调用' : '需要服务端配置自建模型与凭据环境变量'}</small>
              </span>
            </label>
            <button className="btn btn-primary" type="submit" disabled={generating || agents.state.phase !== 'ready'} data-testid="generate-suite-submit">
              <Sparkle size={17} />{generating ? '正在生成…' : '生成候选'}
            </button>
          </form>
          {generationError && <p className="form-error" role="alert" data-testid="generate-suite-error">{generationError}</p>}

          {generation && (
            <div className="generation-result" data-testid="generation-result">
              <div className="generation-result-head">
                <div>
                  <span className={`tag ${generation.review_required ? 'tag-warning' : 'tag-success'}`}>
                    {generation.review_required ? '待人工确认' : '已保存'}
                  </span>
                  <strong>{generation.suite.name}</strong>
                  <small>{generation.cases.length} 条用例 · {generation.llm_used ? '自建模型候选' : '固定规则模板'}</small>
                </div>
                {generation.review_required && (
                  <button className="btn btn-primary" type="button" onClick={() => void acceptGenerated()} disabled={generating} data-testid="accept-generated-suite">
                    <CheckCircle size={17} />确认并保存
                  </button>
                )}
              </div>
              <ul className="generation-cases">
                {generation.cases.map((item, index) => (
                  <li key={item.id}>
                    <span className="case-number">候选 {String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.title}</strong><p>{item.input}</p></div>
                    <span className="tag tag-info">{RISK_TAG_LABELS[item.risk_tag]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>测试集列表</h2>
        <AsyncBoundary state={suites.state} isEmpty={(d) => d.length === 0} onRetry={suites.retry}>
          {(data) => (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="测试集列表">
            <table data-testid="suites-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>版本</th>
                  <th>覆盖范围</th>
                  <th>用例数</th>
                  <th>状态</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={selected === s.id ? 'row-active' : undefined}>
                    <td>{s.name}</td>
                    <td className="mono">{s.version}</td>
                    <td>{SUITE_TYPE_LABELS[s.type] ?? '自定义测试'}</td>
                    <td>{s.case_ids.length}</td>
                    <td>
                      <span className={`tag ${s.case_ids.length ? 'tag-success' : 'tag-warning'}`}>
                        {s.case_ids.length ? '已就绪' : '待配置'}
                      </span>
                    </td>
                    <td>
                      <button className="btn" onClick={() => setSelected(s.id)} aria-expanded={selected === s.id} aria-controls="suite-details">
                        查看用例
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {selected && (
        <section className="panel" id="suite-details">
          <div className="panel-toolbar">
            <h2>用例详情</h2>
            <button className="btn btn-icon" onClick={() => setSelected(null)} aria-label="收起用例详情"><X size={18} aria-hidden="true" /></button>
          </div>
          <AsyncBoundary state={cases.state} isEmpty={(d) => d.length === 0} onRetry={cases.retry}>
            {(data) => (
              <ul className="case-list" data-testid="case-list">
                {data.map((c, index) => (
                  <li key={c.id} className="case-item">
                    <div className="case-head">
                      <span className="case-number">用例 {String(index + 1).padStart(2, '0')}</span>
                      <strong>{c.title}</strong>
                      <span className="tag tag-info">{RISK_TAG_LABELS[c.risk_tag]}</span>
                    </div>
                    <p>
                      <span className="key">输入</span>
                      {c.input}
                    </p>
                    <p>
                      <span className="key">步骤</span>
                      {c.steps.join(' → ')}
                    </p>
                    <p>
                      <span className="key">预期</span>
                      {c.expected}
                    </p>
                    <p>
                      <span className="key">禁止</span>
                      {c.forbidden.join('；')}
                    </p>
                    <p className="judge-row">
                      <span className="key">判定方式</span>
                      {c.judge.map((j) => (
                        <JudgeSourceTag key={j} v={j} />
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
        </section>
      )}
    </div>
  )
}
