<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { deletePortfolio, getPortfolioAnalytics, getPortfolioPositions, recomputePortfolio, updatePortfolio } from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent } from "@/utils/format"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import type { PortfoliosSummaries } from "@/api/types"

const props = defineProps<{
  portfolio: PortfoliosSummaries[number]
  /** §70.2 — completeness/freshness, joined from the aggregate breakdown. */
  freshness?: { unpriced: number; priceAsOf: string | null; fallback: boolean }
  /**
   * §63.3 — this portfolio's row of the aggregate `/total-metrics` breakdown, the
   * same rows the headline is summed from. The card's Value/Invested/Return and
   * its instruments/cash split read THIS, not `portfolio.currentValue`.
   *
   * The stored column is a different price source (backfill bars) than the
   * headline (live quotes), so rendering it made Σ cards disagree with the
   * headline by 1,944.85 PLN in PROD on 2026-10-01. Omitted → the card falls
   * back to the stored figures, which is stale but visible, rather than blank.
   */
  value?: {
    totalValue: number
    instrumentsValue: number
    cashValue: number
    capitalBasis: number
    returnPercentage: number
  } | null
}>()
const emit = defineEmits<{ (e: "add-position"): void }>()

const store = usePortfolioStore()
const router = useRouter()

// §66.3 — the amounts are converted into the user's display currency exactly
// like the headline does, so the cards and the headline are computed the same
// way and their sum can reconcile (§63.3).
//
// The SOURCE currency follows the figure actually being rendered: the breakdown
// row is denominated in the aggregate base (`totalMetrics.baseCurrency`), the
// stored fallback in the portfolio's own base. Converting a breakdown row with
// the portfolio's rate would be wrong on every fleet that is not single-currency
// — and would be wrong by exactly the cross-rate.
const { convert, displayCurrencyOr } = useDisplayConversion(() =>
  props.value ? (store.totalMetrics?.baseCurrency ?? props.portfolio.baseCurrency) : props.portfolio.baseCurrency,
)

/**
 * §63.3 — the reconciled figures for this card.
 *
 * `value` (the aggregate breakdown row) wins whenever it is present, because it
 * is the row the headline sums. The fallback reproduces the old behaviour from
 * `portfolio.currentValue`, which INCLUDES cash (§68), so instruments is its
 * difference against the cash balance rather than a second request.
 */
const cardValue = computed(() => {
  const v = props.value
  if (v) {
    return {
      totalValue: v.totalValue,
      instrumentsValue: v.instrumentsValue,
      cashValue: v.cashValue,
      capitalBasis: v.capitalBasis,
      returnPercentage: v.returnPercentage,
    }
  }
  const current = props.portfolio.currentValue
  if (current == null) return null
  const cash = props.portfolio.cash?.total
  return {
    totalValue: Number(current),
    instrumentsValue: Number(current) - (cash == null ? 0 : Number(cash)),
    cashValue: cash == null ? 0 : Number(cash),
    capitalBasis: Number(props.portfolio.capitalBasis ?? 0),
    returnPercentage: Number(props.portfolio.metrics?.totalReturn ?? 0),
  }
})

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

const timeframe = ref<PortfolioAnalyticsTimeframe>("6M")
const series = ref<number[]>([])
const chartError = ref(false)
const chartLoading = ref(false)
const openMenu = ref(false)
const notice = ref<string | null>(null)
const backfillPending = ref(false)
const backfillFailed = ref(false)
const recomputeBusy = ref(false)
// §63.8 — held symbols the last backfill had no price bar for → value is partial
// §72.30 — TWO lists, because the window-wide one cannot support the claim the
// card was making. `heldChartGap` still held ⇒ today's value really is short.
// `historyChartGap` = sold-since ⇒ only earlier points are partial. PROD
// (2026-10-01) showed the cost of conflating them: three of four flagged
// portfolios had every flagged symbol already closed, and the card told the user
// its value excluded positions it was in fact counting in full.
const heldChartGap = ref<string[] | null>(null)
const historyChartGap = ref<string[] | null>(null)
/**
 * §78.5 — the base-currency PEAK the card's sparkline was short by on any one
 * day, or null when nothing was withheld (or nothing was measured).
 *
 * Computed here rather than passed down because the card already flattens the
 * series to `number[]` for the sparkline, so the peak is captured at the same
 * moment the series is read and costs nothing to keep.
 *
 * **Peak, not sum** — these positions are held for months, so summing multiplies
 * the same money by its holding period into a figure that cannot be reconciled
 * against the chart beside it. The peak is what a single point was short by.
 */
const unpricedPeak = ref<number | null>(null)
/**
 * "up to 10,465.32 PLN" — omitted entirely when unknown, never "PLN 0.00".
 *
 * **`portfolio.baseCurrency`, not `displayCurrencyOr()`**, and deliberately: the
 * card's sparkline is built from raw `timeSeries[].value` with no rate applied,
 * so it is already denominated in the portfolio base. The headline value above is
 * converted, the sparkline below is not. Annotating the line in the headline's
 * currency would put a differently-denominated number on the chart it describes.
 */
const unpricedAmountLabel = computed(() =>
  unpricedPeak.value == null ? "" : `up to ${formatCurrency(unpricedPeak.value, props.portfolio.baseCurrency)}`,
)

const showRename = ref(false)
const renameName = ref(props.portfolio.name)
// §87.5 — the SAME setting as the portfolio page's settings dialog. There are two
// "Rename portfolio" dialogs in the app (this card and PortfolioDetailView) and
// they used to be the same dialog; adding the switch to only one of them left a
// portfolio's cash-leg behaviour editable from one route and invisible from the
// other, which is worse than not having it at all.
const renameCashLeg = ref(false)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollDeadline = 0

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function applyBackfillStatus(status: string | null | undefined) {
  if (status === "pending") {
    backfillPending.value = true
    backfillFailed.value = false
    startPolling()
  } else if (status === "failed") {
    // §53.3 — a failed backfill must not leave the card on the eternal
    // "Loading chart…": surface the failure + a Recompute escape hatch.
    backfillPending.value = false
    backfillFailed.value = true
    stopPolling()
  } else {
    backfillPending.value = false
    backfillFailed.value = false
    stopPolling()
  }
}

function startPolling() {
  stopPolling()
  pollDeadline = Date.now() + 5 * 60 * 1000 // 5-minute guard
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) { stopPolling(); return }
    try {
      const analytics = await getPortfolioAnalytics(props.portfolio.id, timeframe.value)
      series.value = (analytics.performance?.timeSeries ?? []).map((p) => p.value ?? 0)
      applyGapSymbols(analytics)
      applyBackfillStatus(analytics.backfillStatus)
    } catch { stopPolling() }
  }, 5000)
}

onMounted(() => loadChart())
onUnmounted(() => stopPolling())

async function loadChart() {
  chartError.value = false
  chartLoading.value = true
  try {
    const analytics = await getPortfolioAnalytics(props.portfolio.id, timeframe.value)
    series.value = (analytics.performance?.timeSeries ?? []).map((p) => p.value ?? 0)
    applyGapSymbols(analytics)
    applyBackfillStatus(analytics.backfillStatus)
  } catch {
    chartError.value = true
  } finally {
    chartLoading.value = false
  }
}

/**
 * §72.30 — split the response's two gap lists into the two claims the card makes.
 *
 * `heldGapSymbols` is the subset still held, so it is what "this value excludes
 * N positions" is allowed to refer to. Everything else in `gapSymbols` is a
 * position that has since been sold: the history it sat in is a partial sum, the
 * current value is not.
 *
 * A response with only the legacy `gapSymbols` (a backend that has not shipped
 * the split) has no `heldGapSymbols`, so the held list is empty and the whole
 * list reads as history — the safe direction, because it never claims a
 * complete value is short. The next backfill on a current backend fills it in.
 */
function applyGapSymbols(analytics: {
  gapSymbols?: string[] | null
  heldGapSymbols?: string[] | null
  performance?: { timeSeries?: Array<{ unpricedValue?: number | null }> | null } | null
}) {
  const all = analytics.gapSymbols ?? []
  const held = analytics.heldGapSymbols ?? []
  heldChartGap.value = held.length ? held : null
  const heldSet = new Set(held)
  const history = all.filter((s) => !heldSet.has(s))
  historyChartGap.value = history.length ? history : null
  // §78.5 — the amount, from the same response. Absent on a pre-migration
  // backend, and absent is unknown rather than zero: saying "nothing withheld"
  // for a series that is short by 10,465 PLN is the defect this fixes.
  let peak: number | null = null
  for (const p of analytics.performance?.timeSeries ?? []) {
    const v = p?.unpricedValue
    if (typeof v === "number" && v > 0 && (peak === null || v > peak)) peak = v
  }
  unpricedPeak.value = peak
}

/**
 * §76.2 — the manual refresh. `recomputePortfolio` now issues `?mode=upsert`
 * (additive: recomputes the whole series over the top, never deletes) rather than
 * the bare endpoint's destructive force rebuild — see the note in
 * src/api/portfolios.ts. Since §76.1 a read no longer re-prices, so the twice-daily
 * cron owns freshness and this is the only way a user can ask for it sooner; it
 * must never be able to delete history.
 */
async function handleRecompute() {
  if (recomputeBusy.value) return
  recomputeBusy.value = true
  backfillFailed.value = false
  notice.value = "Refreshing prices…"
  try {
    await recomputePortfolio(props.portfolio.id)
    notice.value = "Refresh requested"
    await loadChart()
  } catch {
    // network error — stay failed; the user can retry
    notice.value = null
  } finally {
    recomputeBusy.value = false
  }
}

/**
 * §76.2 — the price as-of this card's number actually reflects. Since §76.1 no
 * read re-prices, so this can be up to ~12h old (the cron runs 13:00 and 17:20
 * UTC), and it is the only honest signal the user has that the figure is not
 * live. §70's rule: label it, do not fabricate it. The OLDEST contributing price
 * is used upstream deliberately — the portfolio is only as fresh as its stalest
 * holding, so this is a floor, not an average.
 */
const priceAsOfLabel = computed<string | null>(() => {
  const raw = props.freshness?.priceAsOf
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
})

async function changeTimeframe(tf: PortfolioAnalyticsTimeframe) {
  timeframe.value = tf
  await loadChart()
}

function tabPath(name: string) {
  const map: Record<string, string> = {
    holdings: "holdings",
    cash: "cash",
    performance: "performance",
    news: "news",
    calendar: "calendar",
  }
  return { name: `portfolio-${map[name]}` as string, params: { id: props.portfolio.id } }
}

const sparkOptions = computed(() => ({
  chart: {
    type: "area" as const,
    height: 90,
    toolbar: { show: false },
    sparkline: { enabled: true },
  },
  colors: ["#2563eb"],
  series: [{ name: "Value", data: series.value }],
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.25, opacityTo: 0 } },
  xaxis: { categories: series.value.map((_, i) => i), labels: { show: false } },
  tooltip: { enabled: false },
}))

// §48.6e B3 / §53.3 — remount key (PortfolioPerformanceChart.vue precedent):
// vue3-apexcharts' prop-update path is unreliable in this stack — a data swap
// after mount (timeframe switch, 5 s backfill-poll update) is never pushed
// into the running instance, leaving the initial series on screen. A fresh
// mount is the only reliable way to repaint; the fingerprint (timeframe +
// length + first/last point) changes on every real data swap.
const chartKey = computed(
  () => [timeframe.value, series.value.length, series.value[0] ?? "", series.value.at(-1) ?? ""].join("~"),
)

defineExpose({ chartKey })

function returnClassFor(returnPercentage: number | undefined | null): string {
  return (returnPercentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function goToDetail() {
  router.push({ name: "portfolio-detail", params: { id: props.portfolio.id } })
}

function openRename() {
  openMenu.value = false
  renameName.value = props.portfolio.name
  renameCashLeg.value = props.portfolio.cashLegOnTrade ?? false
  renameError.value = null
  showRename.value = true
}

async function submitRename() {
  if (!renameName.value.trim()) return
  renameBusy.value = true
  renameError.value = null
  try {
    await updatePortfolio(props.portfolio.id, {
      name: renameName.value.trim(),
      cashLegOnTrade: renameCashLeg.value,
    })
    showRename.value = false
    await store.fetchAll()
    notice.value = "Portfolio renamed"
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : "Failed to rename portfolio"
  } finally {
    renameBusy.value = false
  }
}

function openDelete() {
  openMenu.value = false
  deleteError.value = null
  showDeleteConfirm.value = true
}

async function submitDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deletePortfolio(props.portfolio.id)
    showDeleteConfirm.value = false
    await store.fetchAll()
    notice.value = `Deleted ${props.portfolio.name}`
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete portfolio"
  } finally {
    deleteBusy.value = false
  }
}

function exportFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPositions(format: "csv" | "xml" | "json") {
  openMenu.value = false
  const positions = await getPortfolioPositions(props.portfolio.id)
  const name = `${props.portfolio.name.replace(/\s+/g, "_")}-positions`
  if (format === "json") {
    exportFile(`${name}.json`, JSON.stringify(positions, null, 2), "application/json")
  } else if (format === "xml") {
    const rows = positions
      .map((p) => {
        const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        return `  <position symbol="${esc(p.symbol)}" quantity="${esc(p.quantity)}" averageCostBasis="${esc(p.averageCostBasis)}" currentPrice="${esc(p.currentPrice)}" marketValue="${esc(p.marketValue)}" />`
      })
      .join("\n")
    exportFile(`${name}.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<positions>\n${rows}\n</positions>`, "application/xml")
  } else {
    const header = "Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Weight"
    const rows = positions.map((p) =>
      [p.symbol, p.quantity, p.averageCostBasis, p.currentPrice, p.marketValue, p.unrealizedGainLoss, p.percentOfPortfolio].join(","),
    )
    exportFile(`${name}.csv`, [header, ...rows].join("\n"), "text/csv")
  }
}
</script>

<template>
  <div class="card flex cursor-pointer flex-col p-5 transition-shadow hover:shadow-md" data-testid="portfolio-card" @click="goToDetail">
    <div class="flex items-center justify-between gap-2">
      <div>
        <router-link
          :to="{ name: 'portfolio-detail', params: { id: portfolio.id } }"
          class="truncate font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
        >
          {{ portfolio.name }}
        </router-link>
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ portfolio.description || "No description" }}</p>
      </div>
      <div class="flex items-center gap-2" @click.stop>
        <span class="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">
          {{ portfolio.strategy }}
        </span>
        <div class="relative">
          <button
            type="button"
            aria-label="Portfolio actions"
            class="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
            @click="openMenu = !openMenu"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>
          <template v-if="openMenu">
            <div class="fixed inset-0 z-20" @click="openMenu = false"></div>
            <div class="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 py-1 shadow-lg">
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openRename">Edit</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('csv')">Export as CSV</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('xml')">Export as XML</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="exportPositions('json')">Export as JSON</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="openDelete">Delete</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <p v-if="notice" class="mt-3 rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>

    <div class="mt-4">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs text-slate-500 dark:text-slate-400">Performance</span>
        <div class="flex gap-1" @click.stop>
          <button
            v-for="tf in timeframes"
            :key="tf.value"
            type="button"
            class="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            :class="timeframe === tf.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : ''"
            :disabled="chartLoading"
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
        </div>
      </div>
      <div class="relative">
        <component
          :is="'apexchart'"
          v-if="series.length"
          :key="chartKey"
          :options="sparkOptions"
          :series="sparkOptions.series"
        />
        <div v-else-if="backfillFailed" class="flex h-[90px] flex-col items-center justify-center gap-1.5" @click.stop>
          <p class="text-xs text-slate-400 dark:text-slate-500">Chart unavailable</p>
          <button
            type="button"
            class="btn-secondary text-xs"
            data-testid="card-chart-recompute"
            :disabled="recomputeBusy"
            @click="handleRecompute"
          >
            {{ recomputeBusy ? "Recomputing..." : "Recompute" }}
          </button>
        </div>
        <p v-else-if="chartError" class="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Chart unavailable</p>
        <div v-else-if="chartLoading || backfillPending" class="flex h-[90px] items-center justify-center">
          <p class="text-xs text-slate-400 dark:text-slate-500">Loading chart...</p>
        </div>
        <!-- §53.7 — backfill complete but the window is empty (e.g. fully
             liquidated portfolio): must not sit on "Loading chart…" forever. -->
        <div v-else class="flex h-[90px] items-center justify-center" data-testid="card-chart-empty">
          <p class="text-xs text-slate-400 dark:text-slate-500">No data</p>
        </div>
        <div v-if="chartLoading && series.length" class="absolute inset-0 flex items-center justify-center rounded bg-white/70 dark:bg-slate-900/70">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Refreshing...</span>
        </div>
      </div>
      <p v-if="backfillPending" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Historical data is loading, chart will update in a moment.
      </p>
      <!-- §63.8 — the LATEST value is a partial sum when a held position has no
           price history. §72.30 — this is stated only for symbols still held;
           a sold-since gap makes the HISTORY partial, not the value on the card.
           The two are independent `v-if`s, not an else-chain: a portfolio can
           have both, and dropping the history note just because an urgent one is
           already on screen hides a real gap for the sake of tidiness. -->
      <p v-if="heldChartGap && heldChartGap.length" class="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="card-chart-gap-warning">
        Value excludes {{ heldChartGap.length }} position{{ heldChartGap.length === 1 ? "" : "s" }} without price history<span v-if="unpricedAmountLabel"> &mdash; {{ unpricedAmountLabel }} withheld</span>.
      </p>
      <p v-if="historyChartGap && historyChartGap.length" class="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="card-chart-history-gap-note">
        <!--
          §78.5 — the AMOUNT and the COUNT are two claims about two different
          windows, so they never share a sentence.

          `gapSymbols` is WINDOW-WIDE by design (§72.30: the whole backfill
          window, so a position held in 2022 and sold since still counts). The
          series here is TIMEFRAME-FILTERED. Measured on IKE Beata:
            1Y  → count 7, and 0 of them were held in the visible window
            ALL → count 7, and 1016 of 1801 days withheld, peak 10,465.38
          So pairing them — "7 positions, up to 10,465 PLN" — asserts a count
          about a period the amount does not describe, and in 1Y asserts a count
          about a window in which none of them were held. The amount is the
          window-accurate half and leads when present; the count is the fallback
          and keeps its original wording.
        -->
        <template v-if="unpricedAmountLabel">
          {{ unpricedAmountLabel }} of this chart is missing &mdash; those points are partial. Today's value is complete.
        </template>
        <template v-else>
          {{ historyChartGap.length }} earlier position{{ historyChartGap.length === 1 ? "" : "s" }} had no price history &mdash; those chart points are partial. Today's value is complete.
        </template>
      </p>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Value</p>
        <p class="font-medium tabular-nums" data-testid="card-value">{{ formatCurrency(convert(cardValue?.totalValue), displayCurrencyOr()) }}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Invested</p>
        <p class="font-medium tabular-nums" data-testid="card-invested">{{ formatCurrency(convert(cardValue?.capitalBasis), displayCurrencyOr()) }}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500 dark:text-slate-400">Return</p>
        <p class="font-medium tabular-nums" data-testid="card-return" :class="returnClassFor(cardValue?.returnPercentage)">{{ formatPercent(cardValue?.returnPercentage) }}</p>
      </div>
    </div>
    <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
      {{ portfolio.metrics?.openPositions ?? 0 }} open positions &middot; {{ formatNumber(portfolio.metrics?.unrealizedGainLoss) }} unrealized
    </p>

    <!-- §76.2 — freshness row + the manual refresh, on EVERY card.
         The button used to exist only inside the chart's "unavailable" branch,
         so it appeared only after a backfill had already failed. Reads no longer
         re-price (§76.1), which means the cron owns freshness and the user needs
         a way to ask for it sooner. `priceAsOfLabel` is the oldest contributing
         price, so it can be ~12h old — shown rather than implied, because a
         number that silently looks live is exactly what §76 removed the cost of
         hiding. -->
    <div class="mt-2 flex items-center justify-between gap-2" @click.stop>
      <span
        v-if="priceAsOfLabel"
        class="text-xs text-slate-400 dark:text-slate-500"
        data-testid="card-price-as-of"
      >
        Prices as of {{ priceAsOfLabel }}
      </span>
      <span
        v-else-if="(portfolio.metrics?.openPositions ?? 0) > 0"
        class="text-xs text-amber-600 dark:text-amber-400"
        data-testid="card-price-as-of-missing"
      >
        No price timestamp yet
      </span>
      <button
        type="button"
        class="btn-ghost shrink-0 px-2 py-1 text-xs"
        data-testid="card-refresh"
        :disabled="recomputeBusy"
        :title="'Re-value this portfolio now (additive — nothing is deleted). The scheduled sync does the same twice a day.'"
        @click="handleRecompute"
      >
        {{ recomputeBusy ? "Refreshing…" : "Refresh" }}
      </button>
    </div>

    <!-- §62.8 — Cash group (example-service parity): balance line + per-currency hint. -->
    <!-- §70.2 — this card's value excludes anything unpriced, so say so rather
         than let a small number pass for a complete one. -->
    <p
      v-if="freshness && (freshness.unpriced > 0 || freshness.fallback)"
      class="mt-3 text-xs text-amber-700 dark:text-amber-400"
      data-testid="card-freshness-note"
    >
      <template v-if="freshness.unpriced > 0">
        {{ freshness.unpriced }} position{{ freshness.unpriced === 1 ? "" : "s" }} unpriced &mdash;
        excluded from this value.
      </template>
      <template v-if="freshness.fallback"> Some prices are not live.</template>
    </p>

    <div v-if="portfolio.cash" class="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4" @click.stop data-testid="card-cash-group">
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-500 dark:text-slate-400">Cash</span>
        <router-link
          :to="tabPath('cash')"
          class="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
          data-testid="card-cash-balance"
        >
          {{ formatCurrency(portfolio.cash.total, portfolio.cash.baseCurrency) }}
        </router-link>
      </div>
      <!-- §68.4 — the cash/instruments split lives HERE, inside the existing Cash
           group, rather than as a fifth number in the top row. §63.3 — both
           components now come from the aggregate breakdown row, so the split is
           the same pair of numbers the headline sums and cannot drift from the
           Value printed above it. -->
      <div class="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Instruments</span>
        <span class="tabular-nums" data-testid="card-instruments-value">
          {{ formatCurrency(convert(cardValue?.instrumentsValue), displayCurrencyOr()) }}
        </span>
      </div>
      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span v-for="b in portfolio.cash.balances" :key="b.currency" class="text-xs text-slate-500 dark:text-slate-400" :data-testid="`card-cash-${b.currency}`">
          {{ b.currency }} {{ formatCurrency(b.balance, b.currency) }}
        </span>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3" @click.stop>
      <button type="button" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline" data-testid="card-add-position" @click="emit('add-position')">Add Position</button>
      <div class="flex gap-3 text-sm">
        <router-link :to="tabPath('performance')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">Analytics</router-link>
        <router-link :to="tabPath('news')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">News</router-link>
        <router-link :to="tabPath('calendar')" class="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">Calendar</router-link>
      </div>
    </div>

    <div
      v-if="showRename"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showRename = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Rename portfolio" @click.stop>
        <h3 class="mb-4 text-base font-semibold">Portfolio settings</h3>
        <form @submit.prevent="submitRename">
          <label for="portfolio-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
          <input id="portfolio-name" v-model="renameName" type="text" required class="input mb-4" />
          <!-- §87.5 — UI ONLY, and identical to the portfolio page's copy: pre-ticks
               the buy/sell form's cash checkbox. It does not govern the Google Sheets
               import, which uses its own kontо list. -->
          <label class="mb-4 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              id="card-cash-leg-on-trade"
              v-model="renameCashLeg"
              type="checkbox"
              class="mt-0.5"
              data-testid="card-cash-leg-on-trade"
            />
            <span>
              Generate a cash transaction on buy/sell
              <span class="block text-xs text-slate-500 dark:text-slate-400">
                Pre-ticks the cash checkbox on the buy/sell form. Sheet imports are unaffected.
              </span>
            </span>
          </label>
          <p v-if="renameError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ renameError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showRename = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="renameBusy || !renameName.trim()">
              {{ renameBusy ? "Saving..." : "Save" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showDeleteConfirm = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete portfolio" @click.stop>
        <h3 class="mb-4 text-base font-semibold">Delete portfolio</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">Delete "{{ portfolio.name }}" and its positions? This cannot be undone.</p>
        <p v-if="deleteError" class="mb-3 mt-2 text-sm text-red-600 dark:text-red-400">{{ deleteError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button type="button" class="btn-primary bg-red-600" :disabled="deleteBusy" @click="submitDelete">
            {{ deleteBusy ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
