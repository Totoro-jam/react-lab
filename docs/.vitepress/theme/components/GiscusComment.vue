<script setup>
import Giscus from '@giscus/vue'
import { useData } from 'vitepress'

const { isDark } = useData()
</script>

<template>
  <Giscus
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
</template>
