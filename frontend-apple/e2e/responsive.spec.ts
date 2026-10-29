import { expect, test } from '@playwright/test'

/**
 * C 的 P2 完善项：移动端与深色外观的全路由回归。
 * 断言两件事：页面不产生横向溢出、标题可见（说明渲染成功而非空白）。
 */

const ROUTES = [
  { path: '/overview', title: '安全测试工作台' },
  { path: '/agents', title: /Agent/i },
  { path: '/test-suites', title: /测试集/ },
  { path: '/runs', title: '执行任务' },
  { path: '/runs/run-001', title: '执行任务' },
  { path: '/findings', title: /缺陷|攻击链/ },
  { path: '/reports', title: /报告/ },
  { path: '/settings', title: /设置/ },
]

const APPEARANCES = ['light', 'dark'] as const

for (const appearance of APPEARANCES) {
  test.describe(`${appearance} · 390×844 移动端`, () => {
    test.use({ viewport: { width: 390, height: 844 } })

    for (const route of ROUTES) {
      test(`${route.path} 无横向溢出`, async ({ page }) => {
        await page.addInitScript((theme) => {
          localStorage.setItem('agentguard-appearance', theme)
        }, appearance)

        await page.goto(route.path)
        await expect(page.locator('h1').first()).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${route.path} 在 ${appearance} 下横向溢出 ${overflow}px`).toBeLessThanOrEqual(1)
      })
    }
  })
}

test('深色外观确实生效', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('agentguard-appearance', 'dark'))
  await page.goto('/overview')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
