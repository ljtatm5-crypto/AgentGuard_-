import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Compass, WarningCircle } from '@phosphor-icons/react'

const SUGGESTIONS = [
  { to: '/overview', label: '总览', hint: '查看当前验证环境与质量概览' },
  { to: '/runs', label: '执行任务', hint: '启动测试并查看执行轨迹' },
  { to: '/findings', label: '攻击链与缺陷', hint: '定位问题与回溯证据' },
  { to: '/reports', label: '报告与回归', hint: '对比版本并导出报告' },
]

/**
 * 404 页面
 * ---------------------------------------------------------------
 * 之前的 `*` 路由直接重定向到 /overview，非法地址会被静默吞掉，
 * 用户无法区分「链接输错」和「页面加载失败」。这里显式给出 404 与可用入口。
 *
 * 注意：GitHub Pages 把 index.html 复制为 404.html，因此深层链接（/runs/run-001）
 * 仍由 SPA 正常解析；只有真正不匹配的路由才会落到本页。
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <div className="notfound-page" data-testid="notfound-page">
      <section className="panel notfound-card">
        <span className="notfound-badge">
          <WarningCircle size={20} weight="duotone" aria-hidden="true" />
          404
        </span>
        <h1>没有找到这个页面</h1>
        <p className="page-desc">
          地址 <code className="mono">{pathname}</code> 不在当前工作空间的导航范围内。
          可能是链接已变更，或手动输入的路径有误。
        </p>

        <div className="notfound-actions">
          <Link className="btn btn-primary" to="/overview" data-testid="notfound-home">
            <ArrowLeft size={17} aria-hidden="true" />返回工作台
          </Link>
          <Link className="btn" to="/runs">
            <Compass size={17} aria-hidden="true" />继续一次测试
          </Link>
        </div>

        <h2>可以前往</h2>
        <ul className="notfound-links">
          {SUGGESTIONS.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </Link>
            </li>
          ))}
        </ul>

        <p className="muted small">
          提示：按 <kbd>Ctrl</kbd> + <kbd>K</kbd> 可打开页面搜索。
        </p>
      </section>
    </div>
  )
}
