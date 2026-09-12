// D55 / step 8 — Admin → Topology tab: Vue Flow canvas with the dagre layout
// (topology-layout.ts) and per-area swim-lane backgrounds. Live status and
// traffic are overlaid from useTopologyStore (step 7); custom node rendering
// from step 6; edge animation (active/idle) from step 9; click-to-inspect
// details panel + selection highlight/dimming from step 10 (D55-7); toolbar
// with search + area filter pills + zoom/fit controls from step 11. Route/tab
// wiring lands in step 12.
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { VueFlow, useVueFlow, MarkerType } from "@vue-flow/core"
import type { Edge, Node, NodeMouseEvent } from "@vue-flow/core"
import "@vue-flow/core/dist/style.css"
import "@vue-flow/core/dist/theme-default.css"
import "./topology/edges.css"

import { AREA_LABELS, NODE_AREAS, topologyEdges, topologyNodes } from "./topology/graph-definition"
import type { NodeArea } from "./topology/graph-definition"
import { resolveTopologyEdge } from "./topology/edge-state"
import FlowEdge from "./topology/FlowEdge.vue"
import { edgeSelectionState, nodeSelectionState } from "./topology/topology-selection"
import { filterEdgesByVisible, filterNodeDefs } from "./topology/topology-filters"
import { layoutTopology } from "./topology/topology-layout"
import { TOPOLOGY_NODE_TYPES } from "./topology/nodes"
import type { TopologyNodeData } from "./topology/nodes"
import { dotState } from "./topology/nodes/status"
import { useTopologyStore } from "./topology/topology-store"
import TopologyDetailsPanel from "./topology/TopologyDetailsPanel.vue"

type TopologyFlowNode = Node<TopologyNodeData>

const store = useTopologyStore()
const layout = layoutTopology()

// Custom edge renderer: FlowEdge draws the moving-dot flow overlay on top of
// the standard path (definition in edges.css). Job/provider/static edges get
// the same component but render no overlay because their `flowing` is false.
const TOPOLOGY_EDGE_TYPES = { flow: FlowEdge }

// D55-7 / step 11 — the toolbar shares the Vue Flow instance (useVueFlow in
// the VueFlow parent component is the documented pattern), so zoom/fit act on
// the live viewport rather than re-mounting the canvas.
const { zoomIn, zoomOut, fitView } = useVueFlow()

// D55-7 / step 10 — the clicked node (null = nothing inspected, canvas click
// resets). Drives the details panel plus the ring/dim overlay on nodes+edges.
const selectedNodeId = ref<string | null>(null)

// Step 11 — toolbar state: free-text search + per-area visibility pills.
const searchQuery = ref("")
const visibleAreas = ref<Set<NodeArea>>(new Set(NODE_AREAS))

const flowNodes = computed<TopologyFlowNode[]>(() =>
  topologyNodes.map((def) => {
    const state = nodeSelectionState(selectedNodeId.value, def.id, topologyEdges)
    const nodeData = store.nodeData(def)
    const healthy = nodeData.status ? dotState(nodeData.status) === "healthy" : false
    return {
      id: def.id,
      type: def.area,
      position: layout.positions[def.id],
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

// Step 9 (D55-6) — edges render through FlowEdge, which draws a moving-dot
// flow overlay whose speed scales with the request rate on active edges and
// runs at a slow steady idle flow on measurable edges with no traffic yet
// (resolveTopologyEdge sets `flowing`). Job/provider/static edges stay still.
// Step 10 (D55-7) — incident edges thicken at full opacity, unrelated edges dim.
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
      // Vue Flow's marker prop is `markerEnd` (not `arrowEnd`); a plain string
      // resolves to vue-flow's default marker colour in both themes.
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

// Step 11 — subset the computed flow by search query ∩ visible areas. Nodes
// are removed entirely (not just faded) so zoom/fit and selection stay honest.
const visibleNodeIds = computed<Set<string>>(
  () => new Set(filterNodeDefs(topologyNodes, visibleAreas.value, searchQuery.value).map((n) => n.id)),
)
const filteredFlowNodes = computed<TopologyFlowNode[]>(() => flowNodes.value.filter((n) => visibleNodeIds.value.has(n.id)))
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

function onNodeClick(event: NodeMouseEvent): void {
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
      <!-- Step 11 — toolbar overlay (search, area filter pills, zoom/fit). -->
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
        :node-types="TOPOLOGY_NODE_TYPES"
        :edge-types="TOPOLOGY_EDGE_TYPES"
        :fit-view-on-init="true"
        :min-zoom="0.2"
        :max-zoom="1.5"
        :delete-key-code="null"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
      >
        <template #zoom-pane>
          <div
            v-for="lane in layout.lanes"
            v-show="visibleAreas.has(lane.area)"
            :key="lane.area"
            class="topo-lane"
            :class="`topo-lane--${lane.area}`"
            :style="{ left: `${lane.x}px`, top: `${lane.y}px`, width: `${lane.width}px`, height: `${lane.height}px` }"
            :aria-hidden="true"
          >
            <span class="topo-lane__label">{{ lane.label }}</span>
          </div>
        </template>
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
/* D55-7 / step 10 — right-side slide-in for the click-to-inspect panel. */
.topo-panel-enter-active,
.topo-panel-leave-active {
  transition: transform 0.22s ease;
}
.topo-panel-enter-from,
.topo-panel-leave-to {
  transform: translateX(100%);
}

/* Swim lanes sit inside vue-flow's transformed pane (zoom-pane slot), so
   graph coordinates map 1:1. z-index -1 keeps them behind nodes/edges. */
.topo-lane {
  position: absolute;
  z-index: -1;
  pointer-events: none;
  border-radius: 16px;
}

.topo-lane__label {
  position: absolute;
  top: 6px;
  left: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.topo-lane--internal {
  background: rgb(100 116 139 / 0.07);
}
.topo-lane--internal .topo-lane__label {
  color: rgb(71 85 105 / 0.9);
}
.dark .topo-lane--internal {
  background: rgb(148 163 184 / 0.07);
}
.dark .topo-lane--internal .topo-lane__label {
  color: rgb(148 163 184 / 0.8);
}

.topo-lane--storage {
  background: rgb(14 165 233 / 0.07);
}
.topo-lane--storage .topo-lane__label {
  color: rgb(2 132 199 / 0.9);
}
.dark .topo-lane--storage {
  background: rgb(56 189 248 / 0.07);
}
.dark .topo-lane--storage .topo-lane__label {
  color: rgb(125 211 252 / 0.8);
}

.topo-lane--jobs {
  background: rgb(34 197 94 / 0.07);
}
.topo-lane--jobs .topo-lane__label {
  color: rgb(22 163 74 / 0.9);
}
.dark .topo-lane--jobs {
  background: rgb(74 222 128 / 0.07);
}
.dark .topo-lane--jobs .topo-lane__label {
  color: rgb(134 239 172 / 0.8);
}

.topo-lane--external-services {
  background: rgb(129 140 248 / 0.07);
}
.topo-lane--external-services .topo-lane__label {
  color: rgb(109 40 217 / 0.9);
}
.dark .topo-lane--external-services {
  background: rgb(165 180 252 / 0.07);
}
.dark .topo-lane--external-services .topo-lane__label {
  color: rgb(199 210 254 / 0.8);
}

.topo-lane--data-providers {
  background: rgb(245 158 11 / 0.07);
}
.topo-lane--data-providers .topo-lane__label {
  color: rgb(217 119 6 / 0.9);
}
.dark .topo-lane--data-providers {
  background: rgb(251 191 36 / 0.07);
}
.dark .topo-lane--data-providers .topo-lane__label {
  color: rgb(253 230 138 / 0.8);
}
</style>
