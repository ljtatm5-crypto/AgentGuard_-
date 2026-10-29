import type { ReportSnapshot } from './export'
import { redactReportText } from './export'
import {
  FINDING_STATUS_LABELS,
  JUDGE_SOURCE_LABELS,
  RISK_TAG_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from '@/types/enums'
import type { ChainNode } from '@/types/api'

/**
 * PDF 报告导出
 * ---------------------------------------------------------------
 * 不引入 PDF 库，也不嵌入字体子集：直接生成一份自包含的 A4 打印文档，
 * 由浏览器自身的排版引擎输出，因此中文永远不会乱码，也不增加包体。
 *
 * 与 Markdown / CSV 的关系：三者读取同一个 ReportSnapshot，字段集合一致；
 * 本文件独立生成 HTML 而不解析 Markdown，是为了避免与 Markdown 的转义规则耦合
 * （单元格内的 `|`、`*` 等会被 md() 转义，反向解析容易出错）。
 */

/** HTML 转义：报告内容可能来自 Agent 输出，必须按不可信文本处理 */
function esc(value: unknown): string {
  return redactReportText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pct(value: number | null): string {
  return value === null ? '暂无' : (value * 100).toFixed(1) + '%'
}

function row(cells: string[], tag = 'td'): string {
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">暂无记录。</p>'
  return `<table><thead>${row(headers.map(esc), 'th')}</thead><tbody>${rows.map((cells) => row(cells)).join('')}</tbody></table>`
}

const CHAIN_KIND_LABEL: Record<ChainNode['kind'], string> = {
  entry: '入口',
  behavior: '行为',
  impact: '影响',
  fix: '修复',
}

function styles(): string {
  return `
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans CJK SC", system-ui, sans-serif;
    font-size: 10.5pt; line-height: 1.62; color: #1c1f24; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 20pt; margin: 0 0 4pt; font-weight: 600; letter-spacing: .2pt; }
  h2 { font-size: 12.5pt; margin: 16pt 0 6pt; font-weight: 600; padding-bottom: 3pt; border-bottom: 1px solid #d8dde4; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 10pt 0 3pt; font-weight: 600; }
  p { margin: 0 0 4pt; }
  .cover { border-bottom: 2px solid #1c1f24; padding-bottom: 10pt; margin-bottom: 12pt; }
  .brand { font-size: 9pt; letter-spacing: 1.4pt; text-transform: uppercase; color: #5b6470; }
  .subtitle { color: #5b6470; font-size: 10pt; margin-top: 2pt; }
  .meta { display: flex; flex-wrap: wrap; gap: 6pt; margin-top: 8pt; }
  .meta span { border: 1px solid #d8dde4; border-radius: 3pt; padding: 2pt 6pt; font-size: 8.5pt; color: #3c4450; }
  .meta span b { font-weight: 600; color: #1c1f24; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 8.8pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #dfe3e8; padding: 3.2pt 4.5pt; text-align: left; vertical-align: top; }
  th { background: #f2f4f7; font-weight: 600; color: #3c4450; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 8.3pt; }
  .empty { color: #8b95a1; font-style: normal; }
  .finding { border: 1px solid #dfe3e8; border-radius: 4pt; padding: 8pt 10pt; margin: 0 0 8pt; page-break-inside: avoid; }
  .finding h3 { margin-top: 0; }
  .finding dl { margin: 0; }
  .finding dt { font-size: 8.6pt; color: #5b6470; margin-top: 3pt; }
  .finding dd { margin: 0; }
  .chain { list-style: none; margin: 4pt 0 0; padding: 0; }
  .chain li { display: flex; gap: 6pt; font-size: 8.6pt; padding: 2.5pt 0; border-top: 1px dotted #e3e6ea; }
  .chain li:first-child { border-top: 0; }
  .chain .idx { flex: 0 0 14pt; color: #8b95a1; }
  .chain .kind { flex: 0 0 30pt; color: #3c4450; font-weight: 600; }
  .chain .detail { flex: 1; }
  .chain .ref { display: block; color: #6b7280; font-size: 8pt; margin-top: 1pt; }
  .limits { margin: 0; padding-left: 12pt; font-size: 8.8pt; color: #3c4450; }
  .limits li { margin-bottom: 2.5pt; }
  .note { border-left: 2.5pt solid #b26a00; background: #fdf7ec; padding: 6pt 8pt; font-size: 8.8pt; margin: 8pt 0; }
  .foot { margin-top: 14pt; border-top: 1px solid #d8dde4; padding-top: 6pt; font-size: 8pt; color: #8b95a1; display: flex; justify-content: space-between; }
  .page-break { page-break-before: always; }
  `
}

/** 生成自包含的 A4 打印文档 */
export function buildReportHtml(snapshot: ReportSnapshot): string {
  const { metrics: m, runs, details, findings, unavailableRunIds, isMock } = snapshot
  const generated = snapshot.generatedAt ?? new Date()
  const source = isMock ? 'Mock 示例数据（用于演示，不作为实测结果）' : '本地 API 运行数据（以实际适配器与授权靶场配置为准）'
  const runCount = runs.length
  const resultRows = details.flatMap((detail) =>
    detail.results.map((item) => [
      `<span class="mono">${esc(detail.run.id)}</span><br><span class="mono">${esc(item.case_id)}</span>`,
      esc(STATUS_LABELS[item.status]),
      esc(JUDGE_SOURCE_LABELS[item.judge_source]),
      pct(item.confidence),
      esc(item.reason),
      `<span class="mono">${esc(item.evidence.event_ids.join(', ') || '暂无')}</span>`,
      item.reviewed_by ? esc(`${item.reviewed_by} / ${item.reviewed_at ?? '未记录时间'}`) : '未复核',
    ]),
  )

  const findingBlocks = findings
    .map((finding) => {
      const chain = finding.chain
        .map(
          (node, index) => `<li>
            <span class="idx">${index + 1}</span>
            <span class="kind">${esc(CHAIN_KIND_LABEL[node.kind])}</span>
            <span class="detail">${esc(node.label)}：${esc(node.detail)}
              <span class="ref">证据 ${esc(node.evidence.run_id)} / ${esc(node.evidence.case_id)} / ${esc(node.evidence.event_ids.join(', ') || '无直接事件')}${node.evidence.status === 'inferred' ? '（推断节点）' : ''}</span>
            </span>
          </li>`,
        )
        .join('')
      return `<div class="finding">
        <h3>${esc(finding.id)} · ${esc(finding.title)}</h3>
        <dl>
          <dt>风险类型 / 等级 / 状态</dt>
          <dd>${esc(RISK_TAG_LABELS[finding.risk_tag])} / ${esc(SEVERITY_LABELS[finding.severity])} / ${esc(FINDING_STATUS_LABELS[finding.status])}</dd>
          <dt>版本</dt>
          <dd>${esc(finding.agent_version)} / ${esc(finding.suite_version)}</dd>
          <dt>影响</dt>
          <dd>${esc(finding.impact)}</dd>
          <dt>修复建议</dt>
          <dd>${esc(finding.recommendation)}</dd>
          <dt>主证据</dt>
          <dd class="mono">${esc(finding.evidence.run_id)} / ${esc(finding.evidence.case_id)} / ${esc(finding.evidence.event_ids.join(', ') || '暂无')}</dd>
        </dl>
        ${chain ? `<ul class="chain">${chain}</ul>` : ''}
      </div>`
    })
    .join('')

  const benchmarkRows = Object.entries(m.target_benchmarks).map(([key, value]) => [esc(key), esc(value)])
  const sameSuite = new Set(runs.map((run) => run.suite_id)).size <= 1

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AgentGuard 智测盾 测试报告 ${esc(generated.toISOString().slice(0, 10))}</title>
<style>${styles()}</style>
</head>
<body>
  <header class="cover">
    <div class="brand">AgentGuard 智测盾</div>
    <h1>智能体测试报告</h1>
    <p class="subtitle">规则优先判定 · 轨迹可追溯 · 修复前后可对照</p>
    <div class="meta">
      <span>数据来源 <b>${esc(isMock ? 'Mock 示例' : '本地 API')}</b></span>
      <span>导出时间 <b>${esc(generated.toISOString().replace('T', ' ').slice(0, 19))}Z</b></span>
      <span>运行记录 <b>${runCount} 条</b></span>
      <span>缺陷 <b>${findings.length} 项</b></span>
      <span>测试集 <b>${esc(sameSuite && runs[0] ? runs[0].suite_id : '多测试集')}</b></span>
    </div>
    <p class="subtitle" style="margin-top:6pt;font-size:9pt">${esc(source)}</p>
  </header>

  ${isMock ? '<div class="note"><strong>数据模式说明：</strong>本报告由 Mock 示例数据生成，仅用于流程演示，不能作为比赛实际应用效果的证明。真实效果需在本地 API 模式与授权靶场中复测。</div>' : ''}
  ${unavailableRunIds.length ? `<div class="note"><strong>加载失败：</strong>以下运行详情未能取得，未纳入用例明细：${unavailableRunIds.map(esc).join('、')}。可在服务恢复后重新导出。</div>` : ''}

  <h2>一、指标快照</h2>
  ${table(
    ['指标', '当前值', '说明'],
    [
      ['已完成 / 全部用例', `${m.completed_cases} / ${m.total_cases}`, '仅统计已完成用例'],
      ['通过 / 失败 / 待复核', `${m.passed_cases} / ${m.failed_cases} / ${m.needs_review_cases}`, '待复核不计入通过'],
      ['规则判定数', String(m.rule_judged_cases), '固定规则先行判定'],
      ['语义判定数', String(m.semantic_judged_cases), '大模型仅作补充'],
      ['风险召回率', pct(m.risk_detection_rate), `人工真值风险 ${m.risk_ground_truth_cases} 项`],
      ['风险精确率', pct(m.risk_precision), `TP ${m.risk_confusion_matrix.tp} / FP ${m.risk_confusion_matrix.fp}`],
      ['风险 F1', pct(m.risk_f1), '召回率与精确率的调和平均'],
      [
        '混淆矩阵',
        `TP ${m.risk_confusion_matrix.tp} / FP ${m.risk_confusion_matrix.fp} / FN ${m.risk_confusion_matrix.fn} / TN ${m.risk_confusion_matrix.tn}`,
        '风险真值对照',
      ],
      ['攻击成功率（前 / 后）', `${pct(m.attack_success_rate_before)} / ${pct(m.attack_success_rate_after)}`, '同一测试集修复前后对比'],
      ['轨迹覆盖率', pct(m.trace_coverage_rate), '关键检索、工具与响应事件记录比例'],
      ['API 平均延迟', `${m.avg_latency_ms} ms`, '来自接口返回'],
    ],
  )}

  <h2>二、版本与运行记录</h2>
  ${table(
    ['运行 / 任务', 'Agent 版本', '测试集 / 版本', '状态', '完成 / 总数', '通过 / 失败 / 待复核', '开始时间'],
    runs.map((run) => [
      `<span class="mono">${esc(run.id)}</span> / <span class="mono">${esc(run.task_id)}</span>`,
      esc(run.agent_version),
      `<span class="mono">${esc(run.suite_id)}</span> / ${esc(run.suite_version)}`,
      esc(STATUS_LABELS[run.status]),
      `${run.completed} / ${run.total}`,
      `${run.passed} / ${run.failed} / ${run.needs_review}`,
      `<span class="mono">${esc(run.started_at)}</span>`,
    ]),
  )}

  <h2>三、用例判定与人工复核</h2>
  ${table(['运行 / 用例', '结论', '判定来源', '置信度', '理由', '证据事件', '复核人 / 时间'], resultRows)}

  <h2 class="page-break">四、缺陷与修复建议</h2>
  ${findings.length ? findingBlocks : '<p class="empty">暂无缺陷记录。</p>'}

  <h2>五、目标值（与实测值分别记录）</h2>
  ${table(['目标字段', '目标值'], benchmarkRows)}

  <h2>六、指标口径与已知限制</h2>
  <ul class="limits">
    <li>聚合指标由接口返回，以“聚合指标引用运行”列出的运行范围为准：${esc(m.computed_from_run_ids.join('、') || '暂无')}；运行列表可能包含范围外记录。</li>
    <li>版本表通过率采用“通过数 / 全部用例数”，执行中任务尚未完成，不能作为最终通过率。</li>
    <li>风险召回率、精确率、攻击成功率、轨迹覆盖率的样本范围与分母遵循后端指标契约，空值表示尚无可用结果。</li>
    <li>规则判定优先，大模型语义判断仅作补充；待人工复核结论不视为通过。</li>
    <li>数据来自当前页面所连接的服务；本地模拟适配器产生的数据不代表外部生产环境测试结果。</li>
    <li>报告不导出 Agent 凭据与原始工具参数；对选定文本字段中的常见令牌做了脱敏处理。</li>
    <li>本报告由同一份导出快照生成，与 Markdown / CSV 的字段集合一致。</li>
  </ul>

  <div class="foot"><span>AgentGuard 智测盾 · 测试有依据，改进有方向</span><span>${esc(generated.toISOString())}</span></div>
</body>
</html>`
}

/**
 * 通过隐藏 iframe 触发打印。
 * 用 iframe 而非 window.open，是为了绕开异步取数之后的弹窗拦截。
 */
export function printReportHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', '报告打印视图')
  // 必须参与布局才能正确分页；移到可视区外即可。
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:820px;height:1160px;border:0;'
  document.body.appendChild(frame)

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    frame.remove()
  }

  /** 兜底：把同一份 HTML 作为独立文档打开，用户可自行打印或另存为 PDF */
  const openFallback = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  frame.onload = () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) {
      remove()
      openFallback()
      return
    }

    const start = () => {
      try {
        win.focus()
        win.print()
        // 某些浏览器 print() 立即返回；不能立刻移除 iframe，否则打印任务会被取消。
        win.addEventListener('afterprint', remove, { once: true })
        window.setTimeout(remove, 60_000)
      } catch {
        remove()
        openFallback()
      }
    }

    // 等字体就绪再打印，避免回退字体导致换行与分页偏移。
    const fonts = doc.fonts
    if (fonts && typeof fonts.ready?.then === 'function') {
      fonts.ready.then(start, start)
    } else {
      start()
    }
  }

  frame.srcdoc = html
}
