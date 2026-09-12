import { describe, expect, it } from "vitest"
import { clampLaneMotion, LANE_BOUNDS } from "@/modules/admin/topology/topology-lane-motion"
import type { LaneRect } from "@/modules/admin/topology/topology-lane-motion"

describe("topology lane motion clamp (D55 follow-up)", () => {
  const lane: LaneRect = { x: 100, y: 100, width: 200, height: 120 }

  it("passes through a displacement that hits nothing", () => {
    const r = clampLaneMotion(lane, 40, 60, [])
    expect(r).toEqual({ dx: 40, dy: 60 })
  })

  it("clamps to zero when the request would overlap a sibling lane", () => {
    const blocker: LaneRect = { x: 120, y: 100, width: 200, height: 120 }
    const r = clampLaneMotion(lane, 40, 0, [blocker])
    expect(r).toEqual({ dx: 0, dy: 0 })
  })

  it("keeps the lane collision-free after intersecting displacement is reduced", () => {
    // Blocker sits 10px from the lane's right edge; dragging 80 px right must
    // stop before the boxes can touch.
    const blocker: LaneRect = { x: 310, y: 0, width: 50, height: 500 }
    const r = clampLaneMotion(lane, 80, 0, [blocker])
    const moved = { x: lane.x + r.dx, y: lane.y + r.dy, width: lane.width, height: lane.height }
    const ox = Math.min(moved.x + moved.width, blocker.x + blocker.width) - Math.max(moved.x, blocker.x)
    const oy = Math.min(moved.y + moved.height, blocker.y + blocker.height) - Math.max(moved.y, blocker.y)
    expect(ox > 0 && oy > 0).toBe(false)
    expect(Math.abs(r.dx - 10)).toBeLessThan(1)
    expect(r.dx).toBeGreaterThan(0)
  })

  it("stops at the canvas bounds instead of leaving them", () => {
    // A pure diagonal displacement can never exceed the narrower axis limit.
    const maxDx = LANE_BOUNDS.right - (lane.x + lane.width)
    const maxDy = LANE_BOUNDS.bottom - (lane.y + lane.height)
    const r = clampLaneMotion(lane, 10000, 10000, [])
    const limited = Math.min(maxDx, maxDy)
    expect(Math.round(r.dx)).toBe(limited)
    expect(Math.round(r.dy)).toBe(limited)
    const moved = { x: lane.x + r.dx, y: lane.y + r.dy, width: lane.width, height: lane.height }
    expect(moved.x + moved.width).toBeLessThanOrEqual(LANE_BOUNDS.right + 0.01)
    expect(moved.y + moved.height).toBeLessThanOrEqual(LANE_BOUNDS.bottom + 0.01)
  })

  it("returns identity for a zero displacement", () => {
    expect(clampLaneMotion(lane, 0, 0, [])).toEqual({ dx: 0, dy: 0 })
  })
})