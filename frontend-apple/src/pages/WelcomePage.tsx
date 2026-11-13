import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { ArrowRight, FingerprintSimple, ShieldCheck } from '@phosphor-icons/react'
import '@/welcome.css'

const WelcomeScene = lazy(() => import('./WelcomeScene'))

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`welcome-brand-mark ${className}`} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="welcome-mark-fill" x1="7" y1="5" x2="57" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fbff" />
          <stop offset=".48" stopColor="#b8d6f5" />
          <stop offset="1" stopColor="#6d8eb1" />
        </linearGradient>
        <linearGradient id="welcome-mark-border" x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,.92)" />
          <stop offset="1" stopColor="rgba(255,255,255,.22)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="17" fill="rgba(10,15,24,.68)" stroke="url(#welcome-mark-border)" />
      <path d="M17.6 44.4 28.8 19.6h7.1l11.2 24.8h-7.8l-2-4.9H27.2l-1.9 4.9h-7.7Zm11.9-11.1h6l-3-7.7-3 7.7Z" fill="url(#welcome-mark-fill)" />
    </svg>
  )
}

export default function WelcomePage() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [leaving, setLeaving] = useState(false)
  const timeout = useRef<number | null>(null)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 80, damping: 24 })
  const smoothY = useSpring(pointerY, { stiffness: 80, damping: 24 })
  const backgroundX = useTransform(smoothX, [-1, 1], [8, -8])
  const backgroundY = useTransform(smoothY, [-1, 1], [6, -6])
  const rotateX = useTransform(smoothY, [-1, 1], [5, -5])
  const rotateY = useTransform(smoothX, [-1, 1], [-7, 7])
  const buttonX = useMotionValue(0)
  const buttonY = useMotionValue(0)
  const springButtonX = useSpring(buttonX, { stiffness: 260, damping: 20 })
  const springButtonY = useSpring(buttonY, { stiffness: 260, damping: 20 })

  const enterSystem = () => {
    if (leaving) return
    setLeaving(true)
    timeout.current = window.setTimeout(() => navigate('/overview'), reduce ? 80 : 720)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat) enterSystem()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaving, reduce])

  useEffect(() => () => {
    if (timeout.current !== null) window.clearTimeout(timeout.current)
  }, [])

  return (
    <div
      className={`welcome-page${leaving ? ' is-leaving' : ''}`}
      onPointerMove={(event) => {
        if (reduce) return
        const x = event.clientX / window.innerWidth * 2 - 1
        const y = event.clientY / window.innerHeight * 2 - 1
        pointerX.set(x)
        pointerY.set(y)
      }}
    >
      <motion.div className="welcome-atmosphere" style={{ x: backgroundX, y: backgroundY }} aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}welcome-atmosphere.jpg`} alt="" />
      </motion.div>
      <div className="welcome-haze" aria-hidden="true" />
      <div className="welcome-grain" aria-hidden="true" />

      <header className="welcome-header">
        <div className="welcome-brand">
          <BrandMark />
          <div>
            <strong>AgentGuard</strong>
            <span>智测盾</span>
          </div>
        </div>
        <div className="welcome-status">
          <i />
          <span>SECURE WORKSPACE</span>
          <b>v2.0</b>
        </div>
      </header>

      <main className="welcome-main">
        <motion.section
          className="welcome-copy"
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .8, ease: [.22, 1, .36, 1] }}
        >
          <span className="welcome-kicker"><ShieldCheck size={15} weight="duotone" />AGENT QUALITY & SECURITY</span>
          <h1>
            <span>让每一次</span>
            <span>智能体决策，</span>
            <em>都有证据。</em>
          </h1>
          <p className="welcome-lede">
            从资产接入、测试执行到轨迹审计，把不可见的智能体行为变成可验证、可回归的安全证据。
          </p>

          <div className="welcome-actions">
            <motion.button
              type="button"
              className="welcome-enter"
              onClick={enterSystem}
              data-testid="welcome-enter"
              style={{ x: springButtonX, y: springButtonY }}
              onPointerMove={(event) => {
                if (reduce) return
                const rect = event.currentTarget.getBoundingClientRect()
                buttonX.set((event.clientX - rect.left - rect.width / 2) * .08)
                buttonY.set((event.clientY - rect.top - rect.height / 2) * .08)
              }}
              onPointerLeave={() => { buttonX.set(0); buttonY.set(0) }}
              whileHover={{ scale: 1.018 }}
              whileTap={{ scale: .985 }}
            >
              <span>进入测试空间</span>
              <span className="welcome-enter-icon"><ArrowRight size={18} weight="bold" /></span>
            </motion.button>
            <span className="welcome-key-hint">PRESS <kbd>ENTER</kbd></span>
          </div>

          <ul className="welcome-proof" aria-label="平台核心能力">
            <li><span>01</span><strong>规则优先</strong><small>确定性结论</small></li>
            <li><span>02</span><strong>轨迹审计</strong><small>事件级证据</small></li>
            <li><span>03</span><strong>回归验证</strong><small>修复可复测</small></li>
          </ul>
        </motion.section>

        <motion.section
          className="welcome-visual"
          initial={reduce ? false : { opacity: 0, scale: .94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.05, delay: .12, ease: [.22, 1, .36, 1] }}
          aria-label="交互式三维玻璃安全核心"
        >
          <motion.div className="welcome-3d-shell" style={{ rotateX, rotateY }}>
            <div className="welcome-core-fallback"><BrandMark /></div>
            <Suspense fallback={null}><WelcomeScene /></Suspense>
            <div className="welcome-core-glow" aria-hidden="true" />
            <div className="welcome-orbit welcome-orbit-a" aria-hidden="true" />
            <div className="welcome-orbit welcome-orbit-b" aria-hidden="true" />
          </motion.div>

          <motion.div className="welcome-float-card welcome-float-card-a" animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}>
            <FingerprintSimple size={19} weight="duotone" />
            <div><span>EVIDENCE</span><strong>证据可追溯</strong></div>
          </motion.div>
          <motion.div className="welcome-float-card welcome-float-card-b" animate={reduce ? undefined : { y: [0, 7, 0] }} transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}>
            <span className="signal-dot" />
            <div><span>POLICY ENGINE</span><strong>100% 规则判定</strong></div>
          </motion.div>
        </motion.section>
      </main>

      <footer className="welcome-footer">
        <span>AgentGuard / Quality & Security</span>
        <div className="welcome-footer-line" />
        <span>RULE FIRST · TRACEABLE · REGRESSION READY</span>
      </footer>

      {leaving && (
        <motion.div
          className="welcome-exit"
          initial={{ scale: 0, opacity: .9 }}
          animate={{ scale: 2.8, opacity: 0 }}
          transition={{ duration: reduce ? .08 : .72, ease: [.22, 1, .36, 1] }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}