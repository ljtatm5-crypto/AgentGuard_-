<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useWorkspace } from '../composables/useWorkspace'
const router = useRouter()
const { runs, loading, executeDemo } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">BATCH EXECUTION</span><h2>执行任务与结果</h2><p>Mock 模式可先验收交互和展示；切换 API 模式后生成 SQLite 运行证据。</p></div><button class="primary-btn" :disabled="loading" @click="executeDemo">{{ loading ? '执行中…' : '回放 P0 测试集' }}</button></div>
    <article class="table-card"><div class="data-table"><div class="table-row run-table table-header"><span>状态</span><span>测试用例</span><span>判定来源</span><span>得分 / 延迟</span><span></span></div><button v-for="run in runs" :key="run.id" class="table-row run-table clickable" @click="router.push(`/runs/${run.id}`)"><span><i class="status-dot" :class="run.status"></i>{{ run.status }}</span><span><b>{{ run.case_name }}</b><small>{{ run.case_type }} · {{ run.risk_tag }}</small></span><span>{{ run.result.judge?.source ?? 'rule' }}</span><span>{{ Math.round(run.score * 100) }} / {{ run.latency }}ms</span><span>查看轨迹 →</span></button></div></article>
  </section>
</template>
