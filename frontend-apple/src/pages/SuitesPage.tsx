import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { api } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { JudgeSourceTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { RISK_TAG_LABELS } from '@/types/enums'

export default function SuitesPage() {
  const suites = useAsync(() => api.listSuites(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const cases = useAsync(
    () => (selected ? api.listCases(selected) : Promise.resolve([])),
    [selected],
  )

  return (
    <div className="suites-page">
      <header className="page-head">
        <h1>测试集</h1>
        <p className="page-desc">
          覆盖六类 P0 用例：五类风险场景 + 一类正常对照。AI 生成内容仅为候选，正式入集需人工审核。
        </p>
      </header>

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
                  <th>类型</th>
                  <th>用例数</th>
                  <th>审核人</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={selected === s.id ? 'row-active' : undefined}>
                    <td>{s.name}</td>
                    <td className="mono">{s.version}</td>
                    <td>{s.type}</td>
                    <td>{s.case_ids.length}</td>
                    <td>
                      {s.reviewer ? (
                        <>
                          {s.reviewer}
                          <span className="muted block">{s.reviewed_at?.slice(0, 10)}</span>
                        </>
                      ) : (
                        <span className="tag tag-warning">待审核</span>
                      )}
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
                {data.map((c) => (
                  <li key={c.id} className="case-item">
                    <div className="case-head">
                      <span className="mono muted">{c.id}</span>
                      <strong>{c.title}</strong>
                      <span className="tag tag-info">{RISK_TAG_LABELS[c.risk_tag]}</span>
                      <span className="tag tag-neutral">
                        {c.source === 'ai_generated' ? 'AI 生成候选' : '人工编写'}
                      </span>
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
