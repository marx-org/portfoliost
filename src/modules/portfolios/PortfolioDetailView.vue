<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useCurrenciesStore } from "@/stores/currencies"
import { storeToRefs } from "pinia"
import { deletePortfolio, updatePortfolio } from "@/api/portfolios"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"
import TransferSharesDialog from "@/modules/portfolios/TransferSharesDialog.vue"
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

const isVirtual = computed(() => Boolean(store.detail?.isVirtual))
const tabs = computed(() => [
  { name: "portfolio-holdings", label: "Holdings" },
  ...(isVirtual.value ? [] : [{ name: "portfolio-cash", label: "Cash" }]),
  { name: "portfolio-transactions", label: "Transactions" },
  { name: "portfolio-performance", label: "Performance" },
  { name: "portfolio-allocation", label: "Allocation" },
  { name: "portfolio-risk-analysis", label: "Risk Analysis" },
  { name: "portfolio-dividends", label: "Dividends" },
  { name: "portfolio-calendar", label: "Calendar" },
  { name: "portfolio-news", label: "News" },
  { name: "portfolio-compare", label: "Compare" },
])

// §87.5 — the dialog is now "Portfolio settings": the name plus the UI-only
// cash-leg switch and the cash-base-currency policy. The aria-label stays
// "Rename portfolio" — tests/e2e/parity-portfolios.spec.ts:87 selects the dialog by
// that name, and a renamed label is a gratuitous e2e break for no user gain.
const showRename = ref(false)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const showAddPosition = ref(false)
/** §74 — in-kind transfer of a holding to another portfolio. */
const showTransferShares = ref(false)

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

/** §74 — the legs are written on the server; refresh so the holdings and the
 * transactions tab show the movement. The dialog stays open to show its own
 * confirmation line; the user closes it. */
async function onTransferDone() {
  await store.fetchDetail(id)
  // The Holdings table reads store.positions, which only fetchPositions
  // refreshes — without this the source table keeps showing the lot that left.
  // Labels are filtered client-side too, so dropping the query filter here is
  // safe.
  await store.fetchPositions(id)
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

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted">Loading portfolio...</p>

    <template v-if="!loading && !error">
      <div class="page-header">
        <div>
          <p class="page-eyebrow"><span class="signal-dot" /> PORTFOLIOS</p>
          <h1 class="page-title">{{ portfolioName }}</h1>
          <p class="page-description">{{ description }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary text-sm">Share</button>
          <div class="relative">
            <button type="button" class="btn-secondary text-sm" @click="showCurrencyMenu = !showCurrencyMenu">
              Display currency: {{ displayCurrency }} ({{ currenciesStore.info(displayCurrency)?.symbol ?? "" }})
            </button>
            <template v-if="showCurrencyMenu">
              <div class="fixed inset-0 z-20" @click="showCurrencyMenu = false"></div>
              <div class="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-border bg-white dark:bg-slate-900 py-1 shadow-lg">
                <button
                  v-for="c in currencies"
                  :key="c"
                  type="button"
                  class="block w-full px-4 py-2 text-left text-sm hover:bg-surface-2 dark:hover:bg-slate-800/50"
                  :class="displayCurrency === c ? 'bg-accent-soft text-accent-text' : 'text-text'"
                  @click="setDisplayCurrency(c)"
                >
                  {{ c }}
                </button>
              </div>
            </template>
          </div>
          <button type="button" class="btn-secondary text-sm" @click="openRename">Rename</button>
          <button v-if="!isVirtual" type="button" class="btn-secondary text-sm" data-testid="transfer-shares-button" @click="showTransferShares = true">Transfer shares</button>
           <button v-if="!isVirtual" type="button" class="btn-primary text-sm" @click="openAddPosition">Add Position</button>
          <button type="button" class="btn-red-ghost text-sm" @click="openDelete">Delete</button>
        </div>
      </div>

      <nav aria-label="Portfolio tabs" class="tab-nav mb-6">
        <router-link
          v-for="tab in tabs"
          :key="tab.name"
          :to="{ name: tab.name, params: { id } }"
          class="tab-link"
          :class="route.name === tab.name ? 'tab-link--active' : ''"
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
      :cash-base-currency-only="store.detail?.cashBaseCurrencyOnly ?? false"
      :cash-currency="store.detail?.cashCurrency ?? null"
      :is-virtual="isVirtual"
      :label-id="store.detail?.labelId"
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
        <p class="text-sm text-muted">Delete "{{ portfolioName }}" and its positions? This cannot be undone.</p>
        <p v-if="deleteError" class="mb-3 mt-2 text-sm text-danger">{{ deleteError }}</p>
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

    <TransferSharesDialog
      :open="showTransferShares"
      :portfolio-id="id"
      @close="showTransferShares = false"
      @done="onTransferDone"
    />
  </div>
</template>
