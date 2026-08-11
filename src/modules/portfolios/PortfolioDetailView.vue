<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/utils/format"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const loading = ref(true)
const error = ref<string | null>(null)

const tabs = [
  { name: "portfolio-holdings", label: "Holdings" },
  { name: "portfolio-transactions", label: "Transactions" },
  { name: "portfolio-analytics", label: "Analytics" },
  { name: "portfolio-allocation", label: "Allocation" },
  { name: "portfolio-risk", label: "Risk" },
  { name: "portfolio-dividends", label: "Dividends" },
  { name: "portfolio-calendar", label: "Calendar" },
  { name: "portfolio-news", label: "News" },
  { name: "portfolio-compare", label: "Compare" },
]

onMounted(load)

watch(
  () => route.params.id,
  () => load(),
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await store.fetchDetail(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load portfolio"
  } finally {
    loading.value = false
  }
}

const portfolioName = computed(() => store.detail?.name ?? store.portfolios.find((p) => p.id === id)?.name ?? "Portfolio")
const strategy = computed(() => store.detail?.strategy ?? store.portfolios.find((p) => p.id === id)?.strategy ?? "—")
const description = computed(() => store.detail?.description ?? store.portfolios.find((p) => p.id === id)?.description ?? "No description")

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}
</script>

<template>
  <div>
    <router-link to="/en/investments" class="btn-ghost mb-4">&larr; All portfolios</router-link>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading portfolio...</p>

    <template v-if="!loading && !error">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-semibold">{{ portfolioName }}</h1>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">{{ strategy }}</span>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{ description }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary text-sm">Share</button>
          <button type="button" class="btn-secondary text-sm">Rename</button>
          <button type="button" class="btn-primary text-sm">Add Position</button>
          <button type="button" class="btn-ghost text-sm text-red-600">Delete</button>
        </div>
      </div>

      <div v-if="store.summaryMetrics" class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div class="card p-4">
          <p class="text-sm text-slate-500">Total Value</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ formatCurrency(store.summaryMetrics.totalValue) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Total Invested</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ formatCurrency(store.summaryMetrics.totalInvested) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Return</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.simpleReturnPercent)">
            {{ formatPercent(store.summaryMetrics.simpleReturnPercent) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Unrealized P/L</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.unrealizedGainLoss)">
            {{ formatSignedCurrency(store.summaryMetrics.unrealizedGainLoss) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Realized</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.realizedGain)">
            {{ formatSignedCurrency(store.summaryMetrics.realizedGain) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Day Change</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(store.summaryMetrics.dayChangeAmount)">
            {{ formatSignedCurrency(store.summaryMetrics.dayChangeAmount) }}
            <span class="text-xs font-normal" :class="gainClass(store.summaryMetrics.dayChangePercent)">
              ({{ formatPercent(store.summaryMetrics.dayChangePercent) }})
            </span>
          </p>
        </div>
      </div>

      <nav aria-label="Portfolio tabs" class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        <router-link
          v-for="tab in tabs"
          :key="tab.name"
          :to="{ name: tab.name, params: { id } }"
          class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          :class="route.name === tab.name ? 'border-blue-600 text-blue-700' : 'border-transparent'"
        >
          {{ tab.label }}
        </router-link>
      </nav>

      <router-view />
    </template>
  </div>
</template>
