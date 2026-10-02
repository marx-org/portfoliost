// D55-5 — internal service node: rounded card, service icon.
<script setup lang="ts">
import NodeHandles from "./NodeHandles.vue"
import StatusDot from "./StatusDot.vue"
import type { TopologyNodeData } from "./types"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: TopologyNodeData }>()
</script>

<template>
  <div
    class="card relative flex items-center gap-2 px-4 py-2.5"
    :data-node-id="props.data.id"
  >
    <svg
      class="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="8" rx="2" />
      <rect x="2" y="13" width="20" height="8" rx="2" />
      <line x1="6" y1="7" x2="6.01" y2="7" />
      <line x1="6" y1="17" x2="6.01" y2="17" />
    </svg>
    <span class="truncate text-base font-medium text-slate-900 dark:text-slate-100">{{ props.data.label }}</span>
    <StatusDot v-if="props.data.live" :data="props.data" />
    <NodeHandles />
  </div>
</template>
