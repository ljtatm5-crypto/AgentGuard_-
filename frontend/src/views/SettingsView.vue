<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
const { dataMode } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">INTEGRATION BASELINE</span><h2>联调设置与团队约束</h2><p>这些约束已经同时写入代码门禁、Mock 数据层和 Git 协作规范。</p></div><span class="mode-badge" :class="dataMode">{{ dataMode.toUpperCase() }}</span></div>
    <div class="settings-grid">
      <article><b>A · 测试与评测</b><p>先固化规则集和禁止项。规则命中即为最终结论；只有规则证据不足时，LLM 才能补充，且置信度上限为 0.8。</p></article>
      <article><b>B · 安全与 Agent</b><p>仅允许 local Mock、自建 Dify 或明确授权且加入主机白名单的环境。适配器未完成前不会发起任何真实外部请求。</p></article>
      <article><b>C · 平台与集成</b><p>默认 VITE_DATA_MODE=mock，先打通 8 条页面路由。后端契约稳定后再切换 api 模式。</p></article>
      <article><b>Git · 集成门禁</b><p>feature/* → dev；在 dev 完成后端测试、前端构建和 P0 闭环后，才允许 dev → main。禁止 feature 直接合并 main。</p></article>
    </div>
  </section>
</template>
