<script setup lang="ts">
import { computed } from "vue"
import VueApexCharts, { type VueApexChartsComponentProps } from "vue3-apexcharts"

// §48.6e B6 — vue3-apexcharts (1.8+) deep-merges its own `width`/`height`
// props (defaults "100%"/"auto") OVER `options.chart`, so an explicit
// `options.chart.height` is silently replaced by "auto" and apexcharts falls
// back to `svgWidth / 1.61` — the chart overflowed its fixed-height wrapper
// (536px inside 380px). Forward the dimensions the caller set (explicit
// props first, then options.chart) as the wrapper props, which the merge
// honors. Registered globally as "apexchart" (main.ts), so existing
// usages are unchanged.
const props = defineProps<VueApexChartsComponentProps>()

const chartOpts = computed(() => (props.options?.chart ?? {}) as { width?: string | number; height?: string | number })
const resolvedWidth = computed(() => props.width ?? chartOpts.value.width ?? "100%")
const resolvedHeight = computed(() => props.height ?? chartOpts.value.height ?? "auto")
</script>

<template>
  <component
    :is="VueApexCharts"
    :options="options"
    :type="type"
    :series="series"
    :width="resolvedWidth"
    :height="resolvedHeight"
    v-on="$attrs"
  />
</template>
