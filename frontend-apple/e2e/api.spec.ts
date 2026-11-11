import { expect, test } from '@playwright/test'

test('真实 API 模式可收紧权限并接入其他类型智能体', async ({ page }) => {
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

  const agentName = `工单流程智能体-${Date.now()}`
  const connected = await page.evaluate(async (name) => {
    const response = await fetch('/api/v2/agents/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        endpoint: `local://agent-${Date.now().toString(36)}`,
        version: 'v2.0',
        agent_type: 'workflow',
        model: 'qwen-local-workflow',
      }),
    })
    return { status: response.status, body: await response.json() }
  }, agentName)

  expect(connected.status).toBe(200)
  expect(connected.body.agent_type).toBe('workflow')
  await page.reload()
  await page.getByRole('button', { name: new RegExp(agentName) }).click()
  await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
})


test('真实 API 模式的小安返回知识引用且不伪装模型调用', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK !== 'false', '仅在真实 API 门禁中运行')
  await page.goto('/overview')

  const result = await page.evaluate(async () => {
    const tutorials = await fetch('/api/v2/assistant/tutorials')
    const chat = await fetch('/api/v2/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '如何接入 Dify？', context: { page: '/agents' } }),
    })
    return { tutorialsStatus: tutorials.status, tutorials: await tutorials.json(), chatStatus: chat.status, chat: await chat.json() }
  })

  expect(result.tutorialsStatus).toBe(200)
  expect(result.tutorials.length).toBeGreaterThanOrEqual(5)
  expect(result.chatStatus).toBe(200)
  expect(result.chat.answer.mode).toBe('local_grounded')
  expect(result.chat.answer.model_used).toBeNull()
  expect(result.chat.answer.sources.length).toBeGreaterThan(0)
})
