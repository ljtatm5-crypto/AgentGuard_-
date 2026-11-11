import type { AssistantContext } from '@/types/api'

export const XIAOAN_CONTEXT_EVENT = 'xiaoan:context'

let currentContext: AssistantContext = { page: '/overview' }

export function setXiaoAnContext(next: Partial<AssistantContext>): void {
  currentContext = { ...currentContext, ...next }
  window.dispatchEvent(new CustomEvent(XIAOAN_CONTEXT_EVENT, { detail: currentContext }))
}

export function getXiaoAnContext(): AssistantContext {
  return currentContext
}
