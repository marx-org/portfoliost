<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency } from "@/utils/format"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import type { LatestRate } from "@/api/fx"
import { useCurrenciesStore } from "@/stores/currencies"
import type { Wallets } from "@/api/types"

const props = defineProps<{
  open: boolean
  action: "deposit" | "withdraw" | "transfer"
  wallet: Wallets[number]
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "done", amount: number): void }>()

const store = useWalletsStore()
const currenciesStore = useCurrenciesStore()

const amount = ref<number>(0)
const description = ref("")
const transactionDate = ref(new Date().toISOString().slice(0, 10))
const paymentMethod = ref("bank_transfer")
const toWalletId = ref("")
const fees = ref<number>(0)
const feesType = ref<"fixed" | "pct">("fixed")
const feeCurrency = ref("USD")
const rateSource = ref<"automatic" | "manual">("automatic")
const exchangeRate = ref("")
const feeRateSource = ref<"automatic" | "manual">("automatic")
const feeExchangeRate = ref("")
const targetRateSource = ref<"automatic" | "manual">("automatic")
const manualTargetAmount = ref<number | null>(null)
const feeSuggestion = ref<LatestRate | null>(null)
const transferSuggestion = ref<LatestRate | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

const availableBalance = computed(() => props.wallet.availableBalance ?? props.wallet.balance ?? 0)

const targetWallets = computed(() => store.wallets.filter((w) => w.id !== props.wallet.id))

const destCurrency = computed(() => {
  const dest = store.wallets.find((w) => w.id === toWalletId.value)
  return dest?.currency ?? null
})

const isCrossCurrencyTransfer = computed(
  () => props.action === "transfer" && destCurrency.value != null && destCurrency.value !== props.wallet.currency,
)

const feeAmount = computed(() => {
  if (feesType.value === "pct") return (amount.value * (fees.value || 0)) / 100
  return fees.value || 0
})

const feeRateValue = computed<number | null>(() => {
  if (feeAmount.value <= 0) return null
  if (feeCurrency.value === props.wallet.currency) return 1
  if (feeRateSource.value === "manual" && Number(feeExchangeRate.value) > 0) return Number(feeExchangeRate.value)
  return feeSuggestion.value?.rate ?? null
})

const feeInWalletCcy = computed<number | null>(() => {
  if (feeAmount.value <= 0) return 0
  if (feeRateValue.value == null) return null
  return feesType.value === "pct" ? feeAmount.value : feeAmount.value * feeRateValue.value
})

const transferRateValue = computed<number | null>(() => {
  if (!isCrossCurrencyTransfer.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null && amount.value > 0) {
    return manualTargetAmount.value / amount.value
  }
  return transferSuggestion.value?.rate ?? null
})

const targetAmountValue = computed<number | null>(() => {
  if (!isCrossCurrencyTransfer.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null) return manualTargetAmount.value
  if (transferRateValue.value == null) return null
  return amount.value * transferRateValue.value
})

const totalDebited = computed(() => amount.value + (feeInWalletCcy.value ?? 0))

const remainingBalance = computed(() => Math.max(0, availableBalance.value - totalDebited.value))

const canSubmit = computed(() => {
  if (props.action === "transfer") return amount.value > 0 && toWalletId.value !== ""
  return amount.value > 0
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      amount.value = 0
      description.value = ""
      transactionDate.value = new Date().toISOString().slice(0, 10)
      paymentMethod.value = "bank_transfer"
      toWalletId.value = ""
      fees.value = 0
      feesType.value = "fixed"
      feeCurrency.value = props.wallet.currency || "USD"
      rateSource.value = "automatic"
      exchangeRate.value = ""
      feeRateSource.value = "automatic"
      feeExchangeRate.value = ""
      targetRateSource.value = "automatic"
      manualTargetAmount.value = null
      feeSuggestion.value = null
      transferSuggestion.value = null
      if (!currenciesStore.loaded) void currenciesStore.load()
      busy.value = false
      error.value = null
    }
  },
)

function transferAll() {
  amount.value = availableBalance.value
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    const date = transactionDate.value || undefined
    // shared fee/fx fields (fees-and-custom-fx D28/D29); transfer adds the elastic target leg (D22)
    const feeFx = {
      fees: fees.value || undefined,
      fees_type: feesType.value,
      feeCurrency: feesType.value === "fixed" ? feeCurrency.value : undefined,
      rateSource: rateSource.value,
      exchangeRate:
        rateSource.value === "manual" && exchangeRate.value ? Number(exchangeRate.value) : undefined,
      feeRateSource:
        feesType.value === "fixed" && feeCurrency.value !== props.wallet.currency
          ? feeRateSource.value
          : undefined,
      feeExchangeRate:
        feesType.value === "fixed" &&
        feeCurrency.value !== props.wallet.currency &&
        feeRateSource.value === "manual" &&
        feeExchangeRate.value
          ? Number(feeExchangeRate.value)
          : undefined,
    }
    if (props.action === "deposit") {
      await store.deposit(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
        ...feeFx,
      })
    } else if (props.action === "withdraw") {
      await store.withdraw(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
        payment_method: paymentMethod.value,
        ...feeFx,
      })
    } else {
      await store.transfer(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
        to_wallet_id: toWalletId.value,
        ...(isCrossCurrencyTransfer.value &&
        targetRateSource.value === "manual" &&
        manualTargetAmount.value != null
          ? { targetAmount: manualTargetAmount.value }
          : {}),
        ...feeFx,
      })
    }
    emit("done", amount.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to process cash movement"
  } finally {
    busy.value = false
  }
}

const title = computed(() => {
  if (props.action === "deposit") return "Deposit Funds"
  if (props.action === "withdraw") return "Withdraw Funds"
  return "Transfer Funds"
})

const submitLabel = computed(() => (props.action === "deposit" ? "Deposit" : props.action === "withdraw" ? "Withdraw" : "Transfer"))
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self.stop="emit('close')"
  >
    <div class="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Cash movement">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="submit">
        <template v-if="action === 'withdraw'">
          <p class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 sm:col-span-2">
            Available Balance: {{ formatCurrency(availableBalance, wallet.currency) }}
          </p>
        </template>

        <template v-if="action === 'transfer'">
          <div>
            <label for="wc-from-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">From Wallet *</label>
            <input id="wc-from-wallet" type="text" class="input" :value="`${wallet.name} - ${formatCurrency(wallet.balance, wallet.currency)}`" disabled />
          </div>
          <div>
            <label for="wc-to-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">To Wallet *</label>
            <select id="wc-to-wallet" v-model="toWalletId" class="input" required>
              <option value="" disabled>Select destination wallet</option>
              <option v-for="w in targetWallets" :key="w.id" :value="w.id">
                {{ w.name }} - {{ formatCurrency(w.balance, w.currency) }}
              </option>
            </select>
          </div>
        </template>

        <div>
          <label for="wc-amount" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Amount *</label>
          <div class="flex gap-2">
            <div class="flex min-w-0 flex-1 items-center rounded-lg border border-slate-300 dark:border-slate-600 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500 dark:text-slate-400">{{ wallet.currency }}</span>
              <input id="wc-amount" v-model.number="amount" type="number" min="0" step="0.01" required class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" placeholder="Enter amount" />
            </div>
            <button v-if="action === 'transfer'" type="button" class="btn-secondary shrink-0 text-sm" @click="transferAll">Transfer All</button>
          </div>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Available: {{ formatCurrency(availableBalance, wallet.currency) }}</p>
        </div>

        <div>
          <label for="wc-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Date</label>
          <input id="wc-date" v-model="transactionDate" type="date" class="input" />
        </div>

        <FxRateFields
          leg="Transfer"
          :from="wallet.currency"
          :to="destCurrency ?? wallet.currency"
          :date="transactionDate"
          :hidden="!isCrossCurrencyTransfer"
          v-model:rate-source="targetRateSource"
          @suggestion="transferSuggestion = $event"
          testid="wc-transfer-fx"
          class="sm:col-span-2"
        >
          <template #manual>
            <label for="wc-target-amount" class="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              Target amount in {{ destCurrency }} — leave empty to convert at the custom rate
            </label>
            <input
              id="wc-target-amount"
              v-model.number="manualTargetAmount"
              type="number"
              min="0"
              step="any"
              class="input"
              placeholder="auto"
              data-testid="wc-target-amount"
            />
          </template>
        </FxRateFields>

        <div v-if="action === 'withdraw'" class="sm:col-span-2">
          <label for="wc-payment" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Payment Method</label>
          <select id="wc-payment" v-model="paymentMethod" class="input">
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
            <option value="wire">Wire</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>

        <div class="sm:col-span-2">
          <label for="wc-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description (Optional)</label>
          <input
            id="wc-description"
            v-model="description"
            type="text"
            class="input"
            :placeholder="action === 'withdraw' ? 'e.g., Bill payment' : action === 'deposit' ? 'e.g., Monthly savings' : 'e.g., Rebalance'"
          />
        </div>

        <div class="sm:col-span-2">
          <label for="wc-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Fees (Optional)</label>
          <FeeFields
            v-model:fees="fees"
            v-model:fees-type="feesType"
            v-model:fee-currency="feeCurrency"
            testid="wc"
            input-id="wc-fees"
          />

          <FxRateFields
            leg="Fee"
            :from="feeCurrency"
            :to="wallet.currency"
            :date="transactionDate"
            :hidden="feesType !== 'fixed' || feeCurrency === wallet.currency"
            v-model:rate-source="feeRateSource"
            v-model:rate="feeExchangeRate"
            testid="wc-fee-fx"
            class="mt-3"
          />
        </div>


        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm sm:col-span-2">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Transaction Confirmation</p>
          <dl class="mt-1 space-y-0.5 tabular-nums text-slate-600 dark:text-slate-300">
            <div class="flex justify-between gap-3">
              <dt>{{ action === "transfer" ? "Transfer amount" : "Amount" }}</dt>
              <dd>{{ formatCurrency(amount || 0, wallet.currency) }}</dd>
            </div>
            <div v-if="feeAmount > 0" class="flex justify-between gap-3">
              <dt>Fee ({{ feesType === "pct" ? `${fees}%` : feeCurrency }})</dt>
              <dd>
                {{ formatCurrency(feeAmount, feeCurrency) }}
                <template v-if="feeCurrency !== wallet.currency">
                  <template v-if="feeInWalletCcy != null"> &asymp; {{ formatCurrency(feeInWalletCcy, wallet.currency) }}</template>
                  <template v-else> · rate pending</template>
                </template>
              </dd>
            </div>
            <div v-if="action !== 'deposit'" class="flex justify-between gap-3 border-t border-slate-200 pt-0.5 font-semibold text-slate-900 dark:text-slate-100 dark:border-slate-700">
              <dt>Total debited</dt>
              <dd>{{ formatCurrency(totalDebited, wallet.currency) }} <span class="text-xs font-normal text-slate-400">{{ wallet.currency }}</span></dd>
            </div>
            <div v-if="isCrossCurrencyTransfer" class="flex justify-between gap-3">
              <dt>Target ({{ destCurrency }})</dt>
              <dd>
                <template v-if="targetAmountValue != null">{{ formatCurrency(targetAmountValue, destCurrency || "") }}</template>
                <template v-else>—</template>
                <span class="text-xs text-slate-400">
                  {{ transferRateValue != null ? `@ ${transferRateValue.toFixed(4)}` : "· rate pending" }}
                </span>
              </dd>
            </div>
            <div v-if="action !== 'deposit'" class="flex justify-between gap-3">
              <dt>Remaining balance</dt>
              <dd>{{ formatCurrency(remainingBalance, wallet.currency) }}</dd>
            </div>
          </dl>
        </div>

        <p v-if="error" class="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{{ error }}</p>

        <div class="flex justify-end gap-2 sm:col-span-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary capitalize" :disabled="busy || !canSubmit">
            {{ busy ? "Processing..." : submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
