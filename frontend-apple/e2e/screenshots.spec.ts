import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/**
 * 生成演示截图（队员 C 演示材料用）
 * 输出到 docs/screenshots/，命名与页面标题保持一致。
 */

const SHOTS = [
  { path: '/overview', name: '01-总览', full: true },
  { path: '/agents', name: '02-Agent资产', full: true },
  { path: '/test-suites', name: '03-测试集', full: true },
  { path: '/runs', name: '04-执行任务', full: true },
  { path: '/findings', name: '05-攻击链与缺陷', full: true },
  { path: '/reports', name: '06-报告与回归', full: true },
  { path: '/settings', name: '07-设置', full: true },
]

test('生成演示截图', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '仅 chromium 项目生成截图')
  mkdirSync('docs/screenshots', { recursive: true })

  for (const s of SHOTS) {
    await page.goto(s.path)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `docs/screenshots/${s.name}.png`, fullPage: s.full })
  }

  // 测试集页展开用例列表
  await page.goto('/test-suites')
  await page.getByRole('button', { name: '查看用例' }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/screenshots/03b-测试集-用例详情.png', fullPage: true })

  await page.getByRole('button', { name: '收起用例详情' }).click()
  await page.getByTestId('generate-suite-btn').click()
  await page.locator('.generator-ai-toggle input').check()
  await page.getByTestId('generate-suite-submit').click()
  await page.getByTestId('generation-result').waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/screenshots/03c-测试工作室-AI候选.png', fullPage: true })

  // 执行任务页展开轨迹
  await page.goto('/runs')
  await page.getByRole('button', { name: '详情与轨迹' }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/screenshots/04b-执行任务-轨迹.png', fullPage: true })

  // 攻击链展开
  await page.goto('/findings')
  await page.getByRole('button', { name: '攻击链' }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/screenshots/05b-攻击链节点.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/overview')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'docs/screenshots/08-移动端-总览.png', fullPage: true })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/agents')
  await page.getByTestId('connect-agent-btn').click()
  await page.getByTestId('connect-agent-name').fill('工单处理智能体')
  await page.getByTestId('connect-agent-type').selectOption('workflow')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/screenshots/09-接入智能体.png', fullPage: true })
})
