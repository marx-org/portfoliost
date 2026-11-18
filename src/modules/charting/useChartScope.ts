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
  const kind = ref<"normal" | "virtual">(
    (route.query as Record<string, unknown>).kind === "virtual" ? "virtual" : "normal",
  )
  const from = ref<string | undefined>(
    typeof (route.query as Record<string, unknown>).from === "string"
      ? ((route.query as Record<string, unknown>).from as string)
      : undefined,
  )
  const to = ref<string | undefined>(
    typeof (route.query as Record<string, unknown>).to === "string"
      ? ((route.query as Record<string, unknown>).to as string)
      : undefined,
  )

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
      kind: kind.value,
      currency: currency.value,
      from: from.value,
      to: to.value,
      metric: typeof q.metric === "string" ? q.metric : undefined,
      benchmarks: selectedBenchmarks.value.length ? selectedBenchmarks.value : undefined,
    }
  })

  function toRouteQuery(): Record<string, string> {
    const q: Record<string, string> = {}
    if (selectedAccountIds.value.length) q.accounts = selectedAccountIds.value.join(",")
    if (selectedLabelIds.value.length) q.labels = selectedLabelIds.value.join(",")
    if (kind.value === "virtual") q.kind = "virtual"
    if (currency.value) q.currency = currency.value
    if (from.value) q.from = from.value
    if (to.value) q.to = to.value
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
      if (key === "accounts" || key === "labels" || key === "currency" || key === "benchmarks" || key === "kind" || key === "from" || key === "to") continue
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
  watch(
    () => (route.query as Record<string, unknown>).kind,
    (v) => {
      const next = v === "virtual" ? "virtual" : "normal"
      if (next !== kind.value) {
        kind.value = next
        // Switching side clears the account selection: the two are mutually
        // exclusive and a stale id from the other side must not survive.
        selectedAccountIds.value = []
      }
    },
  )
  watch(
    () => (route.query as Record<string, unknown>).from,
    (v) => {
      from.value = typeof v === "string" && v ? v : undefined
    },
  )
  watch(
    () => (route.query as Record<string, unknown>).to,
    (v) => {
      to.value = typeof v === "string" && v ? v : undefined
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
  /** Switch between real (normal) and virtual portfolios, clearing the account selection. */
  function setKind(next: "normal" | "virtual"): void {
    if (next === kind.value) return
    kind.value = next
    selectedAccountIds.value = []
    selectedLabelIds.value = []
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
    kind.value = "normal"
    from.value = undefined
    to.value = undefined
    syncRoute()
  }
  /** Set the inclusive date window; empty string clears that bound. */
  function setDates(nextFrom: string, nextTo: string): void {
    from.value = nextFrom || undefined
    to.value = nextTo || undefined
    syncRoute()
  }

  return {
    selectedAccountIds,
    selectedLabelIds,
    selectedBenchmarks,
    kind,
    from,
    to,
    allAccounts,
    allLabels,
    currency,
    scopeQuery,
    reset,
    setKind,
    setDates,
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