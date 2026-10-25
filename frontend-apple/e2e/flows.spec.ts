import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download } from '@playwright/test'

test('测试集可展开与收起用例', async ({ page }) => {
  await page.goto('/test-suites')
  await page.getByRole('button', { name: '查看用例' }).first().click()
  await expect(page.getByTestId('case-list')).toBeVisible()
  await expect(page.getByTestId('case-list').locator('.case-item').first()).toContainText('判定方式')
  await page.getByRole('button', { name: '收起用例详情' }).click()
  await expect(page.getByTestId('case-list')).toHaveCount(0)
})

test('先校验选择，再创建任务并展开详情', async ({ page }) => {
  await page.goto('/runs')
  await expect(page.getByTestId('launch-btn')).toBeEnabled()
  await page.getByTestId('launch-btn').click()
  await expect(page.getByTestId('launch-error')).toContainText('请先选择')
  const rowCount = await page.getByTestId('runs-table').locator('tbody tr').count()
  await page.getByTestId('select-agent').selectOption({ index: 1 })
  await page.getByTestId('select-suite').selectOption({ index: 1 })
  await page.getByTestId('launch-btn').click()
  await expect(page).toHaveURL(/\/runs\/run-.+/)
  await expect(page.getByTestId('runs-table').locator('tbody tr')).toHaveCount(rowCount + 1)
  await expect(page.locator('#run-details')).toBeVisible()
  await expect(page.getByTestId('launch-error')).toHaveCount(0)
})

test('攻击链证据跳转、事件高亮与刷新后定位均可用', async ({ page }) => {
  await page.goto('/findings')
  await page.getByRole('button', { name: '攻击链', exact: true }).first().click()
  const link = page.getByTestId('evidence-link').first()
  await expect(link).toBeVisible()
  const href = await link.getAttribute('href')
  const target = new URL(href!, 'http://127.0.0.1:5173')
  const caseId = target.searchParams.get('case')!
  const eventId = target.searchParams.get('events')!.split(',')[0]
  await link.click()
  await expect(page).toHaveURL(/\/runs\?run=.+&case=.+&events=.+/)
  await expect(page.getByTestId('evidence-focus-banner')).toContainText(caseId)
  await expect(page.locator('.trace-focused').first()).toBeVisible()
  await expect(page.locator('.trace-focused').first()).toHaveAttribute('data-event-id', eventId)
  await expect(page.locator('.trace-case-focused')).toContainText(caseId)
  await page.reload()
  await expect(page.locator('.trace-focused').first()).toBeVisible()
  await page.getByRole('button', { name: '清除定位' }).click()
  await expect(page.getByTestId('evidence-focus-banner')).toHaveCount(0)
  await expect(page.locator('.trace-focused')).toHaveCount(0)
})

test('报告导出实际 Markdown 与 CSV 文件并保留 Mock 标识', async ({ page }) => {
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await page.goto('/reports')
  await page.getByTestId('export-btn').click()
  await expect(page.getByTestId('export-status')).toContainText('已生成 Markdown 与 CSV')
  await expect.poll(() => downloads.length).toBe(2)
  const markdown = downloads.find((download) => download.suggestedFilename().endsWith('.md'))!
  const csv = downloads.find((download) => download.suggestedFilename().endsWith('.csv'))!
  const markdownText = await readFile((await markdown.path())!, 'utf8')
  const csvText = await readFile((await csv.path())!, 'utf8')
  expect(markdown.suggestedFilename()).toContain('Mock_')
  expect(markdownText).toContain('Mock 示例数据')
  expect(markdownText).toContain('不作为实测结果')
  expect(markdownText).toContain('规则判定')
  expect(markdownText).toContain('用例判定与人工复核')
  expect(csvText.startsWith('\uFEFF')).toBeTruthy()
  expect(csvText).toContain('运行汇总')
  expect(csvText).toContain('用例明细')
  expect(csvText).toContain('Mock 示例数据')
  await expect(page.getByTestId('export-markdown-btn')).toBeVisible()
  await expect(page.getByTestId('export-csv-btn')).toBeVisible()
})

test('窄屏任务表格在容器内滚动，页面不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/runs')
  await expect(page.getByTestId('runs-table')).toBeVisible()
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }))
  expect(widths.page).toBeLessThanOrEqual(widths.viewport + 2)
  await expect(page.getByTestId('runs-table').locator('..')).toHaveClass(/table-scroll/)
})

test('客户可以从 Agent 资产页接入并测试其他智能体', async ({ page }) => {
  await page.goto('/agents')
  await page.getByTestId('connect-agent-btn').click()
  await page.getByTestId('connect-agent-name').fill('财务知识问答智能体')
  await page.getByTestId('connect-agent-type').selectOption('rag')
  await page.getByTestId('connect-agent-submit').click()
  await expect(page.getByTestId('connect-agent-success')).toContainText('财务知识问答智能体')
  await expect(page.getByRole('heading', { name: '财务知识问答智能体' })).toBeVisible()
  const card = page.getByTestId('agent-card').filter({ hasText: '财务知识问答智能体' })
  await expect(card).toContainText('知识库 RAG')
  await expect(card).toContainText('本地安全沙盒')
  await page.getByTestId('nav-执行任务').click()
  await expect(page.getByTestId('select-agent')).toContainText('财务知识问答智能体')
})

test('可以从测试集页面生成并打开新测试集', async ({ page }) => {
  await page.goto('/test-suites')
  await page.getByTestId('generate-suite-btn').click()
  await page.getByTestId('generate-suite-type').selectOption('injection')
  await page.getByTestId('generate-suite-submit').click()
  await expect(page.getByTestId('generation-result')).toContainText('固定规则模板')
  await expect(page.getByTestId('generation-result')).toContainText('已保存')
  await expect(page.getByTestId('suites-table')).toContainText('injection · 固定规则模板')
  await expect(page.getByTestId('case-list')).toBeVisible()
})

test('Mock 模式不会伪装成真实 AI 生成', async ({ page }) => {
  await page.goto('/test-suites')
  await page.getByTestId('generate-suite-btn').click()
  await page.locator('.generator-ai-toggle input').check()
  await page.getByTestId('generate-suite-submit').click()
  await expect(page.getByTestId('generate-suite-error')).toContainText('不会伪装成真实大模型生成')
})
