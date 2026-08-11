<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentPeers } from "@/api/instruments"
import type { ResearchCompare } from "@/api/types"
import { COMPARE_METRICS } from "./compareMetrics"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const items = ref<ResearchCompare[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await getInstrumentPeers(symbol)
    items.value = res.items
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load comparison"
  } finally {
    loading.value = false
  }
})

const metrics = COMPARE_METRICS

const rows = computed(() =>
  metrics.map((m) => ({ label: m.label, key: m.key, values: items.value.map((r) => m.fmt(r)) })),
)
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading comparison...</p>

    <div v-if="!loading && !error && items.length" class="card p-6">
      <h2 class="mb-3 text-base font-semibold">Compare {{ symbol }} with peers</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th class="py-2 pr-3">Metric</th>
              <th v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right">
                <div :class="r.symbol === symbol ? 'font-bold text-blue-700' : 'font-medium'">{{ r.symbol }}</div>
                <div class="text-[10px] font-normal normal-case text-slate-400">{{ r.name }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.key" class="border-b border-slate-100" :class="i % 2 ? 'bg-slate-50/50' : ''">
              <td class="py-2 pr-3 text-slate-600">{{ row.label }}</td>
              <td
                v-for="(v, j) in row.values"
                :key="j"
                class="px-3 py-2 text-right"
                :class="items[j].symbol === symbol ? 'font-semibold text-blue-700' : ''"
              >
                {{ v }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
