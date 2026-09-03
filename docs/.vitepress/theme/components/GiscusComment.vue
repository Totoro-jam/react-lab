<script setup>
import Giscus from '@giscus/vue'
import { useData, useRoute } from 'vitepress'

const { isDark } = useData()
const route = useRoute()
</script>

<template>
  <div class="giscus-container">
    <Giscus
      :key="route.path"
      id="comments"
      repo="Totoro-jam/react-lab"
      repo-id="R_kgDOUNNPHw"
      category="Announcements"
      category-id="DIC_kwDOUNNPH84DEzYD"
      mapping="pathname"
      strict="1"
      reactions-enabled="1"
      emit-metadata="0"
      input-position="top"
      :theme="isDark ? 'dark' : 'light'"
      lang="zh-CN"
      loading="lazy"
    />
  </div>
</template>

<style scoped>
.giscus-container {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}
</style>
