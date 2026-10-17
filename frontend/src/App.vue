<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  CaretRight,
  Connection,
  DataAnalysis,
  Document,
  Monitor,
  Setting,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue'
import { useWorkspace } from './composables/useWorkspace'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspace()
const { agents, suites, runs, findings, notice, dataMode, initialize } = workspace

const pageTitle = computed(() => String(route.meta.title ?? 'AgentGuard'))
const navItems = computed(() => [
  { path: '/overview', label: '概览', icon: DataAnalysis, count: '01' },
  { path: '/agents', label: 'Agent 资产', icon: Connection, count: agents.value.length },
  { path: '/test-suites', label: '测试集', icon: Document, count: suites.value.length },
  { path: '/runs', label: '执行任务', icon: VideoPlay, count: runs.value.length },
  { path: '/findings', label: '缺陷与攻击链', icon: WarningFilled, count: findings.value.length },
  { path: '/reports', label: '报告与回归', icon: Monitor },
  { path: '/settings', label: '集成设置', icon: Setting },
])

const isActive = (path: string) => route.path === path || (path === '/runs' && route.path.startsWith('/runs/'))

onMounted(() => initialize())
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">AG</div>
        <div><strong>AgentGuard</strong><span>智测盾 / v0.2</span></div>
      </div>
      <div class="workspace-label">WORKSPACE / CAMPUS</div>
      <nav>
        <button
          v-for="item in navItems"
          :key="item.path"
          :class="{ active: isActive(item.path) }"
          @click="router.push(item.path)"
        >
          <component :is="item.icon" /> {{ item.label }} <em v-if="item.count !== undefined">{{ item.count }}</em>
        </button>
      </nav>
      <div class="sidebar-foot">
        <span class="online-dot"></span>
        <div><b>{{ dataMode === 'mock' ? 'Mock 联调环境' : '本地 API 环境' }}</b><small>虚拟工具 · 授权白名单</small></div>
        <CaretRight />
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div><span class="eyebrow">AI AGENT QUALITY CONTROL</span><h1>{{ pageTitle }}</h1></div>
        <div class="top-actions">
          <span class="mode-badge" :class="dataMode">{{ dataMode.toUpperCase() }}</span>
          <span class="last-sync"><span class="online-dot"></span> 路由已联通</span>
          <button class="icon-btn" aria-label="通知"><Bell /></button>
          <div class="avatar">C</div>
        </div>
      </header>
      <div v-if="notice" class="notice"><span>{{ notice }}</span><button @click="notice = ''">关闭</button></div>
      <RouterView />
      <footer><span>AgentGuard 智测盾 · P0 runnable skeleton</span><span>feature → dev → main</span></footer>
    </main>
  </div>
</template>
