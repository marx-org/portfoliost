<script setup lang="ts">
/**
 * §62.8 — per-portfolio cash movement modals (re-scope of the deleted
 * WalletCashModals): Deposit / Withdraw / Transfer on a single portfolio's
 * native cash position. Currency is picked from the `/api/currencies` registry
 * (never hardcoded); D28/D29 FxRateFields on the leg + fee. Transfer adds a
 * target-portfolio select (other user portfolios) + the D22 elastic target leg.
 */
import { computed, ref, watch } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"
import { depositCash, withdrawCash, transferCash, updateCashTransaction } from "@/api/portfolios"
import { formatCurrency } from "@/utils/format"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import type { LatestRate } from "@/api/fx"
import type { components } from "@/api/types"

type PortfolioCash = components["schemas"]["PortfolioCash"]

const props = defineProps<{
  open: boolean
  action: "deposit" | "withdraw" | "transfer"
  portfolioId: string
  /** the portfolio's current cash (for the balance hint + currency default). */
  cash: PortfolioCash
  /** §62 follow-up — when set the modal edits this cash row (PATCH) instead of creating one. */
  editTx?: { id: string; type: string; amount: number | string; currency: string; date?: string; createdAt: string; description?: string | null; toPortfolioId?: string | null; fees?: number | null; feeCurrency?: string | null; feeRateSource?: "automatic" | "manual" | null; feeExchangeRate?: number | null } | null
}>()

const emit = defineEmits<{ (e: "close"): void; (e: "done"): void }>()

const store = usePortfolioStore()
const currenciesStore = useCurrenciesStore()

const amount = ref<number>(0)
const currency = ref("")
const description = ref("")
const transactionDate = ref(new Date().toISOString().slice(0, 10))
const paymentMethod = ref("bank_transfer")
const toPortfolioId = ref("")
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

const allCurrencies = computed(() => currenciesStore.currencies.map((c) => c.code))
const baseCurrency = computed(() => props.cash.baseCurrency)
const isEdit = computed(() => props.editTx != null)

// Other user portfolios (transfer targets).
const targetPortfolios = computed(() =>
  store.portfolios.filter((p) => p.id !== props.portfolioId),
)
const targetPortfolio = computed(() =>
  targetPortfolios.value.find((p) => p.id === toPortfolioId.value),
)
const targetCurrency = computed(() => targetPortfolio.value?.baseCurrency ?? null)

// The FX leg converts the picked currency into the portfolio base currency
// (the position's home currency), like the other cash dialogs (§62.7).
const isCrossCcy = computed(() => currency.value !== "" && currency.value !== baseCurrency.value)

const availableBalance = computed(() => {
  const b = props.cash.balances.find((x) => x.currency.toUpperCase() === currency.value.toUpperCase())
  return b?.balance ?? 0
})

const feeAmount = computed(() => {
  if (feesType.value === "pct") return (amount.value * (fees.value || 0)) / 100
  return fees.value || 0
})

const feeRateValue = computed<number | null>(() => {
  if (feeAmount.value <= 0) return null
  if (feeCurrency.value === currency.value) return 1
  if (feeRateSource.value === "manual" && Number(feeExchangeRate.value) > 0) return Number(feeExchangeRate.value)
  return feeSuggestion.value?.rate ?? null
})

const feeInCcy = computed<number | null>(() => {
  if (feeAmount.value <= 0) return 0
  if (feeRateValue.value == null) return null
  return feesType.value === "pct" ? feeAmount.value : feeAmount.value * feeRateValue.value
})

const transferRateValue = computed<number | null>(() => {
  if (props.action !== "transfer" || !isCrossCcy.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null && amount.value > 0) {
    return manualTargetAmount.value / amount.value
  }
  return transferSuggestion.value?.rate ?? null
})

const targetAmountValue = computed<number | null>(() => {
  if (props.action !== "transfer" || !isCrossCcy.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null) return manualTargetAmount.value
  if (transferRateValue.value == null) return null
  return amount.value * transferRateValue.value
})

const totalDebited = computed(() => amount.value + (feeInCcy.value ?? 0))
const netCredited = computed<number | null>(() => {
  if (props.action !== "deposit") return null
  if (feeAmount.value > 0 && feeInCcy.value == null) return null
  return Math.max(0, amount.value - (feeInCcy.value ?? 0))
})
const remainingBalance = computed(() => Math.max(0, availableBalance.value - totalDebited.value))

const canSubmit = computed(() => {
  if (!currency.value) return false
  if (props.action === "transfer") return amount.value > 0 && toPortfolioId.value !== ""
  return amount.value > 0
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.editTx) {
        // Edit mode — prefill from the existing row (the server re-clamps the
        // sign per type, so the amount ships as a magnitude).
        const tx = props.editTx
        amount.value = Math.abs(Number(tx.amount)) || 0
        currency.value = tx.currency
        description.value = tx.description ?? ""
        transactionDate.value = tx.date ?? tx.createdAt.slice(0, 10)
        toPortfolioId.value = tx.toPortfolioId ?? ""
        fees.value = tx.fees != null ? Number(tx.fees) : 0
        // The CashTransaction schema exposes no feesType; fees ship fixed.
        feesType.value = "fixed"
        feeCurrency.value = tx.feeCurrency ?? (baseCurrency.value || "USD")
        feeRateSource.value = tx.feeRateSource ?? "automatic"
        feeExchangeRate.value = tx.feeExchangeRate != null ? String(tx.feeExchangeRate) : ""
      } else {
        amount.value = 0
        currency.value = baseCurrency.value
        description.value = ""
        transactionDate.value = new Date().toISOString().slice(0, 10)
        paymentMethod.value = "bank_transfer"
        toPortfolioId.value = ""
        fees.value = 0
        feesType.value = "fixed"
        feeCurrency.value = baseCurrency.value || "USD"
      }
      rateSource.value = "automatic"
      exchangeRate.value = ""
      targetRateSource.value = "automatic"
      manualTargetAmount.value = null
      feeSuggestion.value = null
      transferSuggestion.value = null
      if (!currenciesStore.loaded) void currenciesStore.load()
      // The transfer target list is store.portfolios; refresh it so a freshly
      // created portfolio is available even when opened straight to the cash tab
      // (DetailView doesn't fetchAll on mount).
      void store.fetchAll().catch(() => {})
      busy.value = false
      error.value = null
    }
  },
)

function transferAll() {
  amount.value = Math.abs(availableBalance.value)
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    if (props.editTx) {
      // Edit mode — PATCH the row (the server re-clamps the sign per type and
      // ignores currency changes on transfers).
      await updateCashTransaction(props.editTx.id, {
        amount: amount.value,
        currency: props.editTx.type !== "TRANSFER" ? currency.value : undefined,
        description: description.value || undefined,
        date: transactionDate.value || undefined,
        fees: fees.value || undefined,
        feesType: feesType.value,
        feeCurrency:
          props.editTx.type !== "TRANSFER" && feesType.value === "fixed" ? feeCurrency.value : undefined,
        feeRateSource:
          feesType.value === "fixed" && feeCurrency.value !== currency.value ? feeRateSource.value : undefined,
        feeExchangeRate:
          feesType.value === "fixed" &&
          feeCurrency.value !== currency.value &&
          feeRateSource.value === "manual" &&
          feeExchangeRate.value
            ? Number(feeExchangeRate.value)
            : undefined,
      })
      emit("done")
      return
    }
    const feeFx = {
      fees: fees.value || undefined,
      feesType: feesType.value,
      feeCurrency: feesType.value === "fixed" ? feeCurrency.value : undefined,
      rateSource: isCrossCcy.value ? rateSource.value : undefined,
      exchangeRate:
        isCrossCcy.value && rateSource.value === "manual" && exchangeRate.value
          ? Number(exchangeRate.value)
          : undefined,
      feeRateSource:
        feesType.value === "fixed" && feeCurrency.value !== currency.value
          ? feeRateSource.value
          : undefined,
      feeExchangeRate:
        feesType.value === "fixed" &&
        feeCurrency.value !== currency.value &&
        feeRateSource.value === "manual" &&
        feeExchangeRate.value
          ? Number(feeExchangeRate.value)
          : undefined,
    }
    if (props.action === "deposit") {
      await depositCash(props.portfolioId, {
        amount: amount.value,
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        ...feeFx,
      })
    } else if (props.action === "withdraw") {
      await withdrawCash(props.portfolioId, {
        amount: amount.value,
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        paymentMethod: paymentMethod.value,
        ...feeFx,
      })
    } else {
      await transferCash(props.portfolioId, {
        amount: amount.value,
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        toPortfolioId: toPortfolioId.value,
        ...(isCrossCcy.value &&
        targetRateSource.value === "manual" &&
        manualTargetAmount.value != null
          ? { targetAmount: manualTargetAmount.value }
          : {}),
        ...feeFx,
      })
    }
    emit("done")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to process cash movement"
  } finally {
    busy.value = false
  }
}

const title = computed(() => {
  if (isEdit.value) return `Edit ${submitLabel.value}`
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

      <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="pc-form" @submit.prevent="submit">
        <template v-if="action === 'withdraw'">
          <p class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 sm:col-span-2">
            Available in {{ currency || baseCurrency }}: {{ formatCurrency(availableBalance, currency || baseCurrency) }}
          </p>
        </template>

        <template v-if="action === 'transfer' && !isEdit">
          <div>
            <label for="pc-to-portfolio" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">To Portfolio *</label>
            <select id="pc-to-portfolio" v-model="toPortfolioId" class="input" required data-testid="pc-to-portfolio">
              <option value="" disabled>Select destination portfolio</option>
              <option v-for="p in targetPortfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
        </template>

        <div>
          <label for="pc-currency" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Currency</label>
          <select id="pc-currency" v-model="currency" class="input" data-testid="pc-currency">
            <option v-for="c in allCurrencies" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label for="pc-amount" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Amount *</label>
          <div class="flex gap-2">
            <div class="flex min-w-0 flex-1 items-center rounded-lg border border-slate-300 dark:border-slate-600 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500 dark:text-slate-400">{{ currency }}</span>
              <input id="pc-amount" v-model.number="amount" type="number" min="0" step="0.01" required class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" placeholder="Enter amount" data-testid="pc-amount" />
            </div>
            <button v-if="action === 'transfer' && !isEdit" type="button" class="btn-secondary shrink-0 text-sm" @click="transferAll">Transfer All</button>
          </div>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Available: {{ formatCurrency(availableBalance, currency) }}</p>
        </div>

        <div>
          <label for="pc-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Date</label>
          <input id="pc-date" v-model="transactionDate" type="date" class="input" data-testid="pc-date" />
        </div>

        <template v-if="!isEdit && (isCrossCcy || action === 'transfer')">
          <FxRateFields
            :leg="action === 'transfer' ? 'Transfer' : 'Deposit'"
            :from="currency"
            :to="action === 'transfer' ? (targetCurrency ?? baseCurrency) : baseCurrency"
            :date="transactionDate"
            :rate-source="action === 'transfer' ? targetRateSource : rateSource"
            @update:rate-source="(v: 'automatic' | 'manual') => (action === 'transfer' ? (targetRateSource = v) : (rateSource = v))"
            :rate="exchangeRate"
            @update:rate="(v: string) => (exchangeRate = v)"
            @suggestion="(r: LatestRate | null) => (transferSuggestion = r)"
            testid="pc-leg-fx"
            class="sm:col-span-2"
          >
            <template v-if="action === 'transfer'" #manual>
              <label for="pc-target-amount" class="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                Target amount in {{ targetCurrency }} — leave empty to convert at the custom rate
              </label>
              <input
                id="pc-target-amount"
                v-model.number="manualTargetAmount"
                type="number"
                min="0"
                step="any"
                class="input"
                placeholder="auto"
                data-testid="pc-target-amount"
              />
            </template>
          </FxRateFields>
        </template>

        <div v-if="action === 'withdraw'" class="sm:col-span-2">
          <label for="pc-payment" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Payment Method</label>
          <select id="pc-payment" v-model="paymentMethod" class="input" data-testid="pc-payment">
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
            <option value="wire">Wire</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>

        <div class="sm:col-span-2">
          <label for="pc-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description (Optional)</label>
          <input
            id="pc-description"
            v-model="description"
            type="text"
            class="input"
            data-testid="pc-description"
            :placeholder="action === 'withdraw' ? 'e.g., Bill payment' : action === 'deposit' ? 'e.g., Monthly savings' : 'e.g., Rebalance'"
          />
        </div>

        <div class="sm:col-span-2">
          <label for="pc-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Fees (Optional)</label>
          <FeeFields v-model:fees="fees" v-model:fees-type="feesType" v-model:fee-currency="feeCurrency" testid="pc" input-id="pc-fees" />

          <FxRateFields
            leg="Fee"
            :from="feeCurrency"
            :to="currency"
            :date="transactionDate"
            :hidden="feesType !== 'fixed' || feeCurrency === currency"
            :rate-source="feeRateSource"
            :rate="feeExchangeRate"
            @update:rate-source="(v: 'automatic' | 'manual') => (feeRateSource = v)"
            @update:rate="(v: string) => (feeExchangeRate = v)"
            @suggestion="(r: LatestRate | null) => (feeSuggestion = r)"
            testid="pc-fee-fx"
            class="mt-3"
          />
        </div>

        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm sm:col-span-2">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Transaction Confirmation</p>
          <dl class="mt-1 space-y-0.5 tabular-nums text-slate-600 dark:text-slate-300">
            <div class="flex justify-between gap-3">
              <dt>{{ action === "transfer" ? "Transfer amount" : "Amount" }}</dt>
              <dd>{{ formatCurrency(amount || 0, currency) }}</dd>
            </div>
            <div v-if="feeAmount > 0" class="flex justify-between gap-3">
              <dt>Fee ({{ feesType === "pct" ? `${fees}%` : feeCurrency }})</dt>
              <dd>
                {{ formatCurrency(feeAmount, feeCurrency) }}
                <template v-if="feeCurrency !== currency">
                  <template v-if="feeInCcy != null"> &asymp; {{ formatCurrency(feeInCcy, currency) }}</template>
                  <template v-else> · rate pending</template>
                </template>
              </dd>
            </div>
            <div v-if="action === 'deposit' && netCredited != null" class="flex justify-between gap-3 border-t border-slate-200 pt-0.5 font-semibold text-slate-900 dark:text-slate-100 dark:border-slate-700">
              <dt>Total credited (net)</dt>
              <dd>{{ formatCurrency(netCredited, currency) }}</dd>
            </div>
            <div v-if="action !== 'deposit'" class="flex justify-between gap-3 border-t border-slate-200 pt-0.5 font-semibold text-slate-900 dark:text-slate-100 dark:border-slate-700">
              <dt>Total debited</dt>
              <dd>{{ formatCurrency(totalDebited, currency) }}</dd>
            </div>
            <div v-if="action === 'transfer' && isCrossCcy" class="flex justify-between gap-3">
              <dt>Target ({{ targetCurrency }})</dt>
              <dd>
                <template v-if="targetAmountValue != null">{{ formatCurrency(targetAmountValue, targetCurrency || "") }}</template>
                <template v-else>—</template>
                <span class="text-xs text-slate-400">{{ transferRateValue != null ? `@ ${transferRateValue.toFixed(4)}` : "· rate pending" }}</span>
              </dd>
            </div>
            <div v-if="action !== 'deposit'" class="flex justify-between gap-3">
              <dt>Remaining balance</dt>
              <dd>{{ formatCurrency(remainingBalance, currency) }}</dd>
            </div>
          </dl>
        </div>

        <p v-if="error" class="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{{ error }}</p>

        <div class="flex justify-end gap-2 sm:col-span-2">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn-primary capitalize" :disabled="busy || !canSubmit" data-testid="pc-submit">
            {{ busy ? "Processing..." : submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
