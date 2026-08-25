<script setup lang="ts">
import CurrencySelect from "@/components/CurrencySelect.vue"

const props = defineProps<{
  fees: string | number
  feesType: "fixed" | "pct"
  feeCurrency: string
  testid?: string
  /** id for the amount input so external <label :for> keeps working */
  inputId?: string
}>()

const emit = defineEmits<{
  (e: "update:fees", v: string): void
  (e: "update:feesType", v: "fixed" | "pct"): void
  (e: "update:feeCurrency", v: string): void
  (e: "feeCurrencyChange"): void
}>()

function onFeesInput(ev: Event): void {
  emit("update:fees", (ev.target as HTMLInputElement).value)
}

function toggleType(): void {
  emit("update:feesType", props.feesType === "fixed" ? "pct" : "fixed")
}

const tid = props.testid ?? "fee-fields"
</script>

<template>
  <div>
    <div class="mb-1 flex gap-2">
      <div class="flex flex-1 items-center rounded-lg border border-slate-300 focus-within:border-blue-500 dark:border-slate-600">
        <template v-if="feesType === 'fixed'">
          <CurrencySelect
            :model-value="feeCurrency"
            :aria-label="`${tid} fee currency`"
            :testid="`${tid}-fee-currency`"
            class="!rounded-l-lg !border-0 !border-r"
            @update:model-value="(v: string) => { if (v) { emit('update:feeCurrency', v); emit('feeCurrencyChange') } }"
          />
        </template>
        <span v-else class="pl-3 text-sm text-slate-500 dark:text-slate-400">%</span>
        <input
          :id="inputId"
          :value="fees"
          type="number"
          min="0"
          step="0.01"
          class="input !rounded-l-none !border-0 !ring-0 focus:ring-0"
          :data-testid="`${tid}-fees`"
          :aria-label="`${tid} fees amount`"
          @input="onFeesInput"
        />
      </div>
      <button
        type="button"
        class="btn-secondary shrink-0 text-sm"
        :class="feesType === 'pct' ? 'bg-slate-200 text-slate-900 dark:!bg-slate-600 dark:text-white' : ''"
        :data-testid="`${tid}-fees-toggle`"
        @click="toggleType"
      >
        {{ feesType === "fixed" ? "Fixed" : "%" }}
      </button>
    </div>
  </div>
</template>
