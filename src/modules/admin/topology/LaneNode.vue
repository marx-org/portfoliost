// D55 / Q5 — area lane rendered as a vue-flow parent node. Renders the box
// background + header (label + grip); dragging the header moves the entire
// lane with its member nodes. The wrapper is pointer-events: none so clicks
// pass through to the pane (parity with the old background divs); only the
// header handle captures the pointer. Translation uses zoom-corrected deltas.

<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"

import type { NodeArea } from "./graph-definition"

export interface LaneNodeData {
  area: NodeArea
  label: string
  /** Incremental graph-space delta since the previous move event. */
  onMove?: (dx: number, dy: number) => void
  onDragEnd?: () => void
}

defineOptions({ inheritAttrs: false })
const props = defineProps<{ data: LaneNodeData }>()

const flow = useVueFlow()

function onHeaderPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  let lastX = event.clientX
  let lastY = event.clientY

  const onMove = (e: PointerEvent) => {
    const zoom = flow.viewport.value.zoom || 1
    const dx = (e.clientX - lastX) / zoom
    const dy = (e.clientY - lastY) / zoom
    lastX = e.clientX
    lastY = e.clientY
    if (dx !== 0 || dy !== 0) props.data.onMove?.(dx, dy)
  }
  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    window.removeEventListener("pointercancel", onUp)
    props.data.onDragEnd?.()
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
  window.addEventListener("pointercancel", onUp)
}
</script>

<template>
  <div class="topo-lane" :class="`topo-lane--${data.area}`" :data-lane="data.area" aria-hidden="true">
    <header
      class="topo-lane__header"
      :title="`Move ${data.label}`"
      @pointerdown="onHeaderPointerDown"
      @pointermove.stop
    >
      <span class="topo-lane__label">{{ data.label }}</span>
      <svg class="topo-lane__grip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M8 6h2M14 6h2M8 12h2M14 12h2M8 18h2M14 18h2" />
      </svg>
    </header>
  </div>
</template>

<style scoped>
/* The whole lane is click-transparent except its header handle, so clicks fall
   through to the pane (closing the inspector) just like the old background
   divs. The header keeps pointer-events: auto to stay draggable. */
.topo-lane {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  pointer-events: none;
}

.topo-lane__header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px 16px 0 0;
  cursor: move;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}

.topo-lane__header:hover .topo-lane__label {
  text-decoration: underline;
}

.topo-lane__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.topo-lane__grip {
  width: 12px;
  height: 12px;
  opacity: 0.55;
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