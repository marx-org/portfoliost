<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentPeers } from "@/api/instruments"
import type { components } from "@/api/types"
import TickerBadge from "@/components/TickerBadge.vue"
import { COMPARE_METRICS } from "./compareMetrics"

const route = useRoute()
const routeSymbol = String(route.params.symbol).toUpperCase()
const symbol = routeSymbol

const items = ref<components["schemas"]["ResearchCompare"][]>([])
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading comparison...</p>

    <h2 class="mb-3 text-base font-semibold">Compare {{ symbol }} with peers</h2>
    <div v-if="!loading && !error && items.length" class="card p-6">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th class="py-2 pr-3">Metric</th>
              <th v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right">
                <!-- The primary column keeps its blue highlight; the badge
                     supplies the rest of the identity block. `normal-case`
                     because the column header's `uppercase` is meant for the
                     metric labels, not for a company name. -->
                <div
                  class="normal-case tracking-normal"
                  :class="r.symbol === symbol ? 'text-blue-700 dark:text-blue-400' : ''"
                >
                  <TickerBadge
                    size="sm"
                    align="right"
                    :symbol="r.symbol ?? ''"
                    :name="r.name"
                    :country-code="r.countryCode"
                    :asset-type="r.assetType"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.key" class="border-b border-slate-100 dark:border-slate-800" :class="i % 2 ? 'bg-slate-50/50' : ''">
              <td class="py-2 pr-3 text-slate-600 dark:text-slate-300">{{ row.label }}</td>
              <td
                v-for="(v, j) in row.values"
                :key="j"
                class="px-3 py-2 text-right"
                :class="items[j].symbol === symbol ? 'font-semibold text-blue-700 dark:text-blue-400' : ''"
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
