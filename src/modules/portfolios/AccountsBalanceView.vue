<script lang="ts">
/**
 * §84 — the `Konto` block of the source spreadsheet, as one table.
 *
 * The row unit is a portfolio, not a wallet, and every column is already on
 * `PortfolioTotalMetrics.portfolioBreakdown`, so this adds no contract field and
 * no second copy of the arithmetic: `gainLoss` is the derivation the store
 * already performs at `stores/portfolios.ts:219`, and `returnPercentage` carries
 * the same optional-field fallback that store applies.
 *
 * Shared math (docs/COMPONENTS.md) — the derivation and the comparator live here
 * rather than in the template so a unit test can exercise the arithmetic without
 * mounting a component.
 */
export interface AccountsBalanceRow {
  id: string
  name: string
  instrumentsValue: number
  cashValue: number
  totalValue: number
  /** `capitalBasis` — capital at risk: external contributions PLUS the cost of anything
   * transferred in or out (§41/S3). NOT the `externalCashInvested` figure, which is
   * reported separately as `externalContributions` and excludes in-kind transfers. */
  capitalBasis: number
  /** `totalValue − capitalBasis`. */
  gainLoss: number
  /** `null` when nothing was put in — 0/0 is not a number, and the route answers `0`. */
  returnPercentage: number | null
}

/** The subset of the contract's breakdown row this table reads. */
type BreakdownRow = {
  id: string
  name: string
  instrumentsValue: number
  cashValue: number
  totalValue: number
  capitalBasis: number
  returnPercentage?: number
}

/**
 * One row per portfolio. `returnPercentage` is read off the payload and only
 * derived when absent — it is optional in the contract, and a response that omits
 * it must not render a blank cell. A non-positive `capitalBasis` yields `null`
 * (rendered as an em dash) rather than a division by zero.
 */
export function accountsBalanceRows(rows: BreakdownRow[]): AccountsBalanceRow[] {
  return rows.map((r) => {
    const gainLoss = r.totalValue - r.capitalBasis
    return {
      id: r.id,
      name: r.name,
      instrumentsValue: r.instrumentsValue,
      cashValue: r.cashValue,
      totalValue: r.totalValue,
      capitalBasis: r.capitalBasis,
      gainLoss,
      returnPercentage:
        r.capitalBasis > 0 ? (r.returnPercentage ?? (gainLoss / r.capitalBasis) * 100) : null,
    }
  })
}

export type AccountsBalanceSortKey =
  | "name"
  | "instrumentsValue"
  | "cashValue"
  | "totalValue"
  | "capitalBasis"
  | "gainLoss"
  | "returnPercentage"

export type SortDir = "asc" | "desc"

/**
 * Numeric on every money column, `localeCompare` on the account name. A row whose
 * Return % is `null` has no ranking at all, so it sorts LAST in both directions —
 * flipping it to the front on a descending sort would put a non-number where the
 * user is looking for their best performer.
 */
export function sortAccountsBalanceRows(
  rows: AccountsBalanceRow[],
  key: AccountsBalanceSortKey,
  dir: SortDir,
): AccountsBalanceRow[] {
  const sign = dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av === null || bv === null) {
      if (av === bv) return 0
      return av === null ? 1 : -1
    }
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sign
    }
    return (av - bv) * sign
  })
}

/** The Σ footer. The return is the ratio OF the two summed money columns, not a
 * sum of percentages — `Σ gain / Σ invested` is the only figure a reader can
 * reconcile with the row above it, and it is the headline's own return. */
export function accountsBalanceTotals(rows: AccountsBalanceRow[]): AccountsBalanceRow {
  const sum = (pick: (r: AccountsBalanceRow) => number) =>
    Math.round(rows.reduce((s, r) => s + pick(r), 0) * 100) / 100
  const gainLoss = sum((r) => r.gainLoss)
  const capitalBasis = sum((r) => r.capitalBasis)
  return {
    id: "",
    name: "",
    instrumentsValue: sum((r) => r.instrumentsValue),
    cashValue: sum((r) => r.cashValue),
    totalValue: sum((r) => r.totalValue),
    capitalBasis,
    gainLoss,
    returnPercentage: capitalBasis > 0 ? (gainLoss / capitalBasis) * 100 : null,
  }
}
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { storeToRefs } from "pinia"
import { useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { useCurrenciesStore } from "@/stores/currencies"
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/utils/format"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"

const store = usePortfolioStore()
const router = useRouter()
const loading = ref(true)
const error = ref<string | null>(null)

// §66.3 — the ONE base→display conversion, fed the aggregate's own baseCurrency,
// so this table's Total and the dashboard's "Total value" tile are one number by
// construction rather than by coincidence.
const { convert: toDisplay } = useDisplayConversion(() => store.totalMetrics?.baseCurrency)

const displayCurrencyStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayCurrencyStore)

// D26 — the selector is fed exclusively by the /api/currencies registry.
const currenciesStore = useCurrenciesStore()
if (!currenciesStore.loaded) void currenciesStore.load()
const currencies = computed(() => currenciesStore.options.map((c) => c.code))
const currencySymbol = (code: string) => currenciesStore.info(code)?.symbol ?? code
const showCurrencyMenu = ref(false)

function setDisplayCurrency(currency: string) {
  displayCurrencyStore.setCurrency(currency)
  showCurrencyMenu.value = false
}

// ── Table ──────────────────────────────────────────────────────────────────

const columns: Array<{ key: AccountsBalanceSortKey; label: string; testid: string; align?: string }> = [
  { key: "name", label: "Account", testid: "account" },
  { key: "instrumentsValue", label: "Investments", testid: "investments", align: "text-right" },
  { key: "cashValue", label: "Free cash", testid: "cash", align: "text-right" },
  { key: "totalValue", label: "Total", testid: "total", align: "text-right" },
  { key: "capitalBasis", label: "Deposits", testid: "deposits", align: "text-right" },
  { key: "gainLoss", label: "P/L", testid: "gain", align: "text-right" },
  { key: "returnPercentage", label: "Return %", testid: "return", align: "text-right" },
]

// The spreadsheet's row order is Total descending — the biggest account first.
const sortKey = ref<AccountsBalanceSortKey>("totalValue")
const sortDir = ref<SortDir>("desc")

function toggleSort(key: AccountsBalanceSortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
    return
  }
  sortKey.value = key
  sortDir.value = key === "name" ? "asc" : "desc"
}

function sortIndicator(key: AccountsBalanceSortKey): string {
  if (sortKey.value !== key) return ""
  return sortDir.value === "asc" ? "↑" : "↓"
}

const rows = computed<AccountsBalanceRow[]>(() =>
  sortAccountsBalanceRows(
    accountsBalanceRows(store.totalMetrics?.portfolioBreakdown ?? []),
    sortKey.value,
    sortDir.value,
  ),
)
const totals = computed(() => accountsBalanceTotals(rows.value))

// "—" while the rate resolves, never 0 — a converted-by-guess amount is worse
// than no amount (§66.3 rule 1).
function money(value: number): string {
  return formatCurrency(toDisplay(value), displayCurrency.value)
}

function gain(value: number): string {
  return formatSignedCurrency(toDisplay(value), displayCurrency.value)
}

function percent(value: number | null): string {
  if (value === null) return "—"
  return formatPercent(value, 2, true)
}

/** §84.4 — clicking a row opens that portfolio's holdings. */
function openRow(event: MouseEvent, row: AccountsBalanceRow) {
  // The Account cell holds a real <router-link> (focusable, middle-clickable,
  // announced as a link); let it navigate itself instead of pushing twice.
  if ((event.target as HTMLElement | null)?.closest("a")) return
  void router.push({ name: "portfolio-holdings", params: { id: row.id } })
}

onMounted(async () => {
  // §67.1 — adopt the server-side display-currency preference when this browser
  // has never chosen one, so the choice follows the user across devices.
  void displayCurrencyStore.hydrateFromServer()
  // The store is per-route state, so landing straight on this tab (it is the `/`
  // landing page) finds it empty. `fetchAll` already fetches both endpoints this
  // table needs — no new request is introduced.
  try {
    await store.fetchAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load accounts"
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Accounts balance</h1>
        <p v-if="store.totalMetrics" class="text-sm text-slate-500 dark:text-slate-400">
          {{ rows.length }} account{{ rows.length === 1 ? "" : "s" }} &middot; base currency
          {{ store.totalMetrics.baseCurrency }}
        </p>
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

    <InvestmentsTabs />

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading accounts...</p>

    <div v-else-if="rows.length" class="card overflow-x-auto">
      <table class="min-w-full text-sm" data-testid="accounts-balance">
        <thead>
          <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
            <th
              v-for="col in columns"
              :key="col.key"
              class="px-5 py-2.5 font-medium"
              :class="[col.align, 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100']"
              :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined"
            >
              <button type="button" class="inline-flex items-center gap-1" @click="toggleSort(col.key)">
                {{ col.label }}
                <span v-if="sortIndicator(col.key)" class="text-[10px]">{{ sortIndicator(col.key) }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            data-testid="accounts-balance-row"
            @click="openRow($event, row)"
          >
            <td class="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100" data-testid="accounts-balance-account">
              <router-link
                :to="{ name: 'portfolio-holdings', params: { id: row.id } }"
                class="hover:underline"
              >
                {{ row.name }}
              </router-link>
            </td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-investments">{{ money(row.instrumentsValue) }}</td>
            <!-- §84 — a negative cash balance keeps its sign. It is a margin
                 balance, not a clamped zero (openapi.yaml:1201). -->
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-cash">{{ money(row.cashValue) }}</td>
            <td class="px-5 py-2.5 text-right font-semibold tabular-nums" data-testid="accounts-balance-total">{{ money(row.totalValue) }}</td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-deposits">{{ money(row.capitalBasis) }}</td>
            <td
              class="px-5 py-2.5 text-right font-medium tabular-nums"
              :class="row.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-gain"
            >
              {{ gain(row.gainLoss) }}
            </td>
            <td
              class="px-5 py-2.5 text-right tabular-nums"
              :class="row.returnPercentage === null ? '' : row.returnPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-return"
            >
              {{ percent(row.returnPercentage) }}
            </td>
          </tr>
        </tbody>
        <tfoot class="border-t-2 border-slate-200 font-semibold dark:border-slate-700/60">
          <tr data-testid="accounts-balance-totals">
            <td class="px-5 py-2.5 text-slate-900 dark:text-slate-100">Total</td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-totals-investments">{{ money(totals.instrumentsValue) }}</td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-totals-cash">{{ money(totals.cashValue) }}</td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-totals-total">{{ money(totals.totalValue) }}</td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-totals-deposits">{{ money(totals.capitalBasis) }}</td>
            <td
              class="px-5 py-2.5 text-right tabular-nums"
              :class="totals.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-totals-gain"
            >
              {{ gain(totals.gainLoss) }}
            </td>
            <td class="px-5 py-2.5 text-right tabular-nums" data-testid="accounts-balance-totals-return">{{ percent(totals.returnPercentage) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-else-if="!error" class="text-sm text-slate-500 dark:text-slate-400">No accounts yet.</p>
  </div>
</template>