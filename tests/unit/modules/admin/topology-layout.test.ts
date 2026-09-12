import { describe, expect, it } from "vitest"
import { layoutTopology, nearOverlap, packAreas, NODE_SIZES, laneId } from "@/modules/admin/topology/topology-layout"
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

  it("separates the swim lanes so no two lanes overlap (D55 follow-up)", () => {
    for (let i = 0; i < layout.lanes.length; i++) {
      for (let j = i + 1; j < layout.lanes.length; j++) {
        const a = layout.lanes[i]
        const b = layout.lanes[j]
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(overlapX > 0 && overlapY > 0, `${a.area} / ${b.area}`).toBe(false)
      }
    }
  })

  it("provides stable lane ids usable as vue-flow parent nodes", () => {
    const ids = layout.lanes.map((l) => laneId(l.area))
    expect(new Set(ids).size).toBe(ids.length)
    for (const lane of layout.lanes) {
      expect(laneId(lane.area)).toMatch(/^lane-/)
    }
  })

  it("every member node sits strictly inside its lane (bounded boxes)", () => {
    for (const def of topologyNodes) {
      const lane = layout.lanes.find((l) => l.area === def.area)!
      const p = layout.positions[def.id]
      const s = NODE_SIZES[def.area]
      expect(p.x - lane.x, def.id).toBeGreaterThanOrEqual(0)
      expect(p.y - lane.y, def.id).toBeGreaterThanOrEqual(0)
      expect(lane.x + lane.width - (p.x + s.width), def.id).toBeGreaterThanOrEqual(0)
      expect(lane.y + lane.height - (p.y + s.height), def.id).toBeGreaterThanOrEqual(0)
    }
  })

  it("packAreas stacks overlapping boxes deterministically with no overlap", () => {
    const raw = {
      "data-providers": { x: 0, y: 0, width: 300, height: 200 },
      storage: { x: 0, y: 40, width: 300, height: 200 },
      internal: { x: 0, y: 80, width: 300, height: 200 },
      jobs: { x: 0, y: 120, width: 300, height: 200 },
      "external-services": { x: 0, y: 160, width: 300, height: 200 },
    }
    const shifts = packAreas(raw)
    const placed = (Object.keys(shifts) as (typeof NODE_AREAS)[number][]).map((a) => {
      const r = raw[a]
      return { area: a, x: r.x + shifts[a].x, y: r.y + shifts[a].y, width: r.width, height: r.height }
    })
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]
        const b = placed[j]
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(ox > 0 && oy > 0, `${a.area} / ${b.area}`).toBe(false)
      }
    }
    // Deterministic: same input, same shifts.
    expect(JSON.stringify(packAreas(raw))).toBe(JSON.stringify(shifts))
    // Horizontal positions are untouched.
    for (const a of Object.keys(shifts) as (typeof NODE_AREAS)[number][]) {
      expect(shifts[a].x, a).toBe(0)
    }
  })

  it("nearOverlap reports proximity inside the gap threshold (overlap counts as near)", () => {
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 90, y: 0, width: 100, height: 100 }, 16)).toBe(true)
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 }, 16)).toBe(true)
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 110, y: 0, width: 100, height: 100 }, 16)).toBe(true)
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 130, y: 0, width: 100, height: 100 }, 16)).toBe(false)
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 50, width: 100, height: 100 }, 16)).toBe(true)
    expect(nearOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 116, width: 100, height: 100 }, 16)).toBe(false)
  })

  it("keeps the External lane compact (isolated nodes pinned, no canvas-spanning lane)", () => {
    const lane = layout.lanes.find((l) => l.area === "external-services")!
    const full = layout.lanes.reduce((m, l) => Math.max(m, l.x + l.width), 0)
    expect(lane.width).toBeLessThan(full * 0.5)
  })
})
