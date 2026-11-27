<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import TickerBadge from "@/components/TickerBadge.vue"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import RecentSearchesBar from "@/modules/instruments/RecentSearchesBar.vue"
import { getInstrumentProfile } from "@/api/instruments"
import { researchBackTarget, researchSymbol } from "@/utils/research"
import { useWatchlistsStore } from "@/stores/watchlists"
import { useRecentSearchesStore } from "@/stores/recentSearches"
import type { InstrumentsProfile } from "@/api/types"

const route = useRoute()
const router = useRouter()
const routeSymbol = computed(() => String(route.params.symbol).toUpperCase())
const watchlists = useWatchlistsStore()
const recentSearches = useRecentSearchesStore()
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

const backTarget = computed(() => researchBackTarget(route.query))
const preservedQuery = computed(() =>
  route.query.from ? { from: String(route.query.from) } : undefined,
)

function goToSymbol(s: string) {
  router.push({
    name: String(route.name),
    params: { symbol: researchSymbol(s) },
    query: preservedQuery.value,
  })
}

onMounted(async () => {
  void recentSearches.load()
  try {
    profile.value = await getInstrumentProfile(routeSymbol.value)
  } catch {
    profile.value = null
  }
})

// Same-route navigation (quick switcher / search) only changes the param —
// refetch the header profile when it does.
watch(routeSymbol, async (sym) => {
  profile.value = null
  try {
    profile.value = await getInstrumentProfile(sym)
  } catch {
    profile.value = null
  }
})

const inWatchlist = computed(() =>
  watchlists.watchlists.some((w) => w.items?.some((i) => i.symbol?.toUpperCase() === routeSymbol.value)),
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
    const already = target.items?.some((i) => i.symbol?.toUpperCase() === routeSymbol.value)
    if (!already) {
      await watchlists.addItem(target.id, routeSymbol.value)
    }
    watchlistStatus.value = `Added ${routeSymbol.value} to ${target.name}`
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
    <div class="page-header">
      <div class="flex flex-wrap items-center gap-3">
        <router-link :to="backTarget" class="btn-ghost" data-testid="research-back">&larr; Go back</router-link>
        <TickerBadge
          size="lg"
          title-as="h1"
          testid="research-ticker"
          :symbol="routeSymbol"
          :name="profile?.name"
          :country-code="profile?.countryCode"
          :asset-type="profile?.assetType"
        />
      </div>
      <div class="page-actions">
        <button
          type="button"
          class="btn-secondary text-sm"
          :disabled="watchlistBusy || inWatchlist"
          @click="addToWatchlist"
        >
          {{ inWatchlist ? "In Watchlist" : "Add to Watchlist" }}
        </button>
        <button class="btn-ghost" @click="showSearch = true">Search for a stock... &#8984;K</button>
      </div>
    </div>

    <p v-if="watchlistStatus" class="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-text">{{ watchlistStatus }}</p>

    <RecentSearchesBar class="mb-6" :active-symbol="routeSymbol" @select="goToSymbol" />

    <nav aria-label="Research tabs" class="tab-nav mb-6">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name, params: { symbol: routeSymbol }, query: preservedQuery }"
        class="tab-link"
        :class="route.name === tab.name ? 'tab-link--active' : ''"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view :key="routeSymbol" />

    <InstrumentSearchModal :open="showSearch" @close="showSearch = false" />
  </div>
</template>
