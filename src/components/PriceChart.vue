<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { getHistory, getPriceBars } from "@/api/instruments"
import type { HistoryCompareSeries } from "@/api/instruments"
import { getAllTransactions, getPortfolioTransactions } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useCurrenciesStore, type CurrencyInfo } from "@/stores/currencies"
import { formatAmount, formatCurrency, formatNumber } from "@/utils/format"
import { crossCurrencyCaption, needsPercentComparison, percentNormalize } from "@/utils/compareSeries"
import { currencyQueryParam, fxCaveat } from "@/utils/priceChartFx"
import type { components } from "../../generated/api-types"

type Transaction = components["schemas"]["Transaction"]

const props = defineProps<{
  symbol: string
  portfolioId?: string | null
  defaultShowTransactions?: boolean
  maxTransactions?: number
  /** §47.6 — the resolved instrument currency (plan §47.5 source), shown in the
   * chart titles. Optional: the chart still resolves its own axis currency from
   * /history; the prop only avoids a second fetch for the title. */
  currency?: string | null
}>()

type Timeframe = "1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "YTD" | "MAX"
type Mode = "Price" | "Percent" | "Drawdowns"
type CompareKey = "none" | "spy" | "qqq" | "iwm"

const timeframes: Timeframe[] = ["1D", "5D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "YTD", "MAX"]
const modes: Mode[] = ["Price", "Percent", "Drawdowns"]
const compareOptions: { key: CompareKey; label: string }[] = [
  { key: "none", label: "No comparison" },
  { key: "spy", label: "S&P 500" },
  { key: "qqq", label: "Nasdaq 100" },
  { key: "iwm", label: "Russell 2000" },
]

const timeframe = ref<Timeframe>("1Y")
const mode = ref<Mode>("Price")
const compare = ref<CompareKey>("none")
const showCompare = ref(false)
const fullscreen = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const historyLoading = ref(false)
const historyFailed = ref(false)
// §45.6 — true while the chart is showing only price-bars (wide /history
// still loading or failed). Drives the "full history loading…" / notice UI.
const onlyPartial = ref(false)
const showingPartial = computed(() => onlyPartial.value && historyLoading.value)
// Plan §48.4a — generation token for the two-stage load: the compare picker
// can fire a new load() while the previous /history is still in flight.
// Stale responses must not overwrite state owned by the newer load, or a
// failed late /history wipes the series the current load already rendered.
const loadSeq = ref(0)

const timestamps = ref<number[]>([])
const prices = ref<number[]>([])
const bench = ref<HistoryCompareSeries | null>(null)
const loadedCompare = ref<CompareKey>("none")
// §36 — the instrument's trading currency (from /history), for the price axis.
// §47.6 — initialized empty (never "USD"): while unresolved the axis and
// tooltips show plain numbers instead of a guessed currency.
const chartCurrency = ref<string>("")
// Plan §48.5 — the loaded series' native base currency + the FX floor of the
// loaded conversion (plan §48.2); both ride on the price responses
// (`baseCurrency` / `fxFrom`).
const baseCurrency = ref<string>("")
const fxFrom = ref<string | null>(null)
// Plan §48.5 — the display currency picked in the title selector. Empty =
// still on the instrument's base currency (the default).
const selectedCurrency = ref<string>(props.currency ? props.currency.toUpperCase() : "")
// Plan §48.5 — the ?currency= param the currently loaded series was fetched
// with (null = native base series).
const loadedCurrencyParam = ref<string | null>(null)
// §47.5 — bumped on every data swap (price-bars → full history). The remount
// key includes it so the FINAL remount always happens after the last data
// mutation — otherwise the price-bars→history updateOptions re-renders the
// already-remounted chart and vue3-apexcharts' deep-clone silently drops the
// y-axis formatter, leaving bare numbers on the axis.
const dataVersion = ref(0)

const portfolioStore = usePortfolioStore()
// Plan §48.5c — the selector's currency registry (shared /api/currencies).
const currenciesStore = useCurrenciesStore()

/** §47.6 / plan §48.5 — currency shown in the chart titles: the selected
 * display currency first, else the resolved base, else the prop (plan §47.5
 * source, no second fetch), else the axis currency. Empty while unknown →
 * the titles omit the currency instead of guessing. */
const titleCurrency = computed(() =>
  (selectedCurrency.value || baseCurrency.value || props.currency || chartCurrency.value || "").toUpperCase(),
)

/** Plan §48.5a — title selector options from the shared /api/currencies
 * registry (never hardcoded, AGENTS.md). The base currency is always present:
 * if the registry lacks it (untracked base) it is prepended so the default
 * selection still renders. */
const currencyOptions = computed<CurrencyInfo[]>(() => {
  const opts = currenciesStore.options
  const base = (baseCurrency.value || props.currency || "").toUpperCase()
  if (!base || opts.some((c) => c.code === base)) return opts
  return [{ code: base, name: base, symbol: base, minorUnits: 2, popular: false }, ...opts]
})
/** The selector only makes sense once the base currency is known (the server
 * 400s a conversion with an unresolvable base) and the registry has loaded. */
const showCurrencySelect = computed(
  () => !!currenciesStore.loaded && !!(baseCurrency.value || props.currency),
)

const showTransactions = ref(props.defaultShowTransactions ?? false)
const txPortfolioId = ref<string | "all">("all")
const transactions = ref<Transaction[]>([])
const transactionsLoading = ref(false)
const transactionsError = ref<string | null>(null)
const hasMoreTransactions = ref(false)
const maxTxs = ref(props.maxTransactions ?? 500)

async function fetchTransactions(): Promise<void> {
  transactionsLoading.value = true
  transactionsError.value = null
  try {
    const limit = maxTxs.value
    const symbol = props.symbol
    let result
    if (props.portfolioId) {
      result = await getPortfolioTransactions(props.portfolioId, 1, limit, "date", "asc", undefined, undefined, symbol)
    } else if (txPortfolioId.value !== "all") {
      result = await getPortfolioTransactions(txPortfolioId.value, 1, limit, "date", "asc", undefined, undefined, symbol)
    } else {
      result = await getAllTransactions(1, limit, "date", "asc", undefined, symbol)
    }
    transactions.value = result.items
    hasMoreTransactions.value = result.hasNext
  } catch (err) {
    transactionsError.value = err instanceof Error ? err.message : "Failed to load transactions"
    transactions.value = []
    hasMoreTransactions.value = false
  } finally {
    transactionsLoading.value = false
  }
}

async function ensurePortfoliosLoaded(): Promise<void> {
  if (!props.portfolioId && portfolioStore.portfolios.length === 0) {
    try {
      await portfolioStore.fetchAll()
    } catch {
      // Non-fatal: the selector simply stays on "All portfolios".
    }
  }
}

function toggleTransactions(checked: boolean): void {
  showTransactions.value = checked
  if (checked) {
    void ensurePortfoliosLoaded()
    fetchTransactions()
  } else {
    transactions.value = []
    hasMoreTransactions.value = false
  }
}

async function setFromPriceBars(symbol: string, currencyParam: string | null): Promise<boolean> {
  error.value = null
  historyFailed.value = false
  try {
    // 11 years of daily bars matches what /history requests (todayRange(4018)).
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 4018 * 86400_000).toISOString().slice(0, 10)
    const bars = await getPriceBars(symbol, from, to, currencyParam)
    if (bars.dates.length > 0) {
      timestamps.value = bars.dates.map((d) => Math.floor(Date.parse(d + "T00:00:00Z") / 1000))
      prices.value = [...bars.closes]
      if (bars.currency) chartCurrency.value = bars.currency
      // Plan §48.5 — native base + FX floor ride on the response (plan §48.2).
      baseCurrency.value = bars.baseCurrency || bars.currency || ""
      fxFrom.value = bars.fxFrom ?? null
      // Default the selector to the instrument's base currency once resolved
      // (no refetch: the same-currency param is null, i.e. this very load).
      if (!selectedCurrency.value && baseCurrency.value) selectedCurrency.value = baseCurrency.value.toUpperCase()
      dataVersion.value++
      return true
    }
  } catch {
    // price-bars empty/failed: leave an empty chart; the history leg still runs.
  }
  return false
}

async function load(compareKey: CompareKey) {
  const seq = ++loadSeq.value
  loading.value = true
  error.value = null
  onlyPartial.value = false
  // Plan §48.5 — both legs honor the selected currency (?currency=, plan
  // §48.2); null = the native base series.
  const currencyParam = currencyQueryParam(selectedCurrency.value, baseCurrency.value || props.currency || null)
  loadedCurrencyParam.value = currencyParam
  // §45.6 — price-bars first (cached, instant): render the chart as soon as
  // these land so a slow /history (e.g. a .TFI first scrape) never leaves a
  // blank spinner. Mark it "partial" while the wide history is in flight.
  const hasBars = await setFromPriceBars(props.symbol, currencyParam)
  if (seq !== loadSeq.value) return // a newer load owns the state now
  loading.value = false // the chart can paint now, even before /history resolves
  if (hasBars) {
    onlyPartial.value = true
    historyLoading.value = true
  }

  const compareKeyForHistory = compareKey === "none" ? undefined : compareKey
  try {
    const h = await getHistory(props.symbol, "daily", compareKeyForHistory, currencyParam)
    if (seq !== loadSeq.value) return
    if (h.timestamps.length === 0) {
      // Plan §48.4a — an empty provider series (502 burst, uncovered symbol)
      // must never wipe a series already rendered from price-bars: keep it
      // and surface the failure notice instead.
      if (timestamps.value.length > 0) {
        historyFailed.value = true
        error.value = "Full history unavailable — showing recent prices."
      }
    } else {
      timestamps.value = h.timestamps
      prices.value = h.closePrices
      bench.value = h.compare ?? null
      loadedCompare.value = compareKey
      // §47.6 — the history may legitimately carry no currency (unknown); keep
      // it empty rather than guessing USD.
      chartCurrency.value = h.currency ?? ""
      // Plan §48.5 — base + FX floor from the full-history leg (the price-bars
      // leg's values are the same series; the later write wins).
      if (h.baseCurrency || h.currency) baseCurrency.value = h.baseCurrency ?? h.currency ?? ""
      fxFrom.value = h.fxFrom ?? null
      if (!selectedCurrency.value && baseCurrency.value) selectedCurrency.value = baseCurrency.value.toUpperCase()
      dataVersion.value++
      onlyPartial.value = false
      error.value = null
    }
  } catch {
    if (seq !== loadSeq.value) return
    if (currencyParam) {
      // §48.2 / plan §56.3 — both legs 400 "base currency unknown": the
      // server refused to convert (ambiguous ticker, silent resolver). The
      // kept series is the native base currency — say so explicitly; the
      // historyFailed banner renders this message.
      error.value =
        "Display currency unavailable for this instrument — chart stays in its base currency."
    }
    historyFailed.value = true
  } finally {
    if (seq === loadSeq.value) historyLoading.value = false
  }
}

onMounted(() => {
  // Plan §48.5c — warm the shared currency registry for the title selector.
  void currenciesStore.load()
  load("none")
  // `defaultShowTransactions` (the holdings view passes true) starts the box
  // ticked but never fetched: markers and the FIFO lines were silently absent
  // until the user unticked/reticked the box or changed timeframe. Load them
  // here so the ticked box means what it says.
  if (showTransactions.value) {
    void ensurePortfoliosLoaded()
    void fetchTransactions()
  }
})
watch(compare, (k) => {
  if (k !== loadedCompare.value) load(k)
})
watch(
  () => props.symbol,
  () => {
    // symbol changed: reset state and re-run the two-stage load. The series is
    // cleared first so a symbol with no data never shows the previous symbol's
    // bars (and the empty-history guard in load() can't mistake them for its own).
    bench.value = null
    loadedCompare.value = "none"
    onlyPartial.value = false
    historyFailed.value = false
    timestamps.value = []
    prices.value = []
    // Plan §48.5 — the currency selection belongs to the previous symbol;
    // drop it and re-default to the new instrument's base after the load.
    // loadedCurrencyParam resets too, so the currency watch below (declared
    // after this one) sees no param change and does not double-load.
    baseCurrency.value = ""
    fxFrom.value = null
    selectedCurrency.value = ""
    loadedCurrencyParam.value = null
    void load(compare.value)
    if (showTransactions.value) fetchTransactions()
  },
)
// Plan §48.5a — the selected display currency (or its default-to-base
// resolution) changed: re-fetch both legs with ?currency=. A null param
// means "native base series" (identity short-circuit, plan §48.2).
watch(
  () => currencyQueryParam(selectedCurrency.value, baseCurrency.value || props.currency || null),
  (param) => {
    if (param !== loadedCurrencyParam.value) void load(compare.value)
  },
)
watch(timeframe, () => {
  if (showTransactions.value) fetchTransactions()
})
watch(txPortfolioId, () => {
  if (showTransactions.value) fetchTransactions()
})

const slicePoints = computed(() => {
  const n = timestamps.value.length
  switch (timeframe.value) {
    case "1D":
      return 2
    case "5D":
      return Math.min(5, n)
    case "1W":
      return Math.min(5, n)
    case "1M":
      return Math.min(21, n)
    case "3M":
      return Math.min(63, n)
    case "6M":
      return Math.min(126, n)
    case "1Y":
      return Math.min(252, n)
    case "3Y":
      return Math.min(756, n)
    case "5Y":
      return Math.min(1260, n)
    case "10Y":
      return Math.min(2520, n)
    case "MAX":
      return n
    case "YTD": {
      const yearStart = new Date(timestamps.value[n - 1] * 1000).getFullYear()
      let start = 0
      for (let i = 0; i < n; i++) {
        if (new Date(timestamps.value[i] * 1000).getFullYear() === yearStart) {
          start = i
          break
        }
      }
      return n - start
    }
  }
})

function pickCompare(key: CompareKey): void {
  compare.value = key
  showCompare.value = false
}

const compareLabel = computed(() =>
  compare.value === "none" ? "Add comparison" : (compareOptions.find((o) => o.key === compare.value)?.label ?? "Add comparison"),
)

const series = computed(() => {
  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const dates = timestamps.value.slice(startIdx).map((t) =>
    new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
  )

  // §36 — cross-currency overlay: a benchmark priced in a different currency
  // can only be compared honestly percent-normalized (no FX recalculation).
  // When forced, BOTH series are re-based to % so they share one axis.
  const benchPercentForced = forcedPct.value

  function transform(data: number[]): number[] {
    const slice = data.slice(startIdx)
    if (mode.value === "Price") return benchPercentForced ? percentNormalize(slice) : slice
    const base = slice[0] || 0
    if (mode.value === "Percent") return slice.map((p) => (base ? ((p - base) / base) * 100 : 0))
    let runningMax = -Infinity
    return slice.map((p) => {
      runningMax = Math.max(runningMax, p)
      return runningMax ? ((p - runningMax) / runningMax) * 100 : 0
    })
  }

  const out: Array<{ name: string; data: number[] }> = [{ name: props.symbol, data: transform(prices.value) }]
  if (bench.value && compare.value !== "none") {
    const benchSlice = bench.value.closePrices.slice(startIdx)
    const bBase = benchSlice[0] || 0
    const bData =
      mode.value === "Price" && !benchPercentForced
        ? benchSlice
        : benchPercentForced
          ? percentNormalize(benchSlice)
          : benchSlice.map((p) => (bBase ? ((p - bBase) / bBase) * 100 : 0))
    out.push({ name: bench.value.name, data: bData })
  }
  return { dates, data: out }
})

// §36 — the forced % state: a benchmark is shown, the user picked Price mode,
// and the currencies differ → both series must be percent-normalized.
const forcedPct = computed(
  () =>
    !!bench.value &&
    compare.value !== "none" &&
    mode.value === "Price" &&
    needsPercentComparison(chartCurrency.value, bench.value?.currency),
)

// §36 — y-axis unit for the current window. "pct" when a cross-currency overlay
// forces both series onto a percent-normalized axis; "price" otherwise.
const axisUnit = computed<"price" | "pct">(() => (forcedPct.value ? "pct" : "price"))

/** §36 — non-null when the benchmark overlay is percent-normalized due to a currency gap. */
const crossCurrencyNote = computed(() =>
  axisUnit.value === "pct" ? crossCurrencyCaption(chartCurrency.value, bench.value?.currency) : null,
)

/** Plan §48.5a — ISO date of the first VISIBLE bar (the sliced window's
 * start; timeframe-independent). Drives the fxFrom caveat predicate. */
const windowStartIso = computed(() => {
  const n = timestamps.value.length
  if (!n) return null
  const startIdx = Math.max(0, n - slicePoints.value)
  return isoDate(timestamps.value[startIdx] * 1000)
})
/** Plan §48.5a — caveat while the visible window holds unconverted bars
 * (bars before `fxFrom` stay in the base currency — no FX carry-forward). */
const fxCaveatNote = computed(() => fxCaveat(fxFrom.value, baseCurrency.value, windowStartIso.value))

// Remount the chart whenever the data/currency/unit it displays changes.
// vue3-apexcharts deep-clones options via JSON.stringify on updateOptions,
// which silently drops the y-axis formatter function; a fresh mount is the
// only reliable way to guarantee the axis carries the correct unit + currency.
// Keyed on POST-load values (loadedCompare/chartCurrency/dataVersion) so the
// remount happens *after* the data arrives — and dataVersion guarantees a
// final remount after the price-bars→history swap even when the currency is
// unchanged (otherwise the trailing updateOptions strips the formatter and
// the axis falls back to bare numbers).
const chartKey = computed(
  () =>
    `${loadedCompare.value}|${chartCurrency.value}|${dataVersion.value}|${axisUnit.value}|${mode.value}|${props.symbol}|${loadedCurrencyParam.value ?? ""}`,
)

// Stable axis state for the y-axis label formatter closure. The formatter is
// (re)created each time `chartOptions` is evaluated and reads current reactive
// values at call time, so a freshly mounted chart always carries the correct
// unit + currency.
function yLabelFormatter(v: number): string {
  if (mode.value === "Price" && axisUnit.value === "price") {
    // §47.6 — plain number while the currency is unresolved/unknown.
    return chartCurrency.value ? formatCurrency(v, chartCurrency.value) : formatNumber(v)
  }
  return `${v.toFixed(2)}%`
}

function isoDate(ms: number): string {
  const d = new Date(ms)
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

// The API returns transaction types as uppercase ("BUY" | "SELL" | "DIVIDEND").
function txType(tx: Transaction): string {
  return (tx.type ?? "").toUpperCase()
}

// Only transactions belonging to the charted instrument count for markers,
// tooltips, and the Low/High/Avg reference lines. This guards against any
// other instrument's transactions leaking into the feed.
const scopedTransactions = computed<Transaction[]>(() =>
  transactions.value.filter((tx) => String(tx.instrumentSymbol ?? "").toUpperCase() === props.symbol.toUpperCase()),
)

const txByDate = computed<Map<string, Transaction[]>>(() => {
  const map = new Map<string, Transaction[]>()
  for (const tx of scopedTransactions.value) {
    const type = txType(tx)
    if (type !== "BUY" && type !== "SELL") continue
    const key = isoDate(new Date(tx.executedAt).getTime())
    const group = map.get(key)
    if (group) group.push(tx)
    else map.set(key, [tx])
  }
  for (const group of map.values()) {
    group.sort((a, b) => {
      const typeDiff = (txType(a) === "BUY" ? 0 : 1) - (txType(b) === "BUY" ? 0 : 1)
      if (typeDiff !== 0) return typeDiff
      return new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    })
  }
  return map
})

const fifoReferenceLines = computed(() => {
  if (!showTransactions.value || mode.value !== "Price") return []
  if (scopedTransactions.value.length === 0) return []

  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const startTs = timestamps.value[startIdx]
  const endTs = timestamps.value[n - 1]

  const tradePrices: number[] = []
  const lots: Array<{ qty: number; price: number }> = []
  let remainingQty = 0
  let totalCost = 0

  for (const tx of scopedTransactions.value) {
    const txTs = new Date(tx.executedAt).getTime() / 1000
    if (txTs < startTs || txTs > endTs) continue

    const type = txType(tx)
    // Low/High bracket every price the account actually transacted at, so a
    // SELL counts. They used to collect BUY prices only, which put a "High"
    // line below a sell marker (TSM: sold at 101.75, line read 100.99).
    if (type === "BUY" || type === "SELL") tradePrices.push(tx.price)
    if (type === "BUY") {
      lots.push({ qty: tx.quantity, price: tx.price })
      remainingQty += tx.quantity
      totalCost += tx.quantity * tx.price
    } else if (type === "SELL") {
      let sellQty = tx.quantity
      while (sellQty > 0 && lots.length > 0) {
        const lot = lots[0]
        if (lot.qty <= sellQty) {
          totalCost -= lot.qty * lot.price
          remainingQty -= lot.qty
          sellQty -= lot.qty
          lots.shift()
        } else {
          totalCost -= sellQty * lot.price
          remainingQty -= sellQty
          lot.qty -= sellQty
          sellQty = 0
        }
      }
    }
  }

  const lines: Array<{
    y: number
    borderColor: string
    strokeDashArray: number
    label: { borderColor: string; style: { color: string; background: string }; text: string }
  }> = []

  if (tradePrices.length === 0) return lines

  const low = Math.min(...tradePrices)
  const high = Math.max(...tradePrices)

  if (remainingQty > 0) {
    const avgCost = totalCost / remainingQty
    lines.push({
      y: avgCost,
      borderColor: "#2563eb",
      strokeDashArray: 6,
      label: { borderColor: "#2563eb", style: { color: "#fff", background: "#2563eb" }, text: `Avg $${avgCost.toFixed(2)}` },
    })
  }

  lines.push({
    y: low,
    borderColor: "#16a34a",
    strokeDashArray: 4,
    label: { borderColor: "#16a34a", style: { color: "#fff", background: "#16a34a" }, text: `Low $${low.toFixed(2)}` },
  })

  lines.push({
    y: high,
    borderColor: "#dc2626",
    strokeDashArray: 4,
    label: { borderColor: "#dc2626", style: { color: "#fff", background: "#dc2626" }, text: `High $${high.toFixed(2)}` },
  })

  return lines
})

interface BarTxEntry { index: number; group: Transaction[] }

const barDateTxMap = computed<Map<string, BarTxEntry[]>>(() => {
  const map = new Map<string, BarTxEntry[]>()
  const n = timestamps.value.length
  const startIdx = n - slicePoints.value
  if (startIdx < 0) return map
  const startDateStr = isoDate(timestamps.value[startIdx] * 1000)
  const endDateStr = isoDate(timestamps.value[n - 1] * 1000)
  const dateIndexMap = new Map<string, number>()
  series.value.dates.forEach((_, i) => {
    const iso = isoDate(timestamps.value[startIdx + i] * 1000)
    if (!dateIndexMap.has(iso)) dateIndexMap.set(iso, i)
  })
  function nearestBarIndex(dateStr: string): number | undefined {
    const targetMs = Date.parse(dateStr + "T00:00:00Z")
    let best: { i: number; dist: number } | null = null
    for (let i = 0; i < series.value.dates.length; i++) {
      const dist = Math.abs(timestamps.value[startIdx + i] * 1000 - targetMs)
      if (best === null || dist < best.dist) best = { i, dist }
    }
    if (best && best.dist <= 7 * 86400_000) return best.i
    return undefined
  }
  for (const [dateStr, group] of txByDate.value) {
    if (dateStr < startDateStr || dateStr > endDateStr) continue
    const index = dateIndexMap.get(dateStr) ?? nearestBarIndex(dateStr)
    if (index === undefined) continue
    const barDate = isoDate(timestamps.value[startIdx + index] * 1000)
    const entries = map.get(barDate)
    if (entries) {
      const last = entries[entries.length - 1]
      if (last.index === index) last.group.push(...group)
      else entries.push({ index, group })
    } else {
      map.set(barDate, [{ index, group }])
    }
  }
  return map
})

const transactionAnnotations = computed(() => {
  if (!showTransactions.value) return []
  const points: Array<{
    x: number
    y: number
    marker: { size: number; fillColor: string; strokeColor: string; offsetY: number }
    label: { borderColor: string; style: { color: string; background: string }; text: string }
  }> = []
  for (const entries of barDateTxMap.value.values()) {
    for (const { index, group } of entries) {
      const lineValue = series.value.data[0]?.data?.[index]
      if (typeof lineValue !== "number") continue
      group.forEach((tx, i) => {
        const isBuy = txType(tx) === "BUY"
        const color = isBuy ? "#16a34a" : "#dc2626"
        points.push({
          // +1: ApexCharts' numeric x-axis is 1-based (see the xaxis note in
          // chartOptions). The y is the bar's close — what the tooltip's date
          // column is anchored to — while Low/High/Avg below are trade prices.
          x: index + 1,
          y: lineValue,
          marker: { size: 5, fillColor: color, strokeColor: color, offsetY: i === 0 ? 0 : -8 * i },
          label: { borderColor: color, style: { color: "#fff", background: color }, text: isBuy ? "▲" : "▼" },
        })
      })
    }
  }
  return points
})

function tooltipCustom({ series, dataPointIndex, w }: {
  series: number[][]
  dataPointIndex: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w: any
}): string {
  const n = timestamps.value.length
  const startIdx = n - slicePoints.value
  const lines: string[] = []
  for (let s = 0; s < w.config.series.length; s++) {
    const name = w.config.series[s].name ?? ""
    const value = series[s]?.[dataPointIndex]
    const isPriceUnit = mode.value === "Price" && axisUnit.value === "price"
    const formatted =
      typeof value === "number" ? (isPriceUnit ? formatAmount(value, chartCurrency.value) : `${value.toFixed(2)}%`) : "—"
    lines.push(`<div class="price-chart-tooltip-row"><span>${name}: ${formatted}</span></div>`)
  }
  let txHtml = ""
  if (showTransactions.value && dataPointIndex >= 0 && startIdx >= 0 && startIdx + dataPointIndex < n) {
    const dateStr = isoDate(timestamps.value[startIdx + dataPointIndex] * 1000)
    const entries = barDateTxMap.value.get(dateStr)
    if (entries && entries.length) {
      const rows = entries
        .flatMap((e) => e.group)
        .map((tx) => {
          const isBuy = txType(tx) === "BUY"
          const icon = isBuy ? "▲" : "▼"
          const label = isBuy ? "Buy" : "Sell"
          const fee = tx.fees ? ` (fees ${formatCurrency(tx.fees, tx.currency)})` : ""
          return `<div>${icon} ${label} ${formatNumber(tx.quantity)} @ ${formatCurrency(tx.price, tx.priceCurrency)} = ${formatCurrency(tx.totalAmount, tx.currency)}${fee}</div>`
        })
        .join("")
      txHtml = `<div class="price-chart-tooltip-transactions"><div><strong>Transactions:</strong></div>${rows}</div>`
    }
  }
  return `<div class="price-chart-tooltip">${lines.join("")}${txHtml}</div>`
}

const chartOptions = computed(() => ({
  chart: {
    type: "area" as const,
    height: fullscreen.value ? window.innerHeight - 80 : 380,
    toolbar: { show: false },
    zoom: { enabled: true },
    animations: { enabled: true },
    fontFamily: "inherit",
  },
  colors: mode.value === "Drawdowns" ? ["#dc2626", "#94a3b8"] : ["#2563eb", "#94a3b8"],
  series: series.value.data,
  xaxis: {
    // A numeric axis is load-bearing for the transaction markers, not a style
    // choice. ApexCharts positions an annotation point by its `x` VALUE on the
    // axis; on a *category* axis it first tries to match `x` against the
    // category labels and, when nothing matches, uses the number as a raw pixel
    // offset from the grid's left edge (`getX1X2` → `getStringX` falls through
    // to the input). So a 0-based bar index rendered at `index` px: markers
    // drifted right of their bar, and once the index exceeded the plot width
    // ApexCharts clamped them to the right edge and dropped them as clipped —
    // which is why a 10Y window showed no markers at all. Passing the category
    // *string* instead does not rescue it either: the lookup needs a rendered
    // `<text>` node for that category, and fullscreen sets `labels.show:false`.
    // With `type:"numeric"` the axis itself spans 1..N, so `x: index + 1` maps
    // correctly at any width, under zoom, with or without visible labels.
    type: "numeric" as const,
    labels: {
      show: !fullscreen.value,
      // Numeric x is a 1-based position in the sliced window; map it back to
      // that bar's date label.
      formatter: (v: number) => series.value.dates[Math.round(v) - 1] ?? "",
    },
    tickAmount: Math.min(12, series.value.dates.length),
  },
  yaxis: {
    labels: {
      formatter: yLabelFormatter,
    },
  },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.25, opacityTo: 0 } },
  legend: { position: "top" as const, horizontalAlign: "right" as const },
  grid: { borderColor: "#e2e8f0" },
    annotations: { points: transactionAnnotations.value, yaxis: fifoReferenceLines.value },
  tooltip: { custom: tooltipCustom },
}))

const summary = computed(() => {
  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const base = prices.value[startIdx]
  const last = prices.value[n - 1]
  if (typeof base !== "number" || typeof last !== "number" || !base) return null
  const change = last - base
  const changePct = (last / base - 1) * 100
  const years = (timestamps.value[n - 1] - timestamps.value[startIdx]) / (365.25 * 86400)
  const cagr = years > 0.5 ? (Math.pow(last / base, 1 / years) - 1) * 100 : null
  const display = mode.value === "Price" ? change : changePct
  return { change, changePct, cagr, display }
})

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
}

function downloadCsv(): void {
  const { dates, data } = series.value
  const header = ["Date", ...data.map((d) => d.name)]
  const rows = dates.map((date, i) => [date, ...data.map((d) => d.data[i] ?? "")].join(","))
  const csv = [header.join(","), ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${props.symbol}_${timeframe.value}_${mode.value.toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="card p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        Price Chart
        <!-- Plan §48.5a — the title currency becomes a selector: options from
             the shared /api/currencies registry, default = the instrument's
             base currency. Selecting one re-fetches both legs with ?currency=. -->
        <select
          v-if="showCurrencySelect"
          v-model="selectedCurrency"
          data-testid="chart-currency-select"
          class="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200"
        >
          <option v-if="!selectedCurrency" value="" disabled>Select&hellip;</option>
          <option v-for="c in currencyOptions" :key="c.code" :value="c.code">{{ c.code }}</option>
        </select>
        <span v-else-if="titleCurrency" class="font-normal text-slate-500 dark:text-slate-400">({{ titleCurrency }})</span>
      </h2>
      <div class="flex items-center gap-2">
        <button
          v-for="t in timeframes"
          :key="t"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium"
          :class="timeframe === t ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="timeframe = t"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3 text-xs">
      <div class="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
        <button
          v-for="m in modes"
          :key="m"
          type="button"
          class="px-3 py-1.5 font-medium"
          :class="mode === m ? 'bg-slate-800 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="mode = m"
        >
          <!-- §47.7 — the active "Price" mode renders "Price → %" while a
               currency mismatch forces percent normalization, so the highlight
               no longer contradicts the cross-currency caption. The user's
               `mode` selection is untouched (survives removing the benchmark). -->
          <span :data-testid="m === 'Price' && forcedPct ? 'mode-price-forced-pct' : undefined">
            {{ m === "Price" && forcedPct ? "Price → %" : m }}
          </span>
        </button>
      </div>

      <div class="relative">
        <button
          type="button"
          class="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          @click="showCompare = !showCompare"
        >
          {{ compareLabel }} <span class="text-slate-400 dark:text-slate-500">&#9662;</span>
        </button>
        <div v-if="showCompare" class="absolute left-0 z-20 mt-1 w-52 rounded-md border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-1 shadow-lg">
          <button
            v-for="o in compareOptions"
            :key="o.key"
            type="button"
            class="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            @click="pickCompare(o.key)"
          >
            <span>{{ o.label }}</span>
            <span v-if="compare === o.key" class="text-blue-600 dark:text-blue-400">&#10003;</span>
          </button>
        </div>
      </div>

      <label class="flex cursor-pointer items-center gap-1.5 select-none">
        <input
          type="checkbox"
          class="h-3.5 w-3.5 accent-blue-600"
          :checked="showTransactions"
          @change="toggleTransactions(($event.target as HTMLInputElement).checked)"
        />
        <span>Transactions</span>
      </label>

      <select
        v-if="!portfolioId && showTransactions"
        v-model="txPortfolioId"
        class="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
      >
        <option value="all">All portfolios</option>
        <option v-for="p in portfolioStore.portfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>

      <div v-if="summary" class="ml-auto flex items-center gap-4 text-sm">
        <span class="text-slate-500 dark:text-slate-400">Total Chg</span>
        <span class="font-semibold" :class="summary.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
           {{
             mode === "Price" && axisUnit === "price"
               ? formatAmount(summary.change, chartCurrency)
               : `${signed(summary.changePct)}%`
           }}
        </span>
        <span v-if="mode === 'Price' && axisUnit === 'price'" class="text-xs text-slate-400 dark:text-slate-500">{{ signed(summary.changePct) }}%</span>
        <span v-if="mode === 'Price' && axisUnit === 'price'" class="text-slate-500 dark:text-slate-400">CAGR</span>
        <span
          v-if="mode === 'Price' && axisUnit === 'price' && summary.cagr !== null"
          class="font-semibold tabular-nums"
          :class="summary.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
        >
          {{ signed(summary.cagr) }}%
        </span>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="fullscreen = !fullscreen"
        >
          {{ fullscreen ? "Exit fullscreen" : "Fullscreen" }}
        </button>
        <button type="button" class="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" title="Download CSV" @click="downloadCsv">
          Download
        </button>
      </div>
    </div>

    <!-- §45.6 — full-history leg state: a dismissible notice (on failure) or a
         "loading…" hint (while the wide /history runs) over the price-bars
         chart. The chart itself renders from price-bars immediately. -->
    <div v-if="historyFailed" class="mb-3 flex items-center justify-between gap-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      <span>{{ error || "Full history unavailable — showing recent prices." }} <button type="button" class="font-semibold underline underline-offset-2 hover:opacity-80" @click="load(compare)">Retry</button></span>
      <button type="button" class="text-amber-500 hover:opacity-70" aria-label="Dismiss" @click="historyFailed = false">&times;</button>
    </div>
    <p v-else-if="showingPartial" class="mb-3 text-sm text-slate-500 dark:text-slate-400">Showing recent prices — full history loading&hellip;</p>
    <p v-else-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading price history...</p>

    <p v-if="showTransactions && transactionsError" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ transactionsError }}</p>
    <p v-if="showTransactions && transactionsLoading" class="text-sm text-slate-500 dark:text-slate-400">Loading transactions...</p>
    <p v-if="showTransactions && !transactionsLoading && hasMoreTransactions" class="text-sm text-slate-500 dark:text-slate-400">
      Showing first {{ maxTxs }} transactions &mdash; some may be missing.
    </p>

    <div v-if="fullscreen" class="fixed inset-0 z-50 overflow-auto bg-white dark:bg-slate-900 p-6" @dblclick="fullscreen = false">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">{{ symbol }} - {{ timeframe }} ({{ mode }}{{ titleCurrency ? ` · ${titleCurrency}` : "" }})</h2>
        <button type="button" class="btn-secondary text-sm" @click="fullscreen = false">Close</button>
      </div>
      <p v-if="crossCurrencyNote" class="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">{{ crossCurrencyNote }}</p>
      <p v-if="fxCaveatNote" class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{{ fxCaveatNote }}</p>
      <component
        :key="`fs-${chartKey}`"
        :is="'apexchart'"
        v-if="series.data.length && series.data[0].data.length"
        :options="chartOptions"
        :series="series.data"
      />
    </div>
    <template v-else>
      <p v-if="crossCurrencyNote" class="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">{{ crossCurrencyNote }}</p>
      <p v-if="fxCaveatNote" class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{{ fxCaveatNote }}</p>
      <!-- §47.6 — fixed-height wrapper (matches the chart's `height: 380` option)
           so the plot box is stable and the card does not reflow when the
           cross-currency note / loading notice / summary appear. -->
      <div class="h-[380px]">
        <component
          :key="chartKey"
          :is="'apexchart'"
          v-if="series.data.length && series.data[0].data.length"
          :options="chartOptions"
          :series="series.data"
        />
        <p v-else class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">No price history available.</p>
      </div>
    </template>
    <p class="mt-2 text-right text-xs text-slate-400 dark:text-slate-500">Powered by Example service</p>
  </div>
</template>
