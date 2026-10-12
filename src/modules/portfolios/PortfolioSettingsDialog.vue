<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { useLabelsStore } from "@/stores/labels"

export interface PortfolioSettingsPayload {
  name: string
  baseCurrency: string
  cashLegOnTrade: boolean
  isVirtual?: boolean
  labelId?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  name: string
  baseCurrency: string
  cashLegOnTrade: boolean
  isVirtual?: boolean
  labelId?: string | null
  busy?: boolean
  error?: string | null
}>(), {
  busy: false,
  error: null,
})

const emit = defineEmits<{
  (event: "close"): void
  (event: "submit", payload: PortfolioSettingsPayload): void
}>()

const currenciesStore = useCurrenciesStore()
const labelsStore = useLabelsStore()
const currencies = computed(() => currenciesStore.options.map((currency) => currency.code))
const name = ref(props.name)
const baseCurrency = ref(props.baseCurrency)
const cashLegOnTrade = ref(props.cashLegOnTrade)
const labelId = ref(props.labelId ?? "")

watch(() => props.open, (open) => {
  if (!open) return
  if (!currenciesStore.loaded) void currenciesStore.load()
  if (props.isVirtual && !labelsStore.labels.length) void labelsStore.fetchLabels()
  name.value = props.name
  baseCurrency.value = props.baseCurrency
  cashLegOnTrade.value = props.cashLegOnTrade
  labelId.value = props.labelId ?? ""
})

function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName || !baseCurrency.value) return
  emit("submit", {
    name: trimmedName,
    baseCurrency: baseCurrency.value,
    cashLegOnTrade: cashLegOnTrade.value,
    labelId: props.isVirtual ? labelId.value : undefined,
  })
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.stop
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Rename portfolio">
      <h3 class="mb-4 text-base font-semibold">Portfolio settings</h3>
      <form @submit.prevent="submit">
        <label for="portfolio-settings-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
        <input id="portfolio-settings-name" v-model="name" type="text" required class="input mb-4" />

        <label for="portfolio-settings-currency" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Base currency</label>
        <select id="portfolio-settings-currency" v-model="baseCurrency" required class="input mb-4">
          <option v-for="currency in currencies" :key="currency" :value="currency">{{ currency }}</option>
        </select>

        <div v-if="props.isVirtual" class="mb-4">
          <label for="portfolio-settings-label" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Instrument label *</label>
          <select id="portfolio-settings-label" v-model="labelId" class="input" required>
            <option value="" disabled>Select a label</option>
            <option v-for="label in labelsStore.labels" :key="label.id" :value="label.id">{{ label.name }}</option>
          </select>
        </div>

        <label v-if="props.isVirtual" class="mb-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked disabled />
          Virtual portfolio
        </label>

        <label class="mb-4 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
           <input
             v-if="!props.isVirtual"
            id="portfolio-settings-cash-leg"
            v-model="cashLegOnTrade"
            type="checkbox"
            class="mt-0.5"
            data-testid="cash-leg-on-trade"
          />
           <span v-if="!props.isVirtual">
            Generate a cash transaction on buy/sell
            <span class="block text-xs text-slate-500 dark:text-slate-400">
              Pre-ticks the cash checkbox on the buy/sell form. Sheet imports are unaffected.
            </span>
          </span>
        </label>
        <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="busy || !name.trim() || !baseCurrency || (props.isVirtual && !labelId)">
            {{ busy ? "Saving..." : "Save" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
