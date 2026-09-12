// D55 / step 8 — Admin → Topology tab: Vue Flow canvas with the dagre layout
// (topology-layout.ts) and per-area swim-lane backgrounds. Live status and
// traffic are overlaid from useTopologyStore (step 7); custom node rendering
// from step 6; edge animation (active/idle) from step 9; click-to-inspect
// details panel + selection highlight/dimming from step 10 (D55-7). Route/tab
// wiring lands in step 12.
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { VueFlow } from "@vue-flow/core"
import type { Edge, Node, NodeMouseEvent } from "@vue-flow/core"
import "@vue-flow/core/dist/style.css"
import "@vue-flow/core/dist/theme-default.css"
import "./topology/edges.css"

import { topologyEdges, topologyNodes } from "./topology/graph-definition"
import { resolveTopologyEdge } from "./topology/edge-state"
import { edgeSelectionState, nodeSelectionState } from "./topology/topology-selection"
import { layoutTopology } from "./topology/topology-layout"
import { TOPOLOGY_NODE_TYPES } from "./topology/nodes"
import type { TopologyNodeData } from "./topology/nodes"
import { useTopologyStore } from "./topology/topology-store"
import TopologyDetailsPanel from "./topology/TopologyDetailsPanel.vue"

type TopologyFlowNode = Node<TopologyNodeData>

const store = useTopologyStore()
const layout = layoutTopology()

// D55-7 / step 10 — the clicked node (null = nothing inspected, canvas click
// resets). Drives the details panel plus the ring/dim overlay on nodes+edges.
const selectedNodeId = ref<string | null>(null)

const flowNodes = computed<TopologyFlowNode[]>(() =>
  topologyNodes.map((def) => {
    const state = nodeSelectionState(selectedNodeId.value, def.id, topologyEdges)
    return {
      id: def.id,
      type: def.area,
      position: layout.positions[def.id],
      data: { ...store.nodeData(def), selected: state.selected, dimmed: state.dimmed },
      class: [
        state.selected ? "topo-node--selected" : "",
        state.dimmed ? "topo-node--dimmed" : "",
      ].filter(Boolean).join(" "),
    }
  }),
)

// Step 9 — edge visual state (D55-6): active edges get vue-flow's built-in
// animated dash (moving dot along a dashed path) with a speed variable scaled
// to the request rate; idle/job/provider edges stay static (edges.css).
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
      type: "default",
      arrowEnd: "closed",
      animated: resolved.state === "active",
      class: [
        "topo-edge",
        `topo-edge--${resolved.state}`,
        selection.connected ? "topo-edge--connected" : "",
        selection.dimmed ? "topo-edge--dimmed" : "",
      ].filter(Boolean).join(" "),
      style:
        resolved.state === "active"
          ? { "--topo-edge-speed": `${resolved.animationDurationSec}s` }
          : undefined,
    }
  }),
)

function onNodeClick(event: NodeMouseEvent): void {
  selectedNodeId.value = event.node.id
}

function onPaneClick(): void {
  selectedNodeId.value = null
}

function closePanel(): void {
  selectedNodeId.value = null
}

onMounted(() => store.startPolling())
onBeforeUnmount(() => store.stopPolling())
</script>

<template>
  <div>
    <div
      class="relative h-[calc(100vh-230px)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900"
    >
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :node-types="TOPOLOGY_NODE_TYPES"
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
          v-if="selectedNodeId"
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
