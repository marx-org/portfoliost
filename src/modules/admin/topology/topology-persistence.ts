// D55 / topology layout persistence — manual node/lane positions survive a
// reload (localStorage). The canonical layout stays the source of truth: a
// stored layout is only applied when it exactly covers every known node/lane
// id, so graph-definition changes invalidate the cache and fall back to the
// fresh dagre layout instead of rendering nodes with stale coordinates.

export const TOPOLOGY_LAYOUT_KEY = "pfire.topology-layout.v1"
export const TOPOLOGY_LAYOUT_VERSION = 1

export type TopologyLayoutPositions = Record<string, { x: number; y: number }>

export function saveTopologyLayout(positions: Readonly<TopologyLayoutPositions>): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TOPOLOGY_LAYOUT_KEY, JSON.stringify({ version: TOPOLOGY_LAYOUT_VERSION, positions }))
  } catch {
    // quota / private mode — introspection must not throw
  }
}

/**
 * Load a stored layout when it is structurally valid and covers exactly the
 * given known ids (nodes + lanes). Returns null otherwise, so the caller can
 * stick with the current layout. The stored coordinates are absolute.
 */
export function loadTopologyLayout(knownIds: ReadonlySet<string>): TopologyLayoutPositions | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(TOPOLOGY_LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number; positions?: Record<string, unknown> }
    if (parsed.version !== TOPOLOGY_LAYOUT_VERSION || !parsed.positions) return null

    const ids = Object.keys(parsed.positions)
    if (ids.length !== knownIds.size || !ids.every((id) => knownIds.has(id))) return null

    const out: TopologyLayoutPositions = {}
    for (const [id, value] of Object.entries(parsed.positions)) {
      const p = value as { x?: unknown; y?: unknown }
      if (typeof p.x !== "number" || !Number.isFinite(p.x) || typeof p.y !== "number" || !Number.isFinite(p.y)) return null
      out[id] = { x: p.x, y: p.y }
    }
    return out
  } catch {
    return null
  }
}

export function clearTopologyLayout(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(TOPOLOGY_LAYOUT_KEY)
  } catch {
    // ignore
  }
}