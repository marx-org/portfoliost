<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import { getInstrumentPeers } from "@/api/instruments"
import type { components } from "@/api/types"
import TickerBadge from "@/components/TickerBadge.vue"
import { researchRoute } from "@/utils/research"
import { COMPARE_METRICS } from "./compareMetrics"

const route = useRoute()
const { t } = useI18n()
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingComparison") }}</p>

    <h2 class="card-title mb-3">{{ t("research.compareWithPeers", { symbol }) }}</h2>
    <div v-if="!loading && !error && items.length" class="card p-6">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th class="py-2 pr-3">{{ t("research.metricCol") }}</th>
              <th v-for="r in items" :key="r.symbol" class="px-3 py-2 text-right">
                <!-- The primary column keeps its blue highlight; the badge
                     supplies the rest of the identity block. `normal-case`
                     because the column header's `uppercase` is meant for the
                     metric labels, not for a company name.
                     §85.2 — peer columns link to their own research page; the
                     primary column stays plain, because `researchRoute`
                     hard-codes the overview and linking it would move the user
                     off this tab to the page they are already on. The `v-if`
                     guards the nullable `r.symbol`, which also skips the
                     empty-string badge. -->
                <div
                  class="normal-case tracking-normal"
                  :class="r.symbol === symbol ? 'text-accent-text' : ''"
                >
                  <router-link
                    v-if="r.symbol && r.symbol !== symbol"
                    :to="researchRoute(r.symbol, route.fullPath)"
                    class="inline-block"
                  >
                    <TickerBadge
                      size="sm"
                      align="right"
                      :symbol="r.symbol"
                      :name="r.name"
                      :country-code="r.countryCode"
                      :asset-type="r.assetType"
                    />
                  </router-link>
                  <TickerBadge
                    v-else
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
            <tr v-for="(row, i) in rows" :key="row.key" class="border-b border-border" :class="i % 2 ? 'bg-surface-2/50' : ''">
              <td class="py-2 pr-3 text-muted">{{ row.label }}</td>
              <td
                v-for="(v, j) in row.values"
                :key="j"
                class="px-3 py-2 text-right"
                :class="items[j].symbol === symbol ? 'font-semibold text-accent-text' : ''"
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
