<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { usePortfolioFreshness, usePortfolioValues } from "@/stores/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"
import { storeToRefs } from "pinia"
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/utils/format"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import PortfolioCard from "@/modules/portfolios/PortfolioCard.vue"
import AddPositionDialog from "@/modules/portfolios/AddPositionDialog.vue"

const store = usePortfolioStore()
const loading = ref(true)
const error = ref<string | null>(null)

// D26: every currency selector is fed exclusively by the /api/currencies registry
const currenciesStore = useCurrenciesStore()
if (!currenciesStore.loaded) void currenciesStore.load()
const currencies = computed(() => currenciesStore.options.map((c) => c.code))
const currencySymbol = (code: string) => currenciesStore.info(code)?.symbol ?? code
const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)
const showCurrencyMenu = ref(false)

// §67.2 — the base→display conversion now comes from the ONE implementation
// (useDisplayConversion, §66.3) instead of a second copy of the same
// getLatestRate watchEffect. Source is the aggregate's own baseCurrency, exactly
// as before, so this is a dedup and not a behaviour change.
const { convert: toDisplay } = useDisplayConversion(
  () => store.totalMetrics?.baseCurrency,
)

// §68.4 — Total Gain/Loss and Total Return are now DERIVED from the same
// (totalValue, capitalBasis) pair the tiles show, in the aggregate base currency
// and only then converted — which is what the backend does, so converting first
// and subtracting would drift by the rounding. Previously all six figures were
// read independently off the response and could disagree.
/**
 * §70.2 — the headline says how complete and how fresh it is.
 *
 * Two things can make the total wrong in ways a bare number cannot convey:
 *
 *  - UNPRICED positions. They are excluded from `instrumentsValue` (they are not
 *    valued at cost — see plan §70), so the total is an UNDERSTATEMENT and the
 *    gap has to be visible.
 *  - STALE prices. `priceAsOf` is the OLDEST contributing price, so "as of" here
 *    is the age of the least fresh input, not the freshest. Without this the
 *    total silently reads as current.
 */
const priceNote = computed(() => {
  const tm = store.totalMetrics
  if (!tm) return null
  const unpriced = tm.unpricedPositions ?? 0
  const asOf = tm.priceAsOf ? new Date(tm.priceAsOf) : null
  const stale = asOf ? Date.now() - asOf.getTime() > 6 * 60 * 60 * 1000 : false
  return {
    unpriced,
    asOf,
    stale,
    fallback: tm.priceSource === "fallback",
  }
})

const derived = computed(() => {
  const tm = store.totalMetrics
  const totalValue = tm?.totalValue ?? 0
  const capitalBasis = tm?.capitalBasis ?? 0
  const gainLoss = totalValue - capitalBasis
  return {
    gainLoss,
    returnPercentage: capitalBasis > 0 ? (gainLoss / capitalBasis) * 100 : 0,
  }
})

const freshnessById = usePortfolioFreshness()
// §63.3 — each card renders its Value/Invested/Return from the SAME breakdown row
// the headline is summed from, so Σ cards == headline by construction. The cards
// previously read `portfolio.currentValue` (backfill bars) against a headline read
// from live quotes, which is one number with two sources; PROD measured a
// 1,944.85 PLN disagreement across the ten cards on 2026-10-01.
const valuesById = usePortfolioValues()

// §62 — the "Cash balance" card is the portfolio-native cash position:
// `totalMetrics.cashValue` (already converted to the totalMetrics base currency)
// re-expressed into the display currency, with per-currency shares from
// `totalMetrics.cashBreakdown` `weight`.
const cashTotal = ref<number | null>(null)
const cashBreakdown = ref<Array<{ currency: string; pct: number }>>([])

watchEffect(() => {
  const tm = store.totalMetrics
  // cashValue is in totalMetrics.baseCurrency; re-express into the display
  // currency via the one shared base→display conversion. "—" while the rate
  // resolves (a mislabelled amount is never shown).
  cashTotal.value = toDisplay(tm?.cashValue)
  const byCurrency = new Map<string, number>()
  for (const c of tm?.cashBreakdown ?? []) {
    const ccy = (c.currency ?? "").toUpperCase()
    if (!ccy) continue
    byCurrency.set(ccy, (byCurrency.get(ccy) ?? 0) + (c.weight ?? 0))
  }
  cashBreakdown.value = [...byCurrency.entries()]
    .map(([currency, pct]) => ({ currency, pct }))
    .sort((a, b) => b.pct - a.pct)
})
const showCreate = ref(false)
const newPortfolio = ref({ name: "", description: "", currency: "USD" })
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

onMounted(async () => {
  // §67.1 — adopt the server-side display-currency preference when this browser
  // has never chosen one, so the choice follows the user across devices. The
  // selector writes through to the same field when they do pick one.
  void displayCurrencyStore.hydrateFromServer()
  try {
    await store.fetchAll()
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
      currency: newPortfolio.value.currency,
    })
    newPortfolio.value = { name: "", description: "", currency: "USD" }
    showCreate.value = false
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create portfolio"
  } finally {
    creating.value = false
  }
}
</script>

<template>

  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Portfolios</h1>
        <p v-if="store.totalMetrics" class="text-sm text-slate-500 dark:text-slate-400">
          {{ store.portfolios.length }} portfolio{{ store.portfolios.length === 1 ? "" : "s" }} &middot; base currency
          {{ store.totalMetrics.baseCurrency }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="card flex items-center gap-2 px-3 py-1.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Cash balance</span>
          <span class="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100" data-testid="cash-balance">
            {{ formatCurrency(cashTotal, displayCurrency) }}
          </span>
          <span v-for="c in cashBreakdown" :key="c.currency" class="text-xs text-slate-500 dark:text-slate-400">
            {{ c.currency }} {{ formatPercent(c.pct, 0) }}
          </span>
        </div>
        <div class="relative">
          <button type="button" class="btn-secondary text-sm" @click="showCurrencyMenu = !showCurrencyMenu">
            Display currency: {{ displayCurrency }} ({{ currencySymbol(displayCurrency) }})
            <span class="ml-1 text-xs text-slate-400 dark:text-slate-500">▾</span>
          </button>
          <template v-if="showCurrencyMenu">
            <div class="fixed inset-0 z-20" @click="showCurrencyMenu = false"></div>
            <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700/60 dark:bg-slate-900">
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

    <!-- §70.2 — completeness and freshness of the headline, stated rather than
         implied. Rendered only when there is something to say, so a healthy
         total stays clean. -->
    <p
      v-if="priceNote && (priceNote.unpriced > 0 || priceNote.stale || priceNote.fallback)"
      class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
      data-testid="price-freshness-note"
    >
      <template v-if="priceNote.unpriced > 0">
        <strong>{{ priceNote.unpriced }}</strong> position{{ priceNote.unpriced === 1 ? "" : "s" }}
        could not be priced and {{ priceNote.unpriced === 1 ? "is" : "are" }} excluded from these
        figures &mdash; they are <em>not</em> valued at what you paid for them.
      </template>
      <template v-if="priceNote.stale && priceNote.asOf">
        <br />
        Priced as of {{ priceNote.asOf.toLocaleString() }} (the oldest price behind these totals).
      </template>
      <template v-if="priceNote.fallback">
        <br />
        Some prices are carried over from a previous fetch, not live.
      </template>
    </p>

    <InvestmentsTabs />

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading portfolios...</p>

    <template v-if="store.totalMetrics">
      <!-- §68 — cash is a first-class citizen. Four tiles, each labelled with what
           it is, in the order the user asked for. Total = Cash + Instruments, and
           the two derived figures come from the same pair. -->
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="headline-tiles">
        <div class="card p-5" data-testid="tile-cash">
          <p class="text-sm text-slate-500 dark:text-slate-400">Cash value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="tile-cash-value">
            {{ formatCurrency(toDisplay(store.totalMetrics.cashValue), displayCurrency) }}
          </p>
        </div>
        <div class="card p-5" data-testid="tile-instruments">
          <p class="text-sm text-slate-500 dark:text-slate-400">Instruments value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="tile-instruments-value">
            {{ formatCurrency(toDisplay(store.totalMetrics.instrumentsValue), displayCurrency) }}
          </p>
        </div>
        <div class="card p-5" data-testid="tile-total">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total value</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="tile-total-value">
            {{ formatCurrency(toDisplay(store.totalMetrics.totalValue), displayCurrency) }}
          </p>
        </div>
        <div class="card p-5" data-testid="tile-invested">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total invested</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="tile-invested-value">
            {{ formatCurrency(toDisplay(store.totalMetrics.capitalBasis), displayCurrency) }}
          </p>
        </div>
        <div class="card p-5" data-testid="tile-gainloss">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total gain / loss</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="derived.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'"
            data-testid="tile-gainloss-value"
          >
            {{ formatSignedCurrency(toDisplay(derived.gainLoss), displayCurrency) }}
          </p>
        </div>
        <div class="card p-5" data-testid="tile-return">
          <p class="text-sm text-slate-500 dark:text-slate-400">Total return</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="derived.returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'"
            data-testid="tile-return-value"
          >
            {{ formatPercent(derived.returnPercentage) }}
          </p>
        </div>
      </div>
    </template>

    <!-- §83.6 — the combined chart MOVED to /en/investments/performance, which
         renders the same endpoint through the same chart component as the rest of
         the Performance tab. Leaving it here would put the same curve on two
         adjacent pages, and only one of them would have the TWR, MWR, timing and
         drawdown numbers beside it. -->
    <div class="card mb-6 flex flex-wrap items-center justify-between gap-3 p-6">
      <div>
        <h2 class="text-base font-semibold">Portfolio performance</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Value, returns and drawdown across all {{ store.portfolios.length }} portfolios.
        </p>
      </div>
      <router-link to="/en/investments/performance" class="btn-primary text-sm" data-testid="combined-chart-link">
        Open performance
      </router-link>
    </div>

    <section v-if="!loading" class="mb-10">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Investment Portfolios</h2>
        <span v-if="store.portfolios.length" class="text-sm text-slate-500 dark:text-slate-400">{{ store.portfolios.length }}</span>
      </div>

      <div v-if="store.portfolios.length" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PortfolioCard v-for="p in store.portfolios" :key="p.id" :portfolio="p" :freshness="freshnessById.get(p.id)" :value="valuesById.get(p.id)" @add-position="openAddPosition(p.id)" />
      </div>
      <p v-else-if="!error" class="text-sm text-slate-500 dark:text-slate-400">No investment portfolios yet.</p>

      <div class="mt-4">
        <button type="button" class="btn-secondary text-sm" @click="showCreate = true">Create Investment Portfolio</button>
      </div>
    </section>

    <section v-if="!loading" class="mb-10">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold">Cash</h2>
          <div class="mt-0.5 flex items-center gap-3 text-sm">
            <span class="text-slate-500 dark:text-slate-400">Total Balance</span>
            <span class="font-semibold tabular-nums" data-testid="cash-total-balance">{{ formatCurrency(cashTotal, displayCurrency) }}</span>
            <span v-for="c in cashBreakdown" :key="c.currency" class="text-xs text-slate-500 dark:text-slate-400">
              {{ c.currency }} {{ formatPercent(c.pct, 0) }}
            </span>
          </div>
        </div>
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
          <label for="portfolio-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
          <input id="portfolio-name" v-model="newPortfolio.name" type="text" required class="input mb-4" placeholder="e.g. Long-term growth" />
          <label for="portfolio-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description</label>
          <textarea id="portfolio-description" v-model="newPortfolio.description" rows="2" class="input mb-4" placeholder="Optional"></textarea>
          <div class="mb-4">
            <div>
              <label for="portfolio-currency" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Currency</label>
              <select id="portfolio-currency" v-model="newPortfolio.currency" class="input">
                <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
          <p v-if="createError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creating || !newPortfolio.name.trim()">
              {{ creating ? "Creating..." : "Create" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <AddPositionDialog :open="showAddPosition" :portfolio-id="addPositionPortfolioId" @close="closeAddPosition" @added="closeAddPosition" />
  </div>
</template>
