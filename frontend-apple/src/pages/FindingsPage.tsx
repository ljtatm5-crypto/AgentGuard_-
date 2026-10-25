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
                      <button className="btn" onClick={() => setSelected(f.id)} aria-expanded={selected === f.id} aria-controls="finding-details">
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
                  <div className="chain-impact">
                    <p>
                      <span className="key">影响</span>
                      {f.impact}
                    </p>
                    <p>
                      <span className="key">修复建议</span>
                      {f.recommendation}
                    </p>
                  </div>
                  <ol className="chain">
                    {f.chain.map((n, i) => (
                      <li key={n.id} className={`chain-node kind-${n.kind}`}>
                        <div className="chain-marker">
                          <span className="chain-index">{i + 1}</span>
                          <span className="chain-kind">{KIND_LABEL[n.kind]}</span>
                        </div>
                        <div className="chain-body">
                          <strong>{n.label}</strong>
                          <p>{n.detail}</p>
                          {n.evidence.event_ids.length > 0 ? (
                            <Link
                              className="evidence-link"
                              to={`/runs?${new URLSearchParams({ run: n.evidence.run_id, case: n.evidence.case_id, events: n.evidence.event_ids.join(',') })}`}
                              data-testid="evidence-link"
                            >
                              证据：{n.evidence.run_id} / {n.evidence.case_id} /{' '}
                              {n.evidence.event_ids.join(', ')} <ArrowUpRight size={14} aria-hidden="true" />
                            </Link>
                          ) : (
                            <span className="evidence-inferred">推断节点 · 没有可直接回指的事件</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )
            }
          </AsyncBoundary>
        </section>
      )}
    </div>
  )
}
