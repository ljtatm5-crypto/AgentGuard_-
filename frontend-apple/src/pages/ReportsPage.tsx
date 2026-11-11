import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, CheckCircle, DownloadSimple, FileCsv, FilePdf, FileText } from '@phosphor-icons/react'
import { api, ApiRequestError, getControlKey, USE_MOCK } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { StatusTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { buildReportFiles, downloadReportFile } from '@/utils/export'
import type { ReportSnapshot } from '@/utils/export'
import { buildReportHtml, printReportHtml } from '@/utils/pdf'
import type { JudgeResult, TestRun } from '@/types/api'

export default function ReportsPage() {
  const metrics = useAsync(() => api.getMetrics(), [])
  const runs = useAsync(() => api.listRuns(), [])
  const capabilities = useAsync(() => api.getCapabilities(), [])
  const [exporting, setExporting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [files, setFiles] = useState<ReturnType<typeof buildReportFiles> | null>(null)

  /**
   * Markdown / CSV / PDF 共用同一次取数，保证三种格式的字段与口径完全一致。
   */
  async function collectSnapshot(): Promise<ReportSnapshot> {
    const [currentMetrics, currentRuns, findings, caps] = await Promise.all([
      api.getMetrics(),
      api.listRuns(),
      api.listFindings(),
      api.getCapabilities(),
    ])
    const dataSource = USE_MOCK ? '示例测试数据' : 'AgentGuard 安全测试运行记录'
    const details: Awaited<ReturnType<typeof api.getRunDetail>>[] = []
    const unavailableRunIds: string[] = []
    if (USE_MOCK || caps.anonymous_writes || getControlKey()) {
      const runDetails = await Promise.allSettled(currentRuns.map((run) => api.getRunDetail(run.id)))
      runDetails.forEach((result, index) => {
        if (result.status === 'fulfilled') details.push(result.value)
        else unavailableRunIds.push(currentRuns[index].id)
      })
    } else {
      unavailableRunIds.push(...currentRuns.map((run) => run.id))
    }
    return { metrics: currentMetrics, runs: currentRuns, details, findings, unavailableRunIds, isMock: USE_MOCK, dataSource }
  }

  async function exportReport() {
    setExporting(true)
    setExportError(null)
    setExportStatus(null)
    try {
      const snapshot = await collectSnapshot()
      const generated = buildReportFiles(snapshot)
      setFiles(generated)
      downloadReportFile(generated.markdown)
      downloadReportFile(generated.csv)
      setExportStatus(
        '报告已生成，共包含 ' + snapshot.runs.length + ' 条测试记录。' +
          (snapshot.unavailableRunIds.length ? snapshot.unavailableRunIds.length + ' 条记录详情暂不可用，已在报告中注明。' : ''),
      )
    } catch (error) {
      setExportError(error instanceof ApiRequestError ? error.message : '报告生成失败，请检查服务后重新导出')
    } finally {
      setExporting(false)
    }
  }

  async function exportPdf() {
    setPdfLoading(true)
    setExportError(null)
    setExportStatus(null)
    try {
      const snapshot = await collectSnapshot()
      // 先取数再构建，构建失败不会打开空的打印视图。
      const html = buildReportHtml({ ...snapshot, generatedAt: new Date() })
      printReportHtml(html)
      setExportStatus('已打开 PDF 打印视图：在打印对话框中选择「另存为 PDF」即可保存。')
    } catch (error) {
      setExportError(error instanceof ApiRequestError ? error.message : 'PDF 视图生成失败，请稍后重试')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="reports-page">
      <header className="page-head">
        <h1>报告与回归</h1>
        <p className="page-desc">
          查看版本结论、修复效果，并导出客户可读的测试报告。
        </p>
      </header>

      <section className="panel">
        <h2>版本对照</h2>
        <AsyncBoundary state={runs.state} isEmpty={(d) => d.length === 0} onRetry={runs.retry}>
          {(data) => (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="运行版本对照">
            <table data-testid="compare-table">
                <thead>
                  <tr>
                    <th>版本</th>
                    <th>安全结论</th>
                    <th>通过率</th>
                    <th>失败数</th>
                    <th>待复核</th>
                    <th>运行耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => {
                    const rate = r.completed ? r.passed / r.completed : 0
                    const conclusion = conclusionForRun(r)
                    return (
                      <tr key={r.id}>
                        <td className="mono">{r.agent_version}</td>
                        <td>
                          <strong className={`report-run-conclusion report-conclusion-${conclusion.tone}`}>{conclusion.label}</strong>
                          <small className="muted block small">{conclusion.note}</small>
                        </td>
                        <td>{(rate * 100).toFixed(1)}%{(r.status === 'running' || r.status === 'pending') && <span className="muted block small">任务未完成</span>}</td>
                        <td>{r.failed}</td>
                        <td>{r.needs_review}</td>
                        <td>{r.latency_ms ? `${r.latency_ms.toLocaleString()} ms` : '暂无'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
          )}
        </AsyncBoundary>
      </section>

      <section className="panel">
        <h2>攻击成功率前后变化</h2>
        <AsyncBoundary state={metrics.state} onRetry={metrics.retry}>
          {(m) => (
            <div className="compare-bars" data-testid="attack-rate-compare">
              <CompareBar
                label="修复前（匹配用例）"
                value={m.attack_success_rate_before}
                tone="bad"
              />
              <CompareBar
                label="修复后（匹配用例）"
                value={m.attack_success_rate_after}
                tone="good"
              />
            </div>
          )}
        </AsyncBoundary>
        <p className="muted small">仅对比同测试集、同用例的修复前后记录。</p>
      </section>

      <section className="panel">
        <h2>逐用例修复差异</h2>
        <AsyncBoundary state={runs.state} isEmpty={(data) => data.length < 2} onRetry={runs.retry}>
          {(data) => <RunComparison runs={data} canReadPrivate={USE_MOCK || (capabilities.state.phase === 'ready' && (capabilities.state.data.anonymous_writes || Boolean(getControlKey())))} />}
        </AsyncBoundary>
      </section>

      <section className="panel export-panel">
        <div className="panel-toolbar"><h2>导出报告</h2>{USE_MOCK && <span className="tag tag-warning">示例数据</span>}</div>
        <p className="page-desc">
          报告包含测试结论、用例判定、证据与修复建议。
        </p>
        <div className="export-actions">
          <button className="btn btn-primary" data-testid="export-btn" onClick={() => void exportReport()} disabled={exporting}>
            <DownloadSimple size={18} aria-hidden="true" />{exporting ? '正在生成报告…' : '导出测试报告'}
          </button>
          <button className="btn" data-testid="export-pdf-btn" onClick={() => void exportPdf()} disabled={pdfLoading}>
            <FilePdf size={18} aria-hidden="true" />{pdfLoading ? '正在准备…' : '导出 PDF'}
          </button>
          {files && <>
            <button className="btn" onClick={() => downloadReportFile(files.markdown)} data-testid="export-markdown-btn"><FileText size={17} aria-hidden="true" />下载文本报告</button>
            <button className="btn" onClick={() => downloadReportFile(files.csv)} data-testid="export-csv-btn"><FileCsv size={17} aria-hidden="true" />下载明细表</button>
          </>}
        </div>
        <p className="muted small export-hint">导出 PDF 时，请在打印窗口中选择“另存为 PDF”。</p>
        {exportStatus && <p className="export-status" role="status" aria-live="polite" data-testid="export-status"><CheckCircle size={18} aria-hidden="true" />{exportStatus}</p>}
        {exportError && <p className="form-error" role="alert" data-testid="export-error">{exportError}</p>}
      </section>
    </div>
  )
}

function conclusionForRun(run: TestRun): { label: string; note: string; tone: string } {
  if (run.status === 'running' || run.status === 'pending') {
    return { label: '仍在执行', note: `已完成 ${run.completed} / ${run.total} 项`, tone: 'running' }
  }
  if (run.status === 'failed') {
    return { label: '未通过', note: `命中 ${run.failed} 项明确违规`, tone: 'failed' }
  }
  if (run.status === 'needs_review') {
    return { label: '待确认', note: `${run.needs_review} 项需要人工复核`, tone: 'review' }
  }
  return { label: '通过', note: '已测范围未发现违规', tone: 'passed' }
}

function RunComparison({ runs, canReadPrivate }: { runs: TestRun[]; canReadPrivate: boolean }) {
  const chronological = [...runs].sort((left, right) => left.started_at.localeCompare(right.started_at))
  const [beforeId, setBeforeId] = useState(chronological.at(-2)?.id ?? '')
  const [afterId, setAfterId] = useState(chronological.at(-1)?.id ?? '')
  useEffect(() => {
    if (!chronological.some((run) => run.id === beforeId)) setBeforeId(chronological.at(-2)?.id ?? '')
    if (!chronological.some((run) => run.id === afterId)) setAfterId(chronological.at(-1)?.id ?? '')
  }, [chronological, beforeId, afterId])

  const beforeRun = chronological.find((run) => run.id === beforeId)
  const afterRun = chronological.find((run) => run.id === afterId)
  const details = useAsync(
    () => canReadPrivate && beforeRun && afterRun
      ? Promise.all([api.getRunDetail(beforeRun.id), api.getRunDetail(afterRun.id)])
      : Promise.resolve(null),
    [beforeRun?.id, afterRun?.id, canReadPrivate],
  )
  const sameSuite = beforeRun && afterRun && beforeRun.suite_id === afterRun.suite_id

  return (
    <div className="report-diff">
      <div className="report-diff-controls">
        <label>
          修复前
          <select value={beforeId} onChange={(event) => setBeforeId(event.target.value)}>
            {chronological.map((run) => <option key={run.id} value={run.id}>{run.agent_version} · {run.task_id}</option>)}
          </select>
        </label>
        <ArrowRight size={18} aria-hidden="true" />
        <label>
          修复后
          <select value={afterId} onChange={(event) => setAfterId(event.target.value)}>
            {chronological.map((run) => <option key={run.id} value={run.id}>{run.agent_version} · {run.task_id}</option>)}
          </select>
        </label>
      </div>
      {!sameSuite && <p className="form-error" role="alert">两次运行必须使用同一测试集才能做逐用例对比。</p>}
      {!canReadPrivate && (
        <p className="muted small" role="status">
          逐用例详情属于私有运行证据。请在设置页输入操作员令牌后刷新本页；当前仅展示公开摘要。
        </p>
      )}
      <AsyncBoundary state={details.state} onRetry={details.retry}>
        {(data) => !data || !sameSuite ? null : <DiffTable before={data[0].results} after={data[1].results} beforeRun={beforeRun} afterRun={afterRun} />}
      </AsyncBoundary>
    </div>
  )
}

function DiffTable({ before, after, beforeRun, afterRun }: {
  before: JudgeResult[]
  after: JudgeResult[]
  beforeRun?: TestRun
  afterRun?: TestRun
}) {
  const caseIds = [...new Set([...before.map((item) => item.case_id), ...after.map((item) => item.case_id)])]
  const rows = caseIds.map((caseId) => {
    const beforeResult = before.find((item) => item.case_id === caseId)
    const afterResult = after.find((item) => item.case_id === caseId)
    let change = '未变化'
    if (!beforeResult || !afterResult) change = '无法比较'
    else if (beforeResult.status !== 'passed' && afterResult.status === 'passed') change = '已修复'
    else if (beforeResult.status === 'passed' && afterResult.status !== 'passed') change = '新增回归'
    else if (beforeResult.status !== 'passed' && afterResult.status !== 'passed') change = '仍存在'
    return { caseId, beforeResult, afterResult, change }
  })
  const changeClass = (change: string) => {
    if (change === '已修复') return 'fixed'
    if (change === '新增回归') return 'regression'
    if (change === '仍存在') return 'existing'
    if (change === '无法比较') return 'not-comparable'
    return 'unchanged'
  }
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="逐用例修复差异">
      <table className="diff-table">
        <thead>
          <tr><th>用例</th><th>修复前</th><th>修复后</th><th>变化</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.caseId}>
              <td className="mono">{row.caseId}</td>
              <td>{row.beforeResult ? <StatusTag v={row.beforeResult.status} /> : <span className="muted">缺失</span>}</td>
              <td>{row.afterResult ? <StatusTag v={row.afterResult.status} /> : <span className="muted">缺失</span>}</td>
              <td><span className={`diff-badge diff-${changeClass(row.change)}`}><i aria-hidden="true" />{row.change}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="diff-footnote">
        对比范围：<span className="mono">{beforeRun?.task_id}</span> 与 <span className="mono">{afterRun?.task_id}</span>
      </p>
    </div>
  )
}

function CompareBar({
  label,
  value,
  tone,
}: {
  label: string
  value: number | null
  tone: 'good' | 'bad'
}) {
  const pct = value === null ? 0 : Math.round(value * 100)
  return (
    <div className="cmp">
      <span className="cmp-label">{label}</span>
      <span className="cmp-bar">
        <span
          className={`cmp-fill ${tone}`}
          style={{ '--cmp-progress': pct / 100 } as CSSProperties}
        />
      </span>
      <span className="cmp-value">{value === null ? '暂无数据' : `${pct}%`}</span>
    </div>
  )
}
