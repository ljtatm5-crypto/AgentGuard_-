import { useState } from 'react'
import { ArrowUpRight, X } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { FindingStatusTag, SeverityTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { RISK_TAG_LABELS } from '@/types/enums'

const KIND_LABEL: Record<string, string> = {
  entry: '入口',
  behavior: '行为',
  impact: '影响',
  fix: '修复',
}

export default function FindingsPage() {
  const { state, retry } = useAsync(() => api.listFindings(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const chain = useAsync(
    () => (selected ? api.getFindingChain(selected) : Promise.resolve(null)),
    [selected],
  )

  return (
    <div className="findings-page">
      <header className="page-head">
        <h1>攻击链与缺陷</h1>
        <p className="page-desc">
          每个节点都可回指原始运行记录与轨迹事件；修复后用同一测试集复测，历史证据保留不删除。
        </p>
      </header>

      <section className="panel">
        <h2>缺陷列表</h2>
        <AsyncBoundary state={state} isEmpty={(d) => d.length === 0} onRetry={retry}>
          {(data) => (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="缺陷列表">
            <table data-testid="findings-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>风险类型</th>
                  <th>严重等级</th>
                  <th>状态</th>
                  <th>版本</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <tr key={f.id} className={selected === f.id ? 'row-active' : undefined}>
                    <td className="mono">{f.id}</td>
                    <td>{f.title}</td>
                    <td>{RISK_TAG_LABELS[f.risk_tag]}</td>
                    <td>
                      <SeverityTag v={f.severity} />
                    </td>
                    <td>
                      <FindingStatusTag v={f.status} />
                    </td>
                    <td className="mono small">
                      {f.agent_version} / {f.suite_version}
                    </td>
                    <td>
                      <button className="btn" onClick={() => { setSelected(f.id); setSelectedNodeId('') }} aria-expanded={selected === f.id} aria-controls="finding-details">
                        攻击链
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
        <section className="panel" id="finding-details" data-testid="chain-panel">
          <AsyncBoundary state={chain.state} onRetry={chain.retry}>
            {(f) =>
              !f ? null : (
                <>
                  <div className="panel-toolbar">
                    <h2>{f.id} · {f.title}</h2>
                    <button className="btn btn-icon" onClick={() => setSelected(null)} aria-label="收起攻击链"><X size={18} aria-hidden="true" /></button>
                  </div>
                  {(() => {
                    const activeNode = f.chain.find((node) => node.id === selectedNodeId)
                      ?? f.chain.find((node) => node.evidence.event_ids.length > 0)
                      ?? f.chain[0]
                    return (
                      <div className="attack-explorer">
                        <section className="attack-canvas" aria-label="攻击链节点图">
                          <div className="attack-summary">
                            <div><span>风险等级</span><SeverityTag v={f.severity} /></div>
                            <div><span>实际观测节点</span><strong>{f.chain.filter((node) => node.evidence.event_ids.length > 0).length}</strong></div>
                            <div><span>推断节点</span><strong>{f.chain.filter((node) => node.evidence.event_ids.length === 0).length}</strong></div>
                          </div>
                          <div className="attack-graph">
                            {f.chain.map((node, index) => {
                              const observed = node.evidence.event_ids.length > 0
                              return (
                                <div className="attack-node-wrap" key={node.id}>
                                  <button
                                    type="button"
                                    className={`chain-node attack-node ${observed ? 'observed' : 'inferred'} ${activeNode.id === node.id ? 'active' : ''}`}
                                    onClick={() => setSelectedNodeId(node.id)}
                                    aria-pressed={activeNode.id === node.id}
                                  >
                                    <span className="chain-index">{index + 1}</span>
                                    <span className="chain-kind">{KIND_LABEL[node.kind]}</span>
                                    <strong>{node.label}</strong>
                                    <small>{observed ? '实际事件' : '推断关系'}</small>
                                  </button>
                                  {index < f.chain.length - 1 && (
                                    <span className={`attack-link ${observed ? 'observed' : 'inferred'}`} aria-hidden="true" />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div className="attack-legend">
                            <span><i className="solid" />实线：有事件证据</span>
                            <span><i className="dashed" />虚线：推断关系，不代表已经发生</span>
                          </div>
                        </section>

                        <aside className="attack-node-evidence">
                          <div className="attack-node-evidence-head">
                            <span className="detail-label">{KIND_LABEL[activeNode.kind]}</span>
                            <span className={`tag ${activeNode.evidence.event_ids.length > 0 ? 'tag-success' : 'tag-warning'}`}>
                              {activeNode.evidence.event_ids.length > 0 ? '实际观测' : '推断'}
                            </span>
                          </div>
                          <h3>{activeNode.label}</h3>
                          <p>{activeNode.detail}</p>
                          {activeNode.evidence.event_ids.length > 0 ? (
                            <Link
                              className="evidence-link"
                              to={`/runs?${new URLSearchParams({ run: activeNode.evidence.run_id, case: activeNode.evidence.case_id, events: activeNode.evidence.event_ids.join(',') })}`}
                              data-testid="evidence-link"
                            >
                              证据：{activeNode.evidence.run_id} / {activeNode.evidence.case_id} /{' '}
                              {activeNode.evidence.event_ids.join(', ')} <ArrowUpRight size={14} aria-hidden="true" />
                            </Link>
                          ) : (
                            <span className="evidence-inferred">推断节点 · 没有可直接回指的事件</span>
                          )}
                          <div className="attack-node-meta">
                            <span>运行 <b className="mono">{f.evidence.run_id}</b></span>
                            <span>用例 <b className="mono">{f.evidence.case_id}</b></span>
                          </div>
                        </aside>
                      </div>
                    )
                  })()}
                </>
              )
            }
          </AsyncBoundary>
        </section>
      )}
    </div>
  )
}
