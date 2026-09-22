<script setup lang="ts">
import { computed } from "vue"
import type { CurrencySource } from "@/utils/instrumentCurrency"

const props = defineProps<{
  source?: CurrencySource | null
  currency?: string | null
}>()

const isUnknown = computed(() => props.source === "unknown")
const isEstimated = computed(() => props.source === "estimated")
</script>

<template>
  <span
    v-if="isUnknown"
    data-testid="currency-warning"
    class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400"
  >
    Currency unknown
  </span>
  <span
    v-else-if="isEstimated"
    data-testid="currency-warning"
    class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
  >
    {{ currency }} (estimated)
  </span>
</template>
