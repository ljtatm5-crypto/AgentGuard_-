import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/api/client'

export type AsyncState<T> =
  | { phase: 'loading' }
  | { phase: 'error'; error: ApiRequestError }
  | { phase: 'ready'; data: T }

/**
 * 统一异步数据 Hook —— 页面四态（loading / ready / empty / error）
 * 由页面根据 data 是否为空派生 empty 态，此处只负责取数与重试。
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ phase: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    fetcher()
      .then((data) => {
        if (!cancelled && alive.current) setState({ phase: 'ready', data })
      })
      .catch((e: unknown) => {
        if (cancelled || !alive.current) return
        const err =
          e instanceof ApiRequestError
            ? e
            : new ApiRequestError({ error_code: 'UNKNOWN', message: '未知错误' }, 0)
        setState({ phase: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken])

  const retry = useCallback(() => setReloadToken((t) => t + 1), [])

  return { state, retry }
}
