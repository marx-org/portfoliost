import { describe, expect, it } from "vitest"
import { NODE_AREAS } from "@/modules/admin/topology/graph-definition"
import { TOPOLOGY_NODE_TYPES } from "@/modules/admin/topology/nodes"
import { dotState, hasActiveTraffic } from "@/modules/admin/topology/nodes/status"
import type {
  TopologyServiceStatus,
  TopologyServiceTraffic,
} from "@/modules/admin/topology/nodes/types"

function status(over: Partial<TopologyServiceStatus> = {}): TopologyServiceStatus {
  return { name: "svc", reachable: true, impl: "real", ...over }
}

function traffic(requestsPerMin: number): TopologyServiceTraffic {
  return { name: "svc", requestsPerMin, errorRate: 0, p99LatencyMs: 0, source: "otel" }
}

describe("dotState", () => {
  it("is unknown when no status snapshot exists", () => {
    expect(dotState(undefined)).toBe("unknown")
    expect(dotState(null)).toBe("unknown")
  })

  it("is down when unreachable", () => {
    expect(dotState(status({ reachable: false }))).toBe("down")
  })

  it("is down when impl is unknown", () => {
    expect(dotState(status({ impl: "unknown" }))).toBe("down")
  })

  it("is unknown when no Prometheus data is present", () => {
    expect(dotState(status({ replicas: null, restarts: null }))).toBe("unknown")
  })

  it("is healthy when all replicas are ready and restarts are low", () => {
    expect(dotState(status({ replicas: { desired: 2, ready: 2 }, restarts: 3 }))).toBe("healthy")
    expect(dotState(status({ replicas: { desired: 1, ready: 1 }, restarts: null }))).toBe("healthy")
  })

  it("is degraded when replicas are only partially ready", () => {
    expect(dotState(status({ replicas: { desired: 2, ready: 1 }, restarts: 0 }))).toBe("degraded")
  })

  it("is degraded when restart count reaches 5", () => {
    expect(dotState(status({ replicas: { desired: 1, ready: 1 }, restarts: 5 }))).toBe("degraded")
    expect(dotState(status({ replicas: null, restarts: 7 }))).toBe("degraded")
  })

  it("is degraded when both conditions fail", () => {
    expect(dotState(status({ replicas: { desired: 3, ready: 1 }, restarts: 9 }))).toBe("degraded")
  })
})

describe("hasActiveTraffic", () => {
  it("is true only when requests are flowing", () => {
    expect(hasActiveTraffic(traffic(5))).toBe(true)
    expect(hasActiveTraffic(traffic(0))).toBe(false)
    expect(hasActiveTraffic(undefined)).toBe(false)
  })
})

describe("TOPOLOGY_NODE_TYPES", () => {
  it("provides a custom component for every node area", () => {
    expect(Object.keys(TOPOLOGY_NODE_TYPES).sort()).toEqual([...NODE_AREAS].sort())
    for (const area of NODE_AREAS) {
      expect(TOPOLOGY_NODE_TYPES[area]).toBeTruthy()
    }
  })
})
