import { createPinia, setActivePinia, type Pinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTopologyStore, DEFAULT_POLL_INTERVAL_MS } from "@/modules/admin/topology/topology-store"
import { nodeById } from "@/modules/admin/topology/graph-definition"
import { dotState } from "@/modules/admin/topology/nodes/status"
import type { DotState } from "@/modules/admin/topology/nodes/status"
import * as adminApi from "@/api/admin"
import type { TopologyStatusResponse, TopologyTrafficResponse } from "@/api/admin"

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof adminApi>()
  return { ...actual, fetchTopologyStatus: vi.fn(), fetchTopologyTraffic: vi.fn() }
})

const mocked = vi.mocked(adminApi)

function statusResponse(
  services: TopologyStatusResponse["services"],
): TopologyStatusResponse {
  return { services, fetchedAt: "2026-09-11T12:00:00.000Z" }
}

function trafficResponse(
  services: TopologyTrafficResponse["services"],
  cachestProviders: TopologyTrafficResponse["cachestProviders"] = [],
): TopologyTrafficResponse {
  return { services, cachestProviders, fetchedAt: "2026-09-11T12:00:01.000Z" }
}

describe("topology store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts empty", () => {
    const store = useTopologyStore()
    expect(store.statusById).toEqual({})
    expect(store.trafficById).toEqual({})
    expect(store.cachestProviders).toEqual([])
    expect(store.statusFetchedAt).toBeNull()
    expect(store.trafficFetchedAt).toBeNull()
    expect(store.error).toBeNull()
  })

  it("indexes status and traffic by service name and records timestamps", async () => {
    mocked.fetchTopologyStatus.mockResolvedValue(
      statusResponse([
        { name: "portfoliost-admin", reachable: true, impl: "real", version: "1.2.3", replicas: { desired: 2, ready: 2 }, restarts: 0 },
        { name: "cachest", reachable: false, impl: "unknown" },
      ]),
    )
    mocked.fetchTopologyTraffic.mockResolvedValue(
      trafficResponse(
        [{ name: "portfoliost-admin", requestsPerMin: 12.5, errorRate: 0.01, p99LatencyMs: 42, source: "otel" }],
        [{ provider: "alphavantage.co", p99LatencyMs: 210 }],
      ),
    )

    const store = useTopologyStore()
    await store.refresh()

    expect(Object.keys(store.statusById).sort()).toEqual(["cachest", "portfoliost-admin"])
    expect(store.statusById["portfoliost-admin"].version).toBe("1.2.3")
    expect(store.statusById["cachest"].reachable).toBe(false)
    expect(store.trafficById["portfoliost-admin"].requestsPerMin).toBe(12.5)
    expect(store.cachestProviders).toEqual([{ provider: "alphavantage.co", p99LatencyMs: 210 }])
    expect(store.statusFetchedAt).toBe("2026-09-11T12:00:00.000Z")
    expect(store.trafficFetchedAt).toBe("2026-09-11T12:00:01.000Z")
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it("keeps the failing dataset when one endpoint rejects", async () => {
    mocked.fetchTopologyStatus.mockRejectedValue(new Error("prometheus down"))
    mocked.fetchTopologyTraffic.mockResolvedValue(
      trafficResponse([
        { name: "portfoliost-admin", requestsPerMin: 3, errorRate: 0, p99LatencyMs: 10, source: "ingress" },
      ]),
    )

    const store = useTopologyStore()
    await store.refresh()

    expect(store.statusById).toEqual({})
    expect(store.trafficById["portfoliost-admin"].source).toBe("ingress")
    expect(store.error).toBe("status: prometheus down")
    expect(store.loading).toBe(false)
  })

  it("does not throw when both endpoints reject", async () => {
    mocked.fetchTopologyStatus.mockRejectedValue(new Error("boom"))
    mocked.fetchTopologyTraffic.mockRejectedValue(new Error("bang"))

    const store = useTopologyStore()
    await expect(store.refresh()).resolves.toBeUndefined()

    expect(store.error).toBe("status: boom; traffic: bang")
    expect(store.loading).toBe(false)
  })

  it("keeps previous data when a later poll fails", async () => {
    mocked.fetchTopologyStatus.mockResolvedValue(
      statusResponse([{ name: "cachest", reachable: true, impl: "real", replicas: { desired: 1, ready: 1 }, restarts: 0 }]),
    )
    mocked.fetchTopologyTraffic.mockResolvedValue(trafficResponse([]))

    const store = useTopologyStore()
    await store.refresh()
    expect(store.statusById["cachest"].reachable).toBe(true)

    mocked.fetchTopologyStatus.mockRejectedValue(new Error("transient"))
    await store.refresh()
    expect(store.statusById["cachest"].reachable).toBe(true)
    expect(store.error).toBe("status: transient")
  })

  it("merges static node definitions with live overlay in nodeData()", async () => {
    mocked.fetchTopologyStatus.mockResolvedValue(
      statusResponse([{ name: "cachest", reachable: true, impl: "real", version: "9.9.9", replicas: { desired: 1, ready: 1 }, restarts: 0 }]),
    )
    mocked.fetchTopologyTraffic.mockResolvedValue(
      trafficResponse([{ name: "cachest", requestsPerMin: 8, errorRate: 0, p99LatencyMs: 5, source: "otel" }]),
    )

    const store = useTopologyStore()
    await store.refresh()

    const cachest = nodeById.get("cachest")!
    const data = store.nodeData(cachest)
    expect(data.label).toBe("cachest")
    expect(data.area).toBe("data-providers")
    expect(data.live).toBe(true)
    expect(data.status?.version).toBe("9.9.9")
    expect(data.traffic?.requestsPerMin).toBe(8)

    const postgres = nodeById.get("postgres")!
    const pgData = store.nodeData(postgres)
    expect(pgData.live).toBe(true) // postgres/redis now map to probed k8s workloads
    expect(pgData.status).toBeUndefined()
    expect(pgData.traffic).toBeUndefined()
  })

  it("polls on an interval and stops cleanly", async () => {
    vi.useFakeTimers()
    mocked.fetchTopologyStatus.mockResolvedValue(statusResponse([]))
    mocked.fetchTopologyTraffic.mockResolvedValue(trafficResponse([]))

    const store = useTopologyStore()
    store.startPolling(1000)
    expect(mocked.fetchTopologyStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3000)
    expect(mocked.fetchTopologyStatus).toHaveBeenCalledTimes(4)

    store.stopPolling()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocked.fetchTopologyStatus).toHaveBeenCalledTimes(4)
  })

  it("defaults the poll interval to 30 s", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(30_000)
  })

  // D55-5 test matrix: every impl value and every Prometheus state must map to
  // the expected dot-state so the view renders the correct health colour.
  it.each<[string, TopologyStatusResponse["services"][number], DotState]>([
    [
      "real — ready replicas, low restarts → healthy",
      { name: "portfoliost-admin", reachable: true, impl: "real", replicas: { desired: 2, ready: 2 }, restarts: 1 },
      "healthy",
    ],
    [
      "mock — ready replicas, no restarts → healthy",
      { name: "portfoliost-admin", reachable: true, impl: "mock", replicas: { desired: 1, ready: 1 }, restarts: 0 },
      "healthy",
    ],
    [
      "unknown impl / unreachable → down",
      { name: "portfoliost-admin", reachable: false, impl: "unknown" },
      "down",
    ],
    [
      "job impl, no Prometheus data → unknown",
      { name: "portfoliost-admin", reachable: true, impl: "job", replicas: null, restarts: null },
      "unknown",
    ],
    [
      "real — partial replicas → degraded",
      { name: "portfoliost-admin", reachable: true, impl: "real", replicas: { desired: 3, ready: 1 }, restarts: 0 },
      "degraded",
    ],
    [
      "real — restarts ≥ 5 → degraded",
      { name: "portfoliost-admin", reachable: true, impl: "real", replicas: { desired: 1, ready: 1 }, restarts: 5 },
      "degraded",
    ],
    [
      "real — Prometheus unavailable (null/null) → unknown",
      { name: "portfoliost-admin", reachable: true, impl: "real", replicas: null, restarts: null },
      "unknown",
    ],
    [
      "real — only restarts present, >5 → degraded",
      { name: "portfoliost-admin", reachable: true, impl: "real", replicas: null, restarts: 9 },
      "degraded",
    ],
  ])(
    "status mapping: %s",
    async (_label, service, expectedState) => {
      mocked.fetchTopologyStatus.mockResolvedValue(statusResponse([service]))
      mocked.fetchTopologyTraffic.mockResolvedValue(trafficResponse([]))
      const store = useTopologyStore()
      await store.refresh()

      const def = nodeById.get("portfoliost-admin")!
      const data = store.nodeData(def)
      expect(data.status?.impl).toBe(service.impl)
      expect(dotState(data.status)).toBe(expectedState)
    },
  )
})
