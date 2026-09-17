// D55-5 — health status dot overlaid on the bottom-right corner of live nodes.
// Colour encodes health; graded states breathe, measured traffic speeds up the beat.
<script setup lang="ts">
import { computed } from "vue"
import { DOT_LABELS, DOT_STYLES, dotState, hasActiveTraffic } from "./status"
import type { TopologyNodeData } from "./types"

const props = defineProps<{ data: TopologyNodeData }>()

const state = computed(() => dotState(props.data.status))
const active = computed(() => hasActiveTraffic(props.data.traffic))
// Theme-refresh step: the dot pulses for every live node with a graded state
// (healthy / degraded / down) — faster under active traffic — and stays
// static for "unknown" so the pulse itself carries meaning.
const pulsing = computed(() => state.value !== "unknown" || active.value)
const title = computed(() => `${props.data.label} — ${DOT_LABELS[state.value]}`)
</script>

<template>
  <span
    class="status-dot absolute -bottom-1 -right-1 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900"
    :class="[DOT_STYLES[state], { 'status-dot--pulse': pulsing, 'status-dot--pulse--fast': pulsing && active }]"
    :title="title"
    role="img"
    :aria-label="title"
  />
</template>

<style scoped>
/* A soft static halo in the state colour so even quiet nodes carry a glow. */
.status-dot {
  color: #94a3b8;
  box-shadow: 0 0 4px rgb(148 163 184 / 0.4);
}
.status-dot.bg-green-500 {
  color: #22c55e;
  box-shadow: 0 0 4px rgb(34 197 94 / 0.55);
}
.status-dot.bg-amber-500 {
  color: #f59e0b;
  box-shadow: 0 0 4px rgb(245 158 11 / 0.55);
}
.status-dot.bg-red-500 {
  color: #ef4444;
  box-shadow: 0 0 4px rgb(239 68 68 / 0.55);
}

/* Active traffic: the dot pulses with a radiating ring so it reads as alive. */
.status-dot--pulse {
  animation: status-dot-pulse 2.8s ease-in-out infinite;
}

/* Active traffic: a faster beat on top of the calm pulse. */
.status-dot--pulse--fast {
  animation-duration: 1.4s;
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
