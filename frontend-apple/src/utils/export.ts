import type { Finding, JudgeResult, Metrics, TestRun } from '@/types/api'
import { FINDING_STATUS_LABELS, JUDGE_SOURCE_LABELS, RISK_TAG_LABELS, SEVERITY_LABELS, STATUS_LABELS } from '@/types/enums'

export interface ReportSnapshot {
  metrics: Metrics
  runs: TestRun[]
  details: { run: TestRun; results: JudgeResult[] }[]
  findings: Finding[]
  unavailableRunIds: string[]
  isMock: boolean
  generatedAt?: Date
}

export interface ReportFile {
  name: string
  content: string
  mime: string
}

/** Export only selected report fields; raw tool parameters and Agent credentials are excluded. */
export function redactReportText(value: unknown): string {
  return String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [已脱敏]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[已脱敏]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password|密码|密钥)\s*[:=]\s*)["']?[^"'\s,;]+["']?/gi, '$1[已脱敏]')
}

function md(value: unknown): string {
  return redactReportText(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|]/g, '\\$&')
    .replace(/\r?\n/g, '<br>')
}

/** Quoting preserves commas/newlines; a leading apostrophe prevents spreadsheet formula execution. */
function csvCell(value: unknown): string {
  let safe = redactReportText(value)
  if (/^[\s\p{Cc}]*[=+@-]/u.test(safe)) safe = "'" + safe
  return '"' + safe.replace(/"/g, '""') + '"'
}

function percentage(value: number | null): string {
  return value === null ? '暂无' : (value * 100).toFixed(1) + '%'
}

export function buildReportFiles(snapshot: ReportSnapshot): { markdown: ReportFile; csv: ReportFile } {
  const { metrics: m, runs, details, findings, unavailableRunIds, isMock } = snapshot
  const generated = snapshot.generatedAt ?? new Date()
  const generatedAt = generated.toISOString()
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const source = isMock ? 'Mock 示例数据（用于演示，不作为实测结果）' : '本地 API 运行数据（以实际适配器与授权靶场配置为准）'
  const lines = [
    '# AgentGuard 智测盾测试报告', '',
    '- 导出时间：' + generatedAt,
    '- 数据来源：' + source,
    '- 聚合指标引用运行：' + (m.computed_from_run_ids.map(md).join('、') || '暂无'),
    '- 本次导出运行数：' + runs.length, '',
    '## 指标快照', '',
    '| 指标 | 当前值 |', '| --- | --- |',
    '| 已完成 / 全部用例 | ' + m.completed_cases + ' / ' + m.total_cases + ' |',
    '| 通过 / 失败 / 待复核 | ' + m.passed_cases + ' / ' + m.failed_cases + ' / ' + m.needs_review_cases + ' |',
    '| 规则判定数 | ' + m.rule_judged_cases + ' |',
    '| 语义判定数（模型补充） | ' + m.semantic_judged_cases + ' |',
    '| 风险召回率 | ' + percentage(m.risk_detection_rate) + ' |',
    '| 风险精确率 | ' + percentage(m.risk_precision) + ' |',
    '| 风险 F1 | ' + percentage(m.risk_f1) + ' |',
    '| 风险真值混淆矩阵 | TP ' + m.risk_confusion_matrix.tp + ' / FP ' + m.risk_confusion_matrix.fp
      + ' / FN ' + m.risk_confusion_matrix.fn + ' / TN ' + m.risk_confusion_matrix.tn + ' |',
    '| 攻击成功率（修复前 / 修复后） | ' + percentage(m.attack_success_rate_before) + ' / ' + percentage(m.attack_success_rate_after) + ' |',
    '| 轨迹覆盖率 | ' + percentage(m.trace_coverage_rate) + ' |',
    '| API 返回的平均延迟 | ' + m.avg_latency_ms + ' ms |', '',
    '## 版本与运行记录', '',
    '| 运行 / 任务 | Agent 版本 | 测试集 / 版本 | 状态 | 完成 / 总数 | 通过 / 失败 / 待复核 | 开始时间 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...runs.map((r) => '| ' + [r.id + ' / ' + r.task_id, r.agent_version, r.suite_id + ' / ' + r.suite_version, STATUS_LABELS[r.status], r.completed + ' / ' + r.total, r.passed + ' / ' + r.failed + ' / ' + r.needs_review, r.started_at].map(md).join(' | ') + ' |'),
    ...(runs.length ? [] : ['| 暂无运行记录 | | | | | | |']), '',
    '## 用例判定与人工复核', '',
    '| 运行 / 用例 | 结论 | 判定来源 | 置信度 | 理由 | 证据事件 | 复核人 / 时间 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...details.flatMap((d) => d.results.map((r) => '| ' + [d.run.id + ' / ' + r.case_id, STATUS_LABELS[r.status], JUDGE_SOURCE_LABELS[r.judge_source], percentage(r.confidence), r.reason, r.evidence.event_ids.join(', ') || '暂无', r.reviewed_by ? r.reviewed_by + ' / ' + (r.reviewed_at ?? '未记录时间') : '未复核'].map(md).join(' | ') + ' |')),
    ...(details.some((d) => d.results.length) ? [] : ['| 暂无用例判定 | | | | | | |']), '',
    '## 缺陷与修复建议', '',
    ...findings.flatMap((f) => [
      '### ' + md(f.id + ' · ' + f.title), '',
      '- 风险 / 等级 / 状态：' + md(RISK_TAG_LABELS[f.risk_tag] + ' / ' + SEVERITY_LABELS[f.severity] + ' / ' + FINDING_STATUS_LABELS[f.status]),
      '- 版本：' + md(f.agent_version + ' / ' + f.suite_version),
      '- 影响：' + md(f.impact),
      '- 修复建议：' + md(f.recommendation),
      '- 证据：' + md(f.evidence.run_id + ' / ' + f.evidence.case_id + ' / ' + f.evidence.event_ids.join(', ')), '',
    ]),
    ...(findings.length ? [] : ['暂无缺陷记录。', '']),
    '## 目标值（与当前运行结果分别记录）', '',
    '| 目标字段 | 目标值 |', '| --- | --- |',
    ...Object.entries(m.target_benchmarks).map(([key, value]) => '| ' + md(key) + ' | ' + md(value) + ' |'),
    ...(Object.keys(m.target_benchmarks).length ? [] : ['| 未配置目标 | 暂无 |']), '',
    '## 指标口径与已知限制', '',
    '- 聚合指标由 API 返回，以“聚合指标引用运行”列出的运行范围为准；运行列表可能包含范围外记录。',
    '- 版本表通过率采用“通过数 / 全部用例数”；执行中任务尚未完成，不能作为最终通过率。',
    '- 风险检出率、攻击成功率、轨迹覆盖率的样本范围与分母遵循后端指标契约；空值表示尚无可用结果。',
    '- 规则判定优先，大模型语义判断仅作补充；待人工复核结论不视为通过。',
    '- 数据来自当前页面所连接的服务；本地模拟适配器产生的数据不代表外部 Dify 生产环境测试。',
    '- 报告不导出 Agent 凭据或原始工具参数；对选定文本字段中的常见令牌进行脱敏。',
    ...(isMock ? ['- 当前为 Mock 模式，所有数值与缺陷均为示例，不能作为比赛实际应用效果证明。'] : []),
    ...(unavailableRunIds.length ? ['- 以下运行详情加载失败，未纳入用例明细：' + unavailableRunIds.map(md).join('、') + '。可在服务恢复后重新导出。'] : []),
    '- CSV 与 Markdown 来自同一份导出快照；CSV 内含运行汇总行与已取得的用例明细行。', '',
  ]

  const headers = ['记录类型', '数据来源', '导出时间', '运行ID', '任务ID', 'Agent版本', '测试集ID', '测试集版本', '任务状态', '总数', '完成', '通过', '失败', '待复核', '用例ID', '用例结论', '判定来源', '置信度', '理由', '证据事件', '复核人', '复核时间']
  const rows: unknown[][] = [headers]
  for (const run of runs) {
    const common = [source, generatedAt, run.id, run.task_id, run.agent_version, run.suite_id, run.suite_version, STATUS_LABELS[run.status], run.total, run.completed, run.passed, run.failed, run.needs_review]
    rows.push(['运行汇总', ...common, '', '', '', '', '', '', '', ''])
    const result = details.find((d) => d.run.id === run.id)
    for (const item of result?.results ?? []) {
      rows.push(['用例明细', ...common, item.case_id, STATUS_LABELS[item.status], JUDGE_SOURCE_LABELS[item.judge_source], item.confidence, item.reason, item.evidence.event_ids.join(', '), item.reviewed_by ?? '', item.reviewed_at ?? ''])
    }
  }

  return {
    markdown: { name: 'AgentGuard_' + (isMock ? 'Mock_' : 'API_') + stamp + '.md', content: lines.join('\n'), mime: 'text/markdown;charset=utf-8' },
    csv: { name: 'AgentGuard_' + (isMock ? 'Mock_' : 'API_') + stamp + '.csv', content: '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), mime: 'text/csv;charset=utf-8' },
  }
}

export function downloadReportFile(file: ReportFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Keep the Blob alive until the browser has begun the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
