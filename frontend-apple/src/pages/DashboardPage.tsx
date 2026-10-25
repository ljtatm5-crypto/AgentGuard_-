import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Plus, Stack, Checks, Timer, SlidersHorizontal, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { api, USE_MOCK } from '@/api/client'
import { AsyncBoundary } from '@/components/AsyncBoundary'
import { SeverityTag, StatusTag } from '@/components/Tags'
import { MotionSurface, CountUp } from '@/components/MotionSurface'
import { useAsync } from '@/hooks/useAsync'
import { SEVERITY_ORDER } from '@/types/enums'
import type { Severity } from '@/types/enums'

export default function DashboardPage() {
  const runs = useAsync(() => api.listRuns(), [])
  const findings = useAsync(() => api.listFindings(), [])
  const metrics = useAsync(() => api.getMetrics(), [])
  const reduce = useReducedMotion()
  return <div className="dashboard-page">
    <header className="page-head dashboard-head"><div><h1>总览</h1><p className="page-desc">面向多类智能体，统一完成规则判定、批量回归、轨迹审计与授权测试。</p></div><Link to="/runs" className="btn btn-primary"><Plus size={17} weight="bold" />启动新测试</Link></header>
    <AsyncBoundary state={metrics.state} onRetry={metrics.retry}>{m => {
      const passRate = m.completed_cases ? m.passed_cases / m.completed_cases * 100 : 0
      const ruleRate = m.completed_cases ? m.rule_judged_cases / m.completed_cases * 100 : 0
      return <>
        <MotionSurface className="overview-hero">
          <div className="hero-copy">
            <span className="hero-label"><CheckCircle size={17} weight="duotone" />智能体质量与安全验证平台</span>
            <h2>让每一次测试，<br /><span>都有据可循。</span></h2>
            <p>面向对话、RAG、工具调用与工作流智能体，以固定规则先行判定，从执行轨迹到攻击链，每一个结论都能回看证据。</p>
            <div className="hero-features" aria-label="平台核心功能">
              <span className="hero-feature"><b>01</b><span><strong>规则先行</strong><small>确定性判定</small></span></span>
              <span className="hero-feature"><b>02</b><span><strong>批量回归</strong><small>修复前后对照</small></span></span>
              <span className="hero-feature"><b>03</b><span><strong>轨迹审计</strong><small>证据可回指</small></span></span>
              <span className="hero-feature"><b>04</b><span><strong>授权靶场</strong><small>外部目标默认拒绝</small></span></span>
            </div>
            <Link to="/reports" className="hero-link">查看验证报告 <ArrowUpRight size={17} /></Link>
          </div>
          <div className="hero-summary"><div className="quality-ring" style={{ '--ring-value': `${passRate}%` } as CSSProperties}><motion.div className="quality-ring-inner" initial={reduce ? false : { scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 130, damping: 20 }}><span>当前通过率</span><strong><CountUp value={passRate} decimals={1} suffix="%" /></strong><small>{USE_MOCK ? 'Mock 测试样例' : '本地执行记录'}</small></motion.div></div><div className="hero-summary-notes"><span><i className="status-mark status-passed" />{m.passed_cases} 项通过</span><span><i className="status-mark status-failed" />{m.failed_cases} 项失败</span><span><i className="status-mark status-review" />{m.needs_review_cases} 项待复核</span></div></div>
        </MotionSurface>
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
    <section className="panel metrics-panel"><div className="panel-head"><div><h2>验证指标</h2><p className="panel-subtitle">{USE_MOCK ? 'Mock 样例值与目标值分别展示。' : '本地运行结果与目标值分别展示。'}</p></div><Link to="/reports" className="text-link">报告与回归 <ArrowRight size={15} /></Link></div><AsyncBoundary state={metrics.state} onRetry={metrics.retry}>{m => <div className="table-scroll"><table data-testid="metrics-table"><thead><tr><th>指标</th><th>{USE_MOCK ? '样例值' : '当前值'}</th><th>目标值</th><th>说明</th></tr></thead><tbody><MetricRow name="风险检出率" actual={m.risk_detection_rate} target={m.target_benchmarks.risk_detection_rate} hint="预埋风险中被正确发现的比例" higherBetter /><MetricRow name="修复后攻击成功率" actual={m.attack_success_rate_after} target={m.target_benchmarks.attack_success_rate_after} hint="同一测试集，修复前后对比" /><MetricRow name="轨迹覆盖率" actual={m.trace_coverage_rate} target={m.target_benchmarks.trace_coverage_rate} hint="关键检索、工具与响应事件的记录比例" higherBetter /></tbody></table></div>}</AsyncBoundary></section>
  </div>
}

function StatCard({ label, value, hint, suffix, decimals, icon, delay }: { label: string; value: number; hint: string; suffix?: string; decimals?: number; icon: React.ReactNode; delay: number }) {
  return <MotionSurface className="card stat-card" delay={delay}><div className="stat-top"><span className="card-label">{label}</span><span className="stat-icon">{icon}</span></div><div className="card-value"><CountUp value={value} decimals={decimals} suffix={suffix} /></div><div className="card-hint">{hint}</div></MotionSurface>
}
function MetricRow({ name, actual, target, hint, higherBetter }: { name: string; actual: number | null; target: number; hint: string; higherBetter?: boolean }) {
  const met = actual !== null && (higherBetter ? actual >= target : actual <= target)
  return <tr><td>{name}</td><td className={actual === null ? 'muted' : met ? 'ok' : 'warn'}>{actual === null ? '待验证' : `${(actual * 100).toFixed(1)}%`}</td><td className="muted">{(target * 100).toFixed(0)}%</td><td className="muted">{hint}</td></tr>
}
