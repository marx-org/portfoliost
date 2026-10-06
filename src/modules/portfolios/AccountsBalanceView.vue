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

    <!--
        §84.9 — the nested scroll region, and why `max-h` and not `h`.

        This wrapper is `overflow-x-auto`, which per CSS Overflow 3 makes its
        computed `overflow-y` `auto` too. It is therefore a VERTICAL scroll
        container whose height is its content height — so a `sticky top-0` header
        has no scroll port to stick to, and simply scrolls away. Measured: header
        `top` never changed before this, and could not.

        `max-h-[70vh]` gives it the scroll port. MAX-h, not `h`: with a fixed
        height a short account list would leave an empty band under the footer.
        With `max-h` the wrapper is content-height until the list is long enough
        to overflow, so the scrollbar simply does not exist for a short list.

        The cost is real and worth stating: once the list IS long, this is a
        second scroll region on a page that already scrolls, and a second
        scrollbar can capture the wheel. At the realistic account count (~4-9
        rows, ~450px of content) 70vh does not bite, so today the cost is latent
        and only the benefit is live. Revisit if the account count grows a lot.

        The header cells need `z-20`: a sticky element with no z-index paints in
        DOM order, and <tbody> comes after <thead>, so body rows paint over it.
      -->
      <div v-else-if="rows.length" class="card max-h-[70vh] overflow-auto">
        §84.7 — small screens. The table has a natural width of ~905px (six `px-5`
        money columns plus `tabular-nums`) and `min-w-full` puts no floor under it,
        so below ~930px of viewport the table simply overflows and the reader scrolls
        horizontally. A `min-w-[…]` floor would do nothing here — the natural width
        already exceeds any phone. So this step goes the OTHER way: tighten padding
        and the type scale below `sm` to CUT the width, which is the only thing that
        reduces the distance a number is from the name it belongs to.

        Desktop is untouched: `text-sm` and `px-5` are the `sm:` values.
      -->
      <table class="min-w-full text-xs sm:text-sm" data-testid="accounts-balance">
        <thead>
          <!-- The header band is OPAQUE, not a tint: the Account header cell below is
               sticky and needs a background that content cannot show through. Same
               reason the pinned body cells carry their own opaque background. -->
          <tr class="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-400">
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="px-3 py-3.5 font-medium sm:px-5 sm:py-2.5"
              :class="[
                col.align,
                'sticky top-0 z-20 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100',
                // §84.5 — the Account column is pinned, so its header is pinned too
                // (z-30 sits above the body cells' z-10, as in TransactionsTable).
                // The min-w floor matches the body cell's, so a wide header label
                // and a narrow one still put the column edge in the same place.
                col.key === 'name'
                  ? 'sticky left-0 top-0 z-30 min-w-[9rem] bg-slate-50 shadow-[-1px_0_0_0_#e2e8f0] sm:min-w-0 dark:bg-slate-800 dark:shadow-[-1px_0_0_0_#334155]'
                  : '',
              ]"
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
          <!--
            `group` + `even:` striping + `hover:`. The load-bearing detail: Tailwind
            emits `odd:`/`even:` BEFORE `hover:`/`group-hover:` in the stylesheet, so
            hover wins over the stripe with no `!important`. Do not "fix" that with
            `!important` — it works. The corollary is why the hover tints are BLUE
            and not slate: `hover:bg-slate-50` over an already-slate-50 even row is
            invisible, which would read as hover being broken on half the rows.
          -->
          <tr
            v-for="row in rows"
            :key="row.id"
            class="group cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-blue-50/70 focus-within:bg-blue-50/70 dark:border-slate-800 dark:even:bg-slate-800/60 dark:hover:bg-slate-700/60 dark:focus-within:bg-slate-700/60"
            data-testid="accounts-balance-row"
            @click="openRow($event, row)"
          >
            <!--
              §84.5 — the pinned Account cell. Its background is OPAQUE and it is the
              SAME on every row (not striped): it has to be opaque so scrolled-under
              text cannot bleed through it, and it has to carry its own `group-hover:`
              because the row's hover tint sits behind this cell's own background.
              The 1px right shadow is the separator that makes the pinned edge legible.
            -->
            <td
              class="sticky left-0 z-10 min-w-[9rem] bg-slate-100 px-3 py-3.5 font-medium text-slate-900 break-words shadow-[-1px_0_0_0_#e2e8f0] group-hover:bg-blue-100 group-focus-within:bg-blue-100 sm:min-w-0 sm:px-5 sm:py-2.5 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[-1px_0_0_0_#334155] dark:group-hover:bg-slate-700 dark:group-focus-within:bg-slate-700"
              data-testid="accounts-balance-account"
            >
              <!--
                A real <a>, deliberately (see openRow's bail-out): focusable,
                middle-clickable, announced as a link. The focus-visible ring is
                not redundant with the row's focus-within tint — the tint alone
                fails anyone who cannot distinguish blue-50 from slate-100.
              -->
              <router-link
                :to="{ name: 'portfolio-holdings', params: { id: row.id } }"
                class="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-800"
              >
                {{ row.name }}
              </router-link>
            </td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums" data-testid="accounts-balance-investments">{{ money(row.instrumentsValue) }}</td>
            <!-- §84 — a negative cash balance keeps its sign. It is a margin
                 balance, not a clamped zero (openapi.yaml:1201). -->
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums" data-testid="accounts-balance-cash">{{ money(row.cashValue) }}</td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right font-semibold tabular-nums" data-testid="accounts-balance-total">{{ money(row.totalValue) }}</td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums" data-testid="accounts-balance-deposits">{{ money(row.capitalBasis) }}</td>
            <td
              class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right font-medium tabular-nums"
              :class="row.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-gain"
            >
              {{ gain(row.gainLoss) }}
            </td>
            <td
              class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums"
              :class="row.returnPercentage === null ? '' : row.returnPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-return"
            >
              {{ percent(row.returnPercentage) }}
            </td>
          </tr>
        </tbody>
        <!--
          §84.6 — the Σ band. The reader reconciles this row against the Total value
          tile on /en/investments, so it has to read as a deliberate band rather than
          as the last row. A 2px rule plus a font-weight was not enough.

          NOT sticky, deliberately: the wrapper is `overflow-x-auto`, which makes its
          computed `overflow-y` `auto`, so it is a vertical scroll container whose
          height is its content height — `sticky bottom-0` inside it has no scroll
          port to stick to. Making it stick needs a height-constrained wrapper, i.e.
          a nested scroll region; that is #69's trade-off to settle, not this step's.

          The band is OPAQUE (not a /NN tint) for the same reason the pinned Account
          cells are: it abuts their separator shadow, and a translucent band would
          let the last body row show through it.
        -->
        <tfoot class="border-t-2 border-slate-300 text-base dark:border-slate-600">
          <tr class="bg-slate-100 font-semibold dark:bg-slate-800" data-testid="accounts-balance-totals">
            <!-- Pinned and opaque for the same reason as the body Account cells — the
                 Σ row must not be the one row whose label scrolls out from under the
                 numbers. z-30, above the body cells' z-10: this is the last thing drawn. -->
            <td
              class="sticky left-0 z-30 bg-slate-100 px-3 py-3.5 sm:px-5 sm:py-2.5 shadow-[-1px_0_0_0_#e2e8f0] dark:bg-slate-800 dark:shadow-[-1px_0_0_0_#334155]"
            >
              <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</span>
            </td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100" data-testid="accounts-balance-totals-investments">{{ money(totals.instrumentsValue) }}</td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100" data-testid="accounts-balance-totals-cash">{{ money(totals.cashValue) }}</td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100" data-testid="accounts-balance-totals-total">{{ money(totals.totalValue) }}</td>
            <td class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100" data-testid="accounts-balance-totals-deposits">{{ money(totals.capitalBasis) }}</td>
            <td
              class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums"
              :class="totals.gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-totals-gain"
            >
              {{ gain(totals.gainLoss) }}
            </td>
            <td
              class="px-3 py-3.5 sm:px-5 sm:py-2.5 text-right tabular-nums"
              :class="totals.returnPercentage === null ? 'text-slate-900 dark:text-slate-100' : totals.returnPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              data-testid="accounts-balance-totals-return"
            >
              {{ percent(totals.returnPercentage) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-else-if="!error" class="text-sm text-slate-500 dark:text-slate-400">No accounts yet.</p>
  </div>
</template>