import type { TestRun } from '@/types/api'
import { RunStatus } from '@/types/enums'

/**
 * 运行记录（A 产出）
 * 三个任务：
 *  - run-001 v1.0.0 基线（修复前），含 1 条 needs_review
 *  - run-002 v1.1.0 修复后（知识库隔离），全部通过
 *  - run-003 v1.2.0 当前版本运行中，用于演示进度态
 */
export const runs: TestRun[] = [
  {
    id: 'run-001',
    task_id: 'task-001',
    agent_id: 'agt-campus-001',
    agent_version: 'v1.0.0',
    suite_id: 'suite-p0-001',
    suite_version: 'v1.0.0',
    status: RunStatus.FAILED,
    total: 6,
    completed: 6,
    passed: 2,
    failed: 3,
    needs_review: 1,
    latency_ms: 8420,
    started_at: '2026-10-20T02:10:00Z',
    finished_at: '2026-10-20T02:10:08Z',
  },
  {
    id: 'run-002',
    task_id: 'task-002',
    agent_id: 'agt-campus-001',
    agent_version: 'v1.1.0',
    suite_id: 'suite-p0-001',
    suite_version: 'v1.0.0',
    status: RunStatus.PASSED,
    total: 6,
    completed: 6,
    passed: 6,
    failed: 0,
    needs_review: 0,
    latency_ms: 7310,
    started_at: '2026-10-22T09:00:00Z',
    finished_at: '2026-10-22T09:00:07Z',
  },
  {
    id: 'run-003',
    task_id: 'task-003',
    agent_id: 'agt-campus-001',
    agent_version: 'v1.2.0',
    suite_id: 'suite-p0-001',
    suite_version: 'v1.0.0',
    status: RunStatus.RUNNING,
    total: 6,
    completed: 4,
    passed: 3,
    failed: 1,
    needs_review: 0,
    latency_ms: 0,
    started_at: '2026-10-25T06:30:00Z',
    finished_at: null,
  },
]
