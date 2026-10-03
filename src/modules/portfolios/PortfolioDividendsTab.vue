<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioDividends } from "@/api/portfolios"
import TickerBadge from "@/components/TickerBadge.vue"
import { researchRoute } from "@/utils/research"
import type { components } from "@/api/types"

type DividendItem = NonNullable<components["schemas"]["DividendsData"]["items"]>[number]

const route = useRoute()
const id = String(route.params.id)
const data = ref<components["schemas"]["DividendsData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const limit = ref(50)

onMounted(async () => {
  try {
    data.value = await getPortfolioDividends(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load dividends"
  } finally {
    loading.value = false
  }
})

const items = computed<DividendItem[]>(() => data.value?.items ?? [])
const history = computed(() => data.value?.history ?? [])
// §49.5: real endpoint (49.3) returns items[]; the research-backed mock shape is
// history[] — render whichever the endpoint actually returns.
const rows = computed(() => (items.value.length ? items.value : history.value.map(mapLegacy)))
const holdings = computed(() => new Set(rows.value.map((r) => r.symbol)).size)
const convertedTotal = computed(() => data.value?.totalDividends ?? null)

function mapLegacy(h: NonNullable<typeof history.value>[number]): DividendItem {
  return {
    symbol: "—",
    date: h.date,
    quantity: 0,
    gross: h.amount,
    taxes: null,
    amount: h.amount,
    currency: h.currency,
    exchangeRate: null,
    convertedAmount: null,
    notes: null,
  }
}

function fmt(n: number | null | undefined, currency?: string): string {
  const value = n ?? 0
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${currency ? ` ${currency}` : ""}`
}

/**
 * §85.2 — the legacy `history[]` path has no symbol (`mapLegacy` hardcodes the
 * em-dash placeholder), so those rows keep a plain badge. Linking them would
 * produce a real link to `/en/research/%E2%80%94/overview`.
 */
function isResearchLinkable(symbol: string): boolean {
  return symbol !== "" && symbol !== "—"
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading dividends...</p>

    <template v-if="!loading && !error && data">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Payments</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ data.count ?? rows.length }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Holdings</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ holdings }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total Received</p>
          <p v-if="convertedTotal != null" class="mt-1 text-xl font-semibold tabular-nums">{{ convertedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) }}</p>
          <p v-else class="mt-1 text-xl font-semibold tabular-nums">{{ fmt(rows.reduce((s, r) => s + (r.amount ?? 0), 0)) }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
          <h2 class="text-base font-semibold">Dividend History</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm" :data-testid="`dividends-table`">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <th class="px-5 py-2.5 font-medium">Symbol</th>
                <th class="px-5 py-2.5 font-medium">Date</th>
                <th class="px-5 py-2.5 text-right font-medium">Gross</th>
                <th class="px-5 py-2.5 text-right font-medium">Tax</th>
                <th class="px-5 py-2.5 text-right font-medium">Net</th>
                <th v-if="items.some((i) => i.exchangeRate != null)" class="px-5 py-2.5 text-right font-medium">Converted</th>
                <th class="px-5 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="(d, i) in rows.slice(0, limit)" :key="`${d.symbol}-${d.date}-${i}`" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 whitespace-nowrap">
                  <router-link
                    v-if="isResearchLinkable(d.symbol)"
                    :to="researchRoute(d.symbol, route.fullPath)"
                    class="block"
                  >
                    <TickerBadge
                      size="sm"
                      :symbol="d.symbol"
                      :name="d.instrumentName"
                      :country-code="d.country"
                      :asset-type="d.assetType"
                    />
                  </router-link>
                  <TickerBadge
                    v-else
                    size="sm"
                    :symbol="d.symbol"
                    :name="d.instrumentName"
                    :country-code="d.country"
                    :asset-type="d.assetType"
                  />
                </td>
                <td class="px-5 py-3 whitespace-nowrap">{{ String(d.date ?? "").slice(0, 10) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ fmt(d.gross, d.currency) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">
                  <template v-if="d.taxes">{{ fmt(d.taxes, d.currency) }}</template>
                  <span v-else class="text-slate-400">—</span>
                </td>
                <td class="px-5 py-3 text-right font-medium tabular-nums" :data-testid="`dividend-net-${d.symbol}`">{{ fmt(d.amount, d.currency) }}</td>
                <td v-if="items.some((i) => i.exchangeRate != null)" class="px-5 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {{ d.convertedAmount != null ? fmt(d.convertedAmount) : "—" }}
                </td>
                <td class="px-5 py-3">
                  <span v-if="d.notes" class="max-w-[16rem] truncate text-xs text-slate-500 dark:text-slate-400">{{ d.notes }}</span>
                  <span v-else class="text-slate-300 dark:text-slate-600">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="rows.length > limit" class="flex justify-center border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
          <button type="button" class="btn-ghost text-sm" @click="limit = rows.length">Show all {{ rows.length }}</button>
        </div>
      </div>
    </template>
  </div>
</template>