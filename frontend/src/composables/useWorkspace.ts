import { computed, ref } from 'vue'
import { getAgents, getDataMode, getFindings, getMetrics, getRuns, getSuites, getTrace, runSuite } from '../api/client'
import type { Agent, Finding, Metrics, TestRun, TestSuite, TraceEvent } from '../types'

const agents = ref<Agent[]>([])
const suites = ref<TestSuite[]>([])
const runs = ref<TestRun[]>([])
const findings = ref<Finding[]>([])
const metrics = ref<Metrics>({ total_runs: 0, passed_runs: 0, pass_rate: 0, finding_count: 0, risk_detection_rate: 0, avg_latency_ms: 0 })
const loading = ref(false)
const notice = ref('')
const initialized = ref(false)

const initialize = async (force = false) => {
  if (initialized.value && !force) return
  loading.value = true
  try {
    ;[agents.value, suites.value, runs.value, findings.value, metrics.value] = await Promise.all([
      getAgents(),
      getSuites(),
      getRuns(),
      getFindings(),
      getMetrics(),
    ])
    initialized.value = true
    notice.value = getDataMode() === 'mock'
      ? '当前为 Mock 数据模式：全部页面和路由可独立联调，不会访问任何外部目标。'
      : ''
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

const executeDemo = async () => {
  const agent = agents.value[0]
  const suite = suites.value[0]
  if (!agent || !suite) return
  loading.value = true
  try {
    await runSuite(agent.id, suite.id)
    await initialize(true)
    notice.value = getDataMode() === 'mock'
      ? 'Mock 任务已回放；切换 api 模式后才会写入本地 SQLite。'
      : '演示任务完成，结果已写入本地 SQLite。'
  } finally {
    loading.value = false
  }
}

const loadTrace = (runId: string): Promise<TraceEvent[]> => getTrace(runId)

export const useWorkspace = () => ({
  agents,
  suites,
  runs,
  findings,
  metrics,
  loading,
  notice,
  dataMode: getDataMode(),
  currentAgent: computed(() => agents.value[0]),
  currentSuite: computed(() => suites.value[0]),
  latestFinding: computed(() => findings.value[0]),
  initialize,
  executeDemo,
  loadTrace,
})
