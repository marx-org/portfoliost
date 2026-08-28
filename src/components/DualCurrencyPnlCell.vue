<script setup lang="ts">
import { computed } from "vue"
import { formatSignedCurrency, formatPercent } from "@/utils/format"

/**
 * Unrealized P/L cell with dual-currency and percentage.
 *
 * Layout (example, USD portfolio, PLN instrument):
 *
 *   +1 234,56 PLN          ← primary signed value (instrument ccy)
 *   +312,40 USD  +4.72%    ← converted + percent on same line, muted
 *
 * When instrument ccy === display ccy:
 *
 *   +1 234,56 USD  +4.72%  ← single line
 */
const props = defineProps<{
  /** P/L in instrument/native currency */
  primary: number | null | undefined
  primaryCurrency: string | null | undefined
  /** P/L already converted to display/base currency */
  converted?: number | null
  displayCurrency?: string | null
  /** Percentage change (e.g. 4.72 for 4.72%) */
  percent?: number | null
}>()

const primaryCcy  = computed(() => (props.primaryCurrency || "USD").toUpperCase())
const displayCcy  = computed(() => (props.displayCurrency  || "USD").toUpperCase())
const dual        = computed(() => primaryCcy.value !== displayCcy.value && props.converted != null && !Number.isNaN(props.converted))
const isPositive  = computed(() => (props.primary ?? 0) >= 0)
const colorClass  = computed(() => isPositive.value ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")
const subColorClass = computed(() => (props.converted ?? 0) >= 0 ? "text-green-600/70 dark:text-green-500/70" : "text-red-500/70 dark:text-red-400/70")
</script>

<template>
  <span class="inline-flex flex-col items-end leading-tight">
    <!-- Primary value (native currency) -->
    <span class="tabular-nums font-medium" :class="colorClass">
      {{ formatSignedCurrency(primary, primaryCcy) }}
      <!-- Percent on same line when no dual row needed -->
      <span v-if="!dual && percent != null" class="ml-1 text-[11px] font-normal opacity-70">
        ({{ formatPercent(percent, 2, true) }})
      </span>
    </span>
    <!-- Converted + percent row (shown only when currencies differ) -->
    <span v-if="dual" class="inline-flex items-center gap-1 text-[11px]" :class="subColorClass">
      <span class="tabular-nums">{{ formatSignedCurrency(converted, displayCcy) }}</span>
      <span v-if="percent != null" class="opacity-80">({{ formatPercent(percent, 2, true) }})</span>
    </span>
  </span>
</template>
