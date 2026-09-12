import { describe, expect, it } from "vitest"
import {
  IDLE_FLOW_SEC,
  animationDuration,
  resolveTopologyEdge,
} from "@/modules/admin/topology/edge-state"
import { topologyEdges } from "@/modules/admin/topology/graph-definition"
import type { TopologyEdgeDef } from "@/modules/admin/topology/graph-definition"
import type { TopologyServiceTraffic } from "@/modules/admin/topology/nodes/types"

function traffic(name: string, rpm: number): TopologyServiceTraffic {
  return { name, requestsPerMin: rpm, errorRate: 0, p99LatencyMs: 10, source: "otel" }
}

function edge(overrides: Partial<TopologyEdgeDef>): TopologyEdgeDef {
  return { source: "a", target: "b", label: "t", kind: "api", measurable: "otel", ...overrides }
}

describe("resolveTopologyEdge", () => {
  it("job edges are static regardless of traffic", () => {
    const resolved = resolveTopologyEdge(
      edge({ kind: "job", source: "stooq-importer", target: "portfoliost-instruments" }),
      { "portfoliost-instruments": traffic("portfoliost-instruments", 62) },
    )
    expect(resolved).toEqual({ state: "job", requestsPerMin: 0, animationDurationSec: 0, flowing: false, intensity: 0 })
    expect(resolved.flowing).toBe(false)
  })

  it("provider edges are static regardless of traffic", () => {
    const resolved = resolveTopologyEdge(
      edge({ kind: "provider", source: "cachest", target: "alphavantage" }),
      { cachest: traffic("cachest", 30) },
    )
    expect(resolved).toEqual({ state: "provider", requestsPerMin: 0, animationDurationSec: 0, flowing: false, intensity: 0 })
  })

  it("unmeasurable edges are static idles regardless of traffic", () => {
    const resolved = resolveTopologyEdge(
      edge({ measurable: "none", kind: "storage" }),
      { a: traffic("a", 10) },
    )
    expect(resolved).toEqual({ state: "idle", requestsPerMin: 0, animationDurationSec: 0, flowing: false, intensity: 0 })
  })

  it("measurable edges flow slowly even without traffic data (never flat)", () => {
    const resolved = resolveTopologyEdge(edge({}), {})
    expect(resolved.state).toBe("idle")
    expect(resolved.requestsPerMin).toBe(0)
    expect(resolved.flowing).toBe(true)
    expect(resolved.intensity).toBe(0)
    expect(resolved.animationDurationSec).toBe(IDLE_FLOW_SEC)
  })

  it("source traffic activates the edge with speed proportional to rpm", () => {
    const resolved = resolveTopologyEdge(edge({ source: "cachest", target: "openst" }), {
      cachest: traffic("cachest", 8),
    })
    expect(resolved.state).toBe("active")
    expect(resolved.requestsPerMin).toBe(8)
    expect(resolved.flowing).toBe(true)
    expect(resolved.animationDurationSec).toBeCloseTo(0.5, 5)
  })

  it("target traffic activates gateway fan-in edges (gateway is not probed)", () => {
    const resolved = resolveTopologyEdge(
      edge({ kind: "gateway", measurable: "ingress", source: "nginx-gateway", target: "portfoliost-wallets" }),
      { "portfoliost-wallets": traffic("portfoliost-wallets", 11.5) },
    )
    expect(resolved.state).toBe("active")
    expect(resolved.requestsPerMin).toBe(11.5)
    expect(resolved.flowing).toBe(true)
  })

  it("uses the highest endpoint rpm when both endpoints are measured", () => {
    const resolved = resolveTopologyEdge(
      edge({ source: "portfoliost-admin", target: "portfoliost-instruments" }),
      {
        "portfoliost-admin": traffic("portfoliost-admin", 4.2),
        "portfoliost-instruments": traffic("portfoliost-instruments", 62),
      },
    )
    expect(resolved.state).toBe("active")
    expect(resolved.requestsPerMin).toBe(62)
    expect(resolved.animationDurationSec).toBeCloseTo(animationDuration(62), 5)
    expect(resolved.animationDurationSec).toBeCloseTo(0.15, 5) // clamped floor
    expect(resolved.intensity).toBe(1) // saturates at INTENSITY_REF_RPM
  })

  it("zero-rpm entries keep the edge flowing at idle speed", () => {
    const resolved = resolveTopologyEdge(edge({ source: "openst" }), {
      openst: traffic("openst", 0),
    })
    expect(resolved.state).toBe("idle")
    expect(resolved.requestsPerMin).toBe(0)
    expect(resolved.flowing).toBe(true)
    expect(resolved.animationDurationSec).toBe(IDLE_FLOW_SEC)
  })
})

describe("animationDuration", () => {
  it("scales inversely with rpm within clamped bounds", () => {
    expect(animationDuration(4)).toBeCloseTo(1, 5)
    expect(animationDuration(8)).toBeCloseTo(0.5, 5)
    expect(animationDuration(1)).toBeCloseTo(2, 5) // clamped from 4 s
    expect(animationDuration(100)).toBeCloseTo(0.15, 5) // clamped from 0.04 s
    expect(animationDuration(62)).toBeCloseTo(0.15, 5)
    expect(animationDuration(12)).toBeLessThan(animationDuration(3))
  })
})

describe("edge state across the static graph", () => {
  const TRAFFIC: Record<string, TopologyServiceTraffic> = {
    "portfoliost-admin": traffic("portfoliost-admin", 4.2),
    "portfoliost-users-auth": traffic("portfoliost-users-auth", 28),
    "portfoliost-wallets": traffic("portfoliost-wallets", 11.5),
    "portfoliost-instruments": traffic("portfoliost-instruments", 62),
    openst: traffic("openst", 0),
    cachest: traffic("cachest", 30),
  }

  it("classifies every static edge", () => {
    const states = topologyEdges.map((e) => resolveTopologyEdge(e, TRAFFIC))
    expect(states.length).toBe(topologyEdges.length)
    expect(states.some((s) => s.state === "active")).toBe(true)
    expect(states.some((s) => s.state === "idle")).toBe(true)
    expect(states.some((s) => s.state === "job")).toBe(true)
    expect(states.some((s) => s.state === "provider")).toBe(true)
  })

  it("gateway fan-out to measured services is active", () => {
    for (const target of ["portfoliost-users-auth", "portfoliost-wallets", "portfoliost-instruments", "portfoliost-admin"]) {
      const e = topologyEdges.find((x) => x.source === "nginx-gateway" && x.target === target)!
      expect(resolveTopologyEdge(e, TRAFFIC).state).toBe("active")
    }
  })

  it("edges from SPA and to unmeasured nodes are idle", () => {
    const spaEdge = topologyEdges.find((e) => e.source === "portfoliost")!
    expect(resolveTopologyEdge(spaEdge, TRAFFIC).state).toBe("idle")
    const storageEdge = topologyEdges.find((e) => e.target === "postgres")!
    expect(resolveTopologyEdge(storageEdge, TRAFFIC).state).toBe("idle")
  })
})