// D55-9 / step 8 — dagre hierarchical layout + swim-lane geometry for the
// Topology canvas. The static graph (graph-definition.ts) is laid out with
// rankdir "RL" so the natural layering places the data-flow chain left to
// right — Providers → openst/cachest → services → gateway → SPA — because
// every request edge points upstream (SPA → gateway → services → providers).
//
// Swim lanes are per-area rectangles rendered behind the nodes by
// TopologyView.vue (fill only, no heavy borders — D55-9). Because the five
// thematic areas interleave across the same dagre columns, their raw bounding
// boxes overlap heavily. `separateLanes` applies a small vertical shift per
// area (a deterministic coordinate-descent) so no lane fully contains another
// and large overlaps shrink, while the flow areas (data-providers, internal)
// stay pinned — keeping the left-to-right reading intact.

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
  /** Top-left position of every node, keyed by node id (graph coordinates). */
  positions: Record<string, { x: number; y: number }>
  lanes: LaneBox[]
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

/**
 * Nodes without edges would default to the first rank (right-most in RL).
 * Pin each to the column of the node it logically belongs next to, so the
 * External/Jobs swim lanes stay compact instead of spanning the canvas.
 */
const ISOLATED_ANCHORS: Array<{ id: string; anchor: string }> = [
  { id: "mastra-ticker", anchor: "portfoliost-instruments" },
  { id: "scanst", anchor: "portfoliost-instruments" },
  { id: "jobshot", anchor: "portfoliost-admin" },
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

function areaBox(positions: TopologyLayout["positions"], area: NodeArea) {
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

function overlapArea(a: LaneBox, b: LaneBox): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

function contains(outer: LaneBox, inner: LaneBox): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
}

/**
 * Choose a vertical shift (dy) per area that minimizes lane overlap while
 * keeping the flow areas aligned. Deterministic: fixed start (all zero),
 * fixed grid, fixed iteration budget.
 */
function separateLanes(positions: TopologyLayout["positions"]): Record<NodeArea, number> {
  const N = NODE_AREAS.length
  const FLOW_AREAS: NodeArea[] = ["internal", "data-providers"]
  const flowSet = new Set<NodeArea>(FLOW_AREAS)
  const flowIdx = NODE_AREAS.map((a, i) => (flowSet.has(a) ? i : -1)).filter((i) => i >= 0)

  const boxesAt = (dy: number[]): LaneBox[] =>
    NODE_AREAS.map((a, i) => {
      const b = areaBox(positions, a)
      return { area: a, label: AREA_LABELS[a], x: b.x, y: b.y + dy[i], width: b.width, height: b.height }
    })

  const W_CONTAIN = 8
  const W_LARGE = 5
  const W_FLOW = 6
  const W_ALIGN = 8

  const cost = (dy: number[]): number => {
    const bs = boxesAt(dy)
    let c = 0
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (contains(bs[i], bs[j]) || contains(bs[j], bs[i])) c += W_CONTAIN
        const frac = overlapArea(bs[i], bs[j]) / Math.min(bs[i].width * bs[i].height, bs[j].width * bs[j].height)
        if (frac > 0.5) c += W_LARGE * (frac - 0.5)
      }
    }
    c += W_FLOW * (dy.reduce((s, v) => s + Math.abs(v), 0) / 1000)
    // keep the flow areas vertically aligned with each other
    for (let k = 0; k < flowIdx.length; k++) {
      for (let m = k + 1; m < flowIdx.length; m++) c += W_ALIGN * (Math.abs(dy[flowIdx[k]] - dy[flowIdx[m]]) / 1000)
    }
    return c
  }

  let dy = new Array(N).fill(0)
  let best = cost(dy)
  const STEP = 20
  const RANGE = 600
  for (let iter = 0; iter < 400; iter++) {
    let improved = false
    for (let i = 0; i < N; i++) {
      let lb = dy[i]
      let lc = best
      for (let s = -RANGE; s <= RANGE; s += STEP) {
        const trial = [...dy]
        trial[i] = s
        const cc = cost(trial)
        if (cc < lc - 1e-4) {
          lc = cc
          lb = s
        }
      }
      if (lb !== dy[i]) {
        dy[i] = lb
        improved = true
      }
    }
    const nb = cost(dy)
    if (nb < best - 1e-4) best = nb
    else if (!improved) break
  }

  const out = {} as Record<NodeArea, number>
  NODE_AREAS.forEach((a, i) => {
    out[a] = dy[i]
  })
  return out
}

export function layoutTopology(): TopologyLayout {
  const g = buildDagreGraph()
  layout(g)

  // Reposition isolated nodes next to their anchor (stacked below the column).
  // dagre v3 ignores minRank/maxRank, and an isolated node would otherwise
  // default to the first rank (right-most in RL), stretching the External /
  // Jobs swim lanes across the whole canvas. Isolated nodes have no edges,
  // so moving them cannot affect edge routing. Guarded, so a future edge in
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

  // Spread the per-area swim lanes apart (vertical shift per area) so they
  // don't fully contain one another, while keeping the flow pinned.
  const shifts = separateLanes(positions)
  for (const n of topologyNodes) {
    positions[n.id].y += shifts[n.area]
  }

  const lanes: LaneBox[] = []
  for (const area of NODE_AREAS) {
    const nodes = areaNodes(area)
    if (!nodes.length) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const p = positions[n.id]
      const s = NODE_SIZES[area]
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + s.width)
      maxY = Math.max(maxY, p.y + s.height)
    }
    lanes.push({
      area,
      label: AREA_LABELS[area],
      x: minX - LANE_PADDING,
      y: minY - LANE_PADDING,
      width: maxX - minX + LANE_PADDING * 2,
      height: maxY - minY + LANE_PADDING * 2,
    })
  }

  return { positions, lanes }
}