import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
import { SquaresFour, Stack, PlayCircle, CirclesThreePlus, ChartPieSlice, Graph, GearSix, MagnifyingGlass, CaretRight, Sun, Moon, Command, X } from '@phosphor-icons/react'
const XiaoAnPanel = lazy(() => import('@/components/xiaoan/XiaoAnPanel'))

const PAGE_PREFETCH: Record<string, () => Promise<unknown>> = {
  '/overview': () => import('@/pages/DashboardPage'),
  '/agents': () => import('@/pages/AgentsPage'),
  '/test-suites': () => import('@/pages/SuitesPage'),
  '/runs': () => import('@/pages/RunsPage'),
  '/findings': () => import('@/pages/FindingsPage'),
  '/reports': () => import('@/pages/ReportsPage'),
  '/settings': () => import('@/pages/SettingsPage'),
}

const NAV = [
  { to: '/overview', label: '总览', shortLabel: '总览', icon: SquaresFour, hint: '查看测试进展' },
  { to: '/agents', label: 'Agent 资产', shortLabel: '资产', icon: CirclesThreePlus, hint: '知识库与工具权限' },
  { to: '/test-suites', label: '测试集', shortLabel: '测试集', icon: Stack, hint: '用例与预期行为' },
  { to: '/runs', label: '执行任务', shortLabel: '执行', icon: PlayCircle, hint: '启动测试与查看轨迹' },
  { to: '/findings', label: '攻击链与缺陷', shortLabel: '缺陷', icon: Graph, hint: '定位问题与回溯证据' },
  { to: '/reports', label: '报告与回归', shortLabel: '报告', icon: ChartPieSlice, hint: '对比版本并导出报告' },
  { to: '/settings', label: '设置', shortLabel: '设置', icon: GearSix, hint: '偏好与安全范围' },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const outlet = useOutlet()
  const reduce = useReducedMotion()
  const [searchOpen, setSearchOpen] = useState(false)
  const [assistantReady, setAssistantReady] = useState(false)
  const [query, setQuery] = useState('')
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('agentguard-appearance') || 'light')
  // 未匹配任何导航项时（如 404），不能沿用 NAV[0] 的标签，否则标题与面包屑会误报「总览」
  const active = location.pathname === '/'
    ? NAV[0]
    : NAV.find(n => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`))
      ?? { ...NAV[0], label: '页面未找到', shortLabel: '未找到', hint: '该地址不在导航范围内' }
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('agentguard-appearance', theme) }, [theme])
  useEffect(() => { document.title = `${active.label} · AgentGuard 智测盾` }, [active.label])
  useEffect(() => {
    // Keep the assistant and secondary routes out of the critical entry bundle.
    const assistantTimer = window.setTimeout(() => setAssistantReady(true), 700)
    const routeTimer = window.setTimeout(() => {
      Object.values(PAGE_PREFETCH).forEach((load) => { void load() })
    }, 2500)
    return () => {
      window.clearTimeout(assistantTimer)
      window.clearTimeout(routeTimer)
    }
  }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(v => !v) }
      if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    if (!searchOpen) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector('input')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = dialog.current?.querySelectorAll<HTMLElement>('input,button,a[href]')
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); previous?.focus() }
  }, [searchOpen])
  const openSearch = () => { setQuery(''); setSearchOpen(true) }
  return (
    <MotionConfig reducedMotion="user">
    <div className="app">
      <a className="skip-link" href="#page-content">跳到页面内容</a>
      <div className="ambient-light ambient-one" aria-hidden="true" />
      <div className="ambient-light ambient-two" aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">AG</span>
          <div>
            <div className="brand-name">AgentGuard 智测盾</div>
            <div className="brand-sub">每一次测试，都有据可循</div>
          </div>
        </div>
        <div className="workspace-switch"><span className="workspace-avatar">A</span><div><strong>智能体安全测试</strong><small>客户工作空间</small></div><CaretRight size={14} /></div>
        <span className="nav-caption">工作空间</span>
        <nav aria-label="主要导航">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              onMouseEnter={() => { void PAGE_PREFETCH[n.to]?.() }}
              onFocus={() => { void PAGE_PREFETCH[n.to]?.() }}
              data-testid={`nav-${n.label}`}
            >
              {({ isActive }) => <>
                {isActive && <motion.span className="nav-selection" layoutId="nav-selection" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <n.icon size={20} weight={isActive ? 'duotone' : 'regular'} />
                <span className="nav-label"><span className="nav-label-long">{n.label}</span><span className="nav-label-short">{n.shortLabel}</span></span>
                {isActive && <CaretRight className="nav-arrow" size={13} />}
              </>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="app-topbar"><div className="breadcrumb">工作空间 <CaretRight size={13} /><span>{active.label}</span></div><div className="topbar-actions"><button className="search-trigger" ref={searchTrigger} onClick={openSearch} aria-label="搜索页面"><MagnifyingGlass size={17} /><span>快速前往</span><kbd><Command size={12} /> K</kbd></button><div className="appearance-switch" aria-label="外观"><button aria-label="浅色外观" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>{theme === 'light' && <motion.span layoutId="appearance" />}<Sun size={17} /></button><button aria-label="深色外观" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>{theme === 'dark' && <motion.span layoutId="appearance" />}<Moon size={17} /></button></div><span className="team-avatar" title="三人协作团队">AG</span></div></header>
        <AnimatePresence mode="wait" initial={false}><motion.div className="route-view" id="page-content" key={location.pathname} initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={{ duration: reduce ? 0 : .22 }}>{outlet}</motion.div></AnimatePresence>
        <footer className="app-footer"><span>AgentGuard 智测盾</span><span>测试有依据，改进有方向。</span></footer>
      </main>
      {assistantReady && <Suspense fallback={null}><XiaoAnPanel /></Suspense>}
    </div>
    <AnimatePresence>{searchOpen && <motion.div className="command-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSearchOpen(false)}><motion.div ref={dialog} className="command-panel" role="dialog" aria-modal="true" aria-labelledby="search-title" initial={{ opacity: 0, y: reduce ? 0 : -12, scale: reduce ? 1 : .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} onClick={e => e.stopPropagation()}><div className="command-search"><MagnifyingGlass size={23} /><label className="sr-only" id="search-title" htmlFor="command-query">搜索页面</label><input id="command-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="你想前往哪里？" /><button className="icon-button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}><X size={18} /></button></div><div className="command-results">{NAV.filter(n => `${n.label}${n.hint}`.toLowerCase().includes(query.toLowerCase())).map(n => <button key={n.to} onClick={() => { navigate(n.to); setSearchOpen(false) }}><n.icon size={21} /><span><strong>{n.label}</strong><small>{n.hint}</small></span><CaretRight size={15} /></button>)}{!NAV.some(n => `${n.label}${n.hint}`.toLowerCase().includes(query.toLowerCase())) && <p className="state-desc">没有匹配页面，请试试“测试”或“报告”。</p>}</div><div className="command-foot"><span>Tab 选择，Enter 打开</span><span>Esc 关闭</span></div></motion.div></motion.div>}</AnimatePresence>
    </MotionConfig>
  )
}
