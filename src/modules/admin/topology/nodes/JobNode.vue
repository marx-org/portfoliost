// D55-5 — job node: dashed border, green tint, clock icon.
<script setup lang="ts">
import NodeHandles from "./NodeHandles.vue"
import StatusDot from "./StatusDot.vue"
import type { TopologyNodeData } from "./types"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: TopologyNodeData }>()
</script>

<template>
  <div
    class="relative flex items-center gap-2 rounded-lg border border-dashed border-green-400 bg-green-50 px-4 py-2.5 dark:border-green-700 dark:bg-green-950/30"
    :data-node-id="props.data.id"
  >
    <svg
      class="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
    <span class="truncate text-base font-medium text-green-900 dark:text-green-100">{{ props.data.label }}</span>
    <StatusDot v-if="props.data.live" :data="props.data" />
    <NodeHandles />
  </div>
</template>
