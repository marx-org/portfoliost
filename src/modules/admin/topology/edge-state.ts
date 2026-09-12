// D55-6 / step 9 — resolve a static topology edge into its visual state
// (active / idle / job / provider) from the live per-service traffic overlay,
// plus the FlowEdge animation speed (`flowing`) and glow intensity.
//
//   active    brighter flowing dots along the path; speed ∝ request rate
//   idle      measurable edge with no traffic: slow steady flow (never flat)
//   job       static dashed line, green tint (CronJob trigger)
//   provider  static thin line, amber tint (external data provider)
//
// Every edge whose data-plane traffic is measureable (`api` / `auth` /
// `gateway`, `measurable !== "none"`) flows continuously. Traffic only changes
// how fast and how brightly it flows; a completely static canvas is the
// "provider data missing" failure mode, so flowing is independent of whether
// the traffic endpoint has produced data yet.

import type { TopologyEdgeDef } from "./graph-definition"
import type { TopologyServiceTraffic } from "./nodes/types"

export type TopologyEdgeState = "active" | "idle" | "job" | "provider"

export interface ResolvedTopologyEdge {
  state: TopologyEdgeState
  /** Highest request rate observed on the edge endpoints; 0 when unmeasured. */
  requestsPerMin: number
  /** CSS animation duration (seconds) of one flow cycle along the edge. */
  animationDurationSec: number
  /** True when the edge renders the moving-dot flow overlay (measurable). */
  flowing: boolean
  /** 0..1 — how fast/bright the flow should be, proportional to rpm. */
  intensity: number
}

const SPEED_REF_RPM = 4
const SPEED_MIN_SEC = 0.15
const SPEED_MAX_SEC = 2

/** Slow, calm flow for measurable edges that currently carry no traffic. */
export const IDLE_FLOW_SEC = 4.5

/** Request rate that saturates the flow intensity at 1. */
export const INTENSITY_REF_RPM = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** One flow cycle takes SPEED_REF_RPM / rpm seconds, clamped to a stable range. */
export function animationDuration(rpm: number): number {
  return clamp(SPEED_REF_RPM / rpm, SPEED_MIN_SEC, SPEED_MAX_SEC)
}

function intensity(rpm: number): number {
  return clamp(rpm / INTENSITY_REF_RPM, 0, 1)
}

const STATIC_EDGE = { requestsPerMin: 0, animationDurationSec: 0, flowing: false, intensity: 0 } as const

/**
 * Job-trigger and external-provider edges never move (D55-6), and neither do
 * edges no metric source can measure. Everything else flows: the source for
 * inter-service calls, the target for gateway fan-in (the gateway itself is
 * not a probed service). Live traffic only drives speed and brightness.
 */
export function resolveTopologyEdge(
  edge: TopologyEdgeDef,
  trafficById: Record<string, TopologyServiceTraffic>,
): ResolvedTopologyEdge {
  if (edge.kind === "job") {
    return { ...STATIC_EDGE, state: "job" }
  }
  if (edge.kind === "provider") {
    return { ...STATIC_EDGE, state: "provider" }
  }
  if (edge.measurable === "none") {
    return { ...STATIC_EDGE, state: "idle" }
  }

  const rpm = Math.max(
    trafficById[edge.source]?.requestsPerMin ?? 0,
    trafficById[edge.target]?.requestsPerMin ?? 0,
  )
  if (rpm > 0) {
    return {
      state: "active",
      requestsPerMin: rpm,
      animationDurationSec: animationDuration(rpm),
      flowing: true,
      intensity: intensity(rpm),
    }
  }
  return {
    state: "idle",
    requestsPerMin: 0,
    animationDurationSec: IDLE_FLOW_SEC,
    flowing: true,
    intensity: 0,
  }
}