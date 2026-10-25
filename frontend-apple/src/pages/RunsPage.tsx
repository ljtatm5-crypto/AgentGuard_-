import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowClockwise, Crosshair, Play, X } from '@phosphor-icons/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { JudgeSourceTag, PolicyTag, StatusTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { TRACE_TYPE_LABELS } from '@/types/enums'
import type { TraceEventType } from '@/types/enums'

export default function RunsPage() {
  const runs = useAsync(() => api.listRuns(), [])
  const agents = useAsync(() => api.listAgents(), [])
  const suites = useAsync(() => api.listSuites(), [])
  const { runId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const opened = runId ?? searchParams.get('run')
  const focusedCase = searchParams.get('case') ?? ''
  const focusedEvents = searchParams.get('events') ?? ''
  const eventIds = focusedEvents.split(',').filter(Boolean)
  const traceSection = useRef<HTMLElement>(null)
  const [agentId, setAgentId] = useState('')
  const [suiteId, setSuiteId] = useState('')
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const detail = useAsync(
    () => (opened ? api.getRunDetail(opened) : Promise.resolve(null)),
    [opened],
  )
  const trace = useAsync(
    () => (opened ? api.getTrace(opened) : Promise.resolve([])),
    [opened],
  )

  useEffect(() => {
    if (trace.state.phase !== 'ready' || !opened || (!focusedCase && !focusedEvents)) return
    const frame = requestAnimationFrame(() => {
      const target = traceSection.current?.querySelector<HTMLElement>('[data-evidence-focus="true"]')
      if (!target) return
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
      target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [trace.state, opened, focusedCase, focusedEvents])

  function openRun(runId: string) {
    navigate(`/runs/${runId}`)
  }

  function closeRun() {
    if (runId) {
      navigate('/runs')
      return
    }
    setSearchParams({})
  }

  function refresh() {
    runs.retry()
    if (opened) {
      detail.retry()
      trace.retry()
    }
  }

  async function launch() {
    setLaunchError(null)
    if (!agentId || !suiteId) {
      setLaunchError('请先选择 Agent 与测试集')
      return
    }
    setLaunching(true)
    try {
      const run = await api.createRun({ agent_id: agentId, suite_id: suiteId })
      runs.retry()
      openRun(run.id)
    } catch (e) {
      setLaunchError(e instanceof ApiRequestError ? e.message : '启动任务失败，请稍后重试')
    } finally {
      setLaunching(false)
    }
  }

  const assetError = agents.state.phase === 'error' || suites.state.phase === 'error'
  const assetsLoading = agents.state.phase === 'loading' || suites.state.phase === 'loading'

  return (
    <div className="runs-page">
      <header className="page-head">
        <h1>执行任务</h1>
        <p className="page-desc">选定资产与测试集，开始一次可追溯的测试。由规则先行判定，再逐条核对证据。</p>
      </header>

      <section className="panel launch-panel">
        <h2>启动新任务</h2>
        <form className="form-row" onSubmit={(event) => { event.preventDefault(); void launch() }}>
          <label>
            Agent
            <select value={agentId} onChange={(e) => { setAgentId(e.target.value); setLaunchError(null) }} disabled={agents.state.phase !== 'ready'} data-testid="select-agent">
              <option value="">{agents.state.phase === 'loading' ? '正在加载资产…' : '选择 Agent'}</option>
              {(agents.state.phase === 'ready' ? agents.state.data : []).map((a) => (
                <option key={a.id} value={a.id}>{a.name} {a.version}</option>
              ))}
            </select>
          </label>
          <label>
            测试集
            <select value={suiteId} onChange={(e) => { setSuiteId(e.target.value); setLaunchError(null) }} disabled={suites.state.phase !== 'ready'} data-testid="select-suite">
              <option value="">{suites.state.phase === 'loading' ? '正在加载测试集…' : '选择测试集'}</option>
              {(suites.state.phase === 'ready' ? suites.state.data : []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} {s.version}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={launching || assetsLoading || assetError} data-testid="launch-btn">
            <Play size={16} weight="fill" aria-hidden="true" />{launching ? '启动中…' : '启动任务'}
          </button>
        </form>
        {assetError && <div className="form-error" role="alert">资产或测试集加载失败。<button className="btn" onClick={() => { agents.retry(); suites.retry() }}>重新加载</button></div>}
        {launchError && <p className="form-error" role="alert" data-testid="launch-error">{launchError}</p>}
      </section>

      <section className="panel">
        <div className="panel-toolbar">
          <h2>任务列表</h2>
          <button className="btn" onClick={refresh} aria-label="刷新任务与轨迹"><ArrowClockwise size={16} aria-hidden="true" />刷新</button>
        </div>
        <AsyncBoundary state={runs.state} isEmpty={(d) => d.length === 0} onRetry={runs.retry}>
          {(data) => (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="任务列表">
              <table data-testid="runs-table">
                <thead><tr><th>任务 ID</th><th>状态</th><th>进度</th><th>通过 / 失败 / 待复核</th><th>延迟</th><th>开始时间</th><th><span className="sr-only">操作</span></th></tr></thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className={opened === r.id ? 'row-active' : undefined}>
                      <td className="mono">{r.task_id}</td>
                      <td><StatusTag v={r.status} /></td>
                      <td><span className="run-progress" style={{ '--run-progress': String(r.total ? r.completed / r.total * 100 : 0) + '%' } as CSSProperties}>{r.completed} / {r.total}</span></td>
                      <td>{r.passed} / {r.failed} / {r.needs_review}</td>
                      <td>{r.latency_ms ? r.latency_ms.toLocaleString() + ' ms' : '暂无'}</td>
                      <td className="mono">{r.started_at.replace('T', ' ').slice(0, 19)}</td>
                      <td><button className="btn" onClick={() => openRun(r.id)} aria-expanded={opened === r.id} aria-controls="run-details">详情与轨迹</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {opened && (
        <>
          <section className="panel" id="run-details">
            <div className="panel-toolbar detail-head">
              <div><span className="eyebrow mono">{opened}</span><h2>单条用例结论</h2></div>
              <button className="btn btn-icon" onClick={closeRun} aria-label="收起任务详情"><X size={18} aria-hidden="true" /></button>
            </div>
            <AsyncBoundary state={detail.state} onRetry={detail.retry}>
              {(d) => !d ? null : d.results.length === 0 ? <p className="muted">任务尚未产生用例结论，可稍后刷新查看。</p> : (
                <div className="table-scroll" tabIndex={0} role="region" aria-label="单条用例结论">
                  <table data-testid="results-table">
                    <thead><tr><th>用例</th><th>结论</th><th>判定来源</th><th>置信度</th><th>理由</th><th>证据事件</th></tr></thead>
                    <tbody>
                      {d.results.map((r) => (
                        <tr key={r.case_id} className={focusedCase === r.case_id ? 'trace-case-focused' : undefined}>
                          <td className="mono">{r.case_id}</td>
                          <td><StatusTag v={r.status} /></td>
                          <td><JudgeSourceTag v={r.judge_source} /></td>
                          <td>{(r.confidence * 100).toFixed(0)}%</td>
                          <td>{r.reason}</td>
                          <td className="mono small">{r.evidence.event_ids.join(', ') || '暂无'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AsyncBoundary>
          </section>

          <section className="panel" ref={traceSection}>
            <h2>执行轨迹</h2>
            {(focusedCase || eventIds.length > 0) && <div className="trace-focus-banner" data-testid="evidence-focus-banner"><Crosshair size={18} aria-hidden="true" /><span>证据定位 · {focusedCase || '指定事件'}{eventIds.length > 0 ? ' · ' + eventIds.join(', ') : ''}</span><button className="btn" onClick={() => openRun(opened)}>清除定位</button></div>}
            <AsyncBoundary state={trace.state} isEmpty={(d) => d.length === 0} onRetry={trace.retry}>
              {(events) => (
                <>
                  {(focusedCase || eventIds.length > 0) && !events.some((e) => (!focusedCase || e.case_id === focusedCase) && (!eventIds.length || eventIds.includes(e.id))) && <p className="form-error" role="status">当前轨迹中未找到所引用的事件，请核对任务与用例版本。</p>}
                  <ol className="timeline" data-testid="trace-timeline">
                    {events.map((e) => {
                      const focused = (!focusedCase || e.case_id === focusedCase) && (eventIds.length > 0 ? eventIds.includes(e.id) : focusedCase === e.case_id)
                      return (
                        <li key={e.id} className={focused ? 'trace-focused' : undefined} tabIndex={focused ? -1 : undefined} data-evidence-focus={focused ? 'true' : undefined} data-event-id={e.id}>
                          <span className="tl-time mono">{e.timestamp.replace('T', ' ').slice(11, 19)}</span>
                          <span className="tl-id mono">{e.id}</span>
                          <span className="tl-type"><TraceTag type={e.type} /></span>
                          <span className="tl-case mono">{e.case_id}</span>
                          <div className="tl-body">
                            {e.tool && <div className="mono small">工具：{e.tool}</div>}
                            {e.params && <div className="mono small">参数：{JSON.stringify(e.params)}</div>}
                            {e.policy_decision && <div>权限决策：<PolicyTag v={e.policy_decision} /></div>}
                            {e.output && <div>{e.output}</div>}
                            {e.error && <div className="err">错误：{e.error}</div>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </>
              )}
            </AsyncBoundary>
          </section>
        </>
      )}
    </div>
  )
}

function TraceTag({ type }: { type: TraceEventType }) {
  const tone: Record<TraceEventType, string> = { input: 'tag-neutral', retrieval: 'tag-info', tool: 'tag-info', policy: 'tag-warning', response: 'tag-neutral', error: 'tag-danger' }
  return <span className={'tag ' + tone[type]}>{TRACE_TYPE_LABELS[type]}</span>
}
