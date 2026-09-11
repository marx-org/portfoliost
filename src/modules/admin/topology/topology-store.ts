// D55-4 / step 7 — useTopologyStore. Polls the two admin topology endpoints
// every 30 s (matching the System tab cadence) and maps the contract responses
// into a per-node status/traffic overlay consumed by the Topology view (step 8)
// and its custom node components (D55-6).
//
// The store owns the live data only. Positions/layout and the static node/edge
// shape stay in graph-definition.ts; a view composes the two via nodeData().

import { defineStore } from "pinia"
import { ref } from "vue"
import { fetchTopologyStatus, fetchTopologyTraffic } from "@/api/admin"
import type { TopologyNodeDef } from "./graph-definition"
import type { TopologyNodeData, TopologyServiceStatus, TopologyServiceTraffic } from "./nodes/types"

export type CachestProviderLatency = { provider: string; p99LatencyMs: number }

export const DEFAULT_POLL_INTERVAL_MS = 30_000

function failureMessage(reason: unknown, label: string): string {
  return reason instanceof Error ? `${label}: ${reason.message}` : `${label}: request failed`
}

export const useTopologyStore = defineStore("topology", () => {
  const statusById = ref<Record<string, TopologyServiceStatus>>({})
  const trafficById = ref<Record<string, TopologyServiceTraffic>>({})
  const cachestProviders = ref<CachestProviderLatency[]>([])
  const statusFetchedAt = ref<string | null>(null)
  const trafficFetchedAt = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | undefined

  // Fetches both endpoints in parallel. Either may fail independently: a failed
  // call keeps its previous data and records the failure, while the other still
  // applies. Never rejects, so polling cannot produce unhandled rejections.
  async function refresh(): Promise<void> {
    loading.value = true
    const [statusResult, trafficResult] = await Promise.allSettled([
      fetchTopologyStatus(),
      fetchTopologyTraffic(),
    ])

    const failures: string[] = []

    if (statusResult.status === "fulfilled") {
      const next: Record<string, TopologyServiceStatus> = {}
      for (const svc of statusResult.value.services) next[svc.name] = svc
      statusById.value = next
      statusFetchedAt.value = statusResult.value.fetchedAt
    } else {
      failures.push(failureMessage(statusResult.reason, "status"))
    }

    if (trafficResult.status === "fulfilled") {
      const next: Record<string, TopologyServiceTraffic> = {}
      for (const svc of trafficResult.value.services) next[svc.name] = svc
      trafficById.value = next
      cachestProviders.value = trafficResult.value.cachestProviders
      trafficFetchedAt.value = trafficResult.value.fetchedAt
    } else {
      failures.push(failureMessage(trafficResult.reason, "traffic"))
    }

    error.value = failures.length ? failures.join("; ") : null
    loading.value = false
  }

  function startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    stopPolling()
    void refresh()
    pollTimer = setInterval(() => {
      void refresh()
    }, intervalMs)
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  /** Merge a static node definition with its live status/traffic overlay. */
  function nodeData(def: TopologyNodeDef): TopologyNodeData {
    return {
      label: def.label,
      area: def.area,
      live: def.live,
      provider: def.provider,
      status: statusById.value[def.id],
      traffic: trafficById.value[def.id],
    }
  }

  return {
    statusById,
    trafficById,
    cachestProviders,
    statusFetchedAt,
    trafficFetchedAt,
    loading,
    error,
    refresh,
    startPolling,
    stopPolling,
    nodeData,
  }
})
