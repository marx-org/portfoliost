<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency } from "@/utils/format"
import CurrencySelect from "@/components/CurrencySelect.vue"
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
const showFxSection = ref(false)
const manualTargetAmount = ref<number | null>(null)
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

const remainingBalance = computed(() => Math.max(0, availableBalance.value - amount.value - feeAmount.value))

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
      showFxSection.value = false
      manualTargetAmount.value = null
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
        ...(isCrossCurrencyTransfer.value && manualTargetAmount.value != null
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
    <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Cash movement">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <form @submit.prevent="submit">
        <template v-if="action === 'withdraw'">
          <p class="mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
            Available Balance: {{ formatCurrency(availableBalance, wallet.currency) }}
          </p>
        </template>

        <template v-if="action === 'transfer'">
          <div class="mb-4">
            <label for="wc-from-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">From Wallet *</label>
            <input id="wc-from-wallet" type="text" class="input" :value="`${wallet.name} - ${formatCurrency(wallet.balance, wallet.currency)}`" disabled />
          </div>
          <div class="mb-4">
            <label for="wc-to-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">To Wallet *</label>
            <select id="wc-to-wallet" v-model="toWalletId" class="input" required>
              <option value="" disabled>Select destination wallet</option>
              <option v-for="w in targetWallets" :key="w.id" :value="w.id">
                {{ w.name }} - {{ formatCurrency(w.balance, w.currency) }}
              </option>
            </select>
          </div>
        </template>

        <div class="mb-4">
          <label for="wc-amount" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Amount *</label>
          <div class="flex gap-2">
            <div class="flex flex-1 items-center rounded-lg border border-slate-300 dark:border-slate-600 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500 dark:text-slate-400">{{ wallet.currency }}</span>
              <input id="wc-amount" v-model.number="amount" type="number" min="0" step="0.01" required class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" placeholder="Enter amount" />
            </div>
            <button v-if="action === 'transfer'" type="button" class="btn-secondary shrink-0 text-sm" @click="transferAll">Transfer All</button>
          </div>
          <p v-if="action === 'transfer'" class="mt-1 text-xs text-slate-500 dark:text-slate-400">Available: {{ formatCurrency(availableBalance, wallet.currency) }}</p>
        </div>

        <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="wc-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Date</label>
            <input id="wc-date" v-model="transactionDate" type="date" class="input" />
          </div>
          <div v-if="action === 'withdraw'">
            <label for="wc-payment" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Payment Method</label>
            <select id="wc-payment" v-model="paymentMethod" class="input">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="wire">Wire</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>
        </div>

        <div class="mb-4">
          <label for="wc-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description (Optional)</label>
          <input
            id="wc-description"
            v-model="description"
            type="text"
            class="input"
            :placeholder="action === 'withdraw' ? 'e.g., Bill payment' : action === 'deposit' ? 'e.g., Monthly savings' : 'e.g., Rebalance'"
          />
        </div>

        <div class="mb-4">
          <label for="wc-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Fees (Optional)</label>
          <div class="flex gap-2">
            <div class="flex flex-1 items-center rounded-lg border border-slate-300 dark:border-slate-600 focus-within:border-blue-500">
              <CurrencySelect
                v-if="feesType === 'fixed'"
                v-model="feeCurrency"
                aria-label="Fee currency"
                testid="wc-fee-currency"
                class="!rounded-l-lg !border-0 !border-r"
              />
              <span v-else class="pl-3 text-sm text-slate-500 dark:text-slate-400">%</span>
              <input id="wc-fees" v-model.number="fees" type="number" min="0" step="0.01" class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" />
            </div>
            <button
              type="button"
              class="btn-secondary shrink-0 text-sm"
              :class="feesType === 'pct' ? 'bg-slate-200 dark:bg-slate-700/70 text-slate-900 dark:text-slate-100' : ''"
              data-testid="wc-fees-toggle"
              @click="feesType = feesType === 'fixed' ? 'pct' : 'fixed'"
            >
              {{ feesType === "fixed" ? "Fixed" : "%" }}
            </button>
          </div>

          <div v-if="isCrossCurrencyTransfer" class="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Cross-currency transfer · {{ wallet.currency }} → {{ destCurrency }}
            </p>
            <label for="wc-target-amount" class="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              Target amount in {{ destCurrency }} — leave empty to convert automatically at the daily rate
            </label>
            <input
              id="wc-target-amount"
              v-model.number="manualTargetAmount"
              type="number"
              min="0"
              step="any"
              class="input"
              :placeholder="'auto'"
              data-testid="wc-target-amount"
            />
          </div>
        </div>

        <div class="mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Transaction Confirmation</p>
          <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(amount || 0, wallet.currency) }}</p>
          <p v-if="action === 'withdraw'" class="mt-0.5 text-slate-500 dark:text-slate-400">Remaining Balance: {{ formatCurrency(remainingBalance, wallet.currency) }}</p>
          <p v-if="feeAmount > 0 && action !== 'deposit'" class="mt-0.5 text-slate-500 dark:text-slate-400">
            Fees: {{ formatCurrency(feeAmount, feeCurrency) }} ({{ feesType === "pct" ? `${fees}%` : `${feeCurrency} fixed` }})
          </p>
          <p v-if="isCrossCurrencyTransfer" class="mt-0.5 text-slate-500 dark:text-slate-400">
            Target: {{ manualTargetAmount != null ? formatCurrency(manualTargetAmount, destCurrency || '') : `auto · daily ${wallet.currency}/${destCurrency} rate` }}
          </p>
        </div>

        <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary capitalize" :disabled="busy || !canSubmit">
            {{ busy ? "Processing..." : submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
