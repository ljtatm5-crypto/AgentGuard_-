import { expect, test } from '@playwright/test'

/**
 * C 的 P2 完善项回归：
 *  - 非法路由进入 404，而不是被静默重定向
 *  - 轨迹可按类型 / 关键词 / 异常筛选，并支持分批渲染
 *  - 报告支持 PDF 打印视图入口
 */

test.describe('404 与路由兜底', () => {
  test('未知路径展示 404 并可直接返回工作台', async ({ page }) => {
    const resp = await page.goto('/this-route-does-not-exist')
    expect(resp?.status()).toBeLessThan(400)

    const panel = page.getByTestId('notfound-page')
    await expect(panel).toBeVisible()
    await expect(page.locator('h1')).toContainText('没有找到这个页面')
    await expect(panel).toContainText('/this-route-does-not-exist')

    await page.getByTestId('notfound-home').click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(page.locator('h1')).toBeVisible()
  })

  test('合法深层链接没有被 404 劫持', async ({ page }) => {
    await page.goto('/runs/run-001')
    await expect(page.getByTestId('notfound-page')).toHaveCount(0)
    await expect(page.locator('h1')).toContainText('执行任务')
  })

  test('旧路径 /suites 仍重定向到 /test-suites', async ({ page }) => {
    await page.goto('/suites')
    await expect(page).toHaveURL(/\/test-suites$/)
  })
})

test.describe('轨迹筛选', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/runs/run-001')
    await expect(page.getByTestId('trace-controls')).toBeVisible()
  })

  test('按事件类型筛选并显示计数', async ({ page }) => {
    const count = page.getByTestId('trace-count')
    await expect(count).toContainText('本用例共')

    // 类型按钮只为当前用例实际出现的事件类型渲染，因此取第一个可用项。
    const chips = page.locator('[data-testid^="trace-type-"]')
    await expect(chips.first()).toBeVisible()
    const chipLabel = (await chips.first().innerText()).split(' ')[0]
    await chips.first().click()

    await expect(count).toContainText('筛选后')
    await expect(page.getByTestId('trace-timeline')).toBeVisible()

    const reported = Number((await count.innerText()).match(/筛选后 (\d+) 条/)?.[1] ?? -1)
    expect(reported).toBeGreaterThan(0)
    const rendered = await page.getByTestId('trace-timeline').locator('li').count()
    expect(rendered).toBe(Math.min(reported, 60))

    // 筛选后只应保留该类型的事件
    const firstTag = await page.getByTestId('trace-timeline').locator('li').first().locator('.tag').first().innerText()
    expect(firstTag).toContain(chipLabel)
  })

  test('关键词搜索命中工具输出', async ({ page }) => {
    await page.getByTestId('trace-search').fill('protected_write')
    const nodes = page.getByTestId('trace-timeline').locator('li')
    await expect(nodes.first()).toBeVisible()
    const text = await page.getByTestId('trace-timeline').innerText()
    expect(text.toLowerCase()).toContain('protected_write')
  })

  test('无匹配时给出清除筛选的出口', async ({ page }) => {
    await page.getByTestId('trace-search').fill('这个关键词一定不存在zzz')
    await expect(page.getByTestId('trace-empty')).toBeVisible()
    await page.getByRole('button', { name: '清除筛选条件' }).click()
    await expect(page.getByTestId('trace-timeline')).toBeVisible()
  })

  test('仅看异常与拒绝可缩小结果集', async ({ page }) => {
    const all = page.getByTestId('trace-timeline').locator('li')
    const before = await all.count()
    await page.getByTestId('trace-only-issues').check()
    const after = await all.count()
    expect(after).toBeLessThanOrEqual(before)
  })
})

test.describe('报告导出', () => {
  test('PDF 导出入口存在且可点击', async ({ page }) => {
    await page.goto('/reports')
    const pdfButton = page.getByTestId('export-pdf-btn')
    await expect(pdfButton).toBeVisible()
    await expect(pdfButton).toBeEnabled()
    await expect(pdfButton).toContainText('PDF')
  })

  test('点击 PDF 会生成可打印的 A4 文档', async ({ page }) => {
    // 记录创建的 iframe，即使打印后已从 DOM 移除也能读到其文档内容
    await page.addInitScript(() => {
      const w = window as unknown as { __pdfFrames: HTMLIFrameElement[] }
      w.__pdfFrames = []
      const original = document.createElement.bind(document)
      document.createElement = function (name: string, options?: ElementCreationOptions) {
        const el = original(name, options)
        if (String(name).toLowerCase() === 'iframe') w.__pdfFrames.push(el as HTMLIFrameElement)
        return el
      } as typeof document.createElement
    })

    await page.goto('/reports')
    await page.getByTestId('export-pdf-btn').click()

    await expect(page.getByTestId('export-status')).toContainText('打印视图', { timeout: 15_000 })

    const doc = await page.evaluate(() => {
      const frames = (window as unknown as { __pdfFrames: HTMLIFrameElement[] }).__pdfFrames
      return frames.length > 0 ? frames[0].contentDocument?.documentElement.innerHTML ?? '' : ''
    })

    expect(doc.length).toBeGreaterThan(1000)
    expect(doc).toContain('智能体测试报告')
    expect(doc).toContain('A4')            // @page 尺寸声明
    expect(doc).toContain('风险召回率')     // 指标章节
    expect(doc).toContain('指标口径与已知限制')
    expect(doc).toContain('Mock 示例数据')
  })
})
