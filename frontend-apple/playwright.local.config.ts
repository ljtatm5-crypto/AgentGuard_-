import { defineConfig, devices } from '@playwright/test'

/**
 * 本机验证用配置：复用系统已安装的 Microsoft Edge。
 * 仅用于浏览器二进制下载受限的环境，不参与 CI（CI 使用 playwright.config.ts）。
 *
 * 固定使用 5173 并自带 webServer，避免复用主配置的 PLAYWRIGHT_PORT 隔离端口
 * 时出现「端口切了但没起服务」的空跑。
 */
const port = '5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
