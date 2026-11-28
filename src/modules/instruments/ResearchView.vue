<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
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
const { t } = useI18n()
const routeSymbol = computed(() => String(route.params.symbol).toUpperCase())
const watchlists = useWatchlistsStore()
const recentSearches = useRecentSearchesStore()
const showSearch = ref(false)
const profile = ref<InstrumentsProfile | null>(null)
const watchlistStatus = ref<string | null>(null)
const watchlistBusy = ref(false)

const tabs = computed(() => [
  { name: "research-overview", label: t("research.tabOverview") },
  { name: "research-news", label: t("research.tabNews") },
  { name: "research-fundamentals", label: t("research.tabFundamentals") },
  { name: "research-ir", label: t("research.tabIr") },
  { name: "research-ownership", label: t("research.tabOwnership") },
  { name: "research-projections", label: t("research.tabProjections") },
  { name: "research-compare", label: t("research.tabCompare") },
  { name: "research-calendar", label: t("research.tabCalendar") },
  { name: "research-dividends", label: t("research.tabDividends") },
])

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
      await watchlists.create(t("research.myWatchlist"))
    }
    const target = watchlists.watchlists[0]
    const already = target.items?.some((i) => i.symbol?.toUpperCase() === routeSymbol.value)
    if (!already) {
      await watchlists.addItem(target.id, routeSymbol.value)
    }
    watchlistStatus.value = t("research.addedToWatchlist", { symbol: routeSymbol.value, name: target.name })
  } catch (err) {
    watchlistStatus.value = err instanceof Error ? err.message : t("research.addWatchlistError")
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
        <router-link :to="backTarget" class="btn-ghost" data-testid="research-back">{{ t("research.goBack") }}</router-link>
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
          {{ inWatchlist ? t("research.inWatchlist") : t("research.addToWatchlist") }}
        </button>
        <button class="btn-ghost" @click="showSearch = true">{{ t("research.searchStock") }}</button>
      </div>
    </div>

    <p v-if="watchlistStatus" class="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-text">{{ watchlistStatus }}</p>

    <RecentSearchesBar class="mb-6" :active-symbol="routeSymbol" @select="goToSymbol" />

    <nav :aria-label="t('research.researchTabs')" class="tab-nav mb-6">
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
