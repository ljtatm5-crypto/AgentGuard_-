<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
const { findings } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">EVIDENCE CHAIN</span><h2>缺陷与攻击链</h2><p>攻击样本仅来自合成数据、自建 Dify 靶场或书面授权环境；不对真实外部网站发起测试。</p></div><span class="safety-lock">AUTHORIZED TARGETS ONLY</span></div>
    <div class="data-grid"><article v-for="finding in findings" :key="finding.id" class="data-card finding-card"><div class="card-top"><b>{{ finding.title }}</b><span class="severity-pill">{{ finding.severity }}</span></div><p>{{ finding.impact }}</p><div class="chain chain-wide"><div v-for="(node, index) in finding.chain" :key="node.label" class="chain-node"><span :class="node.status"></span><b>{{ String(index + 1).padStart(2, '0') }}</b><span>{{ node.label }}</span></div></div><h4>证据</h4><div class="tag-row"><span v-for="item in finding.evidence" :key="item">{{ item }}</span></div><h4>修复建议</h4><p>{{ finding.recommendation }}</p></article></div>
  </section>
</template>
