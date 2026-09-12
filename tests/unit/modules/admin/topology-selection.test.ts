import { describe, expect, it } from "vitest"
import {
  edgeSelectionState,
  hasSelection,
  nodeSelectionState,
} from "@/modules/admin/topology/topology-selection"
import { topologyNodes, topologyEdges } from "@/modules/admin/topology/graph-definition"
import type { TopologyEdgeDef } from "@/modules/admin/topology/graph-definition"

function edge(overrides: Partial<TopologyEdgeDef>): TopologyEdgeDef {
  return { source: "a", target: "b", label: "t", kind: "api", measurable: "otel", ...overrides }
}

describe("nodeSelectionState", () => {
  it("no selection leaves every node untouched", () => {
    expect(nodeSelectionState(null, "cachest", topologyEdges)).toEqual({
      selected: false,
      connected: false,
      dimmed: false,
    })
  })

  it("marks the clicked node selected and not dimmed", () => {
    const state = nodeSelectionState("cachest", "cachest", topologyEdges)
    expect(state.selected).toBe(true)
    expect(state.connected).toBe(true)
    expect(state.dimmed).toBe(false)
  })

  it("keeps directly connected neighbours at full opacity", () => {
    // cachest edges: ->openst, ->dividendhistory, ->alphavantage, ->fmp, ->redis,
    // and <-portfoliost-instruments
    for (const id of ["openst", "dividendhistory", "alphavantage", "fmp", "redis", "portfoliost-instruments"]) {
      const state = nodeSelectionState("cachest", id, topologyEdges)
      expect(state.dimmed).toBe(false)
      expect(state.connected).toBe(true)
      expect(state.selected).toBe(false)
    }
  })

  it("dims nodes with no edge to the selection", () => {
    // postgres only peers with wallet/storage services, never with cachest.
    const state = nodeSelectionState("cachest", "portfoliost", topologyEdges)
    expect(state.connected).toBe(false)
    expect(state.dimmed).toBe(true)
    expect(state.selected).toBe(false)
  })
})

describe("edgeSelectionState", () => {
  it("no selection leaves every edge untouched", () => {
    expect(edgeSelectionState(null, edge({}))).toEqual({ connected: false, dimmed: false })
  })

  it("keeps edges incident to the selection and dims the rest", () => {
    const incident = edge({ source: "cachest", target: "openst" })
    expect(edgeSelectionState("cachest", incident)).toEqual({ connected: true, dimmed: false })

    const unrelated = edge({ source: "portfoliost", target: "nginx-gateway" })
    expect(edgeSelectionState("cachest", unrelated)).toEqual({ connected: false, dimmed: true })
  })
})

describe("selection across the static graph", () => {
  const everyNodeId = topologyNodes.map((n) => n.id)

  it("selecting a node touches every node exactly once (selected|connected|dimmed)", () => {
    const selectedId = "portfoliost-instruments"
    for (const id of everyNodeId) {
      const state = nodeSelectionState(selectedId, id, topologyEdges)
      if (id === selectedId) {
        expect(state).toEqual({ selected: true, connected: true, dimmed: false })
        continue
      }
      // every other node is exactly one of: directly connected, or dimmed
      const flags = [state.connected, state.dimmed].filter(Boolean)
      expect(flags.length).toBe(1)
      expect(state.selected).toBe(false)
    }
    expect(topologyEdges.some((e) => edgeSelectionState(selectedId, e).dimmed)).toBe(true)
    expect(topologyEdges.some((e) => edgeSelectionState(selectedId, e).connected)).toBe(true)
  })

  it("hasSelection reflects active vs. cleared selection", () => {
    expect(hasSelection(null)).toBe(false)
    expect(hasSelection("cachest")).toBe(true)
  })

  it("every static node resolves against every static selection without error", () => {
    for (const sel of everyNodeId) {
      for (const id of everyNodeId) nodeSelectionState(sel, id, topologyEdges)
    }
  })
})