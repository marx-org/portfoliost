// D55-5 — health status dot overlaid on the bottom-right corner of live nodes.
// Colour encodes the derived DotState; the dot pulses when traffic is active.
<script setup lang="ts">
import { computed } from "vue"
import { DOT_LABELS, DOT_STYLES, dotState, hasActiveTraffic } from "./status"
import type { TopologyNodeData } from "./types"

const props = defineProps<{ data: TopologyNodeData }>()

const state = computed(() => dotState(props.data.status))
const active = computed(() => hasActiveTraffic(props.data.traffic))
const title = computed(() => `${props.data.label} — ${DOT_LABELS[state.value]}`)
</script>

<template>
  <span
    class="status-dot absolute -bottom-1 -right-1 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900"
    :class="[DOT_STYLES[state], { 'status-dot--pulse': active }]"
    :title="title"
    role="img"
    :aria-label="title"
  />
</template>

<style scoped>
.status-dot--pulse {
  animation: status-dot-pulse 1.4s ease-in-out infinite;
}

@keyframes status-dot-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 currentColor;
  }
  50% {
    transform: scale(1.35);
    box-shadow: 0 0 0 3px rgb(0 0 0 / 0);
  }
}
</style>
