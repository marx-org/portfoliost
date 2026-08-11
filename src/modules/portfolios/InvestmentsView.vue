<script setup lang="ts">
import { onMounted, ref } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/utils/format"
import type { PortfoliosSummaries } from "@/api/types"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"

const store = usePortfolioStore()
const loading = ref(true)
const error = ref<string | null>(null)
const showCreate = ref(false)
const newPortfolio = ref({ name: "", description: "" })
const creating = ref(false)
const createError = ref<string | null>(null)

onMounted(async () => {
  try {
    await store.fetchAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load portfolios"
  } finally {
    loading.value = false
  }
})

async function submitCreate() {
  if (!newPortfolio.value.name.trim()) return
  creating.value = true
  createError.value = null
  try {
    await store.createPortfolio({
      name: newPortfolio.value.name.trim(),
      description: newPortfolio.value.description.trim() || undefined,
    })
    newPortfolio.value = { name: "", description: "" }
    showCreate.value = false
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create portfolio"
  } finally {
    creating.value = false
  }
}

function returnClass(p: PortfoliosSummaries[number]): string {
  return (p.metrics?.totalReturn ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Portfolios</h1>
        <p v-if="store.totalMetrics" class="text-sm text-slate-500">
          {{ store.portfolios.length }} portfolio{{ store.portfolios.length === 1 ? "" : "s" }} &middot; base currency
          {{ store.totalMetrics.baseCurrency }}
        </p>
      </div>
      <button type="button" class="btn-primary" @click="showCreate = true">New portfolio</button>
    </div>

    <InvestmentsTabs />

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading portfolios...</p>

    <template v-if="store.totalMetrics">
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalMetrics.totalValue) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Invested</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalMetrics.totalInvested) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Gain / Loss</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="store.totalMetrics.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatSignedCurrency(store.totalMetrics.totalGainLoss) }}
          </p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Return</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="store.totalMetrics.returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatPercent(store.totalMetrics.returnPercentage) }}
          </p>
        </div>
      </div>
    </template>

    <div v-if="!loading && store.portfolios.length" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <router-link
        v-for="p in store.portfolios"
        :key="p.id"
        :to="{ name: 'portfolio-detail', params: { id: p.id } }"
        class="card block p-5 transition-shadow hover:shadow-md"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="truncate font-semibold text-slate-900">{{ p.name }}</h2>
          <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">
            {{ p.strategy }}
          </span>
        </div>
        <p class="mt-1 line-clamp-1 text-sm text-slate-500">{{ p.description || "No description" }}</p>
        <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <p class="text-xs text-slate-500">Value</p>
            <p class="font-medium tabular-nums">{{ formatCurrency(p.currentValue) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500">Invested</p>
            <p class="font-medium tabular-nums">{{ formatCurrency(p.totalInvested) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500">Return</p>
            <p class="font-medium tabular-nums" :class="returnClass(p)">{{ formatPercent(p.metrics?.totalReturn) }}</p>
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-500">
          {{ p.metrics?.openPositions ?? 0 }} open positions &middot; {{ formatNumber(p.metrics?.unrealizedGainLoss) }} unrealized
        </p>
      </router-link>
    </div>

    <p v-else-if="!loading && !error" class="text-sm text-slate-500">No portfolios yet. Create your first portfolio.</p>

    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showCreate = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Create portfolio">
        <h3 class="mb-4 text-base font-semibold">Create a portfolio</h3>
        <form @submit.prevent="submitCreate">
          <label for="portfolio-name" class="mb-1 block text-sm text-slate-600">Name</label>
          <input id="portfolio-name" v-model="newPortfolio.name" type="text" required class="input mb-4" placeholder="e.g. Long-term growth" />
          <label for="portfolio-description" class="mb-1 block text-sm text-slate-600">Description</label>
          <textarea id="portfolio-description" v-model="newPortfolio.description" rows="2" class="input mb-4" placeholder="Optional"></textarea>
          <p v-if="createError" class="mb-3 text-sm text-red-600">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creating || !newPortfolio.name.trim()">
              {{ creating ? "Creating..." : "Create" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
