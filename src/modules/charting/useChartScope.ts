import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import type { ChartScopeQuery } from "@/api/charting"

/**
 * Chart scope for the Charting pages (feature #253, sub-issue #256).
 *
 * Owns the account/label multiselect (All by default), the display currency and
 * the route-query round trip so scope persists across subpages and deep links.
 * Accounts and labels are multiselect; empty means All. The API serialises them
 * comma-separated; this composable keeps the same shape in the URL.
 */

type RouteLike = ReturnType<typeof useRoute>
type RouterLike = ReturnType<typeof useRouter>

function parseList(value: unknown): string[] {
  return typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : []
}

export function useChartScope(opts?: { route?: RouteLike; router?: RouterLike }) {
  const route = opts?.route ?? useRoute()
  const router = opts?.router ?? useRouter()

  const selectedAccountIds = ref<string[]>(parseList((route.query as Record<string, unknown>).accounts))
  const selectedLabelIds = ref<string[]>(parseList((route.query as Record<string, unknown>).labels))
  const selectedBenchmarks = ref<string[]>(parseList((route.query as Record<string, unknown>).benchmarks))

  const allAccounts = computed(() => selectedAccountIds.value.length === 0)
  const allLabels = computed(() => selectedLabelIds.value.length === 0)

  const currency = computed(() => {
    const c = (route.query as Record<string, unknown>).currency
    return typeof c === "string" && c.length === 3 ? c.toUpperCase() : undefined
  })

  const scopeQuery = computed<ChartScopeQuery>(() => {
    const q = route.query as Record<string, unknown>
    return {
      accounts: selectedAccountIds.value.length ? selectedAccountIds.value : undefined,
      labels: selectedLabelIds.value.length ? selectedLabelIds.value : undefined,
      currency: currency.value,
      from: typeof q.from === "string" ? q.from : undefined,
      to: typeof q.to === "string" ? q.to : undefined,
      metric: typeof q.metric === "string" ? q.metric : undefined,
      benchmarks: selectedBenchmarks.value.length ? selectedBenchmarks.value : undefined,
    }
  })

  function toRouteQuery(): Record<string, string> {
    const q: Record<string, string> = {}
    if (selectedAccountIds.value.length) q.accounts = selectedAccountIds.value.join(",")
    if (selectedLabelIds.value.length) q.labels = selectedLabelIds.value.join(",")
    if (currency.value) q.currency = currency.value
    if (selectedBenchmarks.value.length) q.benchmarks = selectedBenchmarks.value.join(",")
    return q
  }

  /** Persist the current selection into the route query (deep-linkable, shareable). */
  function syncRoute(): void {
    // Rebuild the query from the scope keys only, so clearing a selection also
    // REMOVES its key. Spreading the old query first left a stale `accounts`
    // behind when the selection became empty (reset would not clear the URL).
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (key === "accounts" || key === "labels" || key === "currency" || key === "benchmarks") continue
      if (typeof value === "string") next[key] = value
    }
    Object.assign(next, toRouteQuery())
    void router.replace({ query: next })
  }

  // Round-trip: a deep link (or back/forward) updates the selection.
  watch(
    () => (route.query as Record<string, unknown>).accounts,
    (v) => {
      selectedAccountIds.value = parseList(v)
    },
  )
  watch(
    () => (route.query as Record<string, unknown>).labels,
    (v) => {
      selectedLabelIds.value = parseList(v)
    },
  )
  watch(
    () => (route.query as Record<string, unknown>).benchmarks,
    (v) => {
      selectedBenchmarks.value = parseList(v)
    },
  )

  function setAccounts(ids: string[]): void {
    selectedAccountIds.value = ids
    syncRoute()
  }
  function setLabels(ids: string[]): void {
    selectedLabelIds.value = ids
    syncRoute()
  }
  function toggleAccount(id: string): void {
    const cur = selectedAccountIds.value
    setAccounts(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  function toggleLabel(id: string): void {
    const cur = selectedLabelIds.value
    setLabels(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  function reset(): void {
    selectedAccountIds.value = []
    selectedLabelIds.value = []
    selectedBenchmarks.value = []
    syncRoute()
  }

  return {
    selectedAccountIds,
    selectedLabelIds,
    selectedBenchmarks,
    allAccounts,
    allLabels,
    currency,
    scopeQuery,
    reset,
    toggleAccount,
    toggleLabel,
    setAccounts,
    setLabels,
    setBenchmarks: (symbols: string[]) => {
      selectedBenchmarks.value = symbols
      syncRoute()
    },
    toggleBenchmark: (symbol: string) => {
      const cur = selectedBenchmarks.value
      selectedBenchmarks.value = cur.includes(symbol) ? cur.filter((s) => s !== symbol) : [...cur, symbol]
      syncRoute()
    },
    syncRoute,
  }
}