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
const chainEvidenceRef = evidenceRef.extend({
  status: z.enum(['observed', 'inferred']).optional(),
})

const agentSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  adapter: z.string().optional(),
  platform: z.string().optional(),
  observable_capabilities: z.object({
    adapter: z.string(),
    question_answer: z.boolean(),
    multi_turn: z.boolean(),
    rag_events: z.string(),
    tool_events: z.string(),
    workflow_events: z.string(),
    long_term_memory: z.string(),
    notes: z.string(),
  }).optional(),
  agent_type: z.enum(['conversation', 'rag', 'tool', 'workflow']),
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
  adapter: z.string().optional(),
  evidence_level: z.string().optional(),
  suite_id: z.string(),
  suite_version: z.string(),
  status: runStatus,
  total: z.number(),
  completed: z.number(),
  passed: z.number(),
  failed: z.number(),
  needs_review: z.number(),
  pending: z.number().optional(),
  running: z.number().optional(),
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
      evidence: chainEvidenceRef,
    }),
  ),
})

const judgeResultSchema = z.object({
  run_id: z.string(),
  case_id: z.string(),
  case_title: z.string(),
  risk_tag: riskTag,
  expected: z.string(),
  conclusion: z.string(),
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
  generation_source: z.enum(['reviewed_rule_templates', 'llm_draft', 'mock_draft', 'human_reviewed_ai_draft', 'mock_reviewed_draft']),
  llm_used: z.boolean(),
  prompt_version: z.string().optional(),
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
  risk_precision: z.number().nullable(),
  risk_f1: z.number().nullable(),
  risk_ground_truth_cases: z.number(),
  risk_labelled_cases: z.number().optional(),
  risk_actual_positive_cases: z.number().optional(),
  risk_predicted_positive_cases: z.number().optional(),
  risk_unreviewed_cases: z.number().optional(),
  risk_metric_status: z.enum(['READY', 'NO_REVIEWED_GROUND_TRUTH']).optional(),
  risk_metric_scope: z.string().optional(),
  risk_ground_truth_definition_versions: z.array(z.string()).optional(),
  risk_ground_truth_agent_ids: z.array(z.string()).optional(),
  risk_confusion_matrix: z.object({
    tp: z.number(),
    fp: z.number(),
    fn: z.number(),
    tn: z.number(),
  }),
  attack_success_rate_before: z.number().nullable(),
  attack_success_rate_after: z.number().nullable(),
  trace_coverage_rate: z.number().nullable(),
  target_benchmarks: z.record(z.string(), z.number()),
  computed_from_run_ids: z.array(z.string()),
  risk_computed_from_run_ids: z.array(z.string()).optional(),
})

const assistantSourceSchema = z.object({
  id: z.string(),
  document_id: z.string().nullable().optional(),
  title: z.string(),
  heading: z.string(),
  source_path: z.string(),
  route: z.string(),
  excerpt: z.string(),
  score: z.number(),
  access_level: z.string(),
  tags: z.array(z.string()),
  embedding_provider: z.string().nullable().optional(),
})

const assistantEvidenceSchema = z.object({
  type: z.string(),
  label: z.string(),
  detail: z.string(),
  event_ids: z.array(z.string()),
  status: z.enum(['observed', 'inferred', 'unavailable']),
  tool: z.string().nullable().optional(),
  policy_decision: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
})

const assistantStepSchema = z.object({
  title: z.string(),
  detail: z.string(),
  route: z.string().nullable().optional(),
  action_label: z.string().nullable().optional(),
})

const assistantAnswerSchema = z.object({
  conclusion: z.string(),
  steps: z.array(assistantStepSchema),
  evidence: z.array(assistantEvidenceSchema),
  sources: z.array(assistantSourceSchema),
  limitations: z.array(z.string()),
  suggested_questions: z.array(z.string()),
  mode: z.enum(['local_grounded', 'llm_grounded', 'mock_grounded']),
  model_used: z.string().nullable().optional(),
  confidence: z.number(),
})

const assistantChatSchema = z.object({
  message_id: z.string(),
  session_id: z.string(),
  answer: assistantAnswerSchema,
  created_at: z.string(),
})

const assistantTutorialSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  page: z.string(),
  step_count: z.number(),
})

const assistantTutorialSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  page: z.string(),
  steps: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    route: z.string(),
    action_label: z.string(),
  })),
})

const assistantDiagnosisSchema = z.object({
  conclusion: z.string(),
  summary: z.string(),
  status: z.enum(['observed', 'inferred', 'unavailable']),
  evidence: z.array(assistantEvidenceSchema),
  observed: z.array(z.string()),
  limitations: z.array(z.string()),
  finding: z.record(z.unknown()).nullable().optional(),
  run: z.record(z.unknown()).nullable().optional(),
  case: z.record(z.unknown()).nullable().optional(),
  judge: z.record(z.unknown()).nullable().optional(),
  risk_tag: z.string().nullable().optional(),
})

const assistantRemediationSchema = z.object({
  plan_id: z.string(),
  risk_tag: z.string(),
  problem: z.string(),
  observed: z.array(z.string()),
  causes: z.array(z.string()),
  impact: z.array(z.string()),
  recommendations: z.array(z.string()),
  steps: z.array(z.string()),
  side_effects: z.array(z.string()),
  regression_plan: z.array(z.string()),
  evidence: z.array(assistantEvidenceSchema),
  sources: z.array(assistantSourceSchema),
  limitations: z.array(z.string()),
  requires_human_confirmation: z.boolean(),
})

const assistantSourceDetailSchema = assistantSourceSchema.extend({
  content: z.string(),
  source_version: z.string(),
})

const assistantFeedbackSchema = z.object({ id: z.string(), accepted: z.boolean() })

const capabilitiesSchema = z.object({
  public_read: z.boolean(),
  controlled_writes: z.boolean(),
  anonymous_writes: z.boolean(),
  writes_require_auth: z.boolean(),
  max_cases_per_run: z.number(),
  async_tasks: z.boolean(),
  database: z.enum(['postgresql', 'sqlite']),
  migrations: z.string(),
  auto_create_schema: z.boolean(),
  environment: z.string(),
  llm_enabled: z.boolean(),
  write_token_configured: z.boolean(),
  private_reads_require_auth: z.boolean(),
  rate_limit_scope: z.string(),
  public_data_scope: z.string(),
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
  capabilities: capabilitiesSchema,
  assistantChat: assistantChatSchema,
  assistantTutorials: z.array(assistantTutorialSummarySchema),
  assistantTutorial: assistantTutorialSchema,
  assistantDiagnosis: assistantDiagnosisSchema,
  assistantRemediation: assistantRemediationSchema,
  assistantSource: assistantSourceDetailSchema,
  assistantFeedback: assistantFeedbackSchema,
} as const

export { RunStatus, Severity }
