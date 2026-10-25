import { expect, test } from '@playwright/test'

const previewBase = process.env.PAGES_PREVIEW_URL?.replace(/\/$/, '')

test('GitHub Pages 子路径、深层路由与 Mock API 可用', async ({ page }) => {
  test.skip(!previewBase, '仅在 GitHub Pages 预览检查中运行')
  const apiPaths: string[] = []
  const runtimeErrors: string[] = []
  const failedResources: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('requestfailed', (request) => {
    runtimeErrors.push(`${request.url()} ${request.failure()?.errorText ?? ''}`.trim())
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && response.request().resourceType() !== 'document') {
      failedResources.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.includes('/api/v2/')) apiPaths.push(path)
  })

  await page.goto(`${previewBase}/overview`, { waitUntil: 'networkidle' })
  await expect(page.locator('h1'), runtimeErrors.join('\n')).toHaveText('总览')
  await expect(page.getByTestId('runs-table')).toBeVisible()

  await page.goto(`${previewBase}/agents`, { waitUntil: 'networkidle' })
  await expect(page.locator('h1')).toHaveText('Agent 资产')
  await expect(page.getByTestId('agent-card').first()).toBeVisible()

  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration?.active?.scriptURL ?? registration?.installing?.scriptURL ?? null
  })

  expect(runtimeErrors).toEqual([])
  expect(failedResources).toEqual([])
  expect(new Set(apiPaths).size).toBeGreaterThan(0)
  expect(apiPaths.every((path) => path.startsWith('/AgentGuard_-/api/v2/'))).toBeTruthy()
  expect(worker).toContain('/AgentGuard_-/mockServiceWorker.js')
})
