import type { ZodType } from 'zod'
import type {
  Agent,
  Finding,
  JudgeResult,
  Metrics,
  TestCase,
  TestRun,
  TestSuite,
  TraceEvent,
} from '@/types/api'
import { ApiRequestError, schemas } from './schemas'
import { API_PREFIX, apiPath } from './contract'

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

/** 重试策略：仅对网络错误与 5xx 重试，4xx 属契约问题不重试 */
const RETRY_LIMIT = 2
const RETRY_DELAY_MS = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const url = USE_MOCK ? apiPath(path) : `${BASE}${apiPath(path)}`

  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

/* ---------------- Agent 资产（B 提供） ---------------- */
export const api = {
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
  generateSuite: (payload: { agent_id: string; test_type: string }) =>
    request('/test-suites/generate', schemas.suiteGeneration, {
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

  /* ---------------- 指标聚合 ---------------- */
  getMetrics: () => request<Metrics>('/metrics', schemas.metrics),
}

export type Api = typeof api
export { API_PREFIX }
