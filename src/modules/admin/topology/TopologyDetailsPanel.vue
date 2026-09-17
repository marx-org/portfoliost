// D55-7 / step 10 — click-to-inspect details panel. A 320px slide-in overlay
// from the right edge of the topology canvas; TopologyView.vue owns the
// selection and animates the slide via the built-in Transition. Contents per node:
//
//   - name, area badge, status pill
//   - live metrics (replicas, restarts, request rate, P99, error rate)
//   - upstream / downstream neighbours (derived from the static edges)
//   - provider metadata (data types + quota) for data-provider nodes
//   - cachest's per-upstream P99 table (from /topology/traffic, D56 live only)
//   - quick-link to the relevant Admin tab where one exists
<script setup lang="ts">
import { computed } from "vue"

import { AREA_LABELS, downstreamOf, nodeById, upstreamOf } from "./graph-definition"
import type { TopologyNodeDef } from "./graph-definition"
import { DOT_LABELS, DOT_STYLES, dotState } from "./nodes/status"
import { useTopologyStore } from "./topology-store"
import type { CachestProviderLatency } from "./topology-store"

const props = defineProps<{ nodeId: string | null }>()
const emit = defineEmits<{
  close: []
  select: [id: string]
}>()

const store = useTopologyStore()

const def = computed<TopologyNodeDef | null>(() => (props.nodeId ? nodeById.get(props.nodeId) ?? null : null))
const data = computed(() => (def.value ? store.nodeData(def.value) : null))

const status = computed(() => data.value?.status ?? null)
const traffic = computed(() => data.value?.traffic ?? null)
const provider = computed(() => data.value?.provider ?? null)

const health = computed(() => {
  const s = status.value
  if (!s) return null
  return { state: dotState(s), label: DOT_LABELS[dotState(s)], dot: DOT_STYLES[dotState(s)] }
})

const implBadge = computed(() => {
  const impl = status.value?.impl
  if (!impl) return null
  if (impl === "real") return { label: "Deployment", class: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" }
  if (impl === "mock") return { label: "Mock", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  if (impl === "job") return { label: "Job", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  return { label: "Unreachable", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
})

const upstream = computed(() => (def.value ? upstreamOf(def.value.id).map((id) => nodeById.get(id)).filter((d): d is TopologyNodeDef => Boolean(d)) : []))
const downstream = computed(() => (def.value ? downstreamOf(def.value.id).map((id) => nodeById.get(id)).filter((d): d is TopologyNodeDef => Boolean(d)) : []))

const replicaText = computed(() => {
  const r = status.value?.replicas
  return r ? `${r.ready} / ${r.desired}` : null
})

const errorRatePct = computed(() => {
  const rate = traffic.value?.errorRate
  return typeof rate === "number" ? `${Math.round(rate * 100)}%` : null
})

const cachestProviders = computed<CachestProviderLatency[]>(() => store.cachestProviders)

/** Admin tab quick-link for a node, where one exists (D55-7). */
const quickLink = computed<{ name: string; label: string } | null>(() => {
  const id = def.value?.id
  const area = def.value?.area
  if (!id) return null
  if (id === "portfoliost-wallets-fxsync") return { name: "admin-currencies", label: "Currency Rates" }
  if (area === "jobs") return { name: "admin-jobs", label: "Jobs" }
  if (area === "internal") return { name: "admin-system", label: "System" }
  if (area === "storage") return { name: "admin-system", label: "System" }
  return null
})

function onClose(): void {
  emit("close")
}

function onSelect(id: string): void {
  emit("select", id)
}
</script>

<template>
  <aside
    class="topology-inspector absolute inset-y-0 right-0 z-20 w-80 overflow-y-auto border-l border-slate-200 bg-white/95 shadow-xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95"
    :aria-hidden="!def"
  >
    <template v-if="def && data">
      <!-- Header -->
      <div class="sticky top-0 z-10 border-b border-slate-200 bg-inherit px-4 py-3 dark:border-slate-700/60">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{{ data.label }}</h2>
            <p class="mt-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{{ AREA_LABELS[data.area] }}</p>
          </div>
          <button
            type="button"
            class="btn-ghost -mr-2 -mt-1 shrink-0 rounded-full p-1.5"
            data-testid="topology-panel-close"
            :aria-label="`Close ${data.label} details`"
            @click="onClose"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div v-if="health" class="mt-2 flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span class="h-2 w-2 rounded-full" :class="health.dot" :aria-hidden="true" />
            {{ health.label }}
          </span>
          <span v-if="implBadge" class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="implBadge.class">
            {{ implBadge.label }}
          </span>
        </div>
      </div>

      <!-- Body -->
      <div class="space-y-5 px-4 py-4 text-sm">
        <section v-if="def.job" aria-label="Job schedule">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Job schedule</h3>
          <p class="text-slate-700 dark:text-slate-200">{{ def.job.purpose }}</p>
          <p class="mt-2 font-mono text-xs text-slate-600 dark:text-slate-300">{{ def.job.schedule }}</p>
          <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ def.job.suspended ? 'Suspended' : 'Scheduled' }} · Controller timezone</p>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Deployment snapshot · verified 2026-09-17. Not live execution status.</p>
        </section>
        <!-- Version / deployment details -->
        <section v-if="status?.version" aria-label="Version">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Deployment</h3>
          <div class="space-y-1">
            <p v-if="status.version" class="font-mono text-xs text-slate-600 dark:text-slate-300">v{{ status.version }}</p>
            <p v-if="replicaText" class="text-slate-600 dark:text-slate-300">Replicas <span class="font-medium text-slate-900 dark:text-slate-100">{{ replicaText }}</span> ready</p>
            <p v-else-if="status.impl !== 'job'" class="text-slate-500 dark:text-slate-400">Replicas unknown (no Prometheus data)</p>
            <p v-if="typeof status.restarts === 'number'" class="text-slate-600 dark:text-slate-300">Restarts <span class="font-medium text-slate-900 dark:text-slate-100">{{ status.restarts }}</span></p>
          </div>
        </section>

        <!-- Live traffic metrics (any probed service with traffic data) -->
        <section v-if="traffic" aria-label="Traffic">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Traffic</h3>
          <div class="grid grid-cols-3 gap-2">
            <div class="card px-2 py-1.5">
              <p class="text-[11px] text-slate-400 dark:text-slate-500">Req/min</p>
              <p class="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">{{ traffic.requestsPerMin.toFixed(1) }}</p>
            </div>
            <div class="card px-2 py-1.5">
              <p class="text-[11px] text-slate-400 dark:text-slate-500">P99</p>
              <p class="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">{{ traffic.p99LatencyMs }}ms</p>
            </div>
            <div class="card px-2 py-1.5">
              <p class="text-[11px] text-slate-400 dark:text-slate-500">Errors</p>
              <p class="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">{{ errorRatePct }}</p>
            </div>
          </div>
          <p class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Source: {{ traffic.source }}
          </p>
        </section>

        <!-- cachest per-upstream latency (D56 live data) -->
        <section v-if="def.id === 'cachest' && cachestProviders.length" aria-label="Upstream latency">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Upstream P99 latency</h3>
          <table class="w-full text-left text-xs">
            <tbody>
              <tr v-for="row in cachestProviders" :key="row.provider" class="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td class="py-1 font-mono text-slate-600 dark:text-slate-300">{{ row.provider }}</td>
                <td class="py-1 text-right font-mono font-medium text-slate-900 dark:text-slate-100">{{ row.p99LatencyMs }}ms</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Data-provider metadata -->
        <section v-if="provider" aria-label="Data provider">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Provides</h3>
          <ul class="space-y-1">
            <li v-for="type in provider.dataTypes" :key="type" class="text-slate-600 dark:text-slate-300">{{ type }}</li>
          </ul>
          <p v-if="provider.quota" class="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {{ provider.quota }}
          </p>
        </section>

        <!-- Neighbours -->
        <section v-if="upstream.length || downstream.length" aria-label="Neighbours">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Neighbours</h3>
          <div class="space-y-2">
            <div v-if="upstream.length">
              <p class="text-[11px] text-slate-400 dark:text-slate-500">Upstream</p>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="n in upstream"
                  :key="n.id"
                  type="button"
                  class="btn-ghost rounded-full px-2 py-0.5 text-xs"
                  @click="onSelect(n.id)"
                >
                  {{ n.label }}
                </button>
              </div>
            </div>
            <div v-if="downstream.length">
              <p class="text-[11px] text-slate-400 dark:text-slate-500">Downstream</p>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="n in downstream"
                  :key="n.id"
                  type="button"
                  class="btn-ghost rounded-full px-2 py-0.5 text-xs"
                  @click="onSelect(n.id)"
                >
                  {{ n.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Admin quick-link -->
        <section v-if="quickLink">
          <router-link :to="{ name: quickLink.name }" class="btn-secondary w-full">
            Open {{ quickLink.label }}
          </router-link>
        </section>
      </div>
    </template>
  </aside>
</template>