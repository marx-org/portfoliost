<script setup lang="ts">
import { ref, watch } from "vue"
import { getLatestRate, type LatestRate } from "@/api/fx"

const props = defineProps<{
  /** "Transaction" | "Fee" — leg label shown in the header */
  leg: string
  /** source currency of the leg */
  from: string
  /** conversion target (D40 precedence resolved by caller) */
  to: string
  /** leg date (YYYY-MM-DD) — drives the custom-rate suggestion (D39) */
  date?: string
  rateSource: "automatic" | "manual"
  /** only used by the default manual input; supply via #manual slot otherwise */
  rate?: string
  /** hide the whole disclosure (absent = shown); Vue booleans default false when absent */
  hidden?: boolean
  testid?: string
}>()

const emit = defineEmits<{
  (e: "update:rateSource", v: "automatic" | "manual"): void
  (e: "update:rate", v: string): void
}>()

const tid = props.testid ?? "fx"
const suggestion = ref<LatestRate | null>(null)

const needsConversion = () => !props.hidden && props.from !== props.to

async function loadSuggestion(): Promise<void> {
  if (!needsConversion()) {
    suggestion.value = null
    return
  }
  suggestion.value = await getLatestRate(props.from, props.to, props.date)
}

watch(
  () => [props.from, props.to, props.date, props.hidden] as const,
  () => void loadSuggestion(),
  { immediate: true },
)

// D39 — selecting Custom prefills the input with the market rate on the leg date
watch(
  () => props.rateSource,
  (mode) => {
    if (mode === "manual" && suggestion.value && !props.rate) {
      emit("update:rate", suggestion.value.rate.toFixed(4))
    }
  },
)
</script>

<template>
  <div v-if="needsConversion()" class="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50" :data-testid="`${tid}-section`">
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {{ leg }} exchange rate <span class="normal-case text-slate-400">({{ from }} → {{ to }})</span>
      </span>
      <div class="flex gap-1">
        <button
          type="button"
          class="btn-secondary px-2 py-0.5 text-xs"
          :class="rateSource === 'automatic' ? '!bg-blue-600 !text-white' : ''"
          :data-testid="`${tid}-auto`"
          @click="emit('update:rateSource', 'automatic')"
        >
          Automatic
        </button>
        <button
          type="button"
          class="btn-secondary px-2 py-0.5 text-xs"
          :class="rateSource === 'manual' ? '!bg-blue-600 !text-white' : ''"
          :data-testid="`${tid}-manual`"
          @click="emit('update:rateSource', 'manual')"
        >
          Custom
        </button>
      </div>
    </div>
    <p
      v-if="rateSource === 'automatic'"
      class="mt-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400"
      :data-testid="`${tid}-auto-value`"
    >
      <template v-if="suggestion">
        1 {{ from }} = {{ suggestion.rate.toFixed(4) }} {{ to }}
        <span class="text-slate-400">· {{ date ? `market rate on ${date}` : `daily rate · ${suggestion.asOf}` }}</span>
      </template>
      <template v-else>daily market rate</template>
    </p>
    <div v-else class="mt-1.5">
      <slot name="manual" :suggestion="suggestion">
        <div class="flex items-center gap-2">
          <input
            :value="rate"
            type="number"
            min="0"
            step="any"
            :placeholder="suggestion ? suggestion.rate.toFixed(4) : 'e.g. 4.35'"
            class="input"
            :aria-label="`Custom ${leg.toLowerCase()} exchange rate (${from} to ${to})`"
            :data-testid="`${tid}-rate`"
            @input="emit('update:rate', ($event.target as HTMLInputElement).value)"
          />
          <span class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">per 1 {{ from }}</span>
        </div>
      </slot>
    </div>
  </div>
</template>
