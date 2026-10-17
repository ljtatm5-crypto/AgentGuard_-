<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
const { suites } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">TEST CONTRACT</span><h2>测试集与固定规则</h2><p>用例先定义 expected、forbidden 和 risk_tag；规则无法判定时才允许 LLM 给出补充意见。</p></div><span class="rule-badge">RULESET p0-2026.10</span></div>
    <article v-for="suite in suites" :key="suite.id" class="table-card">
      <div class="table-title"><div><h3>{{ suite.name }}</h3><p>{{ suite.version }} · {{ suite.cases.length }} 个用例 · {{ suite.status }}</p></div></div>
      <div class="data-table"><div class="table-row table-header"><span>类型</span><span>用例</span><span>风险标签</span><span>判定顺序</span></div><div v-for="item in suite.cases" :key="item.id" class="table-row"><span><i class="type-chip">{{ item.type }}</i></span><span><b>{{ item.name }}</b><small>{{ item.expected }}</small></span><span class="mono">{{ item.risk_tag }}</span><span>固定规则 → LLM 补充 → 人工复核</span></div></div>
    </article>
  </section>
</template>
