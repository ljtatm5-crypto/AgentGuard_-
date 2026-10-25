/**
 * Mock 数据完整性自检（Mock Spec 纪律）
 * ---------------------------------------------------------------
 * 违反以下任一条即为 Mock 数据不合格：
 *  1. Finding 的 evidence 指向不存在的 run / case / event
 *  2. 攻击链节点无证据
 *  3. 授权范围出现 external_target_allowed = true
 *  4. 危险工具出现 external_write
 *  5. 指标把目标值当成实测值（target 与实测字段混用）
 *  6. 六类 P0 用例不全
 */
import { cases } from '../src/mock/fixtures/suites'
import { agents } from '../src/mock/fixtures/agents'
import { findings } from '../src/mock/fixtures/findings'
import { runs } from '../src/mock/fixtures/runs'
import { traceEvents } from '../src/mock/fixtures/trace'
import { buildMockMetrics, metrics } from '../src/mock/fixtures/metrics'
import { RiskTag } from '../src/types/enums'

const failures: string[] = []

const runIds = new Set(runs.map((r) => r.id))
const caseIds = new Set(cases.map((c) => c.id))
const eventIds = new Set(traceEvents.map((e) => e.id))

// 1 & 2：证据可追溯
for (const f of findings) {
  const refs = [f.evidence, ...f.chain.map((n) => n.evidence)]
  for (const ref of refs) {
    if (!runIds.has(ref.run_id)) failures.push(`${f.id}: run_id ${ref.run_id} 不存在`)
    if (!caseIds.has(ref.case_id)) failures.push(`${f.id}: case_id ${ref.case_id} 不存在`)
    if (ref.event_ids.length === 0) failures.push(`${f.id}: 证据缺少 event_ids`)
    for (const eid of ref.event_ids) {
      if (!eventIds.has(eid)) failures.push(`${f.id}: event_id ${eid} 不存在`)
    }
  }
}

// 3 & 4：安全红线
for (const a of agents) {
  if (a.authorized_scope.external_target_allowed !== false) {
    failures.push(`${a.id}: 授权范围允许了外部目标`)
  }
  for (const t of a.tools) {
    if (t.side_effect === 'external_write') {
      failures.push(`${a.id}: 工具 ${t.name} 存在外部写入副作用`)
    }
  }
}

// 5：目标值与实测值分离
for (const key of ['risk_detection_rate', 'attack_success_rate_after', 'trace_coverage_rate'] as const) {
  if (typeof metrics[key] !== 'number') failures.push(`metrics.${key} 应为实测数值`)
  if (typeof metrics.target_benchmarks[key] !== 'number') {
    failures.push(`metrics.target_benchmarks.${key} 缺失`)
  }
}

// 6：六类 P0 覆盖
const required = Object.values(RiskTag)
for (const tag of required) {
  if (!cases.some((c) => c.risk_tag === tag)) failures.push(`缺少 ${tag} 用例`)
}

// 7：指标必须能由运行记录重新聚合，且不再依赖孤立常量
const derivedMetrics = buildMockMetrics(runs)
if (JSON.stringify(derivedMetrics) !== JSON.stringify(metrics)) {
  failures.push('导出指标与运行记录重新聚合的结果不一致')
}
for (const runId of metrics.computed_from_run_ids) {
  if (!runIds.has(runId)) failures.push(`指标引用了不存在的运行 ${runId}`)
}

// 附加：轨迹事件必须覆盖六种事件类型
const types = new Set(traceEvents.map((e) => e.type))
for (const t of ['input', 'retrieval', 'tool', 'policy', 'response', 'error']) {
  if (!types.has(t as never)) failures.push(`轨迹缺少 ${t} 类型事件`)
}

if (failures.length > 0) {
  console.error('Mock 数据不合格：')
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}

console.log(
  `Mock 自检通过：${agents.length} 个 Agent / ${cases.length} 条用例 / ` +
    `${runs.length} 次运行 / ${traceEvents.length} 条轨迹事件 / ${findings.length} 条缺陷（证据全部可追溯）`,
)
