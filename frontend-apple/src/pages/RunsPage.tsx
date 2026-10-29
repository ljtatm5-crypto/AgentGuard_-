import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowClockwise, ArrowRight, Crosshair, FunnelSimple, MagnifyingGlass, Play, X } from '@phosphor-icons/react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { JudgeSourceTag, PolicyTag, StatusTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { TRACE_TYPE_LABELS, TRACE_TYPE_ORDER } from '@/types/enums'
import { buildTraceView } from '@/utils/trace'
import type { TraceEventType } from '@/types/enums'
import type { TraceEvent } from '@/types/api'

/**
 * 单次渲染的轨迹事件条数。
 * 大批量事件（500+）一次性挂载会阻塞主线程，先渲染首屏，其余按需追加。
 */
const TRACE_PAGE_SIZE = 60

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
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | 'failed' | 'review'>('all')
  const [traceTypes, setTraceTypes] = useState<TraceEventType[]>([])
  const [traceQuery, setTraceQuery] = useState('')
  const [traceOnlyIssues, setTraceOnlyIssues] = useState(false)
  const [traceLimit, setTraceLimit] = useState(TRACE_PAGE_SIZE)
  const detail = useAsync(
    () => (opened ? api.getRunDetail(opened) : Promise.resolve(null)),
    [opened],
  )
  const trace = useAsync(
    () => (opened ? api.getTrace(opened) : Promise.resolve([])),
    [opened],
  )

  useEffect(() => {
    const requestedAgent = searchParams.get('agent')
    if (requestedAgent) setAgentId(requestedAgent)
  }, [searchParams])

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
        <section className="panel run-workbench" id="run-details" ref={traceSection}>
          <div className="panel-toolbar detail-head">
            <div>
              <span className="eyebrow mono">{opened}</span>
              <h2>测试执行工作区</h2>
            </div>
            <button className="btn btn-icon" onClick={closeRun} aria-label="收起任务详情"><X size={18} aria-hidden="true" /></button>
          </div>

          <AsyncBoundary state={detail.state} onRetry={detail.retry}>
            {(d) => {
              if (!d) return null
              if (d.results.length === 0) return <p className="muted">任务尚未产生用例结论，可稍后刷新查看。</p>
              const filteredResults = d.results.filter((result) => {
                if (resultFilter === 'failed') return result.status === 'failed'
                if (resultFilter === 'review') return result.status === 'needs_review'
                return true
              })
              const activeResult = d.results.find((result) => result.case_id === (selectedCaseId || focusedCase))
                ?? filteredResults.find((result) => result.status === 'failed')
                ?? filteredResults[0]
                ?? d.results[0]
              const selectCase = (caseId: string) => {
                setSelectedCaseId(caseId)
                setSelectedEventId('')
                setTraceLimit(TRACE_PAGE_SIZE)
              }
              return (
                <>
                  {(focusedCase || eventIds.length > 0) && (
                    <div className="trace-focus-banner" data-testid="evidence-focus-banner">
                      <Crosshair size={18} aria-hidden="true" />
                      <span>证据定位 · {focusedCase || '指定事件'}{eventIds.length > 0 ? ' · ' + eventIds.join(', ') : ''}</span>
                      <button className="btn" onClick={() => openRun(opened)}>清除定位</button>
                    </div>
                  )}

                  <div className="run-workspace-grid">
                    <aside className="run-case-rail" aria-label="测试用例结果">
                      <div className="run-filter-bar">
                        <span className="run-filter-icon"><FunnelSimple size={15} /></span>
                        <FilterButton active={resultFilter === 'all'} onClick={() => setResultFilter('all')} label={`全部 ${d.results.length}`} />
                        <FilterButton active={resultFilter === 'failed'} onClick={() => setResultFilter('failed')} label={`失败 ${d.results.filter((result) => result.status === 'failed').length}`} />
                        <FilterButton active={resultFilter === 'review'} onClick={() => setResultFilter('review')} label={`待复核 ${d.results.filter((result) => result.status === 'needs_review').length}`} />
                      </div>
                      <div className="run-case-list" data-testid="results-table">
                        {filteredResults.map((result, index) => (
                          <button
                            type="button"
                            key={result.case_id}
                            className={`run-case-item ${activeResult.case_id === result.case_id ? 'active' : ''} ${focusedCase === result.case_id ? 'trace-case-focused' : ''}`}
                            onClick={() => selectCase(result.case_id)}
                          >
                            <span className="run-case-index">{String(index + 1).padStart(2, '0')}</span>
                            <span>
                              <strong>{result.case_id}</strong>
                              <small>{result.reason}</small>
                            </span>
                            <StatusTag v={result.status} />
                          </button>
                        ))}
                      </div>
                    </aside>

                    <section className="run-behavior-panel" aria-label="Agent 行为轨迹">
                      <div className="workspace-section-head">
                        <div><span className="detail-label">Agent 行为</span><h3>{activeResult.case_id}</h3></div>
                        <div className="trace-header-meta">
                          <span>点击节点聚焦证据</span>
                          <TraceTag type="policy" />
                        </div>
                      </div>
                      <AsyncBoundary state={trace.state} isEmpty={(events) => events.length === 0} onRetry={trace.retry}>
                        {(events) => {
                          const caseEvents = events.filter((event) => event.case_id === activeResult.case_id)
                          return (
                            <>
                              {(focusedCase || eventIds.length > 0) && !caseEvents.some((event) => !eventIds.length || eventIds.includes(event.id)) && (
                                <p className="form-error" role="status">当前轨迹中未找到所引用的事件，请核对任务与用例版本。</p>
                              )}
                              <TraceBrowser
                                events={caseEvents}
                                types={traceTypes}
                                query={traceQuery}
                                onlyIssues={traceOnlyIssues}
                                limit={traceLimit}
                                onTypes={(next) => { setTraceTypes(next); setTraceLimit(TRACE_PAGE_SIZE) }}
                                onQuery={(next) => { setTraceQuery(next); setTraceLimit(TRACE_PAGE_SIZE) }}
                                onOnlyIssues={(next) => { setTraceOnlyIssues(next); setTraceLimit(TRACE_PAGE_SIZE) }}
                                onShowMore={() => setTraceLimit((value) => value + TRACE_PAGE_SIZE)}
                                onReset={() => { setTraceTypes([]); setTraceQuery(''); setTraceOnlyIssues(false); setTraceLimit(TRACE_PAGE_SIZE) }}
                                selectedEventId={selectedEventId}
                                onSelect={setSelectedEventId}
                                focusedCase={focusedCase}
                                eventIds={eventIds}
                              />
                            </>
                          )
                        }}
                      </AsyncBoundary>
                    </section>

                    <aside className={`run-verdict-panel verdict-${activeResult.status}`} aria-label="判定与证据">
                      <span className="detail-label">判定与证据</span>
                      <div className="verdict-status"><StatusTag v={activeResult.status} /><JudgeSourceTag v={activeResult.judge_source} /></div>
                      <h3>{(activeResult.confidence * 100).toFixed(0)}% 置信度</h3>
                      <p>{activeResult.reason}</p>
                      {(() => {
                        const selectedEvent = trace.state.phase === 'ready'
                          ? trace.state.data.find((event) => event.id === selectedEventId && event.case_id === activeResult.case_id)
                          : undefined
                        return selectedEvent ? (
                          <div className="verdict-event-focus" aria-live="polite">
                            <span>当前轨迹节点</span>
                            <strong>{selectedEvent.tool || TRACE_TYPE_LABELS[selectedEvent.type]}</strong>
                            <small>{selectedEvent.timestamp.replace('T', ' ').slice(11, 19)} · {selectedEvent.id}</small>
                            {selectedEvent.output && <p>{selectedEvent.output}</p>}
                            <span className={activeResult.evidence.event_ids.includes(selectedEvent.id) ? 'focus-linked' : ''}>
                              {activeResult.evidence.event_ids.includes(selectedEvent.id) ? '已关联本次判定证据' : '供人工审计的轨迹节点'}
                            </span>
                          </div>
                        ) : null
                      })()}
                      <div className="verdict-evidence">
                        <strong>证据事件</strong>
                        <span className="mono">{activeResult.evidence.event_ids.join(', ') || '暂无事件'}</span>
                      </div>
                      <Link
                        className="btn"
                        to={`/runs?${new URLSearchParams({ run: activeResult.evidence.run_id, case: activeResult.evidence.case_id, events: activeResult.evidence.event_ids.join(',') })}`}
                      >
                        在轨迹中定位 <ArrowRight size={15} />
                      </Link>
                    </aside>
                  </div>
                </>
              )
            }}
          </AsyncBoundary>
        </section>
      )}
    </div>
  )
}

function TraceTag({ type }: { type: TraceEventType }) {
  const tone: Record<TraceEventType, string> = { input: 'tag-neutral', retrieval: 'tag-info', tool: 'tag-info', policy: 'tag-warning', response: 'tag-neutral', error: 'tag-danger' }
  return <span className={'tag ' + tone[type]}>{TRACE_TYPE_LABELS[type]}</span>
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick}>{label}</button>
}

function TraceBrowser({
  events,
  types,
  query,
  onlyIssues,
  limit,
  onTypes,
  onQuery,
  onOnlyIssues,
  onShowMore,
  onReset,
  selectedEventId,
  onSelect,
  focusedCase,
  eventIds,
}: {
  events: TraceEvent[]
  types: TraceEventType[]
  query: string
  onlyIssues: boolean
  limit: number
  onTypes: (next: TraceEventType[]) => void
  onQuery: (next: string) => void
  onOnlyIssues: (next: boolean) => void
  onShowMore: () => void
  onReset: () => void
  selectedEventId: string
  onSelect: (id: string) => void
  focusedCase: string
  eventIds: string[]
}) {
  const { visible, rendered, filtered, counts } = useMemo(
    () => buildTraceView({ events, types, query, onlyIssues, limit, focusedCase, eventIds }),
    [events, types, query, onlyIssues, limit, focusedCase, eventIds],
  )

  const toggleType = (type: TraceEventType) => {
    onTypes(types.includes(type) ? types.filter((item) => item !== type) : [...types, type])
  }

  return (
    <>
      <div className="trace-controls" data-testid="trace-controls">
        <div className="trace-type-chips" role="group" aria-label="按事件类型筛选">
          <button
            type="button"
            className={types.length === 0 ? 'active' : ''}
            aria-pressed={types.length === 0}
            onClick={() => onTypes([])}
          >
            全部 {events.length}
          </button>
          {TRACE_TYPE_ORDER.filter((type) => counts.has(type)).map((type) => (
            <button
              type="button"
              key={type}
              className={types.includes(type) ? 'active' : ''}
              aria-pressed={types.includes(type)}
              onClick={() => toggleType(type)}
              data-testid={`trace-type-${type}`}
            >
              {TRACE_TYPE_LABELS[type]} {counts.get(type)}
            </button>
          ))}
        </div>
        <div className="trace-tools">
          <label className="trace-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <span className="sr-only">搜索轨迹事件</span>
            <input
              type="search"
              value={query}
              placeholder="搜索工具、输出或参数"
              onChange={(event) => onQuery(event.target.value)}
              data-testid="trace-search"
            />
          </label>
          <label className="trace-issue-toggle">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(event) => onOnlyIssues(event.target.checked)}
              data-testid="trace-only-issues"
            />
            仅看异常与拒绝
          </label>
        </div>
        <p className="trace-count" role="status" aria-live="polite" data-testid="trace-count">
          {filtered
            ? `筛选后 ${visible.length} 条 / 本用例共 ${events.length} 条`
            : `本用例共 ${events.length} 条事件`}
          {visible.length > rendered.length ? ` · 已显示前 ${rendered.length} 条` : ''}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="trace-empty" data-testid="trace-empty">
          <p>没有匹配的轨迹事件。</p>
          <button type="button" className="btn" onClick={onReset}>清除筛选条件</button>
        </div>
      ) : (
        <ol className="event-flow" data-testid="trace-timeline">
          {rendered.map((event, index) => {
            const focused = focusedCase === event.case_id && (eventIds.length === 0 || eventIds.includes(event.id))
            return (
              <li
                key={event.id}
                className={`event-node ${focused ? 'trace-focused' : ''} ${selectedEventId === event.id ? 'event-selected' : ''} ${event.error ? 'has-error' : ''}`}
                tabIndex={0}
                data-evidence-focus={focused ? 'true' : undefined}
                data-event-id={event.id}
                aria-current={selectedEventId === event.id ? 'true' : undefined}
                onClick={() => onSelect(event.id)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.target !== keyEvent.currentTarget) return
                  if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                    keyEvent.preventDefault()
                    onSelect(event.id)
                  }
                }}
              >
                <span className="event-node-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="event-node-card">
                  <div className="event-node-head">
                    <TraceTag type={event.type} />
                    <span className="mono">{event.timestamp.replace('T', ' ').slice(11, 19)}</span>
                  </div>
                  <strong>{event.tool || TRACE_TYPE_LABELS[event.type]}</strong>
                  {event.policy_decision && <div>权限决策：<PolicyTag v={event.policy_decision} /></div>}
                  {event.output && <p>{event.output}</p>}
                  {event.error && <p className="err">{event.error}</p>}
                  <details>
                    <summary>查看原始事件</summary>
                    <span className="mono">{event.id}</span>
                    <pre>{JSON.stringify(event.params, null, 2)}</pre>
                  </details>
                </div>
                {index < rendered.length - 1 && <ArrowRight className="event-arrow" size={16} aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      )}

      {visible.length > rendered.length && (
        <button type="button" className="btn trace-more" onClick={onShowMore} data-testid="trace-show-more">
          再显示 {Math.min(TRACE_PAGE_SIZE, visible.length - rendered.length)} 条（剩余 {visible.length - rendered.length} 条）
        </button>
      )}
    </>
  )
}
