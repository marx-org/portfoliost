import { ref, shallowRef } from "vue"
import type { ChartScopeQuery } from "@/api/charting"

/**
 * Chart data loader (feature #253, sub-issue #256).
 *
 * Loads a dataset for a scope and discards stale responses: when the scope
 * changes mid-flight, the older request's result is dropped so a fast filter
 * change cannot overwrite the newer one. One request per load; the caller keys
 * by scope to avoid refetching an unchanged scope.
 */
export function useChartData<T>(fetcher: (scope: ChartScopeQuery) => Promise<T>) {
  const data = shallowRef<T | null>(null) as { value: T | null }
  const loading = ref(false)
  const error = ref<unknown>(null)
  let generation = 0

  async function load(scope: ChartScopeQuery): Promise<void> {
    const mine = ++generation
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(scope)
      if (mine !== generation) return // superseded by a newer scope
      data.value = result
    } catch (e) {
      if (mine !== generation) return
      error.value = e
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  function reset(): void {
    generation += 1
    data.value = null
    error.value = null
    loading.value = false
  }

  return { data, loading, error, load, reset }
}

/** A stable key for a scope, used to reuse one request per dataset+scope. */
export function scopeKey(scope: ChartScopeQuery): string {
  return [
    (scope.accounts ?? []).slice().sort().join(","),
    (scope.labels ?? []).slice().sort().join(","),
    scope.kind ?? "normal",
    scope.currency ?? "",
    scope.from ?? "",
    scope.to ?? "",
    scope.metric ?? "",
  ].join("|")
}