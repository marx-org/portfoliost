// D55-9 / step 8 — dagre hierarchical layout + swim-lane geometry for the
// Topology canvas. The static graph (graph-definition.ts) is laid out with
// rankdir "RL" so the natural layering places the data-flow chain left to
// right — Providers → openst/cachest → services → gateway → SPA — because
// every request edge points upstream (SPA → gateway → services → providers).
//
// Each thematic area becomes a movable lane box (LaneBox) that never overlaps
// another one: `packAreas` runs a deterministic greedy stack (ascending raw
// top, push each lane down until it clears every already-placed lane). The
// lane geometry is returned to TopologyView.vue, which renders each area as a
// vue-flow parent node; its member nodes live with `extent: "parent"` so they
// physically cannot leave the box, and dragging a lane header moves the whole
// group at once (clamped against sibling lanes).

import { Graph, layout } from "@dagrejs/dagre"

import { AREA_LABELS, NODE_AREAS, areaNodes, topologyEdges, topologyNodes } from "./graph-definition"
import type { NodeArea } from "./graph-definition"

export interface LaneBox {
  area: NodeArea
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface TopologyLayout {
  /** Top-left position of every member node (graph coordinates, absolute). */
  positions: Record<string, { x: number; y: number }>
  lanes: LaneBox[]
}

/** Vue-flow parent-node id for an area lane. */
export function laneId(area: NodeArea): string {
  return `lane-${area}`
}

/** Approximate rendered node size per area — drives dagre spacing. */
export const NODE_SIZES: Record<NodeArea, { width: number; height: number }> = {
  internal: { width: 200, height: 40 },
  storage: { width: 150, height: 40 },
  jobs: { width: 160, height: 40 },
  "external-services": { width: 160, height: 36 },
  "data-providers": { width: 120, height: 28 },
}

const LANE_PADDING = 24
/** Minimum separation kept between two lanes after packing. */
const LANE_GAP = 16

/**
 * Nodes without edges would default to the first rank (right-most in RL).
 * Pin each to the column of the node it logically belongs next to, so the
 * External/Jobs swim lanes stay compact instead of spanning the canvas.
 * Isolated nodes have no edges, so moving them cannot affect edge routing.
 */
const ISOLATED_ANCHORS: Array<{ id: string; anchor: string }> = [
  { id: "mastra-ticker", anchor: "portfoliost-instruments" },
  { id: "scanst", anchor: "portfoliost-instruments" },
]

function buildDagreGraph() {
  const g = new Graph()
  g.setGraph({ rankdir: "RL", ranksep: 70, nodesep: 16, marginx: 12, marginy: 12 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of topologyNodes) {
    g.setNode(n.id, { ...NODE_SIZES[n.area] })
  }
  for (const e of topologyEdges) {
    g.setEdge(e.source, e.target)
  }
  return g
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Upper-left bounding rect of an area's nodes (plus lane padding). */
function areaBox(positions: TopologyLayout["positions"], area: NodeArea): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of areaNodes(area)) {
    const p = positions[n.id]
    const s = NODE_SIZES[area]
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + s.width)
    maxY = Math.max(maxY, p.y + s.height)
  }
  return { x: minX - LANE_PADDING, y: minY - LANE_PADDING, width: maxX - minX + LANE_PADDING * 2, height: maxY - minY + LANE_PADDING * 2 }
}

/** True when `a` and `b` come within `gap` px of each other (overlap counts). */
export function nearOverlap(a: Rect, b: Rect, gap: number): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return ox > -gap && oy > -gap
}

/**
 * Deterministic greedy pack: process areas top-down (by raw y, then definition
 * order) and push each lane straight down until it clears every already-placed
 * lane by at least LANE_GAP. Result lanes are pairwise disjoint. Horizontal
 * positions are untouched, preserving the left-to-right column reading.
 */
export function packAreas(raw: Record<NodeArea, Rect>): Record<NodeArea, { x: number; y: number }> {
  const order = NODE_AREAS.slice().sort((a, b) => raw[a].y - raw[b].y || NODE_AREAS.indexOf(a) - NODE_AREAS.indexOf(b))
  const placed: Rect[] = []
  const out = {} as Record<NodeArea, { x: number; y: number }>
  for (const area of order) {
    let px = raw[area].x
    let py = raw[area].y
    while (placed.some((p) => nearOverlap({ ...raw[area], x: px, y: py }, p, LANE_GAP))) {
      py += 24
    }
    placed.push({ ...raw[area], x: px, y: py })
    out[area] = { x: px - raw[area].x, y: py - raw[area].y }
  }
  return out
}

export function layoutTopology(): TopologyLayout {
  const g = buildDagreGraph()
  layout(g)

  // Reposition isolated nodes next to their anchor (stacked below the column).
  // dagre v3 ignores minRank/maxRank, so an isolated node would otherwise
  // default to the first rank (right-most in RL), stretching the External /
  // Jobs swim lanes across the whole canvas. Guarded, so a future edge in
  // the definition automatically lifts the pin.
  const columnBottom = new Map<number, number>()
  for (const n of topologyNodes) {
    const p = g.node(n.id)
    const s = NODE_SIZES[n.area]
    columnBottom.set(p.x, Math.max(columnBottom.get(p.x) ?? -Infinity, p.y + s.height / 2))
  }
  for (const { id, anchor } of ISOLATED_ANCHORS) {
    const def = topologyNodes.find((n) => n.id === id)
    if (!def) continue
    const isolated = topologyEdges.every((e) => e.source !== id && e.target !== id)
    if (!isolated) continue
    const anchorNode = g.node(anchor)
    if (!anchorNode) continue
    const p = g.node(id)
    const s = NODE_SIZES[def.area]
    const bottom = columnBottom.get(anchorNode.x) ?? -Infinity
    p.x = anchorNode.x
    p.y = bottom + 16 + s.height / 2
    columnBottom.set(anchorNode.x, p.y + s.height / 2)
  }

  const positions: TopologyLayout["positions"] = {}
  for (const n of topologyNodes) {
    const laid = g.node(n.id)
    positions[n.id] = {
      x: laid.x - NODE_SIZES[n.area].width / 2,
      y: laid.y - NODE_SIZES[n.area].height / 2,
    }
  }

  // Spread the per-area swim lanes apart so no lane overlaps another.
  const raw = {} as Record<NodeArea, Rect>
  for (const area of NODE_AREAS) raw[area] = areaBox(positions, area)
  const shifts = packAreas(raw)
  for (const n of topologyNodes) {
    positions[n.id].x += shifts[n.area].x
    positions[n.id].y += shifts[n.area].y
  }

  // Normalize into LANE_BOUNDS so every lane is draggable. dagre freely emits
  // negative coordinates; the drag clamp treats any negative lane origin as
  // out of bounds, which would silently pin such lanes in place. Lanes extend
  // LANE_PADDING beyond their members, so shift by the padding too.
  const minX = Math.min(...topologyNodes.map((n) => positions[n.id].x))
  const minY = Math.min(...topologyNodes.map((n) => positions[n.id].y))
  const shiftX = Math.max(0, LANE_PADDING - minX)
  const shiftY = Math.max(0, LANE_PADDING - minY)
  if (shiftX > 0 || shiftY > 0) {
    for (const n of topologyNodes) {
      positions[n.id].x += shiftX
      positions[n.id].y += shiftY
    }
  }

  const lanes: LaneBox[] = []
  for (const area of NODE_AREAS) {
    if (!areaNodes(area).length) continue
    const box = areaBox(positions, area)
    lanes.push({ area, label: AREA_LABELS[area], ...box })
  }

  return { positions, lanes }
}