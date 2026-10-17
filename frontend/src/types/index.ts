export type Agent = {
  id: string
  name: string
  version: string
  adapter: string
  endpoint: string
  model: string
  knowledge: string[]
  tools: string[]
  permissions: Record<string, string>
  status: string
  target_scope?: 'local_mock' | 'self_hosted_dify' | 'authorized_external' | 'unverified'
  authorization_confirmed?: boolean
  authorization_reference?: string
}

export type TestCase = {
  id: string
  name: string
  type: string
  input: string
  expected: string
  risk_tag: string
  forbidden?: string[]
  judge?: {
    rule_first?: boolean
    ruleset_version?: string
    llm_role?: 'supplement_only'
  }
}

export type TestSuite = {
  id: string
  name: string
  version: string
  status: string
  cases: TestCase[]
}

export type Finding = {
  id: string
  severity: string
  title: string
  recommendation: string
  status: string
  evidence?: string[]
  impact?: string
  chain: { label: string; status: string }[]
}

export type TestRun = {
  id: string
  task_id: string
  case_name: string
  case_type: string
  risk_tag: string
  status: string
  score: number
  latency: number
  result: {
    answer?: string
    judge?: {
      conclusion?: string
      reason?: string
      source?: string
      ruleset_version?: string
      evidence?: string[]
      llm_supplement?: { used: boolean; can_override_rule: boolean }
    }
  }
  finding?: Finding
}

export type Metrics = {
  total_runs: number
  passed_runs: number
  pass_rate: number
  finding_count: number
  risk_detection_rate: number
  avg_latency_ms: number
  regression?: { before: number; after: number; status: string }
}

export type TraceEvent = {
  id: string
  run_id?: string
  type: string
  timestamp?: string
  tool?: string
  output?: string
  params: Record<string, unknown>
  duration_ms?: number
  error?: string
}
