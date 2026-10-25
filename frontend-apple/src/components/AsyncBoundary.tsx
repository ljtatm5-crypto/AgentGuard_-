import type { ReactNode } from 'react'
import { ArrowClockwise, Tray, WarningCircle } from '@phosphor-icons/react'
import type { AsyncState } from '@/hooks/useAsync'

/** 四态容器：loading / ready / empty / error(error 可重试) */
export function AsyncBoundary<T>({
  state,
  isEmpty,
  onRetry,
  children,
}: {
  state: AsyncState<T>
  isEmpty?: (data: T) => boolean
  onRetry?: () => void
  children: (data: T) => ReactNode
}) {
  if (state.phase === 'loading') {
    return (
      <div className="state-box state-loading" role="status" aria-live="polite" data-testid="state-loading">
        <div className="skeleton-stack" aria-hidden="true">
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line skeleton-wide" />
          <span className="skeleton-line" />
        </div>
        <p className="muted">正在获取最新记录…</p>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="state-box" role="alert" data-testid="state-error">
        <WarningCircle className="state-icon" size={32} weight="duotone" aria-hidden="true" />
        <p className="state-title">加载失败</p>
        <p className="state-error-code">{state.error.error_code}</p>
        <p className="state-desc">{state.error.message}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry} data-testid="retry-btn">
            <ArrowClockwise size={16} aria-hidden="true" />
            重试
          </button>
        )}
      </div>
    )
  }

  if (isEmpty?.(state.data)) {
    return (
      <div className="state-box" data-testid="state-empty">
        <Tray className="state-icon" size={32} weight="duotone" aria-hidden="true" />
        <p className="state-title">暂无数据</p>
        <p className="state-desc">
          这里还没有记录。完成资产配置、建立测试集或启动任务后，再回来查看。
        </p>
      </div>
    )
  }

  return <>{children(state.data)}</>
}
