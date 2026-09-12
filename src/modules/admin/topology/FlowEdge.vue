// D55-6 / visual polish — custom topology edge with a continuous moving-dot
// flow overlay. Renders the standard vue-flow base path (keeps the marker
// arrowhead, all `topo-edge--*` stroke styles from edges.css, selection
// highlight/dimming) plus a second glowing overlay path whose tiny dash travels
// along the edge - a particle flowing source → target. The overlay is used only
// for measurable data-flow edges (edge resolution sets `flowing: true`); job /
// provider / unmeasurable edges stay static with no overlay.
//
// Speed comes from the `animationDurationSec` returned by resolveTopologyEdge
// (fast = active traffic, slow idle flow = measured but quiet), brightness from
// `intensity` (0..1, ∝ request rate). The graph therefore never looks dead even
// when no traffic data has resolved yet.
<script setup lang="ts">
import { computed } from "vue"
import { EdgeText, Position, getBezierPath } from "@vue-flow/core"
import type { EdgeProps, EdgeTextProps } from "@vue-flow/core"
import type { TopologyEdgeState } from "./edge-state"

export interface FlowEdgeData {
  flowing: boolean
  state: TopologyEdgeState
  animationDurationSec: number
  intensity: number
}

const props = defineProps<EdgeProps<FlowEdgeData>>()

const path = computed(() => {
  const [d, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition ?? Position.Bottom,
    targetPosition: props.targetPosition ?? Position.Top,
  })
  return { d, labelX, labelY }
})

const overlayStyle = computed(() => {
  const flow = props.data?.flowing ?? false
  if (!flow) return undefined
  return {
    "--topo-flow-speed": `${props.data.animationDurationSec}s`,
    opacity: `${0.45 + props.data.intensity * 0.55}`,
  } as Record<string, string>
})

const labelProps = computed(() => {
  const lp: EdgeTextProps = {
    x: path.value.labelX,
    y: path.value.labelY,
    label: props.label as string | object | undefined,
    labelShowBg: props.labelShowBg,
    labelStyle: props.labelStyle,
    labelBgStyle: props.labelBgStyle,
    labelBgPadding: props.labelBgPadding,
    labelBgBorderRadius: props.labelBgBorderRadius,
  }
  return lp
})
</script>

<template>
  <g>
    <path
      :id="props.id"
      class="vue-flow__edge-path"
      :d="path.d"
      fill="none"
      :marker-end="props.markerEnd"
      :marker-start="props.markerStart"
    />
    <path
      v-if="props.data?.flowing"
      class="topo-flow"
      :d="path.d"
      :style="overlayStyle"
      pathLength="1"
      vector-effect="non-scaling-stroke"
      fill="none"
      pointer-events="none"
    />
    <path
      class="vue-flow__edge-interaction"
      :d="path.d"
      fill="none"
      :stroke-width="props.interactionWidth ?? 20"
      stroke-opacity="0"
    />
    <EdgeText v-bind="labelProps" />
  </g>
</template>