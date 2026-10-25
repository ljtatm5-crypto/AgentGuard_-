import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AgentsPage = lazy(() => import('@/pages/AgentsPage'))
const SuitesPage = lazy(() => import('@/pages/SuitesPage'))
const RunsPage = lazy(() => import('@/pages/RunsPage'))
const FindingsPage = lazy(() => import('@/pages/FindingsPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

function page(node: ReactNode) {
  return (
    <Suspense fallback={<div className="panel route-loading"><span className="skeleton-line skeleton-wide" /><span className="skeleton-line" /></div>}>
      {node}
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={page(<DashboardPage />)} />
        <Route path="/agents" element={page(<AgentsPage />)} />
        <Route path="/test-suites" element={page(<SuitesPage />)} />
        <Route path="/suites" element={<Navigate to="/test-suites" replace />} />
        <Route path="/runs" element={page(<RunsPage />)} />
        <Route path="/runs/:runId" element={page(<RunsPage />)} />
        <Route path="/findings" element={page(<FindingsPage />)} />
        <Route path="/reports" element={page(<ReportsPage />)} />
        <Route path="/settings" element={page(<SettingsPage />)} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  )
}
