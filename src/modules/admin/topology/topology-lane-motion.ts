// D55 / topology lane movement — resolve a lane's requested drag displacement
// (dx, dy) into the largest displacement that keeps the lane clear of every
// sibling lane and inside the canvas bounds. Pure + deterministic, so unit
// tests can lock the "boxes never overlap" guarantee.

export interface LaneRect {
  x: number
  y: number
  width: number
  height: number
}

/** Bounds beyond which a lane cannot be dragged (graph coordinates). */
export const LANE_BOUNDS = { left: 0, top: 0, right: 4800, bottom: 4800 }

function intersects(a: LaneRect, b: LaneRect): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0
}

function inBounds(rect: LaneRect): boolean {
  return (
    rect.x >= LANE_BOUNDS.left &&
    rect.y >= LANE_BOUNDS.top &&
    rect.x + rect.width <= LANE_BOUNDS.right &&
    rect.y + rect.height <= LANE_BOUNDS.bottom
  )
}

/**
 * Largest fraction of the requested displacement that does not make `lane`
 * intersect any lane in `others` (nor leave the canvas). Binary search on the
 * displacement fraction; the at-rest lane is guaranteed collision-free.
 */
export function clampLaneMotion(lane: LaneRect, dx: number, dy: number, others: LaneRect[]): { dx: number; dy: number } {
  if (dx === 0 && dy === 0) return { dx, dy }

  const collides = (x: number, y: number): boolean => {
    const target: LaneRect = { x: lane.x + x, y: lane.y + y, width: lane.width, height: lane.height }
    if (!inBounds(target)) return true
    return others.some((o) => intersects(target, o))
  }

  if (!collides(dx, dy)) return { dx, dy }

  let lo = 0 // feasible
  let hi = 1 // infeasible
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (collides(dx * mid, dy * mid)) hi = mid
    else lo = mid
  }

  const tx = dx * lo
  const ty = dy * lo
  return { dx: Math.abs(tx) < 0.01 ? 0 : tx, dy: Math.abs(ty) < 0.01 ? 0 : ty }
}