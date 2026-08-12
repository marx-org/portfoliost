<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { storeToRefs } from "pinia"
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/utils/format"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import PortfolioCard from "@/modules/portfolios/PortfolioCard.vue"
import CashWalletCard from "@/modules/portfolios/CashWalletCard.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"

const store = usePortfolioStore()
const walletsStore = useWalletsStore()
const loading = ref(true)
const error = ref<string | null>(null)

const currencies = ["USD", "EUR", "GBP", "CHF", "PLN"]
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const showCurrencyMenu = ref(false)

const strategies = [
  { value: "GROWTH", label: "Growth" },
  { value: "VALUE", label: "Value" },
  { value: "DIVIDEND_GROWTH", label: "Dividend Growth" },
  { value: "INCOME", label: "Income" },
  { value: "SPECIAL_SITUATIONS", label: "Special Situations" },
  { value: "INDEX_INVESTING", label: "Index Investing" },
  { value: "HEDGING", label: "Hedging" },
  { value: "MOMENTUM", label: "Momentum" },
  { value: "TECHNICAL_TRADING", label: "Technical Trading" },
  { value: "MANAGED", label: "Managed" },
  { value: "DEFENSIVE", label: "Defensive" },
  { value: "AGGRESSIVE", label: "Aggressive" },
  { value: "BALANCED", label: "Balanced" },
]

const cashBreakdown = computed(() => {
  const byCurrency = new Map<string, number>()
  for (const w of walletsStore.wallets) {
    byCurrency.set(w.currency, (byCurrency.get(w.currency) ?? 0) + (w.balance ?? 0))
  }
  const total = [...byCurrency.values()].reduce((s, v) => s + v, 0)
  return [...byCurrency.entries()]
    .map(([currency, balance]) => ({ currency, balance, pct: total > 0 ? (balance / total) * 100 : 0 }))
    .sort((a, b) => b.balance - a.balance)
})

const cashTotal = computed(() => cashBreakdown.value.reduce((s, c) => s + c.balance, 0))
const showCreate = ref(false)
const newPortfolio = ref({ name: "", description: "", strategy: "GROWTH", currency: "USD", walletId: "" })
const creating = ref(false)
const createError = ref<string | null>(null)

const showAddPosition = ref(false)
const addPositionPortfolioId = ref("")

function openAddPosition(portfolioId: string) {
  addPositionPortfolioId.value = portfolioId
  showAddPosition.value = true
}

function closeAddPosition() {
  showAddPosition.value = false
}

const showCreateWallet = ref(false)
const newWallet = ref({ name: "", currency: "USD" })
const creatingWallet = ref(false)
const createWalletError = ref<string | null>(null)

onMounted(async () => {
  try {
    await Promise.all([store.fetchAll(), walletsStore.fetchAll()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load portfolios"
  } finally {
    loading.value = false
  }
})

function setDisplayCurrency(currency: string) {
  displayCurrencyStore.setCurrency(currency)
  showCurrencyMenu.value = false
}

async function submitCreate() {
  if (!newPortfolio.value.name.trim()) return
  creating.value = true
  createError.value = null
  try {
    await store.createPortfolio({
      name: newPortfolio.value.name.trim(),
      description: newPortfolio.value.description.trim() || undefined,
      strategy: newPortfolio.value.strategy,
      currency: newPortfolio.value.currency,
      walletId: newPortfolio.value.walletId || undefined,
    })
    newPortfolio.value = { name: "", description: "", strategy: "GROWTH", currency: "USD", walletId: "" }
    showCreate.value = false
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create portfolio"
  } finally {
    creating.value = false
  }
}

function openCreateWalletFromPortfolio() {
  newWallet.value = { name: "", currency: newPortfolio.value.currency }
  createWalletError.value = null
  showCreateWallet.value = true
}

async function submitCreateWallet() {
  if (!newWallet.value.name.trim()) return
  creatingWallet.value = true
  createWalletError.value = null
  try {
    const created = await walletsStore.create({ name: newWallet.value.name.trim(), currency: newWallet.value.currency })
    newPortfolio.value.walletId = created.id
    newPortfolio.value.currency = created.currency
    newWallet.value = { name: "", currency: "USD" }
    showCreateWallet.value = false
  } catch (err) {
    createWalletError.value = err instanceof Error ? err.message : "Failed to create wallet"
  } finally {
    creatingWallet.value = false
  }
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
      <div class="flex items-center gap-2">
        <div class="card flex items-center gap-2 px-3 py-1.5">
          <span class="text-xs text-slate-500">Cash balance</span>
          <span class="text-sm font-semibold tabular-nums text-slate-900" data-testid="cash-balance">
            {{ formatCurrency(cashTotal) }}
          </span>
          <span v-for="c in cashBreakdown" :key="c.currency" class="text-xs text-slate-500">
            {{ c.currency }} {{ formatPercent(c.pct, 0) }}
          </span>
        </div>
        <div class="relative">
          <button type="button" class="btn-secondary text-sm" @click="showCurrencyMenu = !showCurrencyMenu">
            Display currency: {{ displayCurrency }} ({{ displayCurrency === "USD" ? "$" : displayCurrency === "EUR" ? "€" : displayCurrency === "GBP" ? "£" : displayCurrency === "CHF" ? "Fr" : "zł" }})
            <span class="ml-1 text-xs text-slate-400">▾</span>
          </button>
          <template v-if="showCurrencyMenu">
            <div class="fixed inset-0 z-20" @click="showCurrencyMenu = false"></div>
            <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                v-for="c in currencies"
                :key="c"
                type="button"
                class="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                :class="displayCurrency === c ? 'bg-blue-50 text-blue-700' : 'text-slate-700'"
                @click="setDisplayCurrency(c)"
              >
                {{ c }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <InvestmentsTabs />

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading portfolios...</p>

    <template v-if="store.totalMetrics">
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalMetrics.totalValue, displayCurrency) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Invested</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalMetrics.totalInvested, displayCurrency) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Gain / Loss</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="store.totalMetrics.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatSignedCurrency(store.totalMetrics.totalGainLoss, displayCurrency) }}
          </p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Total Return</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="store.totalMetrics.returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'"
          >
            {{ formatPercent(store.totalMetrics.returnPercentage) }}
          </p>
        </div>
      </div>
    </template>

    <section v-if="!loading" class="mb-10">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Investment Portfolios</h2>
        <span v-if="store.portfolios.length" class="text-sm text-slate-500">{{ store.portfolios.length }}</span>
      </div>

      <div v-if="store.portfolios.length" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PortfolioCard v-for="p in store.portfolios" :key="p.id" :portfolio="p" @add-position="openAddPosition(p.id)" />
      </div>
      <p v-else-if="!error" class="text-sm text-slate-500">No investment portfolios yet.</p>

      <div class="mt-4">
        <button type="button" class="btn-secondary text-sm" @click="showCreate = true">Create Investment Portfolio</button>
      </div>
    </section>

    <section v-if="!loading" class="mb-10">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold">Cash Portfolios</h2>
          <div v-if="walletsStore.wallets.length" class="mt-0.5 flex items-center gap-3 text-sm">
            <span class="text-slate-500">Total Balance</span>
            <span class="font-semibold tabular-nums" data-testid="cash-total-balance">{{ formatCurrency(cashTotal) }}</span>
            <span v-for="c in cashBreakdown" :key="c.currency" class="text-xs text-slate-500">
              {{ c.currency }} {{ formatPercent(c.pct, 0) }}
            </span>
          </div>
        </div>
        <span v-if="walletsStore.wallets.length" class="text-sm text-slate-500">{{ walletsStore.wallets.length }}</span>
      </div>

      <div v-if="walletsStore.wallets.length" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CashWalletCard v-for="w in walletsStore.wallets" :key="w.id" :wallet="w" />
      </div>
      <p v-else-if="!error" class="text-sm text-slate-500">No cash portfolios yet.</p>

      <div class="mt-4">
        <button type="button" class="btn-secondary text-sm" @click="showCreateWallet = true">Create Cash Wallet</button>
      </div>
    </section>

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
          <div class="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label for="portfolio-strategy" class="mb-1 block text-sm text-slate-600">Strategy</label>
              <select id="portfolio-strategy" v-model="newPortfolio.strategy" class="input">
                <option v-for="s in strategies" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
            <div>
              <label for="portfolio-currency" class="mb-1 block text-sm text-slate-600">Currency</label>
              <select id="portfolio-currency" v-model="newPortfolio.currency" class="input">
                <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
          <label for="portfolio-wallet" class="mb-1 block text-sm text-slate-600">Linked wallet</label>
          <div class="mb-4 flex gap-2">
            <select id="portfolio-wallet" v-model="newPortfolio.walletId" class="input flex-1">
              <option value="" disabled>Select a wallet…</option>
              <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">
                {{ w.name }} ({{ w.currency }})
              </option>
            </select>
            <button type="button" class="btn-secondary shrink-0 text-sm" @click="openCreateWalletFromPortfolio">Create wallet</button>
          </div>
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

    <div
      v-if="showCreateWallet"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showCreateWallet = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Create wallet">
        <h3 class="mb-4 text-base font-semibold">Create a cash wallet</h3>
        <form @submit.prevent="submitCreateWallet">
          <label for="wallet-name" class="mb-1 block text-sm text-slate-600">Name</label>
          <input id="wallet-name" v-model="newWallet.name" type="text" required class="input mb-4" placeholder="e.g. USD savings" />
          <label for="wallet-currency" class="mb-1 block text-sm text-slate-600">Currency</label>
          <select id="wallet-currency" v-model="newWallet.currency" class="input mb-4">
            <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
          </select>
          <p v-if="createWalletError" class="mb-3 text-sm text-red-600">{{ createWalletError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreateWallet = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creatingWallet || !newWallet.name.trim()">
              {{ creatingWallet ? "Creating..." : "Create" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <AddPositionDialog :open="showAddPosition" :portfolio-id="addPositionPortfolioId" @close="closeAddPosition" @added="closeAddPosition" />
  </div>
</template>
