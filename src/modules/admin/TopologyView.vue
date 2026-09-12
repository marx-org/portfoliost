// D55 / step 8 — Admin → Topology tab: Vue Flow canvas with the dagre layout
// (topology-layout.ts). Step 6 custom nodes; step 9 edge animation; step 10
// click-to-inspect panel; step 11 toolbar. D55 / follow-up — each area is a
// movable parent node (LaneNode.vue): member nodes are children with
// `extent: "parent"` so boxes are bounded and non-overlapping, dragging a lane
// header moves the group clamped against sibling lanes (topology-lane-motion),
// and manual positions persist to localStorage (topology-persistence). A
// Re-layout toolbar button restores the canonical dagre arrangement.
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import type { Component } from "vue"
import { VueFlow, useVueFlow, MarkerType } from "@vue-flow/core"
import type { Edge, Node, NodeDragEvent, NodeMouseEvent } from "@vue-flow/core"
import "@vue-flow/core/dist/style.css"
import "@vue-flow/core/dist/theme-default.css"
import "./topology/edges.css"

import { AREA_LABELS, NODE_AREAS, areaNodes, topologyEdges, topologyNodes } from "./topology/graph-definition"
import type { NodeArea } from "./topology/graph-definition"
import { resolveTopologyEdge } from "./topology/edge-state"
import FlowEdge from "./topology/FlowEdge.vue"
import { edgeSelectionState, nodeSelectionState } from "./topology/topology-selection"
import { filterEdgesByVisible, filterNodeDefs } from "./topology/topology-filters"
import { laneId, layoutTopology } from "./topology/topology-layout"
import LaneNode from "./topology/LaneNode.vue"
import type { LaneNodeData } from "./topology/LaneNode.vue"
import { clampLaneMotion } from "./topology/topology-lane-motion"
import { loadTopologyLayout, saveTopologyLayout } from "./topology/topology-persistence"
import { TOPOLOGY_NODE_TYPES } from "./topology/nodes"
import type { TopologyNodeData } from "./topology/nodes"
import { dotState } from "./topology/nodes/status"
import { useTopologyStore } from "./topology/topology-store"
import TopologyDetailsPanel from "./topology/TopologyDetailsPanel.vue"

type TopologyFlowNode = Node<TopologyNodeData>
type LaneFlowNode = Node<LaneNodeData>

const store = useTopologyStore()
const layout = layoutTopology()

// Custom edge renderer: FlowEdge draws the moving-dot flow overlay on top of
// the standard path. Job/provider/static edges render no overlay.
const TOPOLOGY_EDGE_TYPES = { flow: FlowEdge }

// D55 / follow-up — lane parent nodes render through their own component; the
// drag callbacks travel in the node `data` (vue-flow does not forward custom
// component emits), so the box keeps moving members + clamping in the parent.
const TOPOLOGY_NODE_TYPES_ALL: Record<string, Component> = { ...TOPOLOGY_NODE_TYPES, lane: LaneNode }

// Toolbar shares the Vue Flow instance so zoom/fit act on the live viewport.
const { zoomIn, zoomOut, fitView } = useVueFlow()

// Step 10 — the clicked node (null = nothing inspected, canvas click resets).
const selectedNodeId = ref<string | null>(null)

// Step 11 — toolbar state: free-text search + per-area visibility pills.
const searchQuery = ref("")
const visibleAreas = ref<Set<NodeArea>>(new Set(NODE_AREAS))

// D55 / follow-up — absolute graph-space positions of every node AND lane.
// Lane positions drive the parent nodes; member positions are recomputed into
// parent-relative coordinates by the computed flow below. A stored layout from
// a previous session is loaded only when its id set matches the graph 1:1.
const knownIds = new Set<string>([...topologyNodes.map((n) => n.id), ...layout.lanes.map((l) => laneId(l.area))])
function initialPositions(): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {}
  for (const n of topologyNodes) pos[n.id] = { ...layout.positions[n.id] }
  for (const l of layout.lanes) pos[laneId(l.area)] = { x: l.x, y: l.y }
  return pos
}
const positionsAbs = reactive<Record<string, { x: number; y: number }>>(loadTopologyLayout(knownIds) ?? initialPositions())

const flowLaneNodes = computed<LaneFlowNode[]>(() =>
  layout.lanes.map((lane) => {
    const pos = positionsAbs[laneId(lane.area)]
    return {
      id: laneId(lane.area),
      type: "lane",
      position: { x: pos.x, y: pos.y },
      width: lane.width,
      height: lane.height,
      draggable: false,
      selectable: false,
      focusable: false,
      connectable: false,
      deletable: false,
      data: { area: lane.area, label: lane.label, onMove: (dx, dy) => onLaneMove(lane.area, dx, dy), onDragEnd: persistLayout } as LaneNodeData,
      class: "topo-lane-node",
    }
  }),
)

const flowNodes = computed<TopologyFlowNode[]>(() =>
  topologyNodes.map((def) => {
    const state = nodeSelectionState(selectedNodeId.value, def.id, topologyEdges)
    const nodeData = store.nodeData(def)
    const healthy = nodeData.status ? dotState(nodeData.status) === "healthy" : false
    const lanePos = positionsAbs[laneId(def.area)]
    const abs = positionsAbs[def.id]
    return {
      id: def.id,
      type: def.area,
      // Children are positioned relative to their lane parent and clamped to
      // it via extent ("parent") → boxes are always bounded.
      parentNode: laneId(def.area),
      position: { x: abs.x - lanePos.x, y: abs.y - lanePos.y },
      extent: "parent",
      data: { ...nodeData, selected: state.selected, dimmed: state.dimmed },
      class: [
        `topo-node--${def.area}`,
        healthy ? "topo-node--healthy" : "",
        state.selected ? "topo-node--selected" : "",
        state.dimmed ? "topo-node--dimmed" : "",
      ].filter(Boolean).join(" "),
    }
  }),
)

// Step 9 (D55-6) — moving-dot flow overlay; step 10 — incident edges thicken,
// unrelated edges dim.
const flowEdges = computed<Edge[]>(() =>
  topologyEdges.map((e) => {
    const resolved = resolveTopologyEdge(e, store.trafficById)
    const selection = edgeSelectionState(selectedNodeId.value, e)
    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "flow",
      markerEnd: MarkerType.ArrowClosed,
      data: {
        flowing: resolved.flowing,
        state: resolved.state,
        animationDurationSec: resolved.animationDurationSec,
        intensity: resolved.intensity,
      },
      class: [
        "topo-edge",
        `topo-edge--${resolved.state}`,
        selection.connected ? "topo-edge--connected" : "",
        selection.dimmed ? "topo-edge--dimmed" : "",
      ].filter(Boolean).join(" "),
    }
  }),
)

// Step 11 — subset the flow by search query ∩ visible areas. Lane parents stay
// rendered while their area is visible (they double as the box background),
// even when search empties them.
const visibleNodeIds = computed<Set<string>>(
  () => new Set(filterNodeDefs(topologyNodes, visibleAreas.value, searchQuery.value).map((n) => n.id)),
)
const filteredFlowNodes = computed<Array<TopologyFlowNode | LaneFlowNode>>(() => {
  const lanes = flowLaneNodes.value.filter((n) => visibleAreas.value.has((n.data as LaneNodeData).area))
  const members = flowNodes.value.filter((n) => visibleNodeIds.value.has(n.id))
  return [...lanes, ...members]
})
const filteredFlowEdges = computed<Edge[]>(() => filterEdgesByVisible(flowEdges.value, visibleNodeIds.value))

function isAreaVisible(area: NodeArea): boolean {
  return visibleAreas.value.has(area)
}

function toggleArea(area: NodeArea): void {
  const next = new Set(visibleAreas.value)
  if (next.has(area)) next.delete(area)
  else next.add(area)
  visibleAreas.value = next
  void fitView({ padding: 0.15, duration: 250 })
}

function resetView(): void {
  void fitView({ padding: 0.15, duration: 250 })
}

function zoomInCanvas(): void {
  void zoomIn({ duration: 150 })
}

function zoomOutCanvas(): void {
  void zoomOut({ duration: 150 })
}

// D55 / follow-up — lane drag. Incremental, zoom-corrected deltas from
// LaneNode; the motion is clamped against every sibling lane so boxes never
// overlap, and members move along with the group.
function onLaneMove(area: NodeArea, dx: number, dy: number): void {
  const id = laneId(area)
  const lane = layout.lanes.find((l) => l.area === area)
  if (!lane) return
  const here = positionsAbs[id]
  const others = layout.lanes
    .filter((l) => l.area !== area)
    .map((l) => {
      const p = positionsAbs[laneId(l.area)]
      return { x: p.x, y: p.y, width: l.width, height: l.height }
    })
  const { dx: cdx, dy: cdy } = clampLaneMotion({ x: here.x, y: here.y, width: lane.width, height: lane.height }, dx, dy, others)
  if (cdx === 0 && cdy === 0) return
  here.x += cdx
  here.y += cdy
  for (const def of areaNodes(area)) {
    positionsAbs[def.id].x += cdx
    positionsAbs[def.id].y += cdy
  }
}

// D55 / follow-up — a member node was freely dragged (vue-flow already clamped
// it to its parent via extent); write the new relative position back as an
// absolute coordinate and persist.
function onNodeDragStop({ nodes }: NodeDragEvent): void {
  for (const node of nodes) {
    if (node.parentNode && node.position) {
      const lanePos = positionsAbs[node.parentNode]
      positionsAbs[node.id] = { x: node.position.x + lanePos.x, y: node.position.y + lanePos.y }
    }
  }
  persistLayout()
}

function persistLayout(): void {
  saveTopologyLayout(JSON.parse(JSON.stringify(positionsAbs)))
}

// D55 / follow-up — Re-layout: recompute the canonical dagre arrangement and
// overwrite every saved (possibly hand-moved) position.
function reLayout(): void {
  const fresh = layoutTopology()
  for (const n of topologyNodes) positionsAbs[n.id] = { ...fresh.positions[n.id] }
  for (const l of fresh.lanes) positionsAbs[laneId(l.area)] = { x: l.x, y: l.y }
  persistLayout()
  void fitView({ padding: 0.15, duration: 250 })
}

function onNodeClick(event: NodeMouseEvent): void {
  // Lane parents are background boxes, not inspectable nodes.
  if (event.node.id.startsWith("lane-")) return
  selectedNodeId.value = event.node.id
}

function onPaneClick(): void {
  selectedNodeId.value = null
}

function closePanel(): void {
  selectedNodeId.value = null
}

// Closing the panel when its node disappears from the filtered view keeps the
// inspector consistent with whatever is on screen.
watch(visibleNodeIds, (ids) => {
  if (selectedNodeId.value && !ids.has(selectedNodeId.value)) selectedNodeId.value = null
})

onMounted(() => store.startPolling())
onBeforeUnmount(() => store.stopPolling())
</script>

<template>
  <div>
    <div
      class="relative h-[calc(100vh-230px)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900"
    >
      <!-- Step 11 — toolbar overlay (search, area filter pills, view controls). -->
      <div class="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
        <div
          data-testid="topology-toolbar"
          class="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/90"
        >
          <label class="sr-only" for="topo-search">Search nodes</label>
          <input
            id="topo-search"
            v-model="searchQuery"
            type="search"
            class="input h-8 w-48 text-sm"
            placeholder="Search nodes…"
            data-testid="topo-search"
          />

          <div class="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true"></div>

          <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by area">
            <button
              v-for="area in NODE_AREAS"
              :key="area"
              type="button"
              class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                isAreaVisible(area)
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300'
              "
              :aria-pressed="isAreaVisible(area)"
              :data-testid="`topo-filter-${area}`"
              @click="toggleArea(area)"
            >
              {{ AREA_LABELS[area] }}
            </button>
          </div>

          <div class="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true"></div>

          <div class="flex items-center gap-1" role="group" aria-label="View controls">
            <button type="button" class="btn-ghost h-8 rounded-full px-2" aria-label="Re-layout" data-testid="topo-relayout" @click="reLayout">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </button>
            <button type="button" class="btn-ghost h-8 w-8 rounded-full" aria-label="Zoom out" data-testid="topo-zoom-out" @click="zoomOutCanvas">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button type="button" class="btn-ghost h-8 w-8 rounded-full" aria-label="Zoom in" data-testid="topo-zoom-in" @click="zoomInCanvas">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button type="button" class="btn-ghost h-8 rounded-full px-2" aria-label="Fit view" data-testid="topo-fit-view" @click="resetView">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <VueFlow
        :nodes="filteredFlowNodes"
        :edges="filteredFlowEdges"
        :node-types="TOPOLOGY_NODE_TYPES_ALL"
        :edge-types="TOPOLOGY_EDGE_TYPES"
        :fit-view-on-init="true"
        :min-zoom="0.2"
        :max-zoom="1.5"
        :delete-key-code="null"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @node-drag-stop="onNodeDragStop"
      >
      </VueFlow>

      <Transition name="topo-panel" appear>
        <TopologyDetailsPanel
          v-if="selectedNodeId && visibleNodeIds.has(selectedNodeId)"
          :node-id="selectedNodeId"
          data-testid="topology-details-panel"
          @close="closePanel"
          @select="selectedNodeId = $event"
        />
      </Transition>
    </div>

    <p v-if="store.error" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ store.error }}</p>
    <p v-if="store.statusFetchedAt" class="mt-3 text-xs text-slate-400 dark:text-slate-500">
      Last updated: {{ new Date(store.statusFetchedAt).toLocaleTimeString() }}
    </p>
  </div>
</template>

<style scoped>
/* Step 10 — right-side slide-in for the click-to-inspect panel. */
.topo-panel-enter-active,
.topo-panel-leave-active {
  transition: transform 0.22s ease;
}
.topo-panel-enter-from,
.topo-panel-leave-to {
  transform: translateX(100%);
}
</style>