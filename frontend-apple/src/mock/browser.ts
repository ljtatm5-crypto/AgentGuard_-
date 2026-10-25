import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Mock Service Worker：在浏览器层拦截 fetch，页面代码零感知 */
export const worker = setupWorker(...handlers)
