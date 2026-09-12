// D55-6 / step 9 — resolve a static topology edge into its visual state
// (active / idle / job / provider) from the live per-service traffic overlay,
// plus the moving-dot animation speed for active edges.
//
//   active    animated moving dot along a dashed path; speed ∝ request rate
//   idle      static thin line with arrow (no traffic, or unmeasurable)
//   job       static dashed line, green tint (CronJob trigger)
//   provider  static thin line, amber tint (external data provider)

import type { TopologyEdgeDef } from "./graph-definition"
import type { TopologyServiceTraffic } from "./nodes/types"

export type TopologyEdgeState = "active" | "idle" | "job" | "provider"

export interface ResolvedTopologyEdge {
  state: TopologyEdgeState
  /** Highest request rate observed on the edge endpoints; 0 when unmeasured. */
  requestsPerMin: number
  /** CSS animation duration (seconds) of one dash cycle on active edges. */
  animationDurationSec: number
}

const SPEED_REF_RPM = 4
const SPEED_MIN_SEC = 0.15
const SPEED_MAX_SEC = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** One dash cycle takes SPEED_REF_RPM / rpm seconds, clamped to a stable range. */
export function animationDuration(rpm: number): number {
  return clamp(SPEED_REF_RPM / rpm, SPEED_MIN_SEC, SPEED_MAX_SEC)
}

/**
 * Job-trigger and external-provider edges never animate (D55-6). Every other
 * edge animates only when its metric source can measure it and at least one
 * endpoint reports active traffic — the source for inter-service calls, the
 * target for gateway fan-in (the gateway itself is not a probed service).
 */
export function resolveTopologyEdge(
  edge: TopologyEdgeDef,
  trafficById: Record<string, TopologyServiceTraffic>,
): ResolvedTopologyEdge {
  if (edge.kind === "job") {
    return { state: "job", requestsPerMin: 0, animationDurationSec: 0 }
  }
  if (edge.kind === "provider") {
    return { state: "provider", requestsPerMin: 0, animationDurationSec: 0 }
  }
  if (edge.measurable === "none") {
    return { state: "idle", requestsPerMin: 0, animationDurationSec: 0 }
  }

  const rpm = Math.max(
    trafficById[edge.source]?.requestsPerMin ?? 0,
    trafficById[edge.target]?.requestsPerMin ?? 0,
  )
  if (rpm > 0) {
    return { state: "active", requestsPerMin: rpm, animationDurationSec: animationDuration(rpm) }
  }
  return { state: "idle", requestsPerMin: 0, animationDurationSec: 0 }
}