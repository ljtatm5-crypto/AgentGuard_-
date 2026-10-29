/**
 * 生成报告样例 PDF
 * ---------------------------------------------------------------
 * 直接调用与页面「导出 PDF」相同的 buildReportHtml()，再用 Chromium 的
 * 排版引擎打印为 PDF。作用是给评审留一份可直接打开的成品，
 * 同时证明该函数产出的 HTML 在 A4 下不会出现中文断字或表格溢出。
 *
 *   npx vite-node scripts/render-report-sample.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { buildReportHtml } from '../src/utils/pdf'
import { metrics } from '../src/mock/fixtures/metrics'
import { runs } from '../src/mock/fixtures/runs'
import { findings } from '../src/mock/fixtures/findings'
import { traceEvents } from '../src/mock/fixtures/trace'
import { cases } from '../src/mock/fixtures/suites'
import type { JudgeResult } from '../src/types/api'

const OUT_DIR = 'docs/samples'
mkdirSync(OUT_DIR, { recursive: true })

/** 从 Mock 轨迹里推导出每个用例的判定结果，保持与页面一致的证据引用 */
function mockResults(runId: string): JudgeResult[] {
  return cases.map((testCase) => {
    const events = traceEvents.filter((event) => event.case_id === testCase.id)
    const hasDenyOrError = events.some((event) => event.error || event.policy_decision === 'deny')
    const needsReview = testCase.risk_tag === 'memory_poisoning'
    return {
      run_id: runId,
      case_id: testCase.id,
      status: needsReview ? 'needs_review' : hasDenyOrError ? 'failed' : 'passed',
      judge_source: needsReview ? 'human' : 'rule',
      reason: needsReview ? '规则判定为 review，置信度不足，转人工复核' : '依据固定规则匹配 forbidden 列表',
      confidence: needsReview ? 0.55 : 1,
      evidence: { run_id: runId, case_id: testCase.id, event_ids: events.map((event) => event.id) },
      reviewed_by: needsReview ? '队员A（人工复核）' : null,
      reviewed_at: needsReview ? '2026-10-20T03:00:00Z' : null,
    }
  })
}

const html = buildReportHtml({
  metrics,
  runs,
  details: runs.map((run) => ({ run, results: mockResults(run.id) })),
  findings,
  unavailableRunIds: [],
  isMock: true,
  generatedAt: new Date('2026-10-26T12:00:00Z'),
})

writeFileSync(`${OUT_DIR}/报告样例.html`, html, 'utf8')

const browser = await chromium.launch(
  // 允许在浏览器二进制不可用时复用本机 Chromium 内核（如 Microsoft Edge）。
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: `${OUT_DIR}/AgentGuard_测试报告样例.pdf`,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
})
await page.screenshot({ path: `${OUT_DIR}/报告样例-首页.png`, fullPage: false })
await browser.close()

console.log('已生成：')
console.log(' -', `${OUT_DIR}/AgentGuard_测试报告样例.pdf`)
console.log(' -', `${OUT_DIR}/报告样例-首页.png`)
console.log(' -', `${OUT_DIR}/报告样例.html`)
