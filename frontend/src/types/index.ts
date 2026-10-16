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
}

export type TestCase = {
  id: string
  name: string
  type: string
  input: string
  expected: string
  risk_tag: string
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
  result: { answer?: string; judge?: { reason?: string } }
  finding?: Finding
}

export type Metrics = {
  total_runs: number
  passed_runs: number
  pass_rate: number
  finding_count: number
  risk_detection_rate: number
  avg_latency_ms: number
}

export type TraceEvent = {
  id: string
  type: string
  tool?: string
  output?: string
  params: Record<string, unknown>
  duration_ms?: number
}
