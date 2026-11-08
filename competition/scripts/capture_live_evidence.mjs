import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const base = (process.env.AGENTGUARD_FRONTEND_URL || 'https://agent-guard-kohl.vercel.app').replace(/\/$/, '');
const outDir = path.join(repo, 'competition/04_运行证据/页面截图');
fs.mkdirSync(outDir, { recursive: true });
const playwrightPath = pathToFileURL(path.join(repo, 'frontend-apple/node_modules/playwright/index.mjs')).href;
const { chromium } = await import(playwrightPath);

const routes = [
  ['/overview', '生产环境总览.png'],
  ['/agents', '生产环境智能体.png'],
  ['/test-suites', '生产环境测试集.png'],
  ['/runs', '生产环境运行记录.png'],
  ['/findings', '生产环境缺陷证据.png'],
  ['/reports', '生产环境报告.png'],
  ['/settings', '生产环境设置.png'],
];
const checks = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  for (const [route, screenshot] of routes) {
    const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('正在获取最新记录'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => !document.body.innerText.includes('正在获取最新记录'), null, { timeout: 60000, polling: 500 }).catch(() => {});
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(outDir, screenshot), fullPage: false });
    checks.push({ route, status: response?.status() ?? null, body_chars: body.length, title: await page.title(), screenshot });
  }
  fs.writeFileSync(path.join(repo, 'competition/04_运行证据/live_frontend_verification.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    base_url: base,
    checks,
    console_errors: consoleErrors,
    status: checks.every(item => item.status === 200 && item.body_chars > 50) && consoleErrors.length === 0 ? 'PASS' : 'FAIL',
  }, null, 2), 'utf8');
  console.log(JSON.stringify({ checks, console_errors: consoleErrors }, null, 2));
} finally {
  await browser.close();
}