import { describe, expect, it } from "vitest"
import { layoutTopology, NODE_SIZES } from "@/modules/admin/topology/topology-layout"
import { NODE_AREAS, nodeById, topologyNodes } from "@/modules/admin/topology/graph-definition"

const layout = layoutTopology()

function centerX(id: string): number {
  const def = nodeById.get(id)!
  return layout.positions[id].x + NODE_SIZES[def.area].width / 2
}

describe("topology layout (D55-9)", () => {
  it("assigns a finite position to every node", () => {
    for (const def of topologyNodes) {
      const p = layout.positions[def.id]
      expect(p, def.id).toBeDefined()
      expect(Number.isFinite(p.x), `${def.id}.x`).toBe(true)
      expect(Number.isFinite(p.y), `${def.id}.y`).toBe(true)
    }
  })

  it("is deterministic across runs", () => {
    const again = layoutTopology()
    expect(JSON.stringify(again.positions)).toBe(JSON.stringify(layout.positions))
    expect(JSON.stringify(again.lanes)).toBe(JSON.stringify(layout.lanes))
  })

  it("lays out the data-flow chain left to right: Providers → openst/cachest → services → gateway → SPA", () => {
    // Pure OpenBB-SDK leaves form the left-most column, left of openst.
    for (const id of ["yfinance", "fmp", "intrinio", "polygon", "sec", "nasdaq", "cboe", "tiingo", "tmx"]) {
      expect(centerX(id), id).toBeLessThan(centerX("openst"))
    }
    // Direct cachest leaves sit left of cachest.
    for (const id of ["alphavantage", "dividendhistory"]) {
      expect(centerX(id), id).toBeLessThan(centerX("cachest"))
    }
    // ECB (FX rates) sits left of the wallets service that consumes it.
    expect(centerX("ecb")).toBeLessThan(centerX("portfoliost-wallets"))
    expect(centerX("openst")).toBeLessThan(centerX("cachest"))
    expect(centerX("cachest")).toBeLessThanOrEqual(centerX("portfoliost-users-auth"))
    expect(centerX("portfoliost-users-auth")).toBeLessThan(centerX("portfoliost-wallets"))
    expect(centerX("portfoliost-wallets")).toBeLessThanOrEqual(centerX("portfoliost-instruments"))
    expect(centerX("portfoliost-instruments")).toBeLessThan(centerX("portfoliost-admin"))
    expect(centerX("portfoliost-admin")).toBeLessThan(centerX("nginx-gateway"))
    expect(centerX("nginx-gateway")).toBeLessThan(centerX("portfoliost"))
  })

  it("places the swim lanes in the plan's left-to-right order (left edges)", () => {
    const leftEdge = (area: (typeof NODE_AREAS)[number]): number =>
      layout.lanes.find((l) => l.area === area)!.x
    expect(leftEdge("data-providers")).toBeLessThan(leftEdge("storage"))
    expect(leftEdge("storage")).toBeLessThan(leftEdge("internal"))
    expect(leftEdge("internal")).toBeLessThan(leftEdge("external-services"))
  })

  it("emits exactly one lane per area", () => {
    expect(layout.lanes.map((l) => l.area).sort()).toEqual([...NODE_AREAS].sort())
    for (const lane of layout.lanes) {
      expect(lane.width).toBeGreaterThan(0)
      expect(lane.height).toBeGreaterThan(0)
    }
  })

  it("covers every node of its area with the matching lane", () => {
    for (const def of topologyNodes) {
      const lane = layout.lanes.find((l) => l.area === def.area)!
      const p = layout.positions[def.id]
      const s = NODE_SIZES[def.area]
      expect(p.x, def.id).toBeGreaterThanOrEqual(lane.x)
      expect(p.y, def.id).toBeGreaterThanOrEqual(lane.y)
      expect(p.x + s.width, def.id).toBeLessThanOrEqual(lane.x + lane.width)
      expect(p.y + s.height, def.id).toBeLessThanOrEqual(lane.y + lane.height)
    }
  })

  it("separates the swim lanes so no lane fully contains another", () => {
    for (let i = 0; i < layout.lanes.length; i++) {
      for (let j = i + 1; j < layout.lanes.length; j++) {
        const a = layout.lanes[i]
        const b = layout.lanes[j]
        const aInB = b.x <= a.x && b.y <= a.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height
        const bInA = a.x <= b.x && a.y <= b.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
        expect(aInB || bInA, `${a.area} / ${b.area}`).toBe(false)
      }
    }
  })

  it("keeps the External lane compact (isolated nodes pinned, no canvas-spanning lane)", () => {
    const lane = layout.lanes.find((l) => l.area === "external-services")!
    const full = layout.lanes.reduce((m, l) => Math.max(m, l.x + l.width), 0)
    expect(lane.width).toBeLessThan(full * 0.5)
  })
})
