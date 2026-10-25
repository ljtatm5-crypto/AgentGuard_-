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
import { mockApiPath } from '@/api/contract'
import { mockJudgeTable, verdictForMockRun } from './fixtures/judgments'

/** 可变状态：新任务返回独立的本地合成示例，不发出任何 Agent 请求。 */
const agentState = new Map<string, Agent>(agents.map((agent) => [agent.id, { ...agent }]))
const suiteState = new Map<string, TestSuite>(suites.map((suite) => [suite.id, { ...suite }]))
const caseState = new Map<string, TestCase>(cases.map((item) => [item.id, { ...item }]))
const runState = new Map<string, TestRun>(runs.map((r) => [r.id, { ...r }]))
const generatedTraces = new Map<string, TraceEvent[]>()
const eventsForRun = (id: string) => generatedTraces.get(id) ?? traceByRun(id)

/** 不指定泛型，让 TypeScript 按实际返回值推断，避免联合类型被误判 */
const err = (error_code: string, message: string, status = 400) =>
  HttpResponse.json({ error_code, message } satisfies ApiError, { status })

const notFound = (what: string, id: string) => err('RESOURCE_NOT_FOUND', `${what} 不存在：${id}`, 404)
const withEvidenceStatus = (finding: (typeof findings)[number]) => ({
  ...finding,
  chain: finding.chain.map((node) => ({
    ...node,
    evidence: {
      ...node.evidence,
      status: node.evidence.event_ids.length > 0 ? 'observed' as const : 'inferred' as const,
    },
  })),
})

const buildJudgeResults = (run: TestRun): JudgeResult[] =>
  [...caseState.values()]
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
  http.get(mockApiPath('/agents'), async () => {
    await delay(180)
    return HttpResponse.json([...agentState.values()] satisfies Agent[])
  }),

  http.post(mockApiPath('/agents/validate'), async ({ request }) => {
    await delay(320)
    const body = (await request.json()) as {
      name?: string
      version?: string
      agent_type?: Agent['agent_type']
      endpoint?: string
      model?: string
    }
    if (body.endpoint && !body.endpoint.startsWith('local://')) {
      return err('scope_public_target_denied', '当前版本只接入平台提供的本地测试沙盒', 403)
    }
    const name = body.name?.trim()
    if (!name) return err('VALIDATION_ERROR', '请输入智能体名称', 422)
    const type = body.agent_type && ['conversation', 'rag', 'tool', 'workflow'].includes(body.agent_type)
      ? body.agent_type
      : 'conversation'
    const endpoint = body.endpoint || `local://agent-${Date.now().toString(36)}`
    const created: Agent = {
      id: `agt-local-${Date.now().toString(36)}`,
      version: body.version || 'v2.0',
      name,
      agent_type: type,
      purpose: '本地测试沙盒：验证规则判定、工具权限与行为回归',
      endpoint,
      model: body.model || 'deterministic-local-sandbox',
      knowledge: [],
      tools: [...agents[0].tools],
      permissions: { ...agents[0].permissions },
      validate_status: 'validated',
      authorized_scope: {
        target_type: 'internal_mock',
        external_target_allowed: false,
        note: '平台托管的安全沙盒，不访问外部网站',
      },
    }
    agentState.set(created.id, created)
    return HttpResponse.json(created)
  }),

  http.get(mockApiPath('/agents/:id'), async ({ params }) => {
    await delay(150)
    const found = agentState.get(String(params.id))
    if (!found) return notFound('Agent', String(params.id))
    return HttpResponse.json(found)
  }),

  // ---------- 测试集与用例（A 提供） ----------
  http.get(mockApiPath('/test-suites'), async () => {
    await delay(200)
    return HttpResponse.json([...suiteState.values()] satisfies TestSuite[])
  }),

  http.get(mockApiPath('/test-suites/:id/cases'), async ({ params }) => {
    await delay(200)
    if (!suiteState.has(String(params.id))) return notFound('测试集', String(params.id))
    const list = [...caseState.values()].filter((c) => c.suite_id === params.id) satisfies TestCase[]
    return HttpResponse.json(list)
  }),

  http.post(mockApiPath('/test-suites/generate'), async ({ request }) => {
    await delay(600)
    const body = (await request.json()) as { agent_id?: string; test_type?: string; use_ai?: boolean }
    if (!body.agent_id) return err('VALIDATION_ERROR', 'agent_id 为必填字段', 422)
    if (!agentState.has(body.agent_id)) return notFound('Agent', body.agent_id)
    if (body.use_ai) {
      return err('llm_not_configured', 'Mock 演示不会伪装成真实大模型生成；请使用 API 模式并配置自建模型', 503)
    }
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
    const generatedId = `suite-generated-${Date.now().toString(36)}`
    const generatedCases = selected.map((item, index) => ({
      ...item,
      id: `case-generated-${Date.now().toString(36)}-${index}`,
      suite_id: generatedId,
      source: 'manual' as const,
    }))
    generatedCases.forEach((item) => caseState.set(item.id, item))
    const generatedSuite: TestSuite = {
        ...suites[0],
        id: generatedId,
        name: `${body.test_type ?? 'security'} · 固定规则模板`,
        type: body.test_type ?? 'security',
        case_ids: generatedCases.map((item) => item.id),
    }
    suiteState.set(generatedSuite.id, generatedSuite)
    return HttpResponse.json({
      suite: generatedSuite,
      cases: generatedCases,
      review_required: false,
      generation_source: 'reviewed_rule_templates',
      llm_used: false,
    })
  }),

  // ---------- 执行任务（A 提供） ----------
  http.get(mockApiPath('/runs'), async () => {
    await delay(200)
    return HttpResponse.json(Array.from(runState.values()))
  }),

  http.post(mockApiPath('/runs'), async ({ request }) => {
    await delay(280)
    const body = (await request.json()) as { agent_id?: string; suite_id?: string }
    if (!body.agent_id) return err('VALIDATION_ERROR', 'agent_id 为必填字段', 422)
    if (!body.suite_id) return err('VALIDATION_ERROR', 'suite_id 为必填字段', 422)
    if (!agentState.has(body.agent_id)) return notFound('Agent', body.agent_id)
    if (!suiteState.has(body.suite_id)) return notFound('测试集', body.suite_id)

    const seq = runState.size + 1
    const selectedAgent = agentState.get(body.agent_id)!
    const selectedSuite = suiteState.get(body.suite_id)!
    const selectedCases = [...caseState.values()].filter((c) => c.suite_id === body.suite_id)
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

  http.get(mockApiPath('/runs/:id'), async ({ params }) => {
    await delay(200)
    const run = runState.get(String(params.id))
    if (!run) return notFound('运行记录', String(params.id))
    return HttpResponse.json({ run, results: buildJudgeResults(run) })
  }),

  http.post(mockApiPath('/runs/:id/judge'), async ({ params }) => {
    await delay(260)
    const run = runState.get(String(params.id))
    if (!run) return notFound('运行记录', String(params.id))
    return HttpResponse.json(buildJudgeResults(run))
  }),

  http.get(mockApiPath('/runs/:id/trace'), async ({ params }) => {
    await delay(220)
    const runId = String(params.id)
    if (!runState.has(runId)) return notFound('运行记录', runId)
    return HttpResponse.json(eventsForRun(runId) satisfies TraceEvent[])
  }),

  // ---------- 缺陷与攻击链（B 提供样本，A 判定） ----------
  http.get(mockApiPath('/findings'), async () => {
    await delay(200)
    return HttpResponse.json(findings.map(withEvidenceStatus))
  }),

  http.get(mockApiPath('/findings/:id/chain'), async ({ params }) => {
    await delay(200)
    const found = findings.find((f) => f.id === params.id)
    if (!found) return notFound('缺陷', String(params.id))
    return HttpResponse.json(withEvidenceStatus(found))
  }),

  // ---------- 指标聚合 ----------
  http.get(mockApiPath('/metrics'), async () => {
    await delay(240)
    return HttpResponse.json(buildMockMetrics(Array.from(runState.values())) satisfies Metrics)
  }),
]
