import { expect, test } from '@playwright/test'

/**
 * P0 冒烟：巡检全部产品路由可访问且关键内容渲染。
 * 这是 dev 与 main 的合并门禁之一。
 */

const ROUTES = [
  { path: '/overview', marker: '[data-testid="runs-table"]', name: '总览' },
  { path: '/agents', marker: '[data-testid="agent-card"]', name: 'Agent 资产' },
  { path: '/test-suites', marker: '[data-testid="suites-table"]', name: '测试集' },
  { path: '/runs', marker: '[data-testid="runs-table"]', name: '执行任务' },
  { path: '/runs/run-001', marker: '[data-testid="results-table"]', name: '运行详情' },
  { path: '/findings', marker: '[data-testid="findings-table"]', name: '攻击链与缺陷' },
  { path: '/reports', marker: '[data-testid="compare-table"]', name: '报告与回归' },
  { path: '/settings', marker: '[data-testid="settings-constraints"]', name: '设置' },
]

const NAV_ROUTES = ROUTES.filter((route) => route.name !== '运行详情')

for (const r of ROUTES) {
  test(`路由 ${r.path} 可访问且渲染关键内容`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto(r.path)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator(r.marker)).toBeVisible()

    // 四态不得停留在 loading
    await expect(page.locator('[data-testid="state-loading"]')).toHaveCount(0)
    // 不得停留在错误态
    await expect(page.locator('[data-testid="state-error"]')).toHaveCount(0)
    expect(errors, `页面存在运行时错误：${errors.join('; ')}`).toHaveLength(0)
  })
}

test('侧边导航可切换到全部页面', async ({ page }) => {
  await page.goto('/overview')
  for (const r of NAV_ROUTES.slice(1)) {
    await page.locator(`[data-testid="nav-${r.name}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${r.path}$`))
  }
})

test('授权范围明确标注禁止外部站点目标', async ({ page }) => {
  await page.goto('/agents')
  const scope = page.locator('[data-testid="authorized-scope"]')
  await expect(scope).toContainText('禁止外部站点目标')
})

test('攻击链节点可定位到证据', async ({ page }) => {
  await page.goto('/findings')
  await page.getByRole('button', { name: '攻击链' }).first().click()
  const chain = page.locator('[data-testid="chain-panel"]')
  await expect(chain).toBeVisible()
  await expect(page.locator('[data-testid="evidence-link"]').first()).toContainText('run-')
})

test('Mock 与真实 API 共用 /api/v2 契约', async ({ page }) => {
  const apiPaths = new Set<string>()
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/')) apiPaths.add(path)
  })

  await page.goto('/overview')
  await expect(page.getByTestId('runs-table')).toBeVisible()

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v2/test-suites/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'agt-campus-001', test_type: 'injection' }),
    })
    return { status: response.status, body: await response.json() }
  })

  expect(result.status).toBe(200)
  expect(result.body.review_required).toBe(false)
  expect(result.body.generation_source).toBe('reviewed_rule_templates')
  expect(result.body.llm_used).toBe(false)
  expect(result.body.cases).toHaveLength(2)
  expect([...apiPaths].every((path) => path.startsWith('/api/v2/'))).toBeTruthy()
})

test('Mock 网关拒绝外部站点目标', async ({ page }) => {
  await page.goto('/agents')
  await expect(page.getByTestId('agent-card')).toBeVisible()
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v2/agents/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '外部站点', endpoint: 'https://example.com' }),
    })
    return { status: response.status, body: await response.json() }
  })
  expect(result.status).toBe(403)
  expect(result.body.error_code).toBe('scope_public_target_denied')
})

test('移动端七项导航保持单行且页面不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/overview')
  await expect(page.getByTestId('nav-设置')).toBeVisible()
  const layout = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('nav .nav-item')]
    return {
      rows: new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }
  })
  expect(layout.rows).toBe(1)
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 2)
})
