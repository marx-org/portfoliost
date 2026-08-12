<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency } from "@/utils/format"
import type { Wallets } from "@/api/types"

const props = defineProps<{
  open: boolean
  action: "deposit" | "withdraw" | "transfer"
  wallet: Wallets[number]
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "done", amount: number): void }>()

const store = useWalletsStore()

const amount = ref<number>(0)
const description = ref("")
const transactionDate = ref(new Date().toISOString().slice(0, 10))
const paymentMethod = ref("bank_transfer")
const toWalletId = ref("")
const fees = ref<number>(0)
const feesType = ref<"fixed" | "pct">("fixed")
const busy = ref(false)
const error = ref<string | null>(null)

const availableBalance = computed(() => props.wallet.availableBalance ?? props.wallet.balance ?? 0)

const targetWallets = computed(() => store.wallets.filter((w) => w.id !== props.wallet.id))

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
    if (props.action === "deposit") {
      await store.deposit(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
      })
    } else if (props.action === "withdraw") {
      await store.withdraw(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
        payment_method: paymentMethod.value,
      })
    } else {
      await store.transfer(props.wallet.id, {
        amount: amount.value,
        currency: props.wallet.currency,
        description: description.value || undefined,
        transaction_date: date,
        to_wallet_id: toWalletId.value,
        fees: fees.value || undefined,
        fees_type: feesType.value,
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
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Cash movement">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
      </div>

      <form @submit.prevent="submit">
        <template v-if="action === 'withdraw'">
          <p class="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Available Balance: {{ formatCurrency(availableBalance, wallet.currency) }}
          </p>
        </template>

        <template v-if="action === 'transfer'">
          <div class="mb-4">
            <label for="wc-from-wallet" class="mb-1 block text-sm text-slate-600">From Wallet *</label>
            <input id="wc-from-wallet" type="text" class="input" :value="`${wallet.name} - ${formatCurrency(wallet.balance, wallet.currency)}`" disabled />
          </div>
          <div class="mb-4">
            <label for="wc-to-wallet" class="mb-1 block text-sm text-slate-600">To Wallet *</label>
            <select id="wc-to-wallet" v-model="toWalletId" class="input" required>
              <option value="" disabled>Select destination wallet</option>
              <option v-for="w in targetWallets" :key="w.id" :value="w.id">
                {{ w.name }} - {{ formatCurrency(w.balance, w.currency) }}
              </option>
            </select>
          </div>
        </template>

        <div class="mb-4">
          <label for="wc-amount" class="mb-1 block text-sm text-slate-600">Amount *</label>
          <div class="flex gap-2">
            <div class="flex flex-1 items-center rounded-lg border border-slate-300 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500">{{ wallet.currency }}</span>
              <input id="wc-amount" v-model.number="amount" type="number" min="0" step="0.01" required class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" placeholder="Enter amount" />
            </div>
            <button v-if="action === 'transfer'" type="button" class="btn-secondary shrink-0 text-sm" @click="transferAll">Transfer All</button>
          </div>
          <p v-if="action === 'transfer'" class="mt-1 text-xs text-slate-500">Available: {{ formatCurrency(availableBalance, wallet.currency) }}</p>
        </div>

        <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="wc-date" class="mb-1 block text-sm text-slate-600">Transaction Date</label>
            <input id="wc-date" v-model="transactionDate" type="date" class="input" />
          </div>
          <div v-if="action === 'withdraw'">
            <label for="wc-payment" class="mb-1 block text-sm text-slate-600">Payment Method</label>
            <select id="wc-payment" v-model="paymentMethod" class="input">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="wire">Wire</option>
              <option value="paypal">PayPal</option>
            </select>
          </div>
        </div>

        <div class="mb-4">
          <label for="wc-description" class="mb-1 block text-sm text-slate-600">Description (Optional)</label>
          <input
            id="wc-description"
            v-model="description"
            type="text"
            class="input"
            :placeholder="action === 'withdraw' ? 'e.g., Bill payment' : action === 'deposit' ? 'e.g., Monthly savings' : 'e.g., Rebalance'"
          />
        </div>

        <div v-if="action === 'transfer'" class="mb-4">
          <label for="wc-fees" class="mb-1 block text-sm text-slate-600">Fees (Optional)</label>
          <div class="flex gap-2">
            <div class="flex flex-1 items-center rounded-lg border border-slate-300 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500">{{ feesType === "fixed" ? wallet.currency : "%" }}</span>
              <input id="wc-fees" v-model.number="fees" type="number" min="0" step="0.01" class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" />
            </div>
            <button
              type="button"
              class="btn-secondary shrink-0 text-sm"
              :class="feesType === 'pct' ? 'bg-slate-200 text-slate-900' : ''"
              @click="feesType = feesType === 'fixed' ? 'pct' : 'fixed'"
            >
              {{ feesType === "fixed" ? "$" : "%" }}
            </button>
          </div>
        </div>

        <div class="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Transaction Confirmation</p>
          <p class="mt-0.5 font-semibold tabular-nums">{{ formatCurrency(amount || 0, wallet.currency) }}</p>
          <p v-if="action === 'withdraw'" class="mt-0.5 text-slate-500">Remaining Balance: {{ formatCurrency(remainingBalance, wallet.currency) }}</p>
          <p v-if="action === 'transfer' && feeAmount > 0" class="mt-0.5 text-slate-500">
            Fees: {{ formatCurrency(feeAmount, wallet.currency) }} ({{ feesType === "pct" ? `${fees}%` : `${wallet.currency} fixed` }})
          </p>
        </div>

        <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>

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
