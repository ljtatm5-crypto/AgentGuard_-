import { mockAgents, mockFindings, mockMetrics, mockRuns, mockSuites, mockTraces } from '../mocks/data'
import type { Agent, Finding, Metrics, TestRun, TestSuite, TraceEvent } from '../types'

type DataMode = 'mock' | 'api'
const dataMode: DataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'mock'
const clone = <T>(value: T): T => structuredClone(value)
const mockDelay = () => new Promise((resolve) => window.setTimeout(resolve, 80))

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

const fromMock = async <T>(value: T): Promise<T> => {
  await mockDelay()
  return clone(value)
}

export const getDataMode = (): DataMode => dataMode
export const getAgents = () => dataMode === 'mock' ? fromMock(mockAgents) : api<Agent[]>('/agents')
export const getSuites = () => dataMode === 'mock' ? fromMock(mockSuites) : api<TestSuite[]>('/test-suites')
export const getRuns = () => dataMode === 'mock' ? fromMock(mockRuns) : api<TestRun[]>('/runs')
export const getFindings = () => dataMode === 'mock' ? fromMock(mockFindings) : api<Finding[]>('/findings')
export const getMetrics = () => dataMode === 'mock' ? fromMock(mockMetrics) : api<Metrics>('/metrics')
export const getTrace = (runId: string) => dataMode === 'mock'
  ? fromMock(mockTraces[runId] ?? [])
  : api<TraceEvent[]>(`/runs/${runId}/trace`)

export const runSuite = async (agentId: string, suiteId: string) => {
  if (dataMode === 'mock') {
    await mockDelay()
    return { task_id: 'task-demo-001', status: 'completed', total: mockRuns.length }
  }
  return api<{ task_id: string; status: string; total: number }>('/runs', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, suite_id: suiteId, mode: 'demo' }),
  })
}
