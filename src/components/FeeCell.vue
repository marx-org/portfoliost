<script setup lang="ts">
import { computed } from "vue"
import { formatCurrency } from "../utils/format"

const props = defineProps<{
  fees: number | null | undefined
  feeCurrency?: string | null
  fallbackCurrency: string
  rateSource?: string | null
}>()

const currency = computed(() => (props.feeCurrency || props.fallbackCurrency || "USD").toUpperCase())
const isCustom = computed(() => props.rateSource === "manual")
</script>

<template>
  <span class="inline-flex items-center justify-end gap-1.5">
    <span>{{ formatCurrency(props.fees, currency) }}</span>
    <span
      v-if="isCustom"
      class="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
      :title="`Custom exchange rate applied (${props.feeCurrency ?? ''})`"
      data-testid="custom-fx-badge"
    >
      custom fx
    </span>
  </span>
</template>
