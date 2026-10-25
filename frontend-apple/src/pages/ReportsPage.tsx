import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CheckCircle, DownloadSimple, FileCsv, FileText } from '@phosphor-icons/react'
import { api, ApiRequestError, USE_MOCK } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { StatusTag } from '@/components/Tags'
import { useAsync } from '@/hooks/useAsync'
import { buildReportFiles, downloadReportFile } from '@/utils/export'

export default function ReportsPage() {
  const metrics = useAsync(() => api.getMetrics(), [])
  const runs = useAsync(() => api.listRuns(), [])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [files, setFiles] = useState<ReturnType<typeof buildReportFiles> | null>(null)

  async function exportReport() {
    setExporting(true)
    setExportError(null)
    setExportStatus(null)
    try {
      const [currentMetrics, currentRuns, findings] = await Promise.all([api.getMetrics(), api.listRuns(), api.listFindings()])
      const runDetails = await Promise.allSettled(currentRuns.map((run) => api.getRunDetail(run.id)))
      const details: Awaited<ReturnType<typeof api.getRunDetail>>[] = []
      const unavailableRunIds: string[] = []
      runDetails.forEach((result, index) => {
        if (result.status === 'fulfilled') details.push(result.value)
        else unavailableRunIds.push(currentRuns[index].id)
      })
      const generated = buildReportFiles({ metrics: currentMetrics, runs: currentRuns, details, findings, unavailableRunIds, isMock: USE_MOCK })
      setFiles(generated)
      downloadReportFile(generated.markdown)
      downloadReportFile(generated.csv)
      setExportStatus('已生成 Markdown 与 CSV，共 ' + currentRuns.length + ' 条运行记录。' + (unavailableRunIds.length ? unavailableRunIds.length + ' 条详情暂不可用，已在报告中注明。' : ''))
    } catch (error) {
      setExportError(error instanceof ApiRequestError ? error.message : '报告生成失败，请检查服务后重新导出')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="reports-page">
      <header className="page-head">
        <h1>报告与回归</h1>
        <p className="page-desc">
          将版本变化、判定依据与修复效果留在同一份报告中。每个指标都可回溯到运行记录。
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
                    <th>状态</th>
                    <th>通过率</th>
                    <th>失败数</th>
                    <th>待复核</th>
                    <th>运行耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => {
                    const rate = r.total ? r.passed / r.total : 0
                    return (
                      <tr key={r.id}>
                        <td className="mono">{r.agent_version}</td>
                        <td>
                          <StatusTag v={r.status} />
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
        <p className="muted small">仅比较同测试集、同用例的修复前后记录；没有成对记录时显示暂无数据。运行 ID 列表表示全部聚合范围，不代表单次修复对照。</p>
      </section>

      <section className="panel export-panel">
        <div className="panel-toolbar"><h2>导出报告</h2><span className={`tag ${USE_MOCK ? 'tag-warning' : 'tag-info'}`}>{USE_MOCK ? 'Mock 示例数据' : '本地 API 数据'}</span></div>
        <p className="page-desc">
          包含测试集版本、运行记录、用例判定、人工复核记录及指标口径。文本字段中的常见令牌自动脱敏。
          {USE_MOCK && ' 当前为示例模式，报告会明确标注数据来源。'}
        </p>
        <div className="export-actions">
          <button className="btn btn-primary" data-testid="export-btn" onClick={() => void exportReport()} disabled={exporting}>
            <DownloadSimple size={18} aria-hidden="true" />{exporting ? '正在整理报告…' : '导出报告（Markdown + CSV）'}
          </button>
          {files && <>
            <button className="btn" onClick={() => downloadReportFile(files.markdown)} data-testid="export-markdown-btn"><FileText size={17} aria-hidden="true" />单独下载 Markdown</button>
            <button className="btn" onClick={() => downloadReportFile(files.csv)} data-testid="export-csv-btn"><FileCsv size={17} aria-hidden="true" />单独下载 CSV</button>
          </>}
        </div>
        {exportStatus && <p className="export-status" role="status" aria-live="polite" data-testid="export-status"><CheckCircle size={18} aria-hidden="true" />{exportStatus}</p>}
        {exportError && <p className="form-error" role="alert" data-testid="export-error">{exportError}</p>}
      </section>
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
