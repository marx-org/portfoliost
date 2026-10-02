// D55-5 — storage node: rounded rect, blue-slate tint, cylinder-hint database icon.
<script setup lang="ts">
import NodeHandles from "./NodeHandles.vue"
import StatusDot from "./StatusDot.vue"
import type { TopologyNodeData } from "./types"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: TopologyNodeData }>()
</script>

<template>
  <div
    class="relative flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30"
    :data-node-id="props.data.id"
  >
    <svg
      class="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
    <span class="truncate text-base font-medium text-blue-900 dark:text-blue-100">{{ props.data.label }}</span>
    <StatusDot v-if="props.data.live" :data="props.data" />
    <NodeHandles />
  </div>
</template>
