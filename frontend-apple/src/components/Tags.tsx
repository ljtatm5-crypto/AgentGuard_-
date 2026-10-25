import type {
  FindingStatus,
  JudgeSource,
  PolicyDecision,
  RunStatus,
  Severity,
  TraceEventType,
} from '@/types/enums'
import {
  FINDING_STATUS_LABELS,
  JUDGE_SOURCE_LABELS,
  POLICY_DECISION_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TRACE_TYPE_LABELS,
} from '@/types/enums'

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info'

const statusTone: Record<RunStatus, Tone> = {
  pending: 'neutral',
  running: 'info',
  passed: 'success',
  failed: 'danger',
  needs_review: 'warning',
}

const severityTone: Record<Severity, Tone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
}

const judgeTone: Record<JudgeSource, Tone> = {
  rule: 'success',
  metric: 'info',
  semantic: 'warning',
  human: 'neutral',
}

const policyTone: Record<PolicyDecision, Tone> = {
  allow: 'success',
  deny: 'danger',
  review: 'warning',
}

const traceTone: Record<TraceEventType, Tone> = {
  input: 'neutral',
  retrieval: 'info',
  tool: 'info',
  policy: 'warning',
  response: 'neutral',
  error: 'danger',
}

function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

export const StatusTag = ({ v }: { v: RunStatus }) => (
  <Tag tone={statusTone[v]}>{STATUS_LABELS[v]}</Tag>
)

export const SeverityTag = ({ v }: { v: Severity }) => (
  <Tag tone={severityTone[v]}>{SEVERITY_LABELS[v]}</Tag>
)

/** 判定来源标签 —— 用于显式展示「规则优先、模型补充」 */
export const JudgeSourceTag = ({ v }: { v: JudgeSource }) => (
  <Tag tone={judgeTone[v]}>{JUDGE_SOURCE_LABELS[v]}</Tag>
)

export const PolicyTag = ({ v }: { v: PolicyDecision }) => (
  <Tag tone={policyTone[v]}>{POLICY_DECISION_LABELS[v]}</Tag>
)

export const TraceTypeTag = ({ v }: { v: TraceEventType }) => (
  <Tag tone={traceTone[v]}>{TRACE_TYPE_LABELS[v]}</Tag>
)

export const FindingStatusTag = ({ v }: { v: FindingStatus }) => (
  <Tag tone={v === 'mitigated' ? 'success' : 'danger'}>{FINDING_STATUS_LABELS[v]}</Tag>
)
