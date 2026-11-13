import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  ArrowUpRight,
  Checks,
  CheckCircle,
  CirclesThreePlus,
  Plus,
  SlidersHorizontal,
  Stack,
  Timer,
  WarningCircle,
} from '@phosphor-icons/react'
import { api, readDashboardSnapshot } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { SeverityTag, StatusTag } from '@/components/Tags'
import { MotionSurface, CountUp } from '@/components/MotionSurface'
import { useAsync } from '@/hooks/useAsync'
import type { AsyncState } from '@/hooks/useAsync'
import { SEVERITY_ORDER } from '@/types/enums'
import type { Severity } from '@/types/enums'
import type { DashboardData } from '@/types/api'

function selectState<T>(state: AsyncState<DashboardData>, select: (data: DashboardData) => T): AsyncState<T> {
  return state.phase === 'ready' ? { phase: 'ready', data: select(state.data) } : state
}

export default function DashboardPage() {
  const dashboard = useAsync(() => api.getDashboard(), [], readDashboardSnapshot())
  const runs = { state: selectState(dashboard.state, (data) => data.runs), retry: dashboard.retry }
  const findings = { state: selectState(dashboard.state, (data) => data.findings), retry: dashboard.retry }
  const metrics = { state: selectState(dashboard.state, (data) => data.metrics), retry: dashboard.retry }
  const agents = { state: selectState(dashboard.state, (data) => data.agents), retry: dashboard.retry }
  const reduce = useReducedMotion()
  const currentAgent = agents.state.phase === 'ready' ? agents.state.data[0] : null
  return <div className="dashboard-page">
    <header className="page-head dashboard-head">
      <div>
        <h1>安全测试工作台</h1>
        <p className="page-desc">查看智能体安全结论、风险项与修复进度。</p>
      </div>
      <div className="page-head-actions">
        <Link to="/runs" className="btn btn-primary"><Plus size={18} weight="bold" />启动新测试</Link>
      </div>
    </header>
    <AsyncBoundary state={metrics.state} onRetry={metrics.retry}>{m => {
      const passRate = m.completed_cases ? m.passed_cases / m.completed_cases * 100 : 0
      const ruleRate = m.completed_cases ? m.rule_judged_cases / m.completed_cases * 100 : 0
      return <>
        <section className="command-center-grid">
          <MotionSurface className="command-context">
            <div className="command-context-top">
              <div>
                <span className="eyebrow">当前测试对象</span>
                <h2>{currentAgent?.name ?? (agents.state.phase === 'loading' ? '正在读取 Agent 资产' : '等待选择待测 Agent')}</h2>
                <p>{currentAgent?.purpose ?? '选择待测智能体后，即可开始安全与行为验证。'}</p>
              </div>
              <span className="command-context-icon"><CirclesThreePlus size={27} weight="duotone" /></span>
            </div>
            <div className="command-context-facts">
              <span><small>智能体类型</small><strong>{currentAgent?.agent_type === 'rag' ? 'RAG 知识库' : currentAgent?.agent_type === 'tool' ? '工具调用' : currentAgent?.agent_type === 'workflow' ? '工作流' : currentAgent ? '对话型' : '多类型'}</strong></span>
              <span><small>规则判定</small><strong>{ruleRate.toFixed(0)}%</strong></span>
              <span><small>测试范围</small><strong>安全与行为</strong></span>
            </div>
            <div className="command-context-actions">
              <Link to="/agents" className="text-link">管理 Agent 资产 <ArrowRight size={16} /></Link>
              <Link to="/runs" className="text-link">查看执行任务 <ArrowRight size={16} /></Link>
            </div>
          </MotionSurface>

          <MotionSurface className="command-health" delay={.05}>
            <div className="command-health-head">
              <div>
                <span className="eyebrow">测试结果</span>
                <h2>通过率</h2>
              </div>
              <span className="health-badge"><CheckCircle size={17} weight="fill" />规则优先</span>
            </div>
            <div className="command-health-score">
              <div className="quality-ring" style={{ '--ring-value': `${passRate}%` } as CSSProperties}>
                <motion.div className="quality-ring-inner" initial={reduce ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 22 }}>
                  <strong><CountUp value={passRate} decimals={1} suffix="%" /></strong>
                  <small>{m.completed_cases} 项已完成</small>
                </motion.div>
              </div>
              <div className="hero-summary-notes">
                <span><i className="status-mark status-passed" /><b>{m.passed_cases}</b> 项通过</span>
                <span><i className="status-mark status-failed" /><b>{m.failed_cases}</b> 项失败</span>
                <span><i className="status-mark status-review" /><b>{m.needs_review_cases}</b> 项待复核</span>
              </div>
            </div>
            <Link to="/reports" className="hero-link">查看验证报告 <ArrowUpRight size={17} /></Link>
          </MotionSurface>

          <MotionSurface className="evidence-preview" delay={.1}>
            <div className="evidence-preview-head">
              <div>
                <span className="eyebrow">证据链</span>
                <h2>从输入到判定，一条链回看</h2>
              </div>
              <span className="tag tag-info">结果可追溯</span>
            </div>
            <div className="trace-signature" aria-label="可追溯执行链">
              <div className="trace-track">
                <span className="trace-node"><small>01</small><b>输入</b><em>问题与上下文</em></span>
                <i className="trace-link" />
                <span className="trace-node"><small>02</small><b>策略</b><em>固定规则先行</em></span>
                <i className="trace-link" />
                <span className="trace-node"><small>03</small><b>工具</b><em>调用与权限</em></span>
                <i className="trace-link" />
                <span className="trace-node trace-verdict"><small>04</small><b>判定</b><em>证据与结论</em></span>
              </div>
            </div>
            <div className="evidence-preview-foot">
              <span><strong>{m.semantic_judged_cases}</strong> 项启用语义补充</span>
              <span>结论与证据一一对应</span>
            </div>
          </MotionSurface>
        </section>
        <section className="grid-4 stat-grid" aria-label="测试指标">
          <StatCard label="累计测试用例" value={m.total_cases} hint={`已完成 ${m.completed_cases} 项`} icon={<Stack size={21} weight="duotone" />} delay={.04} />
          <StatCard label="已通过用例" value={m.passed_cases} hint={`${m.failed_cases} 项失败，${m.needs_review_cases} 项待复核`} icon={<Checks size={21} weight="duotone" />} delay={.09} />
          <StatCard label="规则判定占比" value={ruleRate} suffix="%" hint={`规则 ${m.rule_judged_cases} 项，语义补充 ${m.semantic_judged_cases} 项`} icon={<SlidersHorizontal size={21} weight="duotone" />} delay={.14} />
          <StatCard label="平均执行延迟" value={m.avg_latency_ms / 1000} decimals={2} suffix="s" hint={`来自 ${m.computed_from_run_ids.length} 次运行`} icon={<Timer size={21} weight="duotone" />} delay={.19} />
        </section>
      </>
    }}</AsyncBoundary>
    <div className="dashboard-grid">
      <section className="panel tasks-panel"><div className="panel-head"><div><h2>最近的测试</h2><p className="panel-subtitle">每个结果都能追溯到具体执行。</p></div><Link to="/runs" className="text-link">全部任务 <ArrowRight size={15} /></Link></div><AsyncBoundary state={runs.state} isEmpty={d => d.length === 0} onRetry={runs.retry}>{data => <div className="table-scroll"><table data-testid="runs-table"><thead><tr><th>测试任务</th><th>完成情况</th><th>结果</th><th aria-label="操作" /></tr></thead><tbody>{data.map(r => <tr key={r.id}><td><strong className="task-title">{r.task_id}</strong><span className="cell-note">Agent {r.agent_version}</span></td><td><span className="progress-wrap"><span className="progress"><motion.span className="progress-fill" initial={{ scaleX: reduce ? (r.total ? r.completed / r.total : 0) : 0 }} animate={{ scaleX: r.total ? r.completed / r.total : 0 }} transition={{ duration: .8, delay: .15 }} /></span><span className="progress-text">{r.completed}/{r.total}</span></span></td><td><StatusTag v={r.status} /><span className="cell-note">{r.passed} 通过 / {r.failed} 失败</span></td><td><Link className="row-open" to={`/runs?run=${r.id}`} aria-label={`查看 ${r.task_id} 轨迹`}><ArrowUpRight size={18} /></Link></td></tr>)}</tbody></table></div>}</AsyncBoundary></section>
      <section className="panel risk-panel"><div className="panel-head"><div><h2>风险分布</h2><p className="panel-subtitle">优先关注需要处理的问题。</p></div><WarningCircle size={22} className="muted" /></div><AsyncBoundary state={findings.state} isEmpty={d => d.length === 0} onRetry={findings.retry}>{data => {
        const counts = new Map<Severity, number>()
        data.forEach(f => counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1))
        return <><ul className="dist" data-testid="severity-dist">{SEVERITY_ORDER.filter(s => counts.has(s)).map((s, i) => <li key={s}><span className="dist-label"><SeverityTag v={s} /></span><span className="dist-bar"><motion.span className={`dist-fill sev-${s}`} initial={{ scaleX: reduce ? counts.get(s)! / data.length : 0 }} animate={{ scaleX: counts.get(s)! / data.length }} transition={{ duration: .65, delay: .1 * i }} /></span><span className="dist-value">{counts.get(s)}</span></li>)}</ul><div className="risk-summary"><span>{data.length} 项记录，{data.filter(f => f.status === 'mitigated').length} 项已缓解</span><Link to="/findings" aria-label="查看攻击链与缺陷"><ArrowRight size={17} /></Link></div></>
      }}</AsyncBoundary></section>
    </div>
    <section className="panel metrics-panel"><div className="panel-head"><div><h2>核心指标</h2><p className="panel-subtitle">关注风险识别、修复效果与证据完整度。</p></div><Link to="/reports" className="text-link">报告与回归 <ArrowRight size={15} /></Link></div><AsyncBoundary state={metrics.state} onRetry={metrics.retry}>{m => <><div className="table-scroll"><table data-testid="metrics-table"><thead><tr><th>指标</th><th>当前结果</th><th>目标</th></tr></thead><tbody><MetricRow name="风险召回率" actual={m.risk_detection_rate} target={m.target_benchmarks.risk_detection_rate} higherBetter /><MetricRow name="风险精确率" actual={m.risk_precision} target={m.target_benchmarks.risk_precision} higherBetter /><MetricRow name="风险 F1" actual={m.risk_f1} target={m.target_benchmarks.risk_f1} higherBetter /><MetricRow name="修复后攻击成功率" actual={m.attack_success_rate_after} target={m.target_benchmarks.attack_success_rate_after} /><MetricRow name="轨迹覆盖率" actual={m.trace_coverage_rate} target={m.target_benchmarks.trace_coverage_rate} higherBetter /></tbody></table></div>{m.risk_metric_status !== 'READY' && <p className="muted" role="status">人工复核样本不足时，部分风险指标暂不展示。</p>}</>}</AsyncBoundary></section>
  </div>
}

function StatCard({ label, value, hint, suffix, decimals, icon, delay }: { label: string; value: number; hint: string; suffix?: string; decimals?: number; icon: React.ReactNode; delay: number }) {
  return <MotionSurface className="card stat-card" delay={delay}><div className="stat-top"><span className="card-label">{label}</span><span className="stat-icon">{icon}</span></div><div className="card-value"><CountUp value={value} decimals={decimals} suffix={suffix} /></div><div className="card-hint">{hint}</div></MotionSurface>
}
function MetricRow({ name, actual, target, higherBetter }: { name: string; actual: number | null; target: number; higherBetter?: boolean }) {
  const met = actual !== null && (higherBetter ? actual >= target : actual <= target)
  return <tr><td>{name}</td><td className={actual === null ? 'muted' : met ? 'ok' : 'warn'}>{actual === null ? '待积累' : `${(actual * 100).toFixed(1)}%`}</td><td className="muted">{(target * 100).toFixed(0)}%</td></tr>
}
