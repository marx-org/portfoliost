<script setup lang="ts">
import { computed } from "vue"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import { formatCurrency } from "@/utils/format"
import { useCurrenciesStore } from "@/stores/currencies"
import { useTransactionForm, type TransactionFormFields } from "@/composables/useTransactionForm"
import type { Wallets } from "@/api/types"

export interface TransactionFormModel extends TransactionFormFields {
  date: string
  walletId: string
  type?: "BUY" | "SELL"
}

const props = withDefaults(defineProps<{
  symbol: string
  name: string
  assetType?: string
  country?: string
  marketPrice: number | null
  priceAsOfLabel: string
  wallets: Wallets
  targetCurrency: string | null
  txCurrency: string
  testid: string
  showType?: boolean
  showHeader?: boolean
  showViewChart?: boolean
}>(), {
  showHeader: true,
  showViewChart: true,
})

const model = defineModel<TransactionFormModel>("form", { required: true })
const emit = defineEmits<{
  (e: "view-chart"): void
  (e: "price-input"): void
  (e: "submit"): void
}>()

const currenciesStore = useCurrenciesStore()
if (!currenciesStore.loaded) void currenciesStore.load()

const targetCurrencyRef = computed(() => props.targetCurrency)

const tf = useTransactionForm(
  computed(() => model.value),
  targetCurrencyRef,
)
</script>

<template>
  <form @submit.prevent="emit('submit')">
    <div :data-testid="`${testid}-fields`">
      <div v-if="showHeader !== false" class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <img :src="`/api/logos/${symbol}`" :alt="symbol" class="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800" />
        <div class="flex-1">
          <p class="font-medium text-slate-900 dark:text-slate-100">
            {{ symbol }} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">({{ country || "US" }})</span>
            <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{{ assetType || "Stock" }}</span>
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ name || "—" }}</p>
        </div>
        <div class="text-right">
          <button v-if="showViewChart !== false" type="button" class="text-xs text-blue-600 hover:underline" @click="emit('view-chart')">View chart</button>
          <p class="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
            {{ marketPrice != null ? formatCurrency(marketPrice, "USD") : "—" }}
            <span class="block text-xs font-normal text-slate-400">{{ priceAsOfLabel }}</span>
          </p>
        </div>
      </div>

      <div v-if="showType" class="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label :for="`${testid}-date`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Date</label>
          <input
            :id="`${testid}-date`"
            v-model="model.date"
            type="date"
            required
            class="input"
            :data-testid="`${testid}-date`"
          />
        </div>
        <div>
          <label :for="`${testid}-type`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Type</label>
          <select :id="`${testid}-type`" v-model="model.type" class="input" :data-testid="`${testid}-type`">
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
      </div>
      <template v-else>
        <label :for="`${testid}-date`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Purchase Date</label>
        <input
          :id="`${testid}-date`"
          v-model="model.date"
          type="date"
          required
          class="input mb-4"
          :data-testid="`${testid}-date`"
        />
      </template>

      <label :for="`${testid}-wallet`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Cash portfolio</label>
      <select :id="`${testid}-wallet`" v-model="model.walletId" class="input mb-4" :data-testid="`${testid}-wallet`">
        <option v-if="!wallets.length" value="" disabled>Loading wallets…</option>
        <option v-for="w in wallets" :key="w.id" :value="w.id">
          {{ w.name }} ({{ formatCurrency(w.balance, w.currency) }})
        </option>
      </select>

      <div class="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label :for="`${testid}-quantity`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Quantity</label>
          <input
            :id="`${testid}-quantity`"
            v-model="model.quantity"
            type="number"
            min="0.000001"
            step="any"
            required
            class="input"
            :data-testid="`${testid}-quantity`"
          />
        </div>
        <div>
          <label :for="`${testid}-price`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Price per share ({{ txCurrency }})</label>
          <input
            :id="`${testid}-price`"
            v-model="model.price"
            type="number"
            min="0.001"
            step="any"
            required
            class="input"
            :data-testid="`${testid}-price`"
            @input="emit('price-input')"
          />
        </div>
      </div>

      <label :for="`${testid}-fees`" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Fees</label>
      <FeeFields
        v-model:fees="model.fees"
        v-model:fees-type="model.feesType"
        v-model:fee-currency="model.feeCurrency"
        :testid="testid"
        :input-id="`${testid}-fees`"
        class="mb-1"
      />

      <FxRateFields
        leg="Transaction"
        :from="txCurrency"
        :to="targetCurrency ?? ''"
        :date="model.date"
        v-model:rate-source="model.rateSource"
        v-model:rate="model.exchangeRate"
        :testid="`${testid}-fx`"
        @suggestion="tf.onTxSuggestion"
      />

      <FxRateFields
        leg="Fee"
        :from="model.feeCurrency"
        :to="txCurrency"
        :date="model.date"
        :hidden="model.feesType !== 'fixed' || model.feeCurrency === txCurrency"
        v-model:rate-source="model.feeRateSource"
        v-model:rate="model.feeExchangeRate"
        :testid="`${testid}-fee-fx`"
        @suggestion="tf.onFeeSuggestion"
      />

      <dl class="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
        <div class="flex items-center justify-between">
          <dt class="text-slate-600 dark:text-slate-300">Shares × Price</dt>
          <dd class="tabular-nums text-slate-900 dark:text-slate-100">
            {{ formatCurrency(tf.positionCostUSD.value, "USD") }}
            <template v-if="tf.txRateValue.value != null"> ≈ {{ formatCurrency(tf.positionCostConverted.value ?? 0, targetCurrency ?? "") }}</template>
          </dd>
        </div>
        <div v-if="tf.feeValue.value > 0" class="mt-1 flex items-center justify-between">
          <dt class="text-slate-600 dark:text-slate-300">Fee ({{ model.feeCurrency }})</dt>
          <dd class="tabular-nums text-slate-900 dark:text-slate-100">
            {{ formatCurrency(tf.feeValue.value, model.feeCurrency) }}
            <template v-if="tf.feeRateValue.value != null && model.feeCurrency !== txCurrency"> ≈ {{ formatCurrency(tf.feeInUsd.value ?? 0, "USD") }}</template>
          </dd>
        </div>
        <div class="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 font-medium dark:border-slate-700">
          <dt class="text-slate-700 dark:text-slate-200">Total Cost</dt>
          <dd class="tabular-nums text-slate-900 dark:text-slate-100">
            {{ formatCurrency(tf.totalCost.value, "USD") }}
            <template v-if="tf.totalCostConverted.value != null"> ≈ {{ formatCurrency(tf.totalCostConverted.value ?? 0, targetCurrency ?? "") }}</template>
          </dd>
        </div>
      </dl>

      <slot name="footer" :total-cost="tf.totalCost.value" :fee-value="tf.feeValue.value" :fee-in-usd="tf.feeInUsd.value" :tx-rate="tf.txRateValue.value" />
    </div>
  </form>
</template>