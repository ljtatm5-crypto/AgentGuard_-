/**
 * 轨迹视图逻辑校验
 * ---------------------------------------------------------------
 * 覆盖最容易出错的边界：
 *   1. 500+ 事件时首屏只渲染 60 条
 *   2. 证据深链指向第 61 条之后时，目标事件必须被渲染出来
 *   3. 筛选（类型 / 关键词 / 仅异常）组合仍然保留聚焦事件
 *   4. 聚焦事件被筛掉时不应静默丢失，focusIndex = -1（上层会提示找不到）
 *
 *   npx vite-node scripts/check-trace-view.ts
 */
import { buildTraceView, isIssue, matchesQuery } from '../src/utils/trace'
import type { TraceEvent } from '../src/types/api'
import type { TraceEventType } from '../src/types/enums'

const failures: string[] = []
const check = (name: string, condition: boolean, detail?: string) => {
  if (!condition) failures.push(`${name}${detail ? '：' + detail : ''}`)
}

function makeEvent(index: number, overrides: Partial<TraceEvent> = {}): TraceEvent {
  const types: TraceEventType[] = ['input', 'retrieval', 'tool', 'policy', 'response', 'error']
  return {
    id: `ev-${String(index).padStart(4, '0')}`,
    run_id: 'run-900',
    case_id: 'tc-long-001',
    type: types[index % types.length],
    timestamp: `2026-10-26T10:00:${String(index % 60).padStart(2, '0')}Z`,
    tool: index % 7 === 0 ? 'protected_write' : null,
    params: { index },
    output: `第 ${index} 条事件输出`,
    error: index % 41 === 0 ? 'TOOL_PERMISSION_DENIED' : null,
    policy_decision: index % 13 === 0 ? 'deny' : null,
    ...overrides,
  }
}

const LONG = 520
const events = Array.from({ length: LONG }, (_, i) => makeEvent(i))

/* 1. 首屏截断 */
{
  const view = buildTraceView({
    events,
    types: [],
    query: '',
    onlyIssues: false,
    limit: 60,
    focusedCase: '',
    eventIds: [],
  })
  check('首屏只渲染 60 条', view.rendered.length === 60, `实际 ${view.rendered.length}`)
  check('无筛选时 visible 等于全部', view.visible.length === LONG)
  check('无筛选时 filtered 为 false', view.filtered === false)
}

/* 2. 聚焦事件在第 400 条，必须扩展渲染范围 */
{
  const target = events[400]
  const view = buildTraceView({
    events,
    types: [],
    query: '',
    onlyIssues: false,
    limit: 60,
    focusedCase: target.case_id,
    eventIds: [target.id],
  })
  check('聚焦下标正确', view.focusIndex === 400, `实际 ${view.focusIndex}`)
  check('渲染范围覆盖聚焦事件', view.rendered.length >= 401, `实际 ${view.rendered.length}`)
  check('聚焦事件确实在渲染结果里', view.rendered.some((e) => e.id === target.id))
}

/* 3. 筛选后仍保留聚焦事件 */
{
  const toolEvents = events.filter((e) => e.type === 'tool')
  const target = toolEvents[toolEvents.length - 1]
  const view = buildTraceView({
    events,
    types: ['tool'],
    query: '',
    onlyIssues: false,
    limit: 5,
    focusedCase: target.case_id,
    eventIds: [target.id],
  })
  check('类型筛选只保留 tool', view.visible.every((e) => e.type === 'tool'))
  check('筛选后渲染覆盖聚焦事件', view.rendered.some((e) => e.id === target.id))
  check('筛选标记正确', view.filtered === true)
}

/* 4. 聚焦事件被关键词筛掉时，不伪造渲染 */
{
  const target = events[10]
  const view = buildTraceView({
    events,
    types: [],
    query: 'protected_write',
    onlyIssues: false,
    limit: 60,
    focusedCase: target.case_id,
    eventIds: [target.id],
  })
  const stillVisible = view.visible.some((e) => e.id === target.id)
  check(
    '被筛掉的聚焦事件不会凭空渲染',
    stillVisible ? view.rendered.some((e) => e.id === target.id) : view.focusIndex === -1,
  )
}

/* 5. 仅看异常 */
{
  const view = buildTraceView({
    events,
    types: [],
    query: '',
    onlyIssues: true,
    limit: 60,
    focusedCase: '',
    eventIds: [],
  })
  check('仅看异常时每条都满足 isIssue', view.visible.every(isIssue))
  check('仅看异常会真正缩小集合', view.visible.length > 0 && view.visible.length < LONG)
}

/* 6. 关键词只命中可观察字段 */
{
  check('命中工具名', matchesQuery(events[0], 'protected_write') === (events[0].tool === 'protected_write'))
  check('空关键词恒为真', matchesQuery(events[3], '') === true)
  check('不命中不存在的词', matchesQuery(events[5], 'zzz-not-exist') === false)
}

/* 7. 计数与事件总数一致 */
{
  const view = buildTraceView({
    events,
    types: [],
    query: '',
    onlyIssues: false,
    limit: 60,
    focusedCase: '',
    eventIds: [],
  })
  const sum = [...view.counts.values()].reduce((a, b) => a + b, 0)
  check('类型计数之和等于事件总数', sum === LONG, `实际 ${sum}`)
}

if (failures.length > 0) {
  console.error('轨迹视图校验未通过：')
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}

console.log(
  `轨迹视图校验通过：${LONG} 条事件 / 首屏截断、深链聚焦、筛选组合、异常筛选、计数一致性共 7 组断言`,
)
