import type { Agent, Metrics, TestRun, TestSuite, TraceEvent } from '../types'

const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  if (!response.ok) {
    throw new Error((await response.text()) || `API ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const getAgents = () => api<Agent[]>('/agents')
export const getSuites = () => api<TestSuite[]>('/test-suites')
export const getRuns = () => api<TestRun[]>('/runs')
export const getMetrics = () => api<Metrics>('/metrics')
export const getTrace = (runId: string) => api<TraceEvent[]>(`/runs/${runId}/trace`)

export const runSuite = (agentId: string, suiteId: string) =>
  api<{ task_id: string; total: number }>('/runs', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, suite_id: suiteId, mode: 'demo' }),
  })
