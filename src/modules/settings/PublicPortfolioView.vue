<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPublicPortfolioShare } from "@/api/portfolios"
import { researchRoute } from "@/utils/research"
import TickerBadge from "@/components/TickerBadge.vue"
import type { PublicPortfolioShare } from "@/api/portfolios"

const route = useRoute()
const data = ref<PublicPortfolioShare | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await getPublicPortfolioShare(route.params.shareId as string)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "This shared portfolio could not be loaded"
  } finally {
    loading.value = false
  }
}

onMounted(load)

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const showValues = () => data.value?.share.privacySettings.showValues ?? false
const showHoldings = () => data.value?.share.privacySettings.showHoldings ?? false

const totalValue = () =>
  (data.value?.portfolio.positions ?? []).reduce((sum, p) => sum + p.marketValue, 0)
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-800/50">
    <div class="mx-auto max-w-3xl px-4 py-10">
      <div class="mb-6 flex items-center gap-2">
        <img src="/favicon.svg" alt="Portfoliost" class="h-6 w-6" />
        <span class="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">Portfoliost</span>
        <span class="rounded-full bg-slate-200 dark:bg-slate-700/70 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">Shared portfolio</span>
      </div>

      <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading shared portfolio...</p>
      <div v-else-if="error" class="card p-8 text-center">
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">Link not available</p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ error }}</p>
      </div>

      <template v-else-if="data">
        <div class="card p-6">
          <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ data.share.displayName || data.portfolio.name }}</h1>
          <p v-if="showValues()" class="mt-1 text-sm text-slate-500 dark:text-slate-400">Total value: <span class="font-semibold text-slate-900 dark:text-slate-100">{{ money.format(totalValue()) }}</span></p>
        </div>

        <div v-if="showHoldings() && data.portfolio.positions.length" class="card mt-6 overflow-hidden p-0">
          <div class="border-b border-slate-200 dark:border-slate-700/60 px-6 py-4">
            <h2 class="text-base font-semibold">Holdings</h2>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th class="px-6 py-2 font-medium">Symbol</th>
                <th class="px-6 py-2 text-right font-medium">Quantity</th>
                <th v-if="showValues()" class="px-6 py-2 text-right font-medium">Current price</th>
                <th v-if="showValues()" class="px-6 py-2 text-right font-medium">Market value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="p in data.portfolio.positions" :key="p.symbol">
                <!-- §85.5 — the share's tickers link to research, with the share
                     page as `from`. §85.1 is what lets `researchBackTarget`
                     honour that: without the `/public/` prefix the `from` would
                     be discarded and "Go back" would drop the share context.

                     The link is deliberately NOT hidden on auth state. A
                     router-link renders an <a> either way, and the SPA cannot
                     know who holds the share — hiding it would make the page
                     differ per viewer. A logged-out visitor follows it to
                     /login?redirect=…; the owner, who is signed in, lands on
                     the research page and can come straight back.

                     The share schema carries only `symbol`, so the badge
                     degrades to logo + ticker, which is its documented
                     behaviour for a missing name/country/assetType. -->
                <td class="px-6 py-2 font-medium text-slate-900 dark:text-slate-100">
                  <router-link :to="researchRoute(p.symbol, route.fullPath)" class="inline-block">
                    <TickerBadge size="sm" :symbol="p.symbol" />
                  </router-link>
                </td>
                <td class="px-6 py-2 text-right text-slate-600 dark:text-slate-300">{{ p.quantity }}</td>
                <td v-if="showValues()" class="px-6 py-2 text-right text-slate-600 dark:text-slate-300">{{ money.format(p.currentPrice) }}</td>
                <td v-if="showValues()" class="px-6 py-2 text-right text-slate-900 dark:text-slate-100">{{ money.format(p.marketValue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="showHoldings()" class="card mt-6 p-8 text-center">
          <p class="text-sm text-slate-500 dark:text-slate-400">The owner hasn't shared any holdings for this portfolio.</p>
        </div>

        <div v-else class="card mt-6 p-8 text-center">
          <p class="text-sm text-slate-500 dark:text-slate-400">Holdings are hidden for this shared portfolio.</p>
        </div>

      </template>
    </div>
  </div>
</template>
