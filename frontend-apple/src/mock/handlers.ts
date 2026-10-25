import { http, HttpResponse, delay } from 'msw'
import type {
  Agent,
  ApiError,
  JudgeResult,
  Metrics,
  TestCase,
  TestRun,
  TestSuite,
  TraceEvent,
} from '@/types/api'
import { RunStatus } from '@/types/enums'
import { agents } from './fixtures/agents'
import { cases, suites } from './fixtures/suites'
import { findings } from './fixtures/findings'
import { buildMockMetrics } from './fixtures/metrics'
import { runs } from './fixtures/runs'
import { traceEvents, traceByRun } from './fixtures/trace'
import { API_PREFIX } from '@/api/contract'
import { mockJudgeTable, verdictForMockRun } from './fixtures/judgments'

/** 可变状态：新任务返回独立的本地合成示例，不发出任何 Agent 请求。 */
const runState = new Map<string, TestRun>(runs.map((r) => [r.id, { ...r }]))
const generatedTraces = new Map<string, TraceEvent[]>()
const eventsForRun = (id: string) => generatedTraces.get(id) ?? traceByRun(id)

/** 不指定泛型，让 TypeScript 按实际返回值推断，避免联合类型被误判 */
const err = (error_code: string, message: string, status = 400) =>
  HttpResponse.json({ error_code, message } satisfies ApiError, { status })

const notFound = (what: string, id: string) => err('RESOURCE_NOT_FOUND', `${what} 不存在：${id}`, 404)

const buildJudgeResults = (run: TestRun): JudgeResult[] =>
  cases
    .filter((c) => c.suite_id === run.suite_id)
    .slice(0, run.completed)
    .map((c) => {
      const j = verdictForMockRun(run, c.id)
      return {
        run_id: run.id,
        case_id: c.id,
        status: j.status,
        judge_source: j.source,
        reason: j.reason,
        confidence: j.confidence,
        evidence: {
          run_id: run.id,
          case_id: c.id,
          event_ids: eventsForRun(run.id).filter((e) => e.case_id === c.id).map((e) => e.id),
        },
        reviewed_by: null,
        reviewed_at: null,
      }
    })

export const handlers = [
  // ---------- Agent 资产（B 提供） ----------
  http.get(`${API_PREFIX}/agents`, async () => {
    await delay(180)
    return HttpResponse.json(agents satisfies Agent[])
  }),

  http.post(`${API_PREFIX}/agents/validate`, async ({ request }) => {
    await delay(320)
    const body = (await request.json()) as { endpoint?: string }
    if (body.endpoint && !body.endpoint.startsWith('local://')) {
      return err('scope_public_target_denied', '当前版本只接入团队自建 local:// 靶场', 403)
    }
    return HttpResponse.json(agents[0])
  }),

  http.get(`${API_PREFIX}/agents/:id`, async ({ params }) => {
    await delay(150)
    const found = agents.find((a) => a.id === params.id)
    if (!found) return notFound('Agent', String(params.id))
    return HttpResponse.json(found)
  }),

  // ---------- 测试集与用例（A 提供） ----------
  http.get(`${API_PREFIX}/test-suites`, async () => {
    await delay(200)
    return HttpResponse.json(suites satisfies TestSuite[])
  }),

  http.get(`${API_PREFIX}/test-suites/:id/cases`, async ({ params }) => {
    await delay(200)
    if (!suites.some((s) => s.id === params.id)) return notFound('测试集', String(params.id))
    const list = cases.filter((c) => c.suite_id === params.id) satisfies TestCase[]
    return HttpResponse.json(list)
  }),

  http.post(`${API_PREFIX}/test-suites/generate`, async ({ request }) => {
    await delay(600)
    const body = (await request.json()) as { agent_id?: string; test_type?: string }
    if (!body.agent_id) return err('VALIDATION_ERROR', 'agent_id 为必填字段', 422)
    if (!agents.some((agent) => agent.id === body.agent_id)) return notFound('Agent', body.agent_id)
    const requested = (body.test_type ?? 'security').trim().toLowerCase()
    const aliases: Record<string, string[]> = {
      injection: ['direct_injection', 'indirect_injection'],
      memory: ['memory_poisoning'],
      permission: ['tool_abuse'],
      functional: ['baseline_normal'],
      security: cases.map((item) => item.risk_tag),
      mixed: cases.map((item) => item.risk_tag),
      all: cases.map((item) => item.risk_tag),
    }
    const allowed = aliases[requested] ?? [requested]
    const selected = cases.filter((item) => allowed.includes(item.risk_tag))
    if (!selected.length) {
      return err('unsupported_test_type', '没有对应的本地规则模板', 422)
    }
    return HttpResponse.json({
      suite: {
        ...suites[0],
        name: `${body.test_type ?? 'security'} · 固定规则模板`,
        type: body.test_type ?? 'security',
        case_ids: selected.map((item) => item.id),
      },
      cases: selected,
      review_required: false,
      generation_source: 'reviewed_rule_templates',
      llm_used: false,
    })
  }),

  // ---------- 执行任务（A 提供） ----------
  http.get(`${API_PREFIX}/runs`, async () => {
    await delay(200)
    return HttpResponse.json(Array.from(runState.values()))
  }),

  http.post(`${API_PREFIX}/runs`, async ({ request }) => {
    await delay(280)
    const body = (await request.json()) as { agent_id?: string; suite_id?: string }
    if (!body.agent_id) return err('VALIDATION_ERROR', 'agent_id 为必填字段', 422)
    if (!body.suite_id) return err('VALIDATION_ERROR', 'suite_id 为必填字段', 422)
    if (!agents.some((a) => a.id === body.agent_id)) return notFound('Agent', body.agent_id)
    if (!suites.some((s) => s.id === body.suite_id)) return notFound('测试集', body.suite_id)

    const seq = runState.size + 1
    const selectedAgent = agents.find((a) => a.id === body.agent_id)!
    const selectedSuite = suites.find((s) => s.id === body.suite_id)!
    const selectedCases = cases.filter((c) => c.suite_id === body.suite_id)
    const summary = selectedCases.map((c) => mockJudgeTable[c.id]!)
    const run: TestRun = {
      id: `run-${String(seq).padStart(3, '0')}`,
      task_id: `task-${String(seq).padStart(3, '0')}`,
      agent_id: body.agent_id,
      agent_version: selectedAgent.version,
      suite_id: body.suite_id,
      suite_version: selectedSuite.version,
      status: summary.some((j) => j.status === RunStatus.FAILED) ? RunStatus.FAILED : RunStatus.NEEDS_REVIEW,
      total: selectedCases.length,
      completed: selectedCases.length,
      passed: summary.filter((j) => j.status === RunStatus.PASSED).length,
      failed: summary.filter((j) => j.status === RunStatus.FAILED).length,
      needs_review: summary.filter((j) => j.status === RunStatus.NEEDS_REVIEW).length,
      latency_ms: 0,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    }
    generatedTraces.set(run.id, traceEvents.filter((e) => e.run_id === 'run-001' && selectedCases.some((c) => c.id === e.case_id)).map((e) => ({ ...e, id: `${run.id}-${e.id}`, run_id: run.id, timestamp: run.started_at })))
    runState.set(run.id, run)
    return HttpResponse.json(run, { status: 201 })
  }),

  http.get(`${API_PREFIX}/runs/:id`, async ({ params }) => {
    await delay(200)
    const run = runState.get(String(params.id))
    if (!run) return notFound('运行记录', String(params.id))
    return HttpResponse.json({ run, results: buildJudgeResults(run) })
  }),

  http.post(`${API_PREFIX}/runs/:id/judge`, async ({ params }) => {
    await delay(260)
    const run = runState.get(String(params.id))
    if (!run) return notFound('运行记录', String(params.id))
    return HttpResponse.json(buildJudgeResults(run))
  }),

  http.get(`${API_PREFIX}/runs/:id/trace`, async ({ params }) => {
    await delay(220)
    const runId = String(params.id)
    if (!runState.has(runId)) return notFound('运行记录', runId)
    return HttpResponse.json(eventsForRun(runId) satisfies TraceEvent[])
  }),

  // ---------- 缺陷与攻击链（B 提供样本，A 判定） ----------
  http.get(`${API_PREFIX}/findings`, async () => {
    await delay(200)
    return HttpResponse.json(findings)
  }),

  http.get(`${API_PREFIX}/findings/:id/chain`, async ({ params }) => {
    await delay(200)
    const found = findings.find((f) => f.id === params.id)
    if (!found) return notFound('缺陷', String(params.id))
    return HttpResponse.json(found)
  }),

  // ---------- 指标聚合 ----------
  http.get(`${API_PREFIX}/metrics`, async () => {
    await delay(240)
    return HttpResponse.json(buildMockMetrics(Array.from(runState.values())) satisfies Metrics)
  }),
]
