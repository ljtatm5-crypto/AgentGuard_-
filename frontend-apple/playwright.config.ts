import { defineConfig, devices } from '@playwright/test'

const apiMode = process.env.VITE_USE_MOCK === 'false'
const python = process.platform === 'win32' ? '.\\.venv\\Scripts\\python.exe' : 'python'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: apiMode
    ? [
        {
          command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
          cwd: '../backend',
          url: 'http://127.0.0.1:8000/healthz',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'npm run dev',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ]
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
