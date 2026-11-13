import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  ArrowUpRight,
  Checks,
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
    <section className="command-center-grid" aria-label="当前测试概况">
      <section className="panel command-context">
        <div className="command-context-top">
          <h2>当前测试对象</h2>
          <span className="command-context-icon"><CirclesThreePlus size={24} weight="regular" /></span>
        </div>
        <AsyncBoundary state={agents.state} isEmpty={data => data.length === 0} onRetry={agents.retry}>{([agent]) => (
          <div className="dashboard-agent">
            <strong>{agent.name}</strong>
            <p>{agent.purpose}</p>
            <div className="dashboard-agent-details">
              <span>{agent.version}</span>
              <span>{agent.agent_type === 'rag' ? 'RAG 知识库' : agent.agent_type === 'tool' ? '工具调用' : agent.agent_type === 'workflow' ? '工作流' : '对话型'}</span>
            </div>
          </div>
        )}</AsyncBoundary>
        <div className="command-context-actions">
          <Link to="/agents" className="text-link">管理 Agent 资产 <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="panel command-health">
        <div className="command-health-head">
          <h2>测试通过率</h2>
          <Link to="/reports" className="text-link">查看报告 <ArrowUpRight size={15} /></Link>
        </div>
        <AsyncBoundary state={metrics.state} onRetry={metrics.retry}>{m => {
          const passRate = m.completed_cases ? m.passed_cases / m.completed_cases * 100 : 0
          return <div className="dashboard-outcome">
            <div className="dashboard-score">
              <strong>{m.completed_cases ? `${passRate.toFixed(1)}%` : '—'}</strong>
              <span>{m.completed_cases} 项已完成</span>
            </div>
            {m.completed_cases > 0 && <div className="outcome-track" aria-hidden="true">
              <span className="outcome-pass" style={{ flex: m.passed_cases }} />
              <span className="outcome-fail" style={{ flex: m.failed_cases }} />
              <span className="outcome-review" style={{ flex: m.needs_review_cases }} />
            </div>}
            <div className="hero-summary-notes">
              <span><i className="status-mark status-passed" /><b>{m.passed_cases}</b> 通过</span>
              <span><i className="status-mark status-failed" /><b>{m.failed_cases}</b> 失败</span>
              <span><i className="status-mark status-review" /><b>{m.needs_review_cases}</b> 待复核</span>
            </div>
          </div>
        }}</AsyncBoundary>
      </section>
    </section>
    <AsyncBoundary state={metrics.state} onRetry={metrics.retry} loadingLabel="正在读取测试指标">{m => (
      <section className="grid-4 stat-grid" aria-label="测试指标">
        <StatCard label="累计测试用例" value={m.total_cases} hint={`已完成 ${m.completed_cases} 项`} icon={<Stack size={20} />} delay={0} />
        <StatCard label="已通过用例" value={m.passed_cases} hint={`${m.failed_cases} 项失败，${m.needs_review_cases} 项待复核`} icon={<Checks size={20} />} delay={0} />
        <StatCard label="规则判定占比" value={m.completed_cases ? m.rule_judged_cases / m.completed_cases * 100 : 0} suffix="%" hint={`规则 ${m.rule_judged_cases} 项，语义补充 ${m.semantic_judged_cases} 项`} icon={<SlidersHorizontal size={20} />} delay={0} />
        <StatCard label="平均执行延迟" value={m.avg_latency_ms / 1000} decimals={2} suffix="s" hint={`来自 ${m.computed_from_run_ids.length} 次运行`} icon={<Timer size={20} />} delay={0} />
      </section>
    )}</AsyncBoundary>
    <div className="dashboard-grid">
      <section className="panel tasks-panel"><div className="panel-head"><div><h2>最近的测试</h2></div><Link to="/runs" className="text-link">全部任务 <ArrowRight size={15} /></Link></div><AsyncBoundary state={runs.state} isEmpty={d => d.length === 0} onRetry={runs.retry} loadingLabel="正在读取运行记录">{data => <div className="table-scroll"><table data-testid="runs-table"><thead><tr><th>测试任务</th><th>完成情况</th><th>结果</th><th aria-label="操作" /></tr></thead><tbody>{data.slice(0, 5).map(r => <tr key={r.id}><td><strong className="task-title">{r.task_id}</strong><span className="cell-note">Agent {r.agent_version}</span></td><td><span className="progress-wrap"><span className="progress"><motion.span className="progress-fill" initial={{ scaleX: reduce ? (r.total ? r.completed / r.total : 0) : 0 }} animate={{ scaleX: r.total ? r.completed / r.total : 0 }} transition={{ duration: .8, delay: .15 }} /></span><span className="progress-text">{r.completed}/{r.total}</span></span></td><td><StatusTag v={r.status} /><span className="cell-note">{r.passed} 通过 / {r.failed} 失败</span></td><td><Link className="row-open" to={`/runs?run=${r.id}`} aria-label={`查看 ${r.task_id} 轨迹`}><ArrowUpRight size={18} /></Link></td></tr>)}</tbody></table></div>}</AsyncBoundary></section>
      <section className="panel risk-panel"><div className="panel-head"><div><h2>风险分布</h2></div><WarningCircle size={22} className="muted" /></div><AsyncBoundary state={findings.state} isEmpty={d => d.length === 0} onRetry={findings.retry} loadingLabel="正在读取风险分布">{data => {
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
