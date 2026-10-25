import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  CheckCircle,
  CloudSlash,
  GitBranch,
  ShieldCheck,
  SquaresFour,
} from '@phosphor-icons/react'
import { API_PREFIX, USE_MOCK } from '@/api/client'
import { MotionSurface } from '@/components/MotionSurface'

const constraints = [
  {
    code: 'A',
    title: '固定规则先判',
    detail: '规则结论一经命中即为最终结论；只有规则无法判定时，语义能力才补充证据。',
    icon: ShieldCheck,
  },
  {
    code: 'B',
    title: '授权边界默认拒绝',
    detail: '只执行团队自建靶场或明确授权目标，公网未知目标和真实外部网站一律拒绝。',
    icon: CloudSlash,
  },
  {
    code: 'C',
    title: 'Mock 先打通流程',
    detail: '页面默认无需后端即可运行；切换真实数据时复用同一套版本化接口契约。',
    icon: SquaresFour,
  },
]

const releaseSteps = [
  { label: 'feature/*', caption: '功能开发与自测' },
  { label: 'dev', caption: '契约联调与完整回归' },
  { label: 'main', caption: '验收通过后的演示基线' },
]

export default function SettingsPage() {
  const reduce = useReducedMotion()
  return (
    <div className="settings-page">
      <header className="page-head">
        <h1>设置</h1>
        <p className="page-desc">团队约束、数据来源与发布路径集中在这里，联调状态一眼可核。</p>
      </header>

      <MotionSurface className="settings-status">
        <div className="settings-status-copy">
          <span className={`mode-pill ${USE_MOCK ? 'is-mock' : 'is-live'}`}>
            <span className="dot" />{USE_MOCK ? 'Mock 联调模式' : '真实 API 模式'}
          </span>
          <h2>当前工作空间已经可以独立演示</h2>
          <p>{USE_MOCK ? '页面数据由浏览器内的 Mock 网关提供，不依赖后端服务。' : '页面通过版本化接口读取本地靶场运行记录。'}</p>
        </div>
        <div className="contract-card">
          <span>统一接口前缀</span>
          <strong>{API_PREFIX}</strong>
          <small>Mock 与真实接口共用同一契约</small>
        </div>
      </MotionSurface>

      <section className="settings-grid" data-testid="settings-constraints" aria-label="三条实现约束">
        {constraints.map((item, index) => (
          <motion.article
            className="panel constraint-card"
            key={item.code}
            initial={reduce ? false : { opacity: 0, y: 13 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .45, delay: index * .08, ease: [.22, 1, .36, 1] }}
          >
            <div className="constraint-icon"><item.icon size={22} weight="duotone" /></div>
            <span className="eyebrow">约束 {item.code}</span>
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
            <span className="constraint-check"><CheckCircle size={16} weight="fill" />已写入执行链</span>
          </motion.article>
        ))}
      </section>

      <section className="panel release-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">发布门禁</span>
            <h2>只允许一条稳定的交付路径</h2>
          </div>
          <GitBranch size={24} weight="duotone" className="release-icon" />
        </div>
        <ol className="release-track" aria-label="分支合并路径">
          {releaseSteps.map((step, index) => (
            <motion.li
              key={step.label}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: .4, delay: .12 + index * .1 }}
            >
              <span className="release-index">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.caption}</small>
              </span>
              {index < releaseSteps.length - 1 && <ArrowRight size={17} aria-hidden="true" />}
            </motion.li>
          ))}
        </ol>
        <p className="release-note">功能分支先进入 dev 联调；后端测试、Mock 自检、前端构建、路由冒烟和人工闭环全部通过后，才合并到 main。</p>
      </section>
    </div>
  )
}
