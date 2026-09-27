<script setup lang="ts">
import { computed } from "vue"
import { formatCurrency } from "@/utils/format"

/**
 * Shows a primary value in its native currency; if the display/base currency
 * differs, shows the converted amount underneath in smaller muted text.
 *
 * Usage:
 *   <DualCurrencyCell
 *     :primary="tx.price"
 *     :primary-currency="tx.instrumentCurrency"
 *     :converted="tx.convertedPrice"
 *     :display-currency="tx.displayCurrency"
 *   />
 */
const props = defineProps<{
  /** Value in the native/instrument currency */
  primary: number | null | undefined
  /** ISO 4217 code for the primary value (e.g. "PLN") */
  primaryCurrency: string | null | undefined
  /** Value already converted to the portfolio base/display currency */
  converted?: number | null
  /** ISO 4217 code for the display currency (e.g. "USD") */
  displayCurrency?: string | null
}>()

const primaryCcy = computed(() => (props.primaryCurrency || "").toUpperCase())
const displayCcy = computed(() => (props.displayCurrency || "").toUpperCase())

/** Show the secondary row only when currencies genuinely differ */
const showConverted = computed(
  () =>
    primaryCcy.value !== displayCcy.value &&
    props.converted != null &&
    !Number.isNaN(props.converted),
)
</script>

<template>
  <span class="inline-flex flex-col items-end leading-tight">
    <span class="tabular-nums">{{ formatCurrency(primary, primaryCcy) }}</span>
    <span
      v-if="showConverted"
      class="tabular-nums text-[11px] text-slate-400 dark:text-slate-500"
    >
      {{ formatCurrency(converted, displayCcy) }}
    </span>
  </span>
</template>
