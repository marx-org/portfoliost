import { describe, expect, it } from "vitest"
import {
  filterEdgeDefs,
  filterNodeDefs,
  nodeMatchesQuery,
  normalizeQuery,
} from "@/modules/admin/topology/topology-filters"
import { NODE_AREAS, nodeById, topologyEdges, topologyNodes } from "@/modules/admin/topology/graph-definition"
import type { NodeArea, TopologyEdgeDef } from "@/modules/admin/topology/graph-definition"

function edge(overrides: Partial<TopologyEdgeDef>): TopologyEdgeDef {
  return { source: "a", target: "b", label: "t", kind: "api", measurable: "otel", ...overrides }
}

const ALL_AREAS: ReadonlySet<NodeArea> = new Set(NODE_AREAS)

describe("normalizeQuery", () => {
  it("trims and lowercases; empty input is preserved", () => {
    expect(normalizeQuery("  CacheSt  ")).toBe("cachest")
    expect(normalizeQuery("   ")).toBe("")
    expect(normalizeQuery("")).toBe("")
  })
})

describe("nodeMatchesQuery", () => {
  it("matches labels or ids case-insensitively", () => {
    const cachest = nodeById.get("cachest")!
    expect(nodeMatchesQuery(cachest, "cachest")).toBe(true)
    expect(nodeMatchesQuery(cachest, "CACHEST")).toBe(true)
    expect(nodeMatchesQuery(cachest, "cache")).toBe(true)
    // label is lowercase "cachest", so a query against the label matches too
    expect(nodeMatchesQuery({ ...cachest, label: "Cache TTL Proxy" }, "ttl proxy")).toBe(true)
    expect(nodeMatchesQuery(cachest, "openst")).toBe(false)
  })

  it("an empty query matches every node", () => {
    expect(nodeMatchesQuery(nodeById.get("cachest")!, "")).toBe(true)
  })
})

describe("filterNodeDefs", () => {
  it("returns every node when all areas are visible and query is empty", () => {
    const out = filterNodeDefs(topologyNodes, ALL_AREAS, "")
    expect(out.map((n) => n.id)).toEqual(topologyNodes.map((n) => n.id))
  })

  it("honours both the area set and the query in combination", () => {
    const areas: ReadonlySet<NodeArea> = new Set(["data-providers"])
    const out = filterNodeDefs(topologyNodes, areas, "cache")
    expect(out.map((n) => n.id)).toEqual(["cachest"])
  })

  it("only returns nodes whose area is in the visible set", () => {
    const areas: ReadonlySet<NodeArea> = new Set(["internal"])
    const out = filterNodeDefs(topologyNodes, areas, "")
    expect(out.every((n) => n.area === "internal")).toBe(true)
    expect(out.map((n) => n.id)).toContain("portfoliost")
    expect(out.map((n) => n.id)).not.toContain("cachest")
  })

  it("query wins even when the area is visible", () => {
    const out = filterNodeDefs(topologyNodes, ALL_AREAS, "postgres")
    expect(out.map((n) => n.id)).toEqual(["postgres"])
  })
})

describe("filterEdgesByVisible", () => {
  it("keeps an edge only when both endpoints remain visible", () => {
    const ids = new Set(["cachest", "openst"])
    expect(filterEdgeDefs([edge({ source: "cachest", target: "openst" })], ids)).toHaveLength(1)
    expect(filterEdgeDefs([edge({ source: "cachest", target: "redis" })], ids)).toHaveLength(0)
    expect(filterEdgeDefs([edge({ source: "redis", target: "cachest" })], ids)).toHaveLength(0)
  })

  it("static graph: filtering Providers drops every provider-bound edge endpoint", () => {
    const providers = new Set(topologyNodes.filter((n) => n.area === "data-providers").map((n) => n.id))
    const kept = filterEdgeDefs(topologyEdges, providers)
    expect(kept.every((e) => providers.has(e.source) && providers.has(e.target))).toBe(true)
    // market-data chain services stay out of a providers-only view
    expect(kept.every((e) => !["portfoliost-instruments", "portfoliost-admin"].includes(e.source))).toBe(true)
  })
})