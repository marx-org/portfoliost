<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import { getInstrumentProfile } from "@/api/instruments"
import { useWatchlistsStore } from "@/stores/watchlists"
import type { InstrumentsProfile } from "@/api/types"

const route = useRoute()
const symbol = computed(() => String(route.params.symbol).toUpperCase())
const watchlists = useWatchlistsStore()
const showSearch = ref(false)
const profile = ref<InstrumentsProfile | null>(null)
const watchlistStatus = ref<string | null>(null)
const watchlistBusy = ref(false)

const tabs = [
  { name: "research-overview", label: "Overview" },
  { name: "research-news", label: "News" },
  { name: "research-fundamentals", label: "Fundamentals" },
  { name: "research-ir", label: "Investor Relations" },
  { name: "research-ownership", label: "Ownership" },
  { name: "research-projections", label: "Projections" },
  { name: "research-compare", label: "Compare" },
  { name: "research-calendar", label: "Calendar" },
  { name: "research-dividends", label: "Dividends" },
]

onMounted(async () => {
  try {
    profile.value = await getInstrumentProfile(symbol.value)
  } catch {
    profile.value = null
  }
})

const inWatchlist = computed(() =>
  watchlists.watchlists.some((w) => w.items?.some((i) => i.symbol?.toUpperCase() === symbol.value)),
)

async function addToWatchlist(): Promise<void> {
  watchlistBusy.value = true
  watchlistStatus.value = null
  try {
    if (!watchlists.watchlists.length) {
      await watchlists.fetchAll()
    }
    if (!watchlists.watchlists.length) {
      await watchlists.create("My Watchlist")
    }
    const target = watchlists.watchlists[0]
    const already = target.items?.some((i) => i.symbol?.toUpperCase() === symbol.value)
    if (!already) {
      await watchlists.addItem(target.id, symbol.value)
    }
    watchlistStatus.value = `Added ${symbol.value} to ${target.name}`
  } catch (err) {
    watchlistStatus.value = err instanceof Error ? err.message : "Failed to add to watchlist"
  } finally {
    watchlistBusy.value = false
    setTimeout(() => (watchlistStatus.value = null), 3000)
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <router-link to="/en/investments" class="btn-ghost">&larr; Go back</router-link>
      <img :src="`/api/logos/${symbol}`" :alt="symbol" class="h-9 w-9 rounded-full bg-slate-100" />
      <div>
        <h1 class="text-2xl font-semibold">{{ symbol }}</h1>
        <p v-if="profile?.name" class="text-sm text-slate-500">{{ profile.name }}</p>
      </div>
      <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{{ symbol }}.US</span>
      <button
        type="button"
        class="btn-secondary ml-auto text-sm"
        :disabled="watchlistBusy || inWatchlist"
        @click="addToWatchlist"
      >
        {{ inWatchlist ? "In Watchlist" : "Add to Watchlist" }}
      </button>
      <button class="btn-ghost" @click="showSearch = true">Search for a stock... &#8984;K</button>
    </div>

    <p v-if="watchlistStatus" class="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{{ watchlistStatus }}</p>

    <nav aria-label="Research tabs" class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name, params: { symbol } }"
        class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        :class="route.name === tab.name ? 'border-blue-600 text-blue-700' : 'border-transparent'"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />

    <InstrumentSearchModal :open="showSearch" @close="showSearch = false" />
  </div>
</template>
