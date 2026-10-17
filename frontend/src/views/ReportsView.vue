<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
const { metrics } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">VALIDATION REPORT</span><h2>应用效果与安全回归</h2><p>下方当前是 Mock 联调基线，不作为比赛实测结论；接入靶场后必须用真实运行记录替换。</p></div><span class="rule-badge">EVIDENCE REQUIRED</span></div>
    <div class="report-grid"><article><small>运行总数</small><b>{{ metrics.total_runs }}</b><p>TestRun 记录</p></article><article><small>通过率</small><b>{{ metrics.pass_rate }}%</b><p>固定规则优先判定</p></article><article><small>风险检出率</small><b>{{ metrics.risk_detection_rate }}%</b><p>仅当前 Mock 覆盖集</p></article><article><small>平均延迟</small><b>{{ metrics.avg_latency_ms }}ms</b><p>非真实网络性能</p></article></div>
    <article class="evidence-card"><h3>提交前证据清单</h3><div class="check-grid"><span class="done">✓ 可运行工具原型</span><span class="done">✓ 页面路由与 Mock 数据</span><span>○ 真实 Dify 靶场运行记录</span><span>○ 失败样例与修复前后对比</span><span>○ 脱敏截图与演示视频</span><span>○ 人工复核一致性表</span></div><p>{{ metrics.regression?.status }}</p></article>
  </section>
</template>
