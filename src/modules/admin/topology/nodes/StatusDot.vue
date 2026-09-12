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
/* A soft static halo in the state colour so even quiet nodes carry a glow. */
.status-dot {
  box-shadow: 0 0 4px rgb(148 163 184 / 0.4);
}
.status-dot.bg-green-500 {
  box-shadow: 0 0 4px rgb(34 197 94 / 0.55);
}
.status-dot.bg-amber-500 {
  box-shadow: 0 0 4px rgb(245 158 11 / 0.55);
}
.status-dot.bg-red-500 {
  box-shadow: 0 0 4px rgb(239 68 68 / 0.55);
}

/* Active traffic: the dot pulses with a radiating ring so it reads as alive. */
.status-dot--pulse {
  animation: status-dot-pulse 1.4s ease-in-out infinite;
}

@keyframes status-dot-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 6px 1px currentColor;
  }
  50% {
    transform: scale(1.45);
    box-shadow: 0 0 12px 4px currentColor;
  }
}
</style>
