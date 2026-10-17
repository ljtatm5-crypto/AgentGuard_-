<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <section class="content"><div class="empty-page"><span class="eyebrow">404 / ROUTE GUARD</span><h2>页面不存在</h2><p>该地址不在 AgentGuard 的路由契约中。</p><button class="primary-btn" @click="router.push('/overview')">返回概览</button></div></section>
</template>
