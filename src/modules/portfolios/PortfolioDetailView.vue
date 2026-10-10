<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { useCurrenciesStore } from "@/stores/currencies"
import { storeToRefs } from "pinia"
import { deletePortfolio, updatePortfolio } from "@/api/portfolios"
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/utils/format"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import PortfolioSettingsDialog, { type PortfolioSettingsPayload } from "@/modules/portfolios/PortfolioSettingsDialog.vue"

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const displayCurrencyStore = useDisplayCurrencyStore()
const currenciesStore = useCurrenciesStore()
if (!currenciesStore.loaded) void currenciesStore.load()
const id = String(route.params.id)
const loading = ref(true)
const error = ref<string | null>(null)

const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const showCurrencyMenu = ref(false)
const currencies = computed(() => currenciesStore.options.map((currency) => currency.code))

const tabs = [
  { name: "portfolio-holdings", label: "Holdings" },
  { name: "portfolio-cash", label: "Cash" },
  { name: "portfolio-transactions", label: "Transactions" },
  { name: "portfolio-performance", label: "Performance" },
  { name: "portfolio-allocation", label: "Allocation" },
  { name: "portfolio-risk-analysis", label: "Risk Analysis" },
  { name: "portfolio-dividends", label: "Dividends" },
  { name: "portfolio-calendar", label: "Calendar" },
  { name: "portfolio-news", label: "News" },
  { name: "portfolio-compare", label: "Compare" },
]

// §87.5 — the dialog is now "Portfolio settings": the name plus the UI-only
// "generate a cash transaction on buy/sell" switch. The aria-label stays
// "Rename portfolio" — tests/e2e/parity-portfolios.spec.ts:87 selects the dialog by
// that name, and a renamed label is a gratuitous e2e break for no user gain.
const showRename = ref(false)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const showAddPosition = ref(false)

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
const description = computed(() => store.detail?.description ?? store.portfolios.find((p) => p.id === id)?.description ?? "No description")

// §48.6e B3 umbrella (B2 residual, 2026-09-23) — summaryMetrics are
// denominated in the portfolio baseCurrency (wallets `summary_metrics`);
// convert to the display currency once via getLatestRate (never a
// mislabelled amount). Pending cross-currency rate renders "—"; an
// unresolvable pair degrades to 1:1 (§48.3).
//
// §67.2 — this was a FOURTH copy of the same base→display conversion, and the
// only one that DEGRADED an unresolvable pair to 1:1 (`: 1` in the old
// watchEffect). That defeated the `summaryPending` gate right below it: a failed
// rate made `summaryRate` 1, so `summaryPending` went false and the template
// rendered native portfolio-currency values under the DISPLAY currency's symbol
// — precisely the mislabelled amount §66.2 forbids. useDisplayConversion leaves
// the rate null instead, so the existing `—` path does its job.
const { rate: summaryRate } = useDisplayConversion(() => store.detail?.baseCurrency)
const summaryPending = computed(() => {
  const src = (store.detail?.baseCurrency ?? "").toUpperCase()
  return !!src && src !== displayCurrency.value.toUpperCase() && summaryRate.value === null
})
const summary = computed(() => {
  const m = store.summaryMetrics
  if (!m) return null
  const rate = summaryRate.value ?? 1
  return {
    ...m,
    totalValue: m.totalValue * rate,
    capitalBasis: m.capitalBasis * rate,
    unrealizedGainLoss: m.unrealizedGainLoss * rate,
    realizedGain: m.realizedGain * rate,
    cumulativeDividends: m.cumulativeDividends * rate,
  }
})

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function openRename() {
  renameError.value = null
  showRename.value = true
}

async function submitRename(settings: PortfolioSettingsPayload) {
  renameBusy.value = true
  renameError.value = null
  try {
    await updatePortfolio(id, settings)
    showRename.value = false
    await Promise.all([store.fetchAll(), store.fetchDetail(id)])
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : "Failed to rename portfolio"
  } finally {
    renameBusy.value = false
  }
}

function openDelete() {
  deleteError.value = null
  showDeleteConfirm.value = true
}

function setDisplayCurrency(currency: string) {
  displayCurrencyStore.setCurrency(currency)
  showCurrencyMenu.value = false
}

function openAddPosition() {
  showAddPosition.value = true
}

function onAddPositionClose() {
  showAddPosition.value = false
}

async function onAddPositionAdded() {
  await store.fetchDetail(id)
}

async function submitDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deletePortfolio(id)
    showDeleteConfirm.value = false
    await store.fetchAll()
    router.push({ name: "investments" })
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete portfolio"
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div>
    <router-link to="/en/investments" class="btn-ghost mb-4">&larr; All portfolios</router-link>

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading portfolio...</p>

    <template v-if="!loading && !error">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-semibold">{{ portfolioName }}</h1>
          </div>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ description }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary text-sm">Share</button>
          <div class="relative">
            <button type="button" class="btn-secondary text-sm" @click="showCurrencyMenu = !showCurrencyMenu">
              Display currency: {{ displayCurrency }} ({{ currenciesStore.info(displayCurrency)?.symbol ?? "" }})
            </button>
            <template v-if="showCurrencyMenu">
              <div class="fixed inset-0 z-20" @click="showCurrencyMenu = false"></div>
              <div class="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 py-1 shadow-lg">
                <button
                  v-for="c in currencies"
                  :key="c"
                  type="button"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  :class="displayCurrency === c ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'"
                  @click="setDisplayCurrency(c)"
                >
                  {{ c }}
                </button>
              </div>
            </template>
          </div>
          <button type="button" class="btn-secondary text-sm" @click="openRename">Rename</button>
          <button type="button" class="btn-primary text-sm" @click="openAddPosition">Add Position</button>
          <button type="button" class="btn-red-ghost text-sm" @click="openDelete">Delete</button>
        </div>
      </div>

      <div v-if="summary" class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total Value</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ summaryPending ? "—" : formatCurrency(summary.totalValue, displayCurrency) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total Invested</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ summaryPending ? "—" : formatCurrency(summary.capitalBasis, displayCurrency) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Return</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(summary.simpleReturnPercent)">
            {{ formatPercent(summary.simpleReturnPercent) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Unrealized P/L</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(summary.unrealizedGainLoss)">
            {{ summaryPending ? "—" : formatSignedCurrency(summary.unrealizedGainLoss, displayCurrency) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Realized</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(summary.realizedGain)">
            {{ summaryPending ? "—" : formatSignedCurrency(summary.realizedGain, displayCurrency) }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500 dark:text-slate-400">Income</p>
          <p class="mt-1 text-xl font-semibold tabular-nums" :class="gainClass(summary.cumulativeDividends)">
            {{ summaryPending ? "—" : formatSignedCurrency(summary.cumulativeDividends, displayCurrency) }}
          </p>
        </div>
      </div>

      <nav aria-label="Portfolio tabs" class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700/60">
        <router-link
          v-for="tab in tabs"
          :key="tab.name"
          :to="{ name: tab.name, params: { id } }"
          class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          :class="route.name === tab.name ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent'"
        >
          {{ tab.label }}
        </router-link>
      </nav>

      <router-view />
    </template>

    <PortfolioSettingsDialog
      :open="showRename"
      :name="portfolioName"
      :base-currency="store.detail?.baseCurrency ?? ''"
      :cash-leg-on-trade="store.detail?.cashLegOnTrade ?? false"
      :busy="renameBusy"
      :error="renameError"
      @close="showRename = false"
      @submit="submitRename"
    />

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showDeleteConfirm = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete portfolio">
        <h3 class="mb-4 text-base font-semibold">Delete portfolio</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Delete "{{ portfolioName }}" and its positions? This cannot be undone.</p>
        <p v-if="deleteError" class="mb-3 mt-2 text-sm text-red-600 dark:text-red-400">{{ deleteError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button type="button" class="btn-danger" :disabled="deleteBusy" @click="submitDelete">
            {{ deleteBusy ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>

    <AddPositionDialog
      :open="showAddPosition"
      :portfolio-id="id"
      @close="onAddPositionClose"
      @added="onAddPositionAdded"
    />
  </div>
</template>
