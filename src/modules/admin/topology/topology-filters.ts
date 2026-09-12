// D55 / step 11 — pure filtering helpers for the Topology toolbar (search +
// area filter pills). Kept separate from TopologyView.vue so the filter rules
// are unit-testable: the view derives visible node ids from the static
// definition, then subsets the already-computed flow nodes/edges.

import type { NodeArea, TopologyEdgeDef, TopologyNodeDef } from "./graph-definition"

/** Trim + lowercase a raw search term; empty string means "match everything". */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

/** True when a node matches a query against its label or id (case-insensitive). */
export function nodeMatchesQuery(def: TopologyNodeDef, query: string): boolean {
  const q = normalizeQuery(query)
  if (!q) return true
  return def.label.toLowerCase().includes(q) || def.id.toLowerCase().includes(q)
}

/** Static nodes that live in a visible area AND match the query. */
export function filterNodeDefs(
  defs: readonly TopologyNodeDef[],
  visibleAreas: ReadonlySet<NodeArea>,
  query: string,
): TopologyNodeDef[] {
const q = normalizeQuery(query)
  return defs.filter((def) => visibleAreas.has(def.area) && nodeMatchesQuery(def, q))
}

/** Keep only edges whose source AND target are both still visible. */
export function filterEdgesByVisible<E extends { source: string; target: string }>(
  edges: readonly E[],
  visibleNodeIds: ReadonlySet<string>,
): E[] {
  return edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
}

/** Same as filterEdgesByVisible but typed for the static edge definition. */
export function filterEdgeDefs(
  edges: readonly TopologyEdgeDef[],
  visibleNodeIds: ReadonlySet<string>,
): TopologyEdgeDef[] {
  return filterEdgesByVisible(edges, visibleNodeIds)
}