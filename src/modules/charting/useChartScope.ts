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
    }
  })

  function toRouteQuery(): Record<string, string> {
    const q: Record<string, string> = {}
    if (selectedAccountIds.value.length) q.accounts = selectedAccountIds.value.join(",")
    if (selectedLabelIds.value.length) q.labels = selectedLabelIds.value.join(",")
    if (currency.value) q.currency = currency.value
    return q
  }

  /** Persist the current selection into the route query (deep-linkable, shareable). */
  function syncRoute(): void {
    void router.replace({ query: { ...route.query, ...toRouteQuery() } })
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
    syncRoute()
  }

  return {
    selectedAccountIds,
    selectedLabelIds,
    allAccounts,
    allLabels,
    currency,
    scopeQuery,
    reset,
    toggleAccount,
    toggleLabel,
    setAccounts,
    setLabels,
    syncRoute,
  }
}