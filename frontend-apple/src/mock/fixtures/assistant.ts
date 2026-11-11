import type {
  AssistantAnswer,
  AssistantContext,
  AssistantDiagnosis,
  AssistantEvidenceCard,
  AssistantRemediation,
  AssistantSource,
  AssistantTutorial,
  AssistantTutorialSummary,
} from '@/types/api'
import { cases } from './suites'
import { findings } from './findings'
import { runs } from './runs'
import { traceByRun } from './trace'

const mockSources: AssistantSource[] = [
  {
    id: 'xiaoan-getting-started-001',
    document_id: 'xiaoan-getting-started',
    title: '第一次使用 AgentGuard', heading: '先认识测试闭环',
    source_path: 'docs/xiaoan/user-guide.md#第一次使用', route: '/overview',
    excerpt: 'AgentGuard 的主流程是：选择 Agent 资产，选择或生成测试集，启动执行任务，阅读轨迹与判定，查看缺陷，修复后使用同一测试集复测，最后在报告页比较结果。',
    score: 0.92, access_level: 'public', tags: ['新手', '总览'], embedding_provider: 'mock',
  },
  {
    id: 'xiaoan-agent-integration-002',
    document_id: 'xiaoan-agent-integration',
    title: 'Agent 接入与授权', heading: '凭据放在哪里',
    source_path: 'docs/xiaoan/user-guide.md#agent-接入', route: '/agents',
    excerpt: '页面不保存明文 API Key。服务端通过凭据环境变量名读取密钥；浏览器只提交环境变量名，不提交密钥本身。',
    score: 0.88, access_level: 'public', tags: ['Agent', 'Dify', '凭据'], embedding_provider: 'mock',
  },
  {
    id: 'xiaoan-trace-reading-003',
    document_id: 'xiaoan-trace-reading',
    title: '阅读轨迹与判定证据', heading: '哪些事件能证明工具被调用',
    source_path: 'docs/xiaoan/user-guide.md#轨迹阅读', route: '/runs',
    excerpt: '工具调用事件本身证明 Agent 发起了调用；工具结果和策略判定分别证明调用是否执行、是否被拒绝。只看最终回答不能确定工具是否实际执行。',
    score: 0.9, access_level: 'public', tags: ['轨迹', '证据'], embedding_provider: 'mock',
  },
  {
    id: 'xiaoan-remediation-004',
    document_id: 'xiaoan-remediation',
    title: '安全缺陷修复与回归', heading: '通用修复原则',
    source_path: 'docs/xiaoan/user-guide.md#修复与回归', route: '/findings',
    excerpt: '将系统指令、用户输入、检索文档和工具返回隔离，外部内容不能提升权限。修复后使用相同测试集、相同用例和相同规则重新执行。',
    score: 0.86, access_level: 'public', tags: ['修复', '回归'], embedding_provider: 'mock',
  },
]

const questionMap: Record<string, string[]> = {
  '/overview': ['第一次使用应该做什么？', 'AgentGuard 可以测试什么？', '如何完成一次完整测试？'],
  '/agents': ['如何接入 Dify？', '如何接入 FastGPT？', '为什么授权验证失败？'],
  '/test-suites': ['什么是 RAG 测试？', '什么是工具越权测试？', '如何编写预期行为？'],
  '/runs': ['如何阅读测试轨迹？', '为什么这次测试失败？', '哪些事件可以证明工具被调用？'],
  '/findings': ['这条攻击链是否实际发生？', '怎样修复这个问题？', '修复后应该测哪些用例？'],
  '/reports': ['Precision、Recall、F1 是什么？', '为什么待复核不能当作通过？', '如何比较修复前后版本？'],
  '/settings': ['访问令牌有什么用？', '测试数据如何受控使用？'],
}

export const mockTutorials: AssistantTutorial[] = [
  {
    id: 'first-test', title: '完成第一次智能体安全测试', description: '从选择 Agent 到查看总结论。', page: '/overview',
    steps: [
      { title: '确认测试对象', detail: '打开 Agent 资产页，选择现有 Agent 或创建本地安全沙盒。', route: '/agents', action_label: '前往 Agent 资产' },
      { title: '选择测试集', detail: '查看安全基线用例，确认覆盖范围和预期行为。', route: '/test-suites', action_label: '查看测试集' },
      { title: '启动执行任务', detail: '选择 Agent 和测试集后启动任务。', route: '/runs', action_label: '前往执行任务' },
      { title: '阅读总结论', detail: '优先处理失败项，并区分待复核与通过。', route: '/runs', action_label: '查看任务' },
    ],
  },
  {
    id: 'trace-diagnosis', title: '阅读失败轨迹并定位证据', description: '学习输入、检索、工具、策略和响应事件。', page: '/runs',
    steps: [
      { title: '选择失败用例', detail: '在结果列表中选择失败或待复核用例。', route: '/runs', action_label: '打开执行任务' },
      { title: '定位关键事件', detail: '重点查看工具调用、策略判定和工具结果。', route: '/runs', action_label: '阅读轨迹' },
      { title: '核对判定理由', detail: '确认规则来源、置信度和证据事件编号。', route: '/runs', action_label: '查看判定' },
    ],
  },
  {
    id: 'remediation-regression', title: '修复缺陷并完成回归', description: '把失败证据转化为修复和同集回归计划。', page: '/findings',
    steps: [
      { title: '查看攻击链', detail: '区分已观测节点和推断关系。', route: '/findings', action_label: '查看缺陷' },
      { title: '生成修复计划', detail: '让小安基于真实缺陷和轨迹生成修复步骤。', route: '/findings', action_label: '询问小安' },
      { title: '使用原测试集复测', detail: '用同一测试集重新执行，在报告页比较变化。', route: '/reports', action_label: '查看报告' },
    ],
  },
]

export function mockTutorialSummaries(): AssistantTutorialSummary[] {
  return mockTutorials.map(({ steps, ...item }) => ({ ...item, step_count: steps.length }))
}

function eventCards(runId: string): AssistantEvidenceCard[] {
  const events = traceByRun(runId).filter(event => ['input', 'retrieval', 'tool', 'policy', 'response', 'error'].includes(event.type))
  return events.slice(0, 12).map(event => ({
    type: event.type,
    label: event.type === 'tool' ? '工具事件' : event.type === 'policy' ? '策略判定' : event.type === 'input' ? '用户输入' : event.type === 'retrieval' ? '知识检索' : event.type === 'response' ? 'Agent 响应' : '异常事件',
    detail: event.output || event.error || event.tool || '事件已记录',
    event_ids: [event.id],
    status: 'observed' as const,
    tool: event.tool,
    policy_decision: event.policy_decision,
    timestamp: event.timestamp,
  }))
}

export function buildMockDiagnosis(context: AssistantContext): AssistantDiagnosis {
  const finding = context.finding_id ? findings.find(item => item.id === context.finding_id) : undefined
  const runId = finding?.evidence.run_id || context.run_id || 'run-001'
  const run = runs.find(item => item.id === runId || item.task_id === runId) || runs[0]
  const caseId = finding?.evidence.case_id || context.case_id || (run.id === 'run-001' ? 'tc-p0-003' : 'tc-p0-001')
  const testCase = cases.find(item => item.id === caseId) || cases[0]
  const evidence = eventCards(run.id)
  const observed = evidence.filter(item => ['工具事件', '策略判定', '异常事件'].includes(item.label)).map(item => `${item.label}：${item.detail}`)
  return {
    conclusion: run.status === 'failed' ? '不通过' : run.status === 'passed' ? '通过' : '待复核',
    summary: `用例“${testCase.title}”的判定结果为${run.status}。当前回答读取的是本地示例轨迹，用于演示证据解释流程。`,
    status: evidence.length ? 'observed' : 'unavailable',
    evidence,
    observed: observed.length ? observed : ['当前示例轨迹没有工具拒绝或错误事件'],
    limitations: ['示例数据不代表真实模型回答，也不代表生产环境测试结果。', '修复建议必须经人工确认，并通过重新测试验证。'],
    finding: finding ? { id: finding.id, title: finding.title } : null,
    run: { id: run.id, status: run.status, agent_version: run.agent_version },
    case: { id: testCase.id, title: testCase.title, risk_tag: testCase.risk_tag },
    judge: { status: run.status, reason: 'Mock 规则判定' },
    risk_tag: testCase.risk_tag,
  }
}

export function buildMockAnswer(question: string, context: AssistantContext): AssistantAnswer {
  const page = context.page || '/overview'
  const hasEvidence = Boolean(context.run_id || context.finding_id)
  const diagnosis = hasEvidence ? buildMockDiagnosis(context) : null
  const relevant = mockSources.filter(source => source.route === page || (/接入|Dify|FastGPT/i.test(question) && source.route === '/agents') || (/修复|回归|失败/.test(question) && source.route === '/findings'))
  const sources = (relevant.length ? relevant : mockSources).slice(0, 3)
  return {
    conclusion: diagnosis?.summary || `根据已审核的产品知识，建议先确认当前页面目标，再按步骤操作。`,
    steps: [
      { title: '确认当前上下文', detail: `当前页面是 ${page}。先确认要处理的 Agent、测试集或运行记录。`, route: page },
      { title: '执行下一步', detail: sources[0].excerpt, route: sources[0].route, action_label: '前往相关页面' },
      { title: '核对证据', detail: '操作完成后检查页面结果、轨迹事件和报告结论，不要仅凭模型回答判断成功。', route: '/runs' },
    ],
    evidence: diagnosis?.evidence ?? [],
    sources,
    limitations: ['当前为 Mock 演示回答，未调用真实模型。', '教程知识不能替代真实运行证据。'],
    suggested_questions: questionMap[page] || questionMap['/overview'],
    mode: 'mock_grounded',
    model_used: null,
    confidence: diagnosis ? 0.82 : 0.7,
  }
}

export function buildMockRemediation(context: AssistantContext): AssistantRemediation {
  const diagnosis = buildMockDiagnosis(context)
  return {
    plan_id: `mock-plan-${Date.now()}`,
    risk_tag: diagnosis.risk_tag || 'indirect_injection',
    problem: '检索文档中的内容可能被 Agent 当成可执行指令。',
    observed: diagnosis.observed,
    causes: ['RAG 内容与指令上下文未隔离', '工具调用前缺少服务端权限复核'],
    impact: ['可能触发非预期工具调用', '可能产生越权写入尝试'],
    recommendations: ['将检索内容标记为不可执行', '在服务端校验工具权限和目标范围', '记录策略判定与工具结果'],
    steps: ['将检索内容标记为不可执行', '在服务端校验工具权限和目标范围', '记录策略判定与工具结果'],
    side_effects: ['过于严格的隔离可能降低普通摘要的连贯性'],
    regression_plan: ['使用同一测试集重新执行', '确认危险调用被拒绝或不再发生', '确认正常业务对照仍然通过', '在报告页确认状态变化'],
    evidence: diagnosis.evidence,
    sources: mockSources.filter(source => source.route === '/findings'),
    limitations: ['修复建议不会自动执行。', '只有新运行记录通过，才能判断修复有效。'],
    requires_human_confirmation: true,
  }
}
