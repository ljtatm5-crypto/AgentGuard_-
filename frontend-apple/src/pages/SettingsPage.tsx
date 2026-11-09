import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  CheckCircle,
  CloudSlash,
  Key,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
} from '@phosphor-icons/react'
import { api, API_PREFIX, USE_MOCK, getControlKey, setControlKey } from '@/api/client'
import { MotionSurface } from '@/components/MotionSurface'
import { useAsync } from '@/hooks/useAsync'

const basePreferences = [
  {
    title: '测试判定偏好',
    detail: '先执行可复现的固定规则，再由人工复核规则无法确认的用例。',
    status: '规则优先',
    icon: SlidersHorizontal,
  },
  {
    title: '报告默认口径',
    detail: '导出报告会保留运行编号、执行轨迹、证据来源和数据模式说明。',
    status: '证据完整',
    icon: CheckCircle,
  },
]

export default function SettingsPage() {
  const reduce = useReducedMotion()
  const capabilities = useAsync(() => api.getCapabilities(), [])
  const caps = capabilities.state.phase === 'ready' ? capabilities.state.data : null
  const isProduction = caps?.environment === 'production'
  const modeLabel = USE_MOCK ? 'Mock 演示' : isProduction ? 'Vercel 生产' : '本地运行'
  const connectionLabel = USE_MOCK ? '内置 Mock' : isProduction ? 'Vercel 生产 API' : '本地/开发 API'
  const databaseLabel = caps ? (caps.database === 'postgresql' ? 'PostgreSQL' : 'SQLite') : '读取中'
  const llmLabel = caps ? (caps.llm_enabled ? '已启用' : '未启用') : '读取中'
  const rateLimitLabel = caps ? (caps.rate_limit_scope === 'per_process' ? '单实例限流' : caps.rate_limit_scope) : '读取中'
  const evidenceLabel = USE_MOCK ? '浏览器演示数据' : isProduction ? '远程持久化' : '本地运行记录'
  const preferences = [...basePreferences, {
    title: '测试数据来源',
    detail: USE_MOCK
      ? '当前使用浏览器内置演示数据，不需要连接后端即可完成功能体验。'
      : isProduction
        ? '当前读取 Vercel 生产 API；公开页面展示脱敏摘要，原始轨迹与授权记录需要操作员令牌。'
        : '当前读取本地或开发环境 API，数据来自已保存运行记录。',
    status: USE_MOCK ? '演示数据' : isProduction ? '生产摘要' : '本地运行',
    icon: SquaresFour,
  }]
  const [controlKey, setControlKeyValue] = useState(getControlKey)
  const [keySaved, setKeySaved] = useState(false)

  function saveControlKey() {
    setControlKey(controlKey)
    setKeySaved(true)
  }

  function clearControlKey() {
    setControlKey('')
    setControlKeyValue('')
    setKeySaved(false)
  }

  return (
    <div className="settings-page" data-testid="settings-page">
      <header className="page-head">
        <h1>工作空间设置</h1>
        <p className="page-desc">查看当前数据来源、测试判定偏好与安全访问范围。</p>
      </header>

      <MotionSurface className="settings-status">
        <div className="settings-status-copy">
          <span className={`mode-pill ${USE_MOCK ? 'is-mock' : 'is-live'}`}>
            <span className="dot" />{modeLabel}
          </span>
          <h2>{USE_MOCK ? '智能体测试工作区' : isProduction ? '线上生产工作区' : '本地测试工作区'}</h2>
          <p>{USE_MOCK ? '所有内容来自预置示例，适合产品演示和功能验收。' : isProduction ? '当前连接 Vercel 生产 API 与持久化数据库；公开摘要可匿名查看，私有证据需要操作员令牌。' : '当前连接本地或开发 API，可查看已保存运行记录。'}</p>
        </div>
        <div className="settings-facts">
          <span><small>数据连接</small><strong>{connectionLabel}</strong></span>
          <span><small>数据库</small><strong>{databaseLabel}</strong></span>
          <span><small>真实模型</small><strong>{llmLabel}</strong></span>
          <span><small>限流范围</small><strong>{rateLimitLabel}</strong></span>
          <span><small>接口契约</small><strong>{API_PREFIX}</strong></span>
          <span><small>外部目标</small><strong>不可访问</strong></span>
        </div>
      </MotionSurface>

      {!USE_MOCK && (
        <section className="panel write-access-panel" data-testid="write-access-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">受控操作</span>
              <h2>写操作令牌</h2>
            </div>
            <span className="setting-status">{keySaved ? '当前会话已授权' : '只读优先'}</span>
          </div>
          <p className="write-access-copy">
            公开摘要可以匿名读取；原始轨迹、Agent 回答、授权记录和客户资产详情需要操作员令牌。创建任务、生成用例和修改授权同样需要令牌，令牌只保存在当前浏览器会话中。
          </p>
          <div className="write-access-form">
            <label htmlFor="control-key">操作员令牌</label>
            <div className="write-access-input">
              <Key size={18} weight="duotone" />
              <input
                id="control-key"
                type="password"
                autoComplete="off"
                value={controlKey}
                onChange={(event) => { setControlKeyValue(event.target.value); setKeySaved(false) }}
                placeholder="输入 Vercel 环境变量中的受控令牌"
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={saveControlKey} disabled={!controlKey.trim()}>保存令牌</button>
            <button className="btn" type="button" onClick={clearControlKey}>清除</button>
          </div>
          {keySaved && <p className="write-access-note" role="status">令牌已保存到当前浏览器会话，可用于受控测试。</p>}
        </section>
      )}

      <div className="settings-layout">
        <section className="panel settings-options">
          <div className="panel-head">
            <div>
              <span className="eyebrow">工作空间偏好</span>
              <h2>测试与报告</h2>
            </div>
          </div>
          {preferences.map((item, index) => (
            <motion.article
              className="setting-row"
              key={item.title}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .4, delay: index * .07, ease: [.22, 1, .36, 1] }}
            >
              <span className="setting-row-icon"><item.icon size={21} weight="duotone" /></span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
              <span className="setting-status">{item.status}</span>
            </motion.article>
          ))}
        </section>

        <aside className="panel settings-security">
          <span className="security-icon"><ShieldCheck size={26} weight="duotone" /></span>
          <span className="eyebrow">安全访问范围</span>
          <h2>仅限授权测试环境</h2>
          <p>测试任务只面向平台安全环境或客户明确授权的内部系统，真实外部网站不会进入测试目标。</p>
          <div className="security-status">
            <CloudSlash size={18} weight="duotone" />
            <span><strong>外部网站访问已关闭</strong><small>目标范围在服务端统一校验</small></span>
          </div>
        </aside>
      </div>

      <section className="panel system-info">
        <div>
          <span className="eyebrow">系统信息</span>
          <h2>AgentGuard 智测盾</h2>
        </div>
        <dl>
          <div><dt>产品版本</dt><dd>v0.1.0</dd></div>
          <div><dt>支持类型</dt><dd>多类智能体</dd></div>
          <div><dt>测试范围</dt><dd>多类型智能体</dd></div>
          <div><dt>证据保留</dt><dd>{evidenceLabel}</dd></div>
        </dl>
      </section>
    </div>
  )
}
