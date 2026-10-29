/**
 * 跨平台测试启动器
 * ---------------------------------------------------------------
 * 原先只有 PowerShell 脚本（scripts/test-*.ps1），在 macOS / Linux 或受限执行策略下
 * 无法直接复现。这里用 Node 设置环境变量再拉起 Playwright，Windows / macOS / Linux 一致。
 *
 *   node scripts/run-tests.mjs smoke
 *   node scripts/run-tests.mjs api
 *   node scripts/run-tests.mjs screenshots
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const playwrightCli = require.resolve('@playwright/test/cli')

const PRESETS = {
  // 完整 Mock 门禁：路由、主流程、页面细节、视觉系统、本轮新增项、响应式
  smoke: {
    env: { VITE_USE_MOCK: 'true', PLAYWRIGHT_PORT: '5180', PLAYWRIGHT_ISOLATED: '1' },
    specs: [
      'e2e/smoke.spec.ts',
      'e2e/flows.spec.ts',
      'e2e/pages.spec.ts',
      'e2e/visual-system.spec.ts',
      'e2e/c-completion.spec.ts',
      'e2e/responsive.spec.ts',
    ],
  },
  // 真实 API 契约：需要本地 FastAPI（playwright.config 会在 API 模式下自动拉起）
  api: {
    env: { VITE_USE_MOCK: 'false', PLAYWRIGHT_PORT: '5182', PLAYWRIGHT_ISOLATED: '1' },
    specs: ['e2e/api.spec.ts'],
  },
  // 重新生成演示截图
  screenshots: {
    env: { VITE_USE_MOCK: 'true', PLAYWRIGHT_PORT: '5181', PLAYWRIGHT_ISOLATED: '1' },
    specs: ['e2e/screenshots.spec.ts'],
  },
}

const presetName = process.argv[2] ?? 'smoke'
const preset = PRESETS[presetName]

if (!preset) {
  console.error(`未知的测试预设：${presetName}（可选：${Object.keys(PRESETS).join(' / ')}）`)
  process.exit(1)
}

// 可选：指定 Playwright 配置（例如浏览器二进制受限时改用 playwright.local.config.ts）
const configArgs = process.env.PLAYWRIGHT_CONFIG ? ['-c', process.env.PLAYWRIGHT_CONFIG] : []
const child = spawn(process.execPath, [playwrightCli, 'test', ...configArgs, ...preset.specs], {
  stdio: 'inherit',
  env: { ...process.env, ...preset.env },
})

child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (error) => {
  console.error('启动 Playwright 失败：', error.message)
  process.exit(1)
})
