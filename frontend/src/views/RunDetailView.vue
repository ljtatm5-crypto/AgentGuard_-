<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspace } from '../composables/useWorkspace'
import type { TraceEvent } from '../types'

const route = useRoute()
const router = useRouter()
const { runs, initialize, loadTrace } = useWorkspace()
const trace = ref<TraceEvent[]>([])
const run = computed(() => runs.value.find((item) => item.id === route.params.id))

onMounted(async () => {
  await initialize()
  trace.value = await loadTrace(String(route.params.id))
})
</script>

<template>
  <section class="content page-stack">
    <button class="back-link" @click="router.push('/runs')">← 返回执行任务</button>
    <div v-if="run" class="detail-grid">
      <article class="detail-card"><span class="eyebrow">VERDICT</span><h2>{{ run.case_name }}</h2><p>{{ run.result.judge?.reason }}</p><div class="verdict-strip"><span><small>状态</small><b>{{ run.status }}</b></span><span><small>规则集</small><b>{{ run.result.judge?.ruleset_version }}</b></span><span><small>LLM 使用</small><b>{{ run.result.judge?.llm_supplement?.used ? '是（仅补充）' : '否' }}</b></span><span><small>得分</small><b>{{ Math.round(run.score * 100) }}</b></span></div><h3>判定证据</h3><div class="tag-row"><span v-for="item in run.result.judge?.evidence" :key="item">{{ item }}</span></div></article>
      <article class="detail-card"><span class="eyebrow">TRACE EVENTS</span><h2>思考—行动轨迹</h2><div class="trace-list"><div v-for="event in trace" :key="event.id" class="trace-item"><span class="trace-icon">{{ event.type === 'policy' ? 'P' : event.type === 'tool_call' ? 'T' : 'A' }}</span><div><b>{{ event.type }}</b><p>{{ event.output || JSON.stringify(event.params) }}</p><small>{{ event.duration_ms }}ms</small></div></div></div></article>
    </div>
    <div v-else class="empty-state"><span>未找到该运行记录</span><small>请从任务列表重新进入</small></div>
  </section>
</template>
