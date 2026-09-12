// D55-7 / step 10 — selection state for the Topology canvas. When a node is
// clicked it is highlighted (ring), its directly connected edges and their
// endpoints stay at full opacity, and every unrelated node and edge is dimmed
// (opacity 0.2). Clicking the canvas background resets the selection. The
// view derives these visuals from the pure functions below.
//
//   selected  the clicked node itself
//   connected edge directly shared with the selected node
//   dimmed    selection active and no edge shared with the selected node

import type { TopologyEdgeDef } from "./graph-definition"

export interface SelectionNodeState {
  selected: boolean
  connected: boolean
  dimmed: boolean
}

export interface SelectionEdgeState {
  connected: boolean
  dimmed: boolean
}

/** No selection active — every node and edge renders at full opacity. */
export const NO_SELECTION_NODE: SelectionNodeState = Object.freeze({
  selected: false,
  connected: false,
  dimmed: false,
})

export const NO_SELECTION_EDGE: SelectionEdgeState = Object.freeze({
  connected: false,
  dimmed: false,
})

export function nodeSelectionState(
  selectedId: string | null,
  id: string,
  edges: TopologyEdgeDef[],
): SelectionNodeState {
  if (!selectedId) return NO_SELECTION_NODE
  if (selectedId === id) return { selected: true, connected: true, dimmed: false }

  const connected = edges.some(
    (e) => (e.source === selectedId && e.target === id) || (e.target === selectedId && e.source === id),
  )
  return { selected: false, connected, dimmed: !connected }
}

export function edgeSelectionState(
  selectedId: string | null,
  edge: TopologyEdgeDef,
): SelectionEdgeState {
  if (!selectedId) return NO_SELECTION_EDGE

  const connected = edge.source === selectedId || edge.target === selectedId
  return { connected, dimmed: !connected }
}

/** True when a selection is active (controls whether dimming applies). */
export function hasSelection(selectedId: string | null): boolean {
  return selectedId !== null
}