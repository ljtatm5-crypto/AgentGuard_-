import type { TraceEvent } from '@/types/api'
import { TRACE_TYPE_LABELS } from '@/types/enums'
import type { TraceEventType as TraceType } from '@/types/enums'

/**
 * 轨迹视图计算（纯函数，便于独立校验）
 * ---------------------------------------------------------------
 * 从 RunsPage 抽出，原因是这里的边界最容易出错：
 *   - 分批渲染会截断列表，而证据深链可能指向被截断的部分；
 *   - 筛选状态与聚焦状态叠加时，目标事件可能被筛掉。
 * 抽成纯函数后可用 scripts/check-trace-view.ts 覆盖 520 条事件的场景
 * （含反向验证：去掉聚焦扩展逻辑后该脚本必须失败）。
 */

export interface TraceViewInput {
  events: TraceEvent[]
  types: TraceType[]
  query: string
  onlyIssues: boolean
  limit: number
  focusedCase: string
  eventIds: string[]
}

export interface TraceView {
  /** 命中筛选的全部事件 */
  visible: TraceEvent[]
  /** 实际渲染的事件（保证包含聚焦事件） */
  rendered: TraceEvent[]
  /** 聚焦事件在 visible 中的下标，-1 表示没有聚焦 */
  focusIndex: number
  /** 是否发生过筛选 */
  filtered: boolean
  /** 各类型事件数，用于渲染筛选按钮 */
  counts: Map<TraceType, number>
}

/** 事件是否命中关键词：只搜索可观察字段，不涉及模型内部状态 */
export function matchesQuery(event: TraceEvent, query: string): boolean {
  if (!query) return true
  const haystack = [
    event.id,
    event.type,
    TRACE_TYPE_LABELS[event.type],
    event.tool ?? '',
    event.output ?? '',
    event.error ?? '',
    event.params ? JSON.stringify(event.params) : '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

/** 异常事件：有错误，或被策略拒绝 */
export function isIssue(event: TraceEvent): boolean {
  return Boolean(event.error) || event.policy_decision === 'deny'
}

export function buildTraceView(input: TraceViewInput): TraceView {
  const { events, types, query, onlyIssues, limit, focusedCase, eventIds } = input
  const normalized = query.trim().toLowerCase()

  const counts = new Map<TraceType, number>()
  events.forEach((event) => counts.set(event.type, (counts.get(event.type) ?? 0) + 1))

  const visible = events.filter((event) => {
    if (types.length > 0 && !types.includes(event.type)) return false
    if (onlyIssues && !isIssue(event)) return false
    return matchesQuery(event, normalized)
  })

  const focusIndex = focusedCase
    ? visible.findIndex(
        (event) => event.case_id === focusedCase && (eventIds.length === 0 || eventIds.includes(event.id)),
      )
    : -1

  // 聚焦事件必须落在渲染范围内，否则上层的滚动聚焦找不到节点
  const effectiveLimit = focusIndex >= 0 ? Math.max(limit, focusIndex + 1) : limit

  return {
    visible,
    rendered: visible.slice(0, effectiveLimit),
    focusIndex,
    filtered: visible.length !== events.length,
    counts,
  }
}
