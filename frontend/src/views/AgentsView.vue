<script setup lang="ts">
import { useWorkspace } from '../composables/useWorkspace'
const { agents } = useWorkspace()
</script>

<template>
  <section class="content page-stack">
    <div class="page-intro"><div><span class="eyebrow">ASSET INVENTORY</span><h2>Agent 资产与授权边界</h2><p>只有本地 Mock、自建 Dify 靶场或有明确授权记录且加入白名单的目标才能进入 live 模式。</p></div><span class="safety-lock">外部真实网站默认拒绝</span></div>
    <div class="data-grid">
      <article v-for="agent in agents" :key="agent.id" class="data-card">
        <div class="card-top"><div><span class="status-dot passed"></span><b>{{ agent.name }}</b></div><span class="mono">{{ agent.version }}</span></div>
        <dl><div><dt>Endpoint</dt><dd class="mono">{{ agent.endpoint }}</dd></div><div><dt>Adapter</dt><dd>{{ agent.adapter }}</dd></div><div><dt>目标范围</dt><dd>{{ agent.target_scope }}</dd></div><div><dt>授权记录</dt><dd>{{ agent.authorization_reference || '仅本地 Mock' }}</dd></div></dl>
        <div class="tag-row"><span v-for="tool in agent.tools" :key="tool">{{ tool }} · {{ agent.permissions[tool] }}</span></div>
      </article>
    </div>
  </section>
</template>
