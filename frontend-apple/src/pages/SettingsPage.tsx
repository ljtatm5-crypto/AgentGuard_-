import { motion, useReducedMotion } from 'motion/react'
import {
  CheckCircle,
  CloudSlash,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
} from '@phosphor-icons/react'
import { API_PREFIX, USE_MOCK } from '@/api/client'
import { MotionSurface } from '@/components/MotionSurface'

const preferences = [
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
  {
    title: '测试数据来源',
    detail: USE_MOCK
      ? '当前使用浏览器内置演示数据，不需要连接后端即可完成功能体验。'
      : '当前读取本地测试环境中的运行记录，所有页面展示均来自已保存数据。',
    status: USE_MOCK ? '演示数据' : '本地运行',
    icon: SquaresFour,
  },
]

export default function SettingsPage() {
  const reduce = useReducedMotion()
  return (
    <div className="settings-page" data-testid="settings-page">
      <header className="page-head">
        <h1>工作空间设置</h1>
        <p className="page-desc">查看当前数据来源、测试判定偏好与安全访问范围。</p>
      </header>

      <MotionSurface className="settings-status">
        <div className="settings-status-copy">
          <span className={`mode-pill ${USE_MOCK ? 'is-mock' : 'is-live'}`}>
            <span className="dot" />{USE_MOCK ? '演示数据模式' : '本地数据模式'}
          </span>
          <h2>校园助手测试工作区</h2>
          <p>{USE_MOCK ? '所有内容来自预置示例，适合产品演示和功能验收。' : '当前连接本地测试环境，可查看真实运行记录与证据。'}</p>
        </div>
        <div className="settings-facts">
          <span><small>数据连接</small><strong>{USE_MOCK ? '内置 Mock' : '本地 API'}</strong></span>
          <span><small>接口契约</small><strong>{API_PREFIX}</strong></span>
          <span><small>外部目标</small><strong>不可访问</strong></span>
        </div>
      </MotionSurface>

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
          <p>测试任务只面向团队自建靶场或已明确授权的内部环境，真实外部网站不会进入测试目标。</p>
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
          <div><dt>测试范围</dt><dd>校园智能助手</dd></div>
          <div><dt>证据保留</dt><dd>本地运行记录</dd></div>
        </dl>
      </section>
    </div>
  )
}
