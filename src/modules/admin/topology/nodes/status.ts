// D55-5 — status-dot logic. Maps a live service status snapshot (plus traffic)
// onto a single health state that drives the coloured dot rendered on each node.
//
//   healthy  green  reachable + all replicas ready + restarts < 5
//   degraded amber  reachable, but partial replicas or restarts >= 5
//   down     red    unreachable / impl "unknown"
//   unknown  grey   no Prometheus data available (CronJob / external provider)

import type { TopologyServiceStatus, TopologyServiceTraffic } from "./types"

export type DotState = "healthy" | "degraded" | "down" | "unknown"

export function dotState(status?: TopologyServiceStatus | null): DotState {
  if (!status) return "unknown"
  if (!status.reachable || status.impl === "unknown") return "down"

  const replicas = status.replicas ?? null
  const restarts = status.restarts ?? null

  // Neither Prometheus signal is present → nothing to grade on (CronJob, etc.).
  if (replicas === null && restarts === null) return "unknown"

  if (restarts !== null && restarts >= 5) return "degraded"
  if (replicas !== null && replicas.ready < replicas.desired) return "degraded"

  return "healthy"
}

/** True when the service is handling traffic now — the dot pulses. */
export function hasActiveTraffic(traffic?: TopologyServiceTraffic | null): boolean {
  return (traffic?.requestsPerMin ?? 0) > 0
}

export const DOT_STYLES: Record<DotState, string> = {
  healthy: "bg-green-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-slate-400",
}

export const DOT_LABELS: Record<DotState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
}
