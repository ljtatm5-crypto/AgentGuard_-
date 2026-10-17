import { createRouter, createWebHistory } from 'vue-router'

export const requiredRoutes = [
  '/overview',
  '/agents',
  '/test-suites',
  '/runs',
  '/runs/:id',
  '/findings',
  '/reports',
  '/settings',
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', name: 'overview', component: () => import('../views/OverviewView.vue'), meta: { title: '验证控制台' } },
    { path: '/agents', name: 'agents', component: () => import('../views/AgentsView.vue'), meta: { title: 'Agent 资产' } },
    { path: '/test-suites', name: 'test-suites', component: () => import('../views/TestSuitesView.vue'), meta: { title: '测试集与用例' } },
    { path: '/runs', name: 'runs', component: () => import('../views/RunsView.vue'), meta: { title: '执行任务' } },
    { path: '/runs/:id', name: 'run-detail', component: () => import('../views/RunDetailView.vue'), meta: { title: '运行轨迹' } },
    { path: '/findings', name: 'findings', component: () => import('../views/FindingsView.vue'), meta: { title: '缺陷与攻击链' } },
    { path: '/reports', name: 'reports', component: () => import('../views/ReportsView.vue'), meta: { title: '报告与回归' } },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '集成设置' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '页面未找到' } },
  ],
})

export default router
