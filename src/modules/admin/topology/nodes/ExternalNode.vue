// D55-5 — external service node: rounded rect, indigo tint, globe icon.
<script setup lang="ts">
import NodeHandles from "./NodeHandles.vue"
import StatusDot from "./StatusDot.vue"
import type { TopologyNodeData } from "./types"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: TopologyNodeData }>()
</script>

<template>
  <div
    class="relative flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900/40 dark:bg-indigo-950/30"
  >
    <svg
      class="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
    <span class="truncate text-sm font-medium text-indigo-900 dark:text-indigo-100">{{ props.data.label }}</span>
    <StatusDot v-if="props.data.live" :data="props.data" />
    <NodeHandles />
  </div>
</template>
