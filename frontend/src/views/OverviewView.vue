<script setup lang="ts">
import { CircleCheckFilled, VideoPlay } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useWorkspace } from '../composables/useWorkspace'

const router = useRouter()
const { currentAgent, metrics, runs, latestFinding, loading, executeDemo } = useWorkspace()
</script>

<template>
  <section class="content">
    <div class="hero-row">
      <div>
        <p class="muted">当前被测对象</p>
        <h2>{{ currentAgent?.name ?? '校园智能助手' }} <span class="validated"><CircleCheckFilled /> 已校验</span></h2>
        <p class="hero-sub">{{ currentAgent?.endpoint ?? 'local://campus-assistant' }} <span>·</span> {{ currentAgent?.version ?? 'v0.1-demo' }} <span>·</span> 本地隔离运行</p>
      </div>
      <button class="primary-btn" :disabled="loading" @click="executeDemo"><VideoPlay /> {{ loading ? '运行中…' : '运行 Demo 任务' }}</button>
    </div>

    <div class="kpis">
      <article><span class="kpi-label">用例通过率</span><strong>{{ metrics.pass_rate }}<small>%</small></strong><div class="spark"><i style="height:40%"></i><i style="height:55%"></i><i style="height:46%"></i><i style="height:70%"></i><i style="height:88%"></i><i class="hot" style="height:96%"></i></div><p>来自 {{ metrics.total_runs }} 条执行记录</p></article>
      <article><span class="kpi-label">风险发现</span><strong>{{ metrics.finding_count }}<small> 条</small></strong><div class="risk-line"><span :style="{ width: `${Math.min(metrics.risk_detection_rate, 100)}%` }"></span></div><p>规则优先 · LLM 仅补充</p></article>
      <article><span class="kpi-label">平均响应延迟</span><strong>{{ metrics.avg_latency_ms || '—' }}<small> ms</small></strong><div class="latency-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div><p>输入、检索、工具和策略事件</p></article>
      <article><span class="kpi-label">当前回归</span><strong class="accent-number">P0</strong><div class="regression-state"><span></span> Mock 基线</div><p>同测试集修复前后重放</p></article>
    </div>

    <div class="section-heading"><div><span class="eyebrow">WORKFLOW / 01</span><h3>端到端验证闭环</h3></div><span class="section-note">规则先判 · 轨迹可查 · 证据可复现</span></div>
    <div class="pipeline">
      <div class="pipeline-step done"><b>01</b><span>接入 Agent</span><small>授权门禁</small></div><div class="pipeline-line done"></div>
      <div class="pipeline-step done"><b>02</b><span>生成测试</span><small>规则固化</small></div><div class="pipeline-line done"></div>
      <div class="pipeline-step done"><b>03</b><span>批量执行</span><small>Mock / API</small></div><div class="pipeline-line done"></div>
      <div class="pipeline-step current"><b>04</b><span>确定判定</span><small>LLM 补充</small></div><div class="pipeline-line"></div>
      <div class="pipeline-step"><b>05</b><span>攻击链</span><small>证据定位</small></div><div class="pipeline-line"></div>
      <div class="pipeline-step"><b>06</b><span>安全回归</span><small>版本对比</small></div>
    </div>

    <div class="dashboard-grid">
      <section class="panel runs-panel">
        <div class="panel-head"><div><span class="eyebrow">LATEST RUNS</span><h3>最近执行</h3></div><button class="text-btn" @click="router.push('/runs')">查看全部</button></div>
        <div class="run-list"><button v-for="run in runs.slice(0, 6)" :key="run.id" class="run-row" @click="router.push(`/runs/${run.id}`)"><span class="status-dot" :class="run.status"></span><span class="run-name">{{ run.case_name }}<small>{{ run.case_type }} / {{ run.risk_tag }}</small></span><span class="run-score">{{ Math.round((run.score || 0) * 100) }}<small>分</small></span><span class="run-latency">{{ run.latency }}ms</span></button></div>
      </section>
      <section class="panel finding-panel">
        <div class="panel-head"><div><span class="eyebrow">RISK SIGNAL</span><h3>最新风险证据</h3></div><span v-if="latestFinding" class="severity-pill">{{ latestFinding.severity.toUpperCase() }}</span></div>
        <div v-if="latestFinding" class="finding-body"><h4>{{ latestFinding.title }}</h4><p>{{ latestFinding.recommendation }}</p><div class="chain"><div v-for="(node, index) in latestFinding.chain" :key="node.label" class="chain-node"><span :class="node.status"></span><b>{{ String(index + 1).padStart(2, '0') }}</b><span>{{ node.label }}</span></div></div><button class="outline-btn" @click="router.push('/findings')">打开攻击链</button></div>
      </section>
    </div>
  </section>
</template>
