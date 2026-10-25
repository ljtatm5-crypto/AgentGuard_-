import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const DESKTOP_ROUTES = [
  '/overview',
  '/agents',
  '/test-suites',
  '/runs',
  '/findings',
  '/reports',
  '/settings',
]

async function openRoute(page: Page, route: string) {
  await page.goto(route)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(650)
}

for (const viewport of [
  { width: 1366, height: 768, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
]) {
  test(`Aurora typography and overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })

    for (const route of DESKTOP_ROUTES) {
      await openRoute(page, route)

      const titleSize = await page.locator('.page-head h1').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
      expect(titleSize, `${route} page title`).toBeGreaterThanOrEqual(32)

      const navSizes = await page.locator('.sidebar .nav-item').evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))
      expect(Math.min(...navSizes), `${route} navigation`).toBeGreaterThanOrEqual(15)

      const buttonSizes = await page.locator('button:visible, .btn:visible').evaluateAll((nodes) => nodes
        .map((node) => parseFloat(getComputedStyle(node).fontSize))
        .filter((size) => Number.isFinite(size)))
      expect(Math.min(...buttonSizes), `${route} button`).toBeGreaterThanOrEqual(15)

      const bodyFont = await page.locator('body').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
      expect(bodyFont, `${route} body`).toBeGreaterThanOrEqual(16)

      const viewportWidth = await page.evaluate(() => window.innerWidth)
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(documentWidth, `${route} horizontal overflow`).toBeLessThanOrEqual(viewportWidth + 2)

      const tinyVisibleText = await page.evaluate(() => {
        const ignored = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH'])
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
        const failures: Array<{ tag: string; className: string; text: string; size: number }> = []
        let current = walker.nextNode()
        while (current) {
          const element = current as HTMLElement
          const directText = Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim() ?? '')
            .join(' ')
            .trim()
          if (directText && !ignored.has(element.tagName) && !element.closest('.sr-only')) {
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            const size = parseFloat(style.fontSize)
            if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && size < 12) {
              failures.push({ tag: element.tagName, className: element.className, text: directText.slice(0, 24), size })
            }
          }
          current = walker.nextNode()
        }
        return failures
      })
      expect(tinyVisibleText, `${route} readable text below 12px`).toEqual([])
    }
  })
}

test('Mobile navigation stays single-line and never covers final content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRoute(page, '/overview')

  const navMetrics = await page.locator('.sidebar').evaluate((nav) => {
    const items = Array.from(nav.querySelectorAll<HTMLElement>('.nav-item'))
    return {
      count: items.length,
      minFont: Math.min(...items.map((item) => parseFloat(getComputedStyle(item).fontSize))),
      topSpread: Math.max(...items.map((item) => item.getBoundingClientRect().top))
        - Math.min(...items.map((item) => item.getBoundingClientRect().top)),
      right: nav.getBoundingClientRect().right,
      bottom: nav.getBoundingClientRect().bottom,
    }
  })

  expect(navMetrics.count).toBe(7)
  expect(navMetrics.minFont).toBeGreaterThanOrEqual(12)
  expect(navMetrics.topSpread).toBeLessThanOrEqual(1)
  expect(navMetrics.right).toBeLessThanOrEqual(390)
  expect(navMetrics.bottom).toBeLessThanOrEqual(844)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(100)
  const clearance = await page.evaluate(() => {
    const footer = document.querySelector('.app-footer')?.getBoundingClientRect()
    const nav = document.querySelector('.sidebar')?.getBoundingClientRect()
    return footer && nav ? nav.top - footer.bottom : -1
  })
  expect(clearance).toBeGreaterThanOrEqual(0)

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth).toBeLessThanOrEqual(392)

  for (const route of DESKTOP_ROUTES) {
    await openRoute(page, route)
    if (route === '/runs') {
      await page.getByRole('button', { name: '详情与轨迹' }).first().click()
    }
    if (route === '/findings') {
      await page.getByRole('button', { name: '攻击链' }).first().click()
    }
    await page.waitForTimeout(300)
    const routeWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(routeWidth, `${route} mobile horizontal overflow`).toBeLessThanOrEqual(392)
    const titleSize = await page.locator('.page-head h1').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
    expect(titleSize, `${route} mobile title`).toBeGreaterThanOrEqual(30)
  }
})

test('Trace nodes and studio controls keep readable runtime sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openRoute(page, '/runs')
  await page.getByRole('button', { name: '详情与轨迹' }).first().click()
  await page.getByTestId('trace-timeline').waitFor()

  const traceSizes = await page.evaluate(() => ({
    cardText: parseFloat(getComputedStyle(document.querySelector('.event-node-card p')!).fontSize),
    nodeTitle: parseFloat(getComputedStyle(document.querySelector('.event-node-card > strong')!).fontSize),
    verdict: parseFloat(getComputedStyle(document.querySelector('.run-verdict-panel > p')!).fontSize),
  }))
  expect(traceSizes.cardText).toBeGreaterThanOrEqual(14)
  expect(traceSizes.nodeTitle).toBeGreaterThanOrEqual(15)
  expect(traceSizes.verdict).toBeGreaterThanOrEqual(14)

  await page.locator('.event-node').first().click()
  await expect(page.locator('.event-node.event-selected')).toHaveCount(1)
  await expect(page.locator('.verdict-event-focus')).toBeVisible()

  await openRoute(page, '/test-suites')
  await page.getByTestId('generate-suite-btn').click()
  await page.locator('.generator-ai-toggle input').check()
  await page.getByTestId('generate-suite-submit').click()
  await page.getByTestId('generation-result').waitFor()

  const editorSizes = await page.evaluate(() => ({
    field: parseFloat(getComputedStyle(document.querySelector('.studio-field-grid input')!).fontSize),
    textarea: parseFloat(getComputedStyle(document.querySelector('.studio-field-grid textarea')!).fontSize),
    candidate: parseFloat(getComputedStyle(document.querySelector('.studio-case-item strong')!).fontSize),
  }))
  expect(editorSizes.field).toBeGreaterThanOrEqual(15)
  expect(editorSizes.textarea).toBeGreaterThanOrEqual(15)
  expect(editorSizes.candidate).toBeGreaterThanOrEqual(14)
})

test('Evidence flow and regression states remain explicit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openRoute(page, '/findings')
  await page.getByRole('button', { name: '攻击链' }).first().click()
  await page.locator('.attack-node').first().waitFor()

  const chainSizes = await page.evaluate(() => ({
    title: parseFloat(getComputedStyle(document.querySelector('.attack-node strong')!).fontSize),
    legend: parseFloat(getComputedStyle(document.querySelector('.attack-legend')!).fontSize),
  }))
  expect(chainSizes.title).toBeGreaterThanOrEqual(15)
  expect(chainSizes.legend).toBeGreaterThanOrEqual(12)
  await page.locator('.attack-node').nth(1).click()
  await expect(page.locator('.attack-node.active')).toHaveCount(1)
  await expect(page.locator('.attack-node-evidence')).toBeVisible()

  await openRoute(page, '/reports')
  const diffLabels = await page.locator('.diff-badge').allTextContents()
  expect(new Set(diffLabels).size).toBeGreaterThan(0)
  const diffClasses = await page.locator('.diff-badge').evaluateAll((nodes) => nodes.map((node) => node.className))
  expect(diffClasses.every((className) => /diff-(fixed|regression|existing|not-comparable|unchanged)/.test(className))).toBe(true)
})
