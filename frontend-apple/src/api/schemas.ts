import { z } from 'zod'
import type { ApiError } from '@/types/api'
import { RunStatus, Severity } from '@/types/enums'

/** 归一化错误 —— 页面只需处理这一种错误形态 */
export class ApiRequestError extends Error {
  readonly error_code: string
  readonly status: number
  readonly detail: Record<string, unknown> | undefined

  constructor(error: ApiError, status: number) {
    super(error.message)
    this.name = 'ApiRequestError'
    this.error_code = error.error_code
    this.status = status
    this.detail = error.detail
  }
}

/* ---------- 轻量运行时校验：响应结构不符契约时立即失败，不让脏数据流入页面 ---------- */

const riskTag = z.enum([
  'direct_injection',
  'indirect_injection',
  'memory_poisoning',
  'tool_abuse',
  'goal_drift',
  'baseline_normal',
])
const runStatus = z.enum(['pending', 'running', 'passed', 'failed', 'needs_review'])
const severity = z.enum(['critical', 'high', 'medium', 'low', 'info'])
const findingStatus = z.enum(['open', 'mitigated'])
const judgeSource = z.enum(['rule', 'metric', 'semantic', 'human'])
const traceType = z.enum(['input', 'retrieval', 'tool', 'policy', 'response', 'error'])
const policyDecision = z.enum(['allow', 'deny', 'review'])

const evidenceRef = z.object({
  run_id: z.string(),
  case_id: z.string(),
  event_ids: z.array(z.string()),
})

const agentSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  purpose: z.string(),
  endpoint: z.string(),
  model: z.string(),
  knowledge: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
      source: z.string(),
      kind: z.enum(['normal', 'conflict', 'malicious']),
    }),
  ),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      side_effect: z.enum(['none', 'virtual_write', 'external_write']),
    }),
  ),
  permissions: z.record(z.string(), policyDecision),
  validate_status: z.enum(['validated', 'invalid', 'pending']),
  authorized_scope: z.object({
    target_type: z.enum(['internal_mock', 'internal_authorized']),
    external_target_allowed: z.literal(false),
    note: z.string(),
  }),
})

const suiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  version: z.string(),
  case_ids: z.array(z.string()),
  created_by: z.string(),
  reviewer: z.string().nullable(),
  reviewed_at: z.string().nullable(),
})

const caseSchema = z.object({
  id: z.string(),
  suite_id: z.string(),
  title: z.string(),
  risk_tag: riskTag,
  input: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
  forbidden: z.array(z.string()),
  judge: z.array(judgeSource),
  source: z.enum(['ai_generated', 'manual']),
  version: z.string(),
})

const runSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent_id: z.string(),
  agent_version: z.string(),
  suite_id: z.string(),
  suite_version: z.string(),
  status: runStatus,
  total: z.number(),
  completed: z.number(),
  passed: z.number(),
  failed: z.number(),
  needs_review: z.number(),
  latency_ms: z.number(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
})

const traceEventSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  case_id: z.string(),
  type: traceType,
  timestamp: z.string(),
  tool: z.string().nullable(),
  params: z.record(z.unknown()).nullable(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  policy_decision: policyDecision.nullable(),
})

const findingSchema = z.object({
  id: z.string(),
  title: z.string(),
  risk_tag: riskTag,
  severity,
  status: findingStatus,
  evidence: evidenceRef,
  impact: z.string(),
  recommendation: z.string(),
  agent_version: z.string(),
  suite_version: z.string(),
  created_at: z.string(),
  chain: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['entry', 'behavior', 'impact', 'fix']),
      label: z.string(),
      detail: z.string(),
      evidence: evidenceRef,
    }),
  ),
})

const judgeResultSchema = z.object({
  run_id: z.string(),
  case_id: z.string(),
  status: runStatus,
  judge_source: judgeSource,
  reason: z.string(),
  confidence: z.number(),
  evidence: evidenceRef,
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
})

const runDetailSchema = z.object({ run: runSchema, results: z.array(judgeResultSchema) })

const suiteGenerationSchema = z.object({
  suite: suiteSchema,
  cases: z.array(caseSchema),
  review_required: z.boolean(),
  generation_source: z.enum(['reviewed_rule_templates']),
  llm_used: z.literal(false),
})

const metricsSchema = z.object({
  total_cases: z.number(),
  completed_cases: z.number(),
  passed_cases: z.number(),
  failed_cases: z.number(),
  needs_review_cases: z.number(),
  rule_judged_cases: z.number(),
  semantic_judged_cases: z.number(),
  avg_latency_ms: z.number(),
  findings_total: z.number(),
  findings_open: z.number(),
  findings_mitigated: z.number(),
  risk_detection_rate: z.number().nullable(),
  attack_success_rate_before: z.number().nullable(),
  attack_success_rate_after: z.number().nullable(),
  trace_coverage_rate: z.number().nullable(),
  target_benchmarks: z.record(z.string(), z.number()),
  computed_from_run_ids: z.array(z.string()),
})

export const schemas = {
  agents: z.array(agentSchema),
  agent: agentSchema,
  suites: z.array(suiteSchema),
  cases: z.array(caseSchema),
  runs: z.array(runSchema),
  run: runSchema,
  runDetail: runDetailSchema,
  trace: z.array(traceEventSchema),
  findings: z.array(findingSchema),
  finding: findingSchema,
  judgeResults: z.array(judgeResultSchema),
  suiteGeneration: suiteGenerationSchema,
  metrics: metricsSchema,
} as const

export { RunStatus, Severity }
