import { expect, test } from '@playwright/test'

test('真实 API 模式沿用 /api/v2 并正确展示收紧后的工具权限', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', '仅在真实 API 门禁中运行')

  await page.goto('/agents')
  await expect(page.getByTestId('agent-card').first()).toBeVisible()
  await expect(page.getByText('未配置')).toHaveCount(0)
  await expect(page.getByTestId('authorized-scope').first()).toContainText('禁止外部站点目标')

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v2/agents/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '权限收紧验证',
        endpoint: 'local://campus-assistant',
        version: 'v2.0',
        permissions: { campus_search: 'deny' },
      }),
    })
    return { status: response.status, body: await response.json() }
  })

  expect(result.status).toBe(200)
  expect(result.body.permissions.campus_search).toBe('deny')
})
