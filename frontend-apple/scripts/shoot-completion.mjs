import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * 生成 C 本轮完善项的界面截图（404 / 轨迹筛选 / PDF 导出区）。
 *   node scripts/shoot-completion.mjs
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
// 单独放到日期目录，避免覆盖仓库里既有的 01~09 截图
const OUT = 'docs/screenshots-2026-10-26'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function shot(path, name, prepare) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  if (prepare) await prepare()
  await page.waitForTimeout(700)
  // 截图前移除焦点，避免 Skip Link 等仅聚焦可见的元素进入画面
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(120)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('shot', name)
}

await shot('/this-route-does-not-exist', '10-404页面')

await shot('/runs/run-001', '11-轨迹筛选-默认', async () => {
  await page.getByTestId('trace-controls').waitFor()
})

await shot('/runs/run-001', '12-轨迹筛选-仅看异常', async () => {
  await page.getByTestId('trace-only-issues').check()
  await page.waitForTimeout(400)
})

await shot('/runs/run-001', '13-轨迹搜索', async () => {
  await page.getByTestId('trace-search').fill('policy')
  await page.waitForTimeout(400)
})

await shot('/reports', '14-报告导出-PDF入口', async () => {
  await page.getByTestId('export-pdf-btn').waitFor()
})

await browser.close()
