import type { ZodType } from 'zod'
import type {
  Agent,
  AssistantChatResponse,
  AssistantContext,
  AssistantDiagnosis,
  AssistantFeedbackResponse,
  AssistantRemediation,
  AssistantSource,
  AssistantTutorial,
  AssistantTutorialSummary,
  Capabilities,
  DashboardData,
  Finding,
  JudgeResult,
  Metrics,
  TestCase,
  TestRun,
  TestSuite,
  TraceEvent,
} from '@/types/api'
import { ApiRequestError, schemas } from './schemas'
import { API_PREFIX, apiPath, mockApiPath } from './contract'

export { ApiRequestError }

/**
 * API Client —— 全项目唯一的数据出入口
 * ---------------------------------------------------------------
 * 数据源切换点唯一：VITE_USE_MOCK
 *  - true  → MSW 在浏览器层拦截，走本地 Mock
 *  - false → 直连 VITE_API_BASE，走真实后端
 * 页面组件只依赖本文件导出的函数与 types/api.ts 的类型，
 * 完全不感知当前数据来自 Mock 还是真实后端。
 */

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const CONTROL_KEY_STORAGE = 'agentguard.controlKey'
const DASHBOARD_CACHE_STORAGE = 'agentguard.dashboardSnapshot.v1'
const GET_CACHE_TTL_MS = 15_000
const getCache = new Map<string, { expiresAt: number; data: unknown }>()
const inflightGets = new Map<string, Promise<unknown>>()

export function getControlKey(): string {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(CONTROL_KEY_STORAGE) ?? ''
}

export function setControlKey(value: string): void {
  if (typeof window === 'undefined') return
  const normalized = value.trim()
  if (normalized) window.sessionStorage.setItem(CONTROL_KEY_STORAGE, normalized)
  else window.sessionStorage.removeItem(CONTROL_KEY_STORAGE)
}

/** 重试策略：仅对网络错误与 5xx 重试，4xx 属契约问题不重试 */
const RETRY_LIMIT = 2
const RETRY_DELAY_MS = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const url = USE_MOCK ? mockApiPath(path) : `${BASE}${apiPath(path)}`
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  const controlKey = getControlKey()
  if (!USE_MOCK && controlKey) {
    headers.Authorization = `Bearer ${controlKey}`
  }

  const cacheKey = `${method}:${url}:${controlKey}`
  if (method === 'GET') {
    const cached = getCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.data as T
    const pending = inflightGets.get(cacheKey)
    if (pending) return pending as Promise<T>
  }

  const execute = async (): Promise<T> => {
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers,
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({
          error_code: 'UNKNOWN_ERROR',
          message: `请求失败（HTTP ${res.status}）`,
        }))) as { error_code: string; message: string; detail?: Record<string, unknown> }

        // 5xx 视为可重试；4xx 直接抛出，交页面展示
        if (res.status >= 500 && attempt < RETRY_LIMIT) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        throw new ApiRequestError(payload, res.status)
      }

      const data = await res.json()
      const parsed = schema.safeParse(data)
      if (!parsed.success) {
        throw new ApiRequestError(
          {
            error_code: 'CONTRACT_MISMATCH',
            message: `响应结构不符合团队契约：${parsed.error.issues
              .map((i) => `${i.path.join('.')} ${i.message}`)
              .join('；')}`,
            detail: { issues: parsed.error.issues },
          },
          res.status,
        )
      }
      if (method === 'GET') {
        getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, data: parsed.data })
      } else {
        getCache.clear()
      }
      return parsed.data
    } catch (e) {
      lastError = e
      // ApiRequestError 不重试（契约/业务错误），网络层异常才重试
      if (e instanceof ApiRequestError) throw e
      if (attempt < RETRY_LIMIT) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      throw new ApiRequestError(
        {
          error_code: 'NETWORK_ERROR',
          message: e instanceof Error ? e.message : '网络请求失败，请检查后端是否启动',
        },
        0,
      )
    }
  }
  throw lastError
  }

  if (method !== 'GET') return execute()
  const pending = execute()
  inflightGets.set(cacheKey, pending)
  try {
    return await pending
  } finally {
    inflightGets.delete(cacheKey)
  }
}

/* ---------------- Agent 资产（B 提供） ---------------- */
export const api = {
  getCapabilities: () => request<Capabilities>('/capabilities', schemas.capabilities),
  getDashboard: async () => {
    const data = await request<DashboardData>('/dashboard', schemas.dashboard)
    rememberDashboardSnapshot(data)
    return data
  },
  listAgents: () => request<Agent[]>('/agents', schemas.agents),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`, schemas.agent),
  validateAgent: (payload: Record<string, unknown>) =>
    request<Agent>('/agents/validate', schemas.agent, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /* ---------------- 测试集与用例（A 提供） ---------------- */
  listSuites: () => request<TestSuite[]>('/test-suites', schemas.suites),
  listCases: (suiteId: string) =>
    request<TestCase[]>(`/test-suites/${suiteId}/cases`, schemas.cases),
  generateSuite: (payload: { agent_id: string; test_type: string; use_ai?: boolean }) =>
    request('/test-suites/generate', schemas.suiteGeneration, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  acceptGeneratedSuite: (payload: {
    agent_id: string
    name: string
    test_type: string
    cases: Array<TestCase & { ai_original?: Record<string, unknown> }>
  }) =>
    request('/test-suites/accept', schemas.suiteGeneration, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /* ---------------- 执行任务（A 提供） ---------------- */
  listRuns: () => request<TestRun[]>('/runs', schemas.runs),
  createRun: (payload: { agent_id: string; suite_id: string }) =>
    request<TestRun>('/runs', schemas.run, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getRunDetail: (id: string) =>
    request<{ run: TestRun; results: JudgeResult[] }>(`/runs/${id}`, schemas.runDetail),
  rejudge: (id: string) =>
    request<JudgeResult[]>(`/runs/${id}/judge`, schemas.judgeResults, { method: 'POST' }),
  getTrace: (runId: string) => request<TraceEvent[]>(`/runs/${runId}/trace`, schemas.trace),

  /* ---------------- 缺陷与攻击链（B 提供样本） ---------------- */
  listFindings: () => request<Finding[]>('/findings', schemas.findings),
  getFindingChain: (id: string) =>
    request<Finding>(`/findings/${id}/chain`, schemas.finding),

  /* ---------------- 小安教学助手 ---------------- */
  assistantChat: (payload: { session_id?: string | null; message: string; context: AssistantContext }) =>
    request<AssistantChatResponse>('/assistant/chat', schemas.assistantChat, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listAssistantTutorials: () =>
    request<AssistantTutorialSummary[]>('/assistant/tutorials', schemas.assistantTutorials),
  getAssistantTutorial: (id: string) =>
    request<AssistantTutorial>(`/assistant/tutorials/${id}`, schemas.assistantTutorial),
  diagnoseAssistant: (payload: { run_id?: string | null; case_id?: string | null; finding_id?: string | null; question?: string }) =>
    request<AssistantDiagnosis>('/assistant/diagnose', schemas.assistantDiagnosis, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  assistantRemediation: (payload: { run_id?: string | null; case_id?: string | null; finding_id?: string | null; question?: string }) =>
    request<AssistantRemediation>('/assistant/remediation', schemas.assistantRemediation, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  assistantFeedback: (payload: { message_id: string; rating: -1 | 1; comment?: string }) =>
    request<AssistantFeedbackResponse>('/assistant/feedback', schemas.assistantFeedback, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAssistantSource: (id: string) =>
    request<AssistantSource & { content: string; source_version: string }>(`/assistant/sources/${id}`, schemas.assistantSource),

  /* ---------------- 指标聚合 ---------------- */
  getMetrics: () => request<Metrics>('/metrics', schemas.metrics),
}

export function readDashboardSnapshot(): DashboardData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CACHE_STORAGE)
    if (!raw) return null
    const parsed = schemas.dashboard.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function rememberDashboardSnapshot(data: DashboardData): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DASHBOARD_CACHE_STORAGE, JSON.stringify(data))
  } catch {
    // Storage can be disabled in privacy mode; the live request still succeeds.
  }
}

export type Api = typeof api
export { API_PREFIX }
