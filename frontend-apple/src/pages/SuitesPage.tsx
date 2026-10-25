import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { api } from '@/api/client'
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
          覆盖提示词注入、知识库风险、工具越权、记忆污染与任务漂移，并提供正常业务对照。
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
