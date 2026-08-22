<template>
  <div class="overview-page">
    <NodeStatsCard />
    <TodoMattersCard />
    <ResourceOverviewCard />
    <!-- 其他后续内容可以添加在这里 -->
  </div>
</template>

<script setup>
import NodeStatsCard from './overview/NodeStatsCard.vue'
import TodoMattersCard from './overview/TodoMattersCard.vue'
import ResourceOverviewCard from './overview/ResourceOverviewCard.vue'
</script>

<style scoped>

</style>
