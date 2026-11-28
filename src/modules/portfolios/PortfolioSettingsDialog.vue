<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useCurrenciesStore } from "@/stores/currencies"
import { useLabelsStore } from "@/stores/labels"
import type { PortfolioDetail } from "@/api/types"

const { t } = useI18n()

export type PortfolioSettingsPayload =
  Required<Pick<PortfolioDetail, "name" | "baseCurrency" | "cashLegOnTrade" | "cashBaseCurrencyOnly">> & {
    /** null = the cash ledger stays per trade currency. */
    cashCurrency: string | null
    labelId?: NonNullable<PortfolioDetail["labelId"]>
  }

const props = withDefaults(defineProps<{
  open: boolean
  name: string
  baseCurrency: string
  cashLegOnTrade: boolean
  cashBaseCurrencyOnly: boolean
  cashCurrency?: string | null
  isVirtual?: boolean
  labelId?: string | null
  busy?: boolean
  error?: string | null
}>(), {
  cashCurrency: null,
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
const cashBaseCurrencyOnly = ref(props.cashBaseCurrencyOnly)
const cashCurrency = ref(props.cashCurrency ?? "")
const labelId = ref(props.labelId ?? "")

watch(() => props.open, (open) => {
  if (!open) return
  if (!currenciesStore.loaded) void currenciesStore.load()
  if (props.isVirtual && !labelsStore.labels.length) void labelsStore.fetchLabels()
  name.value = props.name
  baseCurrency.value = props.baseCurrency
  cashLegOnTrade.value = props.cashLegOnTrade
  cashBaseCurrencyOnly.value = props.cashBaseCurrencyOnly
  cashCurrency.value = props.cashCurrency ?? ""
  labelId.value = props.labelId ?? ""
})

function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName || !baseCurrency.value) return
  emit("submit", {
    name: trimmedName,
    baseCurrency: baseCurrency.value,
    cashLegOnTrade: cashLegOnTrade.value,
    cashBaseCurrencyOnly: cashBaseCurrencyOnly.value,
    // "Base currency only" is the shorthand for settlement = base; sending a
    // settlement currency as well would be redundant, and empty means
    // "no single settlement currency" (per-trade-currency ledger).
    cashCurrency: cashBaseCurrencyOnly.value
      ? baseCurrency.value
      : (cashCurrency.value || null),
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
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="t('portfolios.settingsAria')">
      <h3 class="mb-4 text-base font-semibold">{{ t("portfolios.settingsTitle") }}</h3>
      <form @submit.prevent="submit">
        <label for="portfolio-settings-name" class="mb-1 block text-sm text-muted">{{ t("portfolios.name") }}</label>
        <input id="portfolio-settings-name" v-model="name" type="text" required class="input mb-4" />

        <label for="portfolio-settings-currency" class="mb-1 block text-sm text-muted">{{ t("portfolios.baseCurrency") }}</label>
        <select id="portfolio-settings-currency" v-model="baseCurrency" required class="input mb-4">
          <option v-for="currency in currencies" :key="currency" :value="currency">{{ currency }}</option>
        </select>

        <div v-if="props.isVirtual" class="mb-4">
          <label for="portfolio-settings-label" class="mb-1 block text-sm text-muted">{{ t("portfolios.instrumentLabel") }}</label>
          <select id="portfolio-settings-label" v-model="labelId" class="input" required>
            <option value="" disabled>{{ t("portfolios.selectLabel") }}</option>
            <option v-for="label in labelsStore.labels" :key="label.id" :value="label.id">{{ label.name }}</option>
          </select>
        </div>

        <label v-if="props.isVirtual" class="mb-4 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked disabled />
          {{ t("portfolios.virtualPortfolio") }}
        </label>

        <label class="mb-4 flex items-start gap-2 text-sm text-muted">
           <input
             v-if="!props.isVirtual"
            id="portfolio-settings-cash-leg"
            v-model="cashLegOnTrade"
            type="checkbox"
            class="mt-0.5"
            data-testid="cash-leg-on-trade"
          />
           <span v-if="!props.isVirtual">
            {{ t("portfolios.cashLegOnTrade") }}
            <span class="block text-xs text-muted">
              {{ t("portfolios.cashLegOnTradeHelp") }}
            </span>
          </span>
        </label>
        <label v-if="!props.isVirtual" class="mb-4 flex items-start gap-2 text-sm text-muted">
          <input
            id="portfolio-settings-cash-base-only"
            v-model="cashBaseCurrencyOnly"
            type="checkbox"
            class="mt-0.5"
            data-testid="cash-base-currency-only"
          />
          <span>
            {{ t("portfolios.cashBaseOnly") }}
            <span class="block text-xs text-muted">
              {{ t("portfolios.cashBaseOnlyHelp") }}
            </span>
          </span>
        </label>
        <div v-if="!props.isVirtual && !cashBaseCurrencyOnly" class="mb-4">
          <label for="portfolio-settings-cash-currency" class="mb-1 block text-sm text-muted">{{ t("portfolios.cashSettlement") }}</label>
          <select id="portfolio-settings-cash-currency" v-model="cashCurrency" class="input" data-testid="cash-settlement-currency">
            <option value="">{{ t("portfolios.cashSettlementNone") }}</option>
            <option v-for="currency in currencies" :key="currency" :value="currency">{{ currency }}</option>
          </select>
          <p class="mt-1 text-xs text-muted">
            {{ t("portfolios.cashSettlementHelp") }}
          </p>
        </div>
        <p v-if="error" class="mb-3 text-sm text-danger">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="emit('close')">{{ t("portfolios.cancel") }}</button>
          <button type="submit" class="btn-primary" :disabled="busy || !name.trim() || !baseCurrency || (props.isVirtual && !labelId)">
            {{ busy ? t("portfolios.saving") : t("portfolios.save") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
