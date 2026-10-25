import { api } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { PolicyTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'

const sideEffectLabel: Record<string, string> = {
  none: '只读',
  virtual_write: '虚拟写入',
  external_write: '外部写入（禁止）',
}

export default function AgentsPage() {
  const { state, retry } = useAsync(() => api.listAgents(), [])

  return (
    <div className="agents-page">
      <header className="page-head">
        <h1>Agent 资产</h1>
        <p className="page-desc">被测 Agent 的版本、知识库、工具与权限。授权范围仅限自建靶场或已获授权的内部环境。</p>
      </header>

      <AsyncBoundary state={state} isEmpty={(d) => d.length === 0} onRetry={retry}>
        {(agents) =>
          agents.map((a) => (
            <section className="panel" key={a.id} data-testid="agent-card">
              <div className="panel-head">
                <h2>
                  {a.name} <span className="mono version">{a.version}</span>
                </h2>
                <span className={`validate ${a.validate_status}`}>
                  {a.validate_status === 'validated' ? '已校验' : a.validate_status === 'invalid' ? '校验未通过' : '待校验'}
                </span>
              </div>
              <p className="page-desc">{a.purpose}</p>
              <dl className="kv">
                <dt>接口地址</dt>
                <dd className="mono">{a.endpoint}</dd>
                <dt>模型</dt>
                <dd className="mono">{a.model}</dd>
              </dl>

              <h3>知识库</h3>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={`${a.name}知识库`}>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>版本</th>
                    <th>来源</th>
                    <th>类型</th>
                  </tr>
                </thead>
                <tbody>
                  {a.knowledge.map((k) => (
                    <tr key={k.id}>
                      <td>{k.name}</td>
                      <td className="mono">{k.version}</td>
                      <td>{k.source}</td>
                      <td>
                        <span className={`tag ${k.kind === 'malicious' ? 'tag-danger' : k.kind === 'conflict' ? 'tag-warning' : 'tag-neutral'}`}>
                          {k.kind === 'normal' ? '正常' : k.kind === 'conflict' ? '冲突' : '含测试性恶意指令'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <h3>工具与权限</h3>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={`${a.name}工具与权限`}>
              <table>
                <thead>
                  <tr>
                    <th>工具</th>
                    <th>说明</th>
                    <th>副作用</th>
                    <th>权限决策</th>
                  </tr>
                </thead>
                <tbody>
                  {a.tools.map((t) => (
                    <tr key={t.name}>
                      <td className="mono">{t.name}</td>
                      <td>{t.description}</td>
                      <td>
                        <span className={t.side_effect === 'external_write' ? 'tag tag-danger' : 'tag tag-neutral'}>
                          {sideEffectLabel[t.side_effect]}
                        </span>
                      </td>
                      <td>{a.permissions[t.name] ? <PolicyTag v={a.permissions[t.name]} /> : '未配置'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <h3>授权范围</h3>
              <div className="scope-box" data-testid="authorized-scope">
                <p>
                  <strong>{a.authorized_scope.target_type === 'internal_mock' ? '团队自建靶场' : '已授权内部环境'}</strong>
                  <span className="tag tag-danger">禁止外部站点目标</span>
                </p>
                <p className="muted">{a.authorized_scope.note}</p>
              </div>
            </section>
          ))
        }
      </AsyncBoundary>
    </div>
  )
}
