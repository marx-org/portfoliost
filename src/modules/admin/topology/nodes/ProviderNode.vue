// D55-5 — data-provider node: compact amber pill/chip, quota badge where set.
<script setup lang="ts">
import NodeHandles from "./NodeHandles.vue"
import StatusDot from "./StatusDot.vue"
import type { TopologyNodeData } from "./types"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: TopologyNodeData }>()
</script>

<template>
  <div
    class="relative flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 dark:border-amber-700/50 dark:bg-amber-950/30"
    :data-node-id="props.data.id"
  >
    <span class="truncate text-xs font-medium text-amber-900 dark:text-amber-100">{{ props.data.label }}</span>
    <span
      v-if="props.data.provider?.quota"
      class="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-800 dark:bg-amber-800/50 dark:text-amber-200"
    >{{ props.data.provider.quota }}</span>
    <StatusDot v-if="props.data.live" :data="props.data" />
    <NodeHandles />
  </div>
</template>
