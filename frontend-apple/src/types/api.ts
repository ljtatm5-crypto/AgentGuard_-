/**
 * 团队公共契约类型
 * ---------------------------------------------------------------
 * 与后端 Pydantic Schema 一一对应。时间统一 ISO 8601。
 * 字段变更必须先在协作频道说明，并同步更新后端模型与本文件。
 * 本文件是 Mock 数据与真实响应的共同类型来源 —— Mock 不允许偏离。
 */
import type {
  FindingStatus,
  JudgeSource,
  PolicyDecision,
  RiskTag,
  RunStatus,
  Severity,
  TraceEventType,
} from './enums'

/** 统一错误响应：必须包含错误码和可读信息 */
export interface ApiError {
  error_code: string
  message: string
  detail?: Record<string, unknown>
}

/** 授权范围 —— B 的红线：只允许自建靶场或已明确授权的内部环境 */
export interface AuthorizedScope {
  /** internal_mock = 团队自建靶场；internal_authorized = 已获书面授权的内部环境 */
  target_type: 'internal_mock' | 'internal_authorized'
  /** 是否允许外网目标 —— 恒为 false，页面据此做展示约束 */
  external_target_allowed: false
  note: string
}

/** Agent 资产对象 */
export interface Agent {
  id: string
  version: string
  name: string
  /** 面向客户的智能体能力类型 */
  agent_type: 'conversation' | 'rag' | 'tool' | 'workflow'
  purpose: string
  endpoint: string
  model: string
  knowledge: KnowledgeBaseRef[]
  tools: ToolDef[]
  permissions: Record<string, PolicyDecision>
  validate_status: 'validated' | 'invalid' | 'pending'
  authorized_scope: AuthorizedScope
}

export interface KnowledgeBaseRef {
  id: string
  name: string
  version: string
  source: string
  /** normal / conflict / malicious —— B 的三层知识库结构 */
  kind: 'normal' | 'conflict' | 'malicious'
}

export interface ToolDef {
  name: string
  description: string
  /** 虚拟工具只写虚拟文件/虚拟库/模拟 API，绝不触碰真实生产系统 */
  side_effect: 'none' | 'virtual_write' | 'external_write'
}

/** 测试集 */
export interface TestSuite {
  id: string
  name: string
  type: string
  version: string
  case_ids: string[]
}

export interface TestCase {
  id: string
  suite_id: string
  title: string
  risk_tag: RiskTag
  input: string
  steps: string[]
  expected: string
  forbidden: string[]
  judge: JudgeSource[]
  source: 'ai_generated' | 'manual'
  version: string
}

export interface TestRun {
  id: string
  task_id: string
  agent_id: string
  agent_version: string
  suite_id: string
  suite_version: string
  status: RunStatus
  total: number
  completed: number
  passed: number
  failed: number
  needs_review: number
  latency_ms: number
  started_at: string
  finished_at: string | null
}

export interface TraceEvent {
  id: string
  run_id: string
  case_id: string
  type: TraceEventType
  timestamp: string
  tool: string | null
  params: Record<string, unknown> | null
  output: string | null
  error: string | null
  policy_decision: PolicyDecision | null
}

/** 证据引用 —— 每条 Finding 必须能回指到具体的运行记录与轨迹事件 */
export interface EvidenceRef {
  run_id: string
  case_id: string
  event_ids: string[]
}

export interface ChainNode {
  id: string
  kind: 'entry' | 'behavior' | 'impact' | 'fix'
  label: string
  detail: string
  evidence: EvidenceRef
}

export interface Finding {
  id: string
  title: string
  risk_tag: RiskTag
  severity: Severity
  status: FindingStatus
  evidence: EvidenceRef
  impact: string
  recommendation: string
  agent_version: string
  suite_version: string
  created_at: string
  chain: ChainNode[]
}

/** 复判结果：按固定规则重新判定并保留来源 */
export interface JudgeResult {
  run_id: string
  case_id: string
  status: RunStatus
  judge_source: JudgeSource
  reason: string
  confidence: number
  evidence: EvidenceRef
  reviewed_by: string | null
  reviewed_at: string | null
}

/**
 * 聚合指标 —— 只从原始运行记录计算。
 * 目标值与实测值必须分开标注，禁止前端写死目标数字。
 */
export interface Metrics {
  total_cases: number
  completed_cases: number
  passed_cases: number
  failed_cases: number
  needs_review_cases: number
  rule_judged_cases: number
  semantic_judged_cases: number
  avg_latency_ms: number
  findings_total: number
  findings_open: number
  findings_mitigated: number
  risk_detection_rate: number | null
  attack_success_rate_before: number | null
  attack_success_rate_after: number | null
  trace_coverage_rate: number | null
  /** 目标值（比赛指标），与实测值严格区分，页面必须分别渲染 */
  target_benchmarks: Record<string, number>
  /** 指标版本化依据，报告可回溯 */
  computed_from_run_ids: string[]
}
