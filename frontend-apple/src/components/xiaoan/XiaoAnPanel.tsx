import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenText,
  CheckCircle,
  PaperPlaneTilt,
  ShieldCheck,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { api, ApiRequestError } from '@/api/client'
import type {
  AssistantAnswer,
  AssistantContext,
  AssistantEvidenceCard,
  AssistantSource,
  AssistantTutorial,
  AssistantTutorialSummary,
} from '@/types/api'
import { getXiaoAnContext, XIAOAN_CONTEXT_EVENT } from '@/utils/xiaoanContext'

type ChatItem =
  | { id: string; role: 'assistant'; answer: AssistantAnswer; messageId?: string }
  | { id: string; role: 'user'; text: string }

const PAGE_QUESTIONS: Record<string, string[]> = {
  '/overview': ['第一次使用应该做什么？', 'AgentGuard 可以测试什么？', '如何完成一次完整测试？'],
  '/agents': ['如何接入 Dify？', '如何接入 FastGPT？', '为什么授权验证失败？'],
  '/test-suites': ['什么是 RAG 测试？', '什么是工具越权测试？', '如何编写预期行为？'],
  '/runs': ['如何阅读当前执行轨迹？', '解释这次测试为什么失败', '哪些事件可以证明工具被调用？'],
  '/findings': ['这条攻击链是否实际发生？', '为当前缺陷制定修复计划', '修复后应该测哪些用例？'],
  '/reports': ['Precision、Recall、F1 是什么？', '为什么待复核不能当作通过？', '如何比较修复前后版本？'],
  '/settings': ['访问令牌有什么用？', '测试数据如何受控使用？'],
}

const PAGE_LABELS: Record<string, string> = {
  '/overview': '总览', '/agents': 'Agent 资产', '/test-suites': '测试集', '/runs': '执行任务',
  '/findings': '攻击链与缺陷', '/reports': '报告与回归', '/settings': '设置',
}

function pageKey(pathname: string): string {
  if (pathname.startsWith('/runs')) return '/runs'
  if (pathname.startsWith('/findings')) return '/findings'
  return PAGE_LABELS[pathname] ? pathname : '/overview'
}

function greeting(context: AssistantContext): AssistantAnswer {
  const page = pageKey(context.page)
  return {
    conclusion: `你好，我是小安。我可以根据当前页面，带你完成${PAGE_LABELS[page]}相关操作，也会在选中真实运行或缺陷后解释证据。`,
    steps: [],
    evidence: [],
    sources: [],
    limitations: ['小安负责教学和建议；事实判定以 AgentGuard 固定规则和真实运行证据为准。'],
    suggested_questions: PAGE_QUESTIONS[page] || PAGE_QUESTIONS['/overview'],
    mode: 'local_grounded',
    model_used: null,
    confidence: 1,
  }
}

function compactContext(page: string, search: string): AssistantContext {
  const params = new URLSearchParams(search)
  const global = getXiaoAnContext()
  const currentPage = pageKey(page)
  const globalMatchesPage = global.page === currentPage
  const runId = params.get('run') || (globalMatchesPage ? global.run_id : null) || (page.startsWith('/runs/') ? page.split('/')[2] : null)
  return {
    page: currentPage,
    agent_id: params.get('agent') || (globalMatchesPage ? global.agent_id : undefined),
    run_id: runId,
    case_id: params.get('case') || (globalMatchesPage ? global.case_id : undefined),
    finding_id: globalMatchesPage ? global.finding_id : undefined,
    event_ids: params.get('events')?.split(',').filter(Boolean) || (globalMatchesPage ? global.event_ids : []) || [],
  }
}

export default function XiaoAnPanel() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tutorials, setTutorials] = useState<AssistantTutorialSummary[]>([])
  const [tutorial, setTutorial] = useState<AssistantTutorial | null>(null)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [context, setContext] = useState<AssistantContext>(() => compactContext(location.pathname, location.search))
  const [messages, setMessages] = useState<ChatItem[]>(() => [{ id: 'greeting', role: 'assistant', answer: greeting(context) }])
  const [feedback, setFeedback] = useState<Record<string, -1 | 1>>({})
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const next = compactContext(location.pathname, location.search)
    setContext(next)
    setMessages(current => current.length === 1 ? [{ id: 'greeting', role: 'assistant', answer: greeting(next) }] : current)
  }, [location.pathname, location.search])

  useEffect(() => {
    const sync = () => setContext(compactContext(location.pathname, location.search))
    window.addEventListener(XIAOAN_CONTEXT_EVENT, sync)
    return () => window.removeEventListener(XIAOAN_CONTEXT_EVENT, sync)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!open || tutorials.length) return
    api.listAssistantTutorials().then(setTutorials).catch(() => undefined)
  }, [open, tutorials.length])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const quickQuestions = useMemo(() => {
    const latest = [...messages].reverse().find(item => item.role === 'assistant') as Extract<ChatItem, { role: 'assistant' }> | undefined
    return latest?.answer.suggested_questions?.length ? latest.answer.suggested_questions : PAGE_QUESTIONS[pageKey(context.page)] || PAGE_QUESTIONS['/overview']
  }, [messages, context.page])

  async function send(question = input) {
    const trimmed = question.trim()
    if (!trimmed || loading) return
    setInput('')
    setError('')
    setMessages(current => [...current, { id: `user-${Date.now()}`, role: 'user', text: trimmed }])
    setLoading(true)
    try {
      const response = await api.assistantChat({ session_id: sessionId, message: trimmed, context })
      setSessionId(response.session_id)
      setMessages(current => [...current, { id: response.message_id, role: 'assistant', answer: response.answer, messageId: response.message_id }])
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '小安暂时无法回答，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function openTutorial(id: string) {
    setError('')
    try {
      const data = await api.getAssistantTutorial(id)
      setTutorial(data)
      setTutorialStep(0)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '教学流程加载失败')
    }
  }

  async function rate(messageId: string, rating: -1 | 1) {
    setFeedback(current => ({ ...current, [messageId]: rating }))
    await api.assistantFeedback({ message_id: messageId, rating }).catch(() => undefined)
  }

  function go(route: string | null | undefined) {
    if (!route || !route.startsWith('/')) return
    navigate(route)
    setOpen(false)
  }

  return (
    <>
      {!open && (
        <button type="button" className="xiaoan-launcher" onClick={() => setOpen(true)} aria-label="打开小安教学助手" data-testid="xiaoan-launcher">
          <Sparkle size={20} weight="fill" aria-hidden="true" />
          <span>小安</span>
        </button>
      )}
      {open && (
        <section className="xiaoan-backdrop" aria-label="小安教学助手">
          <div className="xiaoan-panel" role="dialog" aria-modal="true" aria-labelledby="xiaoan-title" data-testid="xiaoan-panel">
            <header className="xiaoan-head">
              <div className="xiaoan-identity">
                <span className="xiaoan-mark"><Sparkle size={20} weight="fill" /></span>
                <div>
                  <h2 id="xiaoan-title">小安</h2>
                  <p>AgentGuard 教学助手 · 当前页面：{PAGE_LABELS[pageKey(context.page)]}</p>
                </div>
              </div>
              <button type="button" className="xiaoan-close" onClick={() => setOpen(false)} aria-label="关闭小安"><X size={19} /></button>
            </header>

            <div className="xiaoan-context-bar">
              <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
              <span>{context.run_id || context.finding_id ? '已带入当前授权证据上下文' : '当前为基础教学问答'}</span>
              <span className="xiaoan-mode">{context.run_id || context.finding_id ? '证据感知' : '知识检索'}</span>
            </div>

            {tutorial ? (
              <div className="xiaoan-tutorial" data-testid="xiaoan-tutorial">
                <button type="button" className="xiaoan-back-link" onClick={() => setTutorial(null)}>返回对话</button>
                <span className="xiaoan-eyebrow">跟着小安学 · 第 {tutorialStep + 1} / {tutorial.steps.length} 步</span>
                <h3>{tutorial.steps[tutorialStep].title}</h3>
                <p>{tutorial.steps[tutorialStep].detail}</p>
                <div className="xiaoan-tutorial-progress">
                  {tutorial.steps.map((step, index) => <i key={step.title} className={index <= tutorialStep ? 'active' : ''} />)}
                </div>
                <div className="xiaoan-tutorial-actions">
                  <button type="button" className="btn" disabled={tutorialStep === 0} onClick={() => setTutorialStep(value => Math.max(0, value - 1))}>上一步</button>
                  <button type="button" className="btn btn-primary" onClick={() => go(tutorial.steps[tutorialStep].route)}>
                    {tutorial.steps[tutorialStep].action_label} <ArrowRight size={15} />
                  </button>
                  <button type="button" className="btn" disabled={tutorialStep >= tutorial.steps.length - 1} onClick={() => setTutorialStep(value => Math.min(tutorial.steps.length - 1, value + 1))}>下一步</button>
                </div>
              </div>
            ) : (
              <>
                <div className="xiaoan-messages" data-testid="xiaoan-messages">
                  {messages.map(item => item.role === 'user' ? (
                    <div key={item.id} className="xiaoan-message user"><p>{item.text}</p></div>
                  ) : (
                    <AssistantMessage key={item.id} answer={item.answer} context={context} messageId={item.messageId} rated={item.messageId ? feedback[item.messageId] : undefined} onRate={rate} onNavigate={go} />
                  ))}
                  {loading && <div className="xiaoan-message assistant xiaoan-thinking"><span /><span /><span /><small>小安正在核对知识库与证据…</small></div>}
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <div ref={endRef} />
                </div>

                <div className="xiaoan-quick">
                  {quickQuestions.slice(0, 4).map(question => <button key={question} type="button" onClick={() => void send(question)}>{question}</button>)}
                </div>

                {tutorials.length > 0 && (
                  <div className="xiaoan-tutorial-list">
                    <span className="xiaoan-eyebrow"><BookOpenText size={15} /> 教学流程</span>
                    {tutorials.slice(0, 3).map(item => (
                      <button key={item.id} type="button" onClick={() => void openTutorial(item.id)}>
                        <span><strong>{item.title}</strong><small>{item.description}</small></span>
                        <span>{item.step_count} 步 <ArrowRight size={13} /></span>
                      </button>
                    ))}
                  </div>
                )}

                <form className="xiaoan-input" onSubmit={event => { event.preventDefault(); void send() }}>
                  <label className="sr-only" htmlFor="xiaoan-question">问小安</label>
                  <textarea id="xiaoan-question" value={input} onChange={event => setInput(event.target.value)} placeholder="问小安：下一步该怎么做？" rows={2} />
                  <button type="submit" className="xiaoan-send" disabled={!input.trim() || loading} aria-label="发送问题"><PaperPlaneTilt size={18} weight="fill" /></button>
                </form>
              </>
            )}
          </div>
        </section>
      )}
    </>
  )
}

function AssistantMessage({ answer, context, messageId, rated, onRate, onNavigate }: {
  answer: AssistantAnswer
  context: AssistantContext
  messageId?: string
  rated?: -1 | 1
  onRate: (messageId: string, rating: -1 | 1) => void
  onNavigate: (route: string | null | undefined) => void
}) {
  return (
    <article className="xiaoan-message assistant">
      <div className="xiaoan-answer-head">
        <span className="xiaoan-answer-mark"><Sparkle size={15} weight="fill" /></span>
        <strong>{answer.mode === 'mock_grounded' ? '小安 · 示例回答' : answer.mode === 'llm_grounded' ? '小安 · 模型回答' : '小安 · 知识回答'}</strong>
        {answer.confidence > 0 && <span>{Math.round(answer.confidence * 100)}% 置信度</span>}
      </div>
      <p className="xiaoan-conclusion">{answer.conclusion}</p>
      {answer.steps.length > 0 && <ol className="xiaoan-steps">{answer.steps.map((step, index) => (
        <li key={`${step.title}-${index}`}>
          <span>{index + 1}</span>
          <div><strong>{step.title}</strong><p>{step.detail}</p>{step.route && <button type="button" onClick={() => onNavigate(step.route)}>{step.action_label || '定位操作'} <ArrowRight size={13} /></button>}</div>
        </li>
      ))}</ol>}
      {answer.evidence.length > 0 && <EvidenceList evidence={answer.evidence} context={context} onNavigate={onNavigate} />}
      {answer.sources.length > 0 && <SourceReferences sources={answer.sources} onNavigate={onNavigate} />}
      {answer.limitations.length > 0 && <div className="xiaoan-limitations"><WarningCircle size={15} /><span>{answer.limitations[0]}</span></div>}
      {messageId && (
        <div className="xiaoan-feedback">
          <span>这个回答有帮助吗？</span>
          <button type="button" className={rated === 1 ? 'active' : ''} onClick={() => onRate(messageId, 1)} aria-label="有帮助"><ThumbsUp size={15} /></button>
          <button type="button" className={rated === -1 ? 'active' : ''} onClick={() => onRate(messageId, -1)} aria-label="没有帮助"><ThumbsDown size={15} /></button>
        </div>
      )}
    </article>
  )
}

function EvidenceList({ evidence, context, onNavigate }: { evidence: AssistantEvidenceCard[]; context: AssistantContext; onNavigate: (route: string | null | undefined) => void }) {
  return (
    <div className="xiaoan-evidence">
      <span className="xiaoan-eyebrow"><CheckCircle size={15} /> 真实证据（{evidence.length}）</span>
      {evidence.slice(0, 5).map((item, index) => (
        <details key={`${item.label}-${index}`}>
          <summary><strong>{item.label}</strong><span>{item.status === 'observed' ? '实际观测' : item.status === 'inferred' ? '推断' : '不可观测'}</span></summary>
          <p>{item.detail}</p>
          {item.event_ids.length > 0 && (
            <button type="button" onClick={() => {
              if (!context.run_id || !context.case_id) return
              onNavigate(`/runs?${new URLSearchParams({ run: context.run_id, case: context.case_id, events: item.event_ids.join(',') })}`)
            }}>
              事件：{item.event_ids.join(', ')} <ArrowRight size={12} />
            </button>
          )}
        </details>
      ))}
    </div>
  )
}

function SourceReferences({ sources, onNavigate }: { sources: AssistantSource[]; onNavigate: (route: string | null | undefined) => void }) {
  return (
    <div className="xiaoan-sources">
      <span className="xiaoan-eyebrow"><BookOpenText size={15} /> 引用来源</span>
      {sources.slice(0, 4).map((source, index) => (
        <details key={source.id}>
          <summary><span>{index + 1}</span><strong>{source.title}</strong><small>{source.heading}</small></summary>
          <p>{source.excerpt}</p>
          <button type="button" onClick={() => onNavigate(source.route)}>打开相关页面 <ArrowRight size={12} /></button>
        </details>
      ))}
    </div>
  )
}
