import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  CheckCircle,
  CloudSlash,
  Key,
  ShieldCheck,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import { api, USE_MOCK, getControlKey, setControlKey } from '@/api/client'
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
    title: '报告内容',
    detail: '报告保留测试结论、用例判定、证据和修复建议。',
    status: '证据完整',
    icon: CheckCircle,
  },
  {
    title: '数据使用',
    detail: '测试数据仅用于本次安全评估和报告生成。',
    status: '受控使用',
    icon: ShieldCheck,
  },
]

export default function SettingsPage() {
  const reduce = useReducedMotion()
  const capabilities = useAsync(() => api.getCapabilities(), [])
  const caps = capabilities.state.phase === 'ready' ? capabilities.state.data : null
  const preferences = basePreferences
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
        <p className="page-desc">管理测试偏好、访问权限与报告选项。</p>
      </header>

      <MotionSurface className="settings-status">
        <div className="settings-status-copy">
          <h2>智能体安全测试工作区</h2>
          <p>统一管理测试任务、风险结论与报告证据。</p>
        </div>
        <div className="settings-facts">
          <span><small>测试状态</small><strong>{caps?.anonymous_writes ? '公开演示（受控）' : '操作员模式'}</strong></span>
          <span><small>证据留存</small><strong>自动保存</strong></span>
          <span><small>测试范围</small><strong>授权环境</strong></span>
        </div>
      </MotionSurface>

      {!USE_MOCK && caps?.writes_require_auth && (
        <section className="panel write-access-panel" data-testid="write-access-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">受控操作</span>
              <h2>访问令牌</h2>
            </div>
            <span className="setting-status">{keySaved ? '当前会话已授权' : '只读优先'}</span>
          </div>
          <p className="write-access-copy">输入操作员提供的访问令牌后，可执行测试并查看完整证据。</p>
          <div className="write-access-form">
            <label htmlFor="control-key">访问令牌</label>
            <div className="write-access-input">
              <Key size={18} weight="duotone" />
              <input
                id="control-key"
                type="password"
                autoComplete="off"
                value={controlKey}
                onChange={(event) => { setControlKeyValue(event.target.value); setKeySaved(false) }}
                placeholder="输入访问令牌"
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
            <span><strong>外部网站访问已关闭</strong></span>
          </div>
        </aside>
      </div>

    </div>
  )
}
