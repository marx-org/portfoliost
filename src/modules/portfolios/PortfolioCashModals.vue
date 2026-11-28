<script setup lang="ts">
/**
 * §62.8 — per-portfolio cash movement modals (re-scope of the deleted
 * WalletCashModals): Deposit / Withdraw / Transfer on a single portfolio's
 * native cash position. Currency is picked from the `/api/currencies` registry
 * (never hardcoded); D28/D29 FxRateFields on the leg + fee. Transfer adds a
 * target-portfolio select (other user portfolios) + the D22 elastic target leg.
 *
 * #245 adds the three kinds a broker account has but a trade sheet does not:
 * Interest (signed, credited or charged), Charge (a fee attached to no
 * transaction) and Conversion (two legs — the currency handed over and the one
 * received; both legs the same currency is a correction of one balance).
 */
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { usePortfolioStore } from "@/stores/portfolios"
import { useCurrenciesStore } from "@/stores/currencies"
import {
  depositCash,
  withdrawCash,
  transferCash,
  interestCash,
  feeCash,
  conversionCash,
  updateCashTransaction,
} from "@/api/portfolios"
import { formatCurrency } from "@/utils/format"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import type { LatestRate } from "@/api/fx"
import type { components } from "@/api/types"

type PortfolioCash = components["schemas"]["PortfolioCash"]
type CashAction = "deposit" | "withdraw" | "transfer" | "interest" | "fee" | "conversion"

const props = withDefaults(defineProps<{
  open: boolean
  action: CashAction
  portfolioId: string
  /** the portfolio's current cash (for the balance hint + currency default). */
  cash: PortfolioCash
  /** When enabled, only the portfolio base currency can be used for cash movements. */
  cashBaseCurrencyOnly?: boolean
  /** §243 — the single currency the account settles in, when it is not the base. */
  cashCurrency?: string | null
  /** §93 — the consolidated feed has no portfolio in scope, so name the one the
   *  event is being recorded into on the dialog itself. */
  portfolioName?: string | null
  /** §62 follow-up — when set the modal edits this cash row (PATCH) instead of creating one. */
  editTx?: { id: string; type: string; amount: number | string; currency: string; date?: string; createdAt: string; description?: string | null; toPortfolioId?: string | null; toCurrency?: string | null; toAmount?: number | null; fees?: number | null; feeCurrency?: string | null; feeRateSource?: "automatic" | "manual" | null; feeExchangeRate?: number | null } | null
}>(), { cashBaseCurrencyOnly: false })

const emit = defineEmits<{ (e: "close"): void; (e: "done"): void }>()

const store = usePortfolioStore()
const currenciesStore = useCurrenciesStore()
const { t } = useI18n()

const amount = ref<number>(0)
const currency = ref("")
const description = ref("")
const transactionDate = ref(new Date().toISOString().slice(0, 10))
const toPortfolioId = ref("")
/** #245 — the second leg of a conversion: the currency received and its amount. */
const toCurrency = ref("")
const toAmount = ref<number>(0)
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
/**
 * The currency the cash ledger is denominated in. `cashCurrency` is the account's
 * settlement currency (IBKR: USD, displayed in PLN); `cashBaseCurrencyOnly` is the
 * shorthand for settlement = base. When neither is set the ledger is genuinely
 * multi-currency and every registry currency is a valid choice.
 */
const ledgerCurrency = computed(() =>
  props.cashCurrency ?? (props.cashBaseCurrencyOnly ? baseCurrency.value : null),
)
/**
 * The currencies a non-conversion cash movement may use. When the base is the
 * only available cash, just the base; when a settlement is set and the base is
 * not exclusive, both the settlement and the base (IBKR: USD + PLN); when the
 * ledger is genuinely multi-currency, every registry currency.
 */
const cashCurrencies = computed(() => {
  if (props.cashBaseCurrencyOnly) return [baseCurrency.value].filter(Boolean)
  if (props.cashCurrency) {
    const settlement = props.cashCurrency.toUpperCase()
    const base = baseCurrency.value.toUpperCase()
    return settlement === base ? [base] : [props.cashCurrency, baseCurrency.value].filter(Boolean)
  }
  return allCurrencies.value
})
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
const isBaseCrossCcy = computed(() => currency.value !== "" && currency.value !== baseCurrency.value)
const isTransferCrossCcy = computed(() =>
  props.action === "transfer" && !!targetCurrency.value && currency.value !== targetCurrency.value,
)
const needsAmountFx = computed(() =>
  props.action === "transfer" ? isTransferCrossCcy.value : isBaseCrossCcy.value,
)
const isLegacyNonBaseEdit = computed(() => {
  if (!props.editTx || ledgerCurrency.value == null) return false
  const ledger = ledgerCurrency.value.toUpperCase()
  // A conversion's first leg is expected to be foreign — only a row where
  // neither leg touches the settlement currency is uneditable.
  if (String(props.editTx.type).toUpperCase() === "FX_CONVERSION") {
    return (props.editTx.currency ?? "").toUpperCase() !== ledger &&
      (props.editTx.toCurrency ?? "").toUpperCase() !== ledger
  }
  return (props.editTx.currency ?? "").toUpperCase() !== ledger
})

/**
 * For a conversion the handed-over leg may be any currency, as long as the leg
 * received is the one the account settles in (conversionLegsValid enforces it).
 * Every other movement is restricted to the ledger currency when there is one.
 */
const currencyOptions = computed(() =>
  isConversion.value && ledgerCurrency.value ? allCurrencies.value : cashCurrencies.value,
)

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
  if (props.action !== "transfer" || !isTransferCrossCcy.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null) {
    return manualTargetAmount.value > 0 && amount.value > 0 ? manualTargetAmount.value / amount.value : null
  }
  if (targetRateSource.value === "manual" && Number(exchangeRate.value) > 0) {
    return Number(exchangeRate.value)
  }
  return transferSuggestion.value?.rate ?? null
})

const targetAmountValue = computed<number | null>(() => {
  if (props.action !== "transfer" || !isTransferCrossCcy.value) return null
  if (targetRateSource.value === "manual" && manualTargetAmount.value != null) {
    return manualTargetAmount.value > 0 ? manualTargetAmount.value : null
  }
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

// ── #245: conversion semantics ─────────────────────────────────────────────
const isConversion = computed(() => props.action === "conversion")
/** The leg received defaults to the leg handed over: same currency = a correction. */
const receivedCurrency = computed(() => toCurrency.value || currency.value)
const receivedOptions = computed(() =>
  Array.from(new Set([currency.value, ...cashCurrencies.value].filter(Boolean))),
)
/**
 * A cash row's `fees` is metadata — the ledger replay reads the amounts. So a
 * conversion charge has to be netted into the leg it is quoted in, and a charge
 * in a third currency is not expressible at all (the server rejects it too).
 */
const chargeLeg = computed<"from" | "to" | null>(() => {
  if (!isConversion.value || feeAmount.value <= 0) return null
  if (feeCurrency.value === currency.value) return "from"
  if (feeCurrency.value === receivedCurrency.value) return "to"
  return null
})
const handedOver = computed(() => amount.value + (chargeLeg.value === "from" ? feeAmount.value : 0))
const receivedNet = computed(() => toAmount.value - (chargeLeg.value === "to" ? feeAmount.value : 0))
/** The balance effect in each leg's own currency — what the ledger actually replays. */
const netEffect = computed(() => -handedOver.value + receivedNet.value)
const conversionLegsValid = computed(() => {
  if (!isConversion.value) return true
  if (chargeLeg.value === null && feeAmount.value > 0) return false
  const ledger = ledgerCurrency.value
  return !ledger || currency.value.toUpperCase() === ledger.toUpperCase() || receivedCurrency.value.toUpperCase() === ledger.toUpperCase()
})

const canSubmit = computed(() => {
  if (!currency.value || isLegacyNonBaseEdit.value || !conversionLegsValid.value) return false
  if (props.action === "transfer") {
    return amount.value > 0 && toPortfolioId.value !== "" && (!isTransferCrossCcy.value || (targetAmountValue.value ?? 0) > 0)
  }
  if (props.action === "conversion") return amount.value > 0 || toAmount.value > 0
  if (props.action === "interest") return amount.value !== 0
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
        if (String(tx.type).toUpperCase() === "FX_CONVERSION") {
          const to = (tx.toCurrency ?? tx.currency) || ""
          if (to.toUpperCase() === (tx.currency ?? "").toUpperCase()) {
            // A correction is one signed balance movement: show it as a single leg.
            const net = Number(tx.amount) + Number(tx.toAmount ?? 0)
            amount.value = net < 0 ? -net : 0
            toAmount.value = net > 0 ? net : 0
          } else {
            amount.value = Math.abs(Number(tx.amount) || 0)
            toAmount.value = Number(tx.toAmount ?? 0)
          }
          toCurrency.value = to
        } else if (String(tx.type).toUpperCase() === "INTEREST") {
          // Interest is signed: the sign is the fact (credited vs charged).
          amount.value = Number(tx.amount) || 0
          toAmount.value = 0
          toCurrency.value = ""
        } else {
          amount.value = Math.abs(Number(tx.amount)) || 0
          toAmount.value = 0
          toCurrency.value = ""
        }
        // A conversion keeps its own leg currency (the other leg is the one that
        // touches the settlement currency); every other row is forced to the ledger.
        currency.value = String(tx.type).toUpperCase() === "FX_CONVERSION" ? tx.currency : (ledgerCurrency.value ?? tx.currency)
        description.value = tx.description ?? ""
        transactionDate.value = tx.date ?? tx.createdAt.slice(0, 10)
        toPortfolioId.value = tx.toPortfolioId ?? ""
        fees.value = tx.fees != null ? Number(tx.fees) : 0
        // The CashTransaction schema exposes no feesType; fees ship fixed.
        feesType.value = "fixed"
        feeCurrency.value = tx.feeCurrency ?? (baseCurrency.value || "")
        feeRateSource.value = tx.feeRateSource ?? "automatic"
        feeExchangeRate.value = tx.feeExchangeRate != null ? String(tx.feeExchangeRate) : ""
      } else {
        amount.value = 0
        toAmount.value = 0
        toCurrency.value = ""
        // A single-currency account cannot take a movement in its display base:
        // the ledger currency is the only one the server accepts.
        currency.value = ledgerCurrency.value ?? baseCurrency.value
        description.value = ""
        transactionDate.value = new Date().toISOString().slice(0, 10)
        toPortfolioId.value = ""
        fees.value = 0
        feesType.value = "fixed"
        feeCurrency.value = ledgerCurrency.value ?? baseCurrency.value
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
      // Edit mode — PATCH the row (the server re-clamps the sign for
      // DEPOSIT/WITHDRAWAL/TRANSFER and takes INTEREST, FEE and FX_CONVERSION as
      // sent, because there the sign is the fact being recorded).
      const type = String(props.editTx.type).toUpperCase()
      const signedAmount =
        type === "FX_CONVERSION" ? -handedOver.value
        : type === "FEE" ? -Math.abs(amount.value)
        : amount.value
      await updateCashTransaction(props.editTx.id, {
        amount: signedAmount,
        currency: type !== "TRANSFER" ? currency.value : undefined,
        ...(type === "FX_CONVERSION" ? { toCurrency: receivedCurrency.value, toAmount: receivedNet.value } : {}),
        description: description.value || undefined,
        date: transactionDate.value || undefined,
        fees: fees.value || undefined,
        feesType: feesType.value,
        feeCurrency:
          type !== "TRANSFER" && feesType.value === "fixed" ? feeCurrency.value : undefined,
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
      rateSource: props.action !== "transfer" && isBaseCrossCcy.value ? rateSource.value : undefined,
      exchangeRate:
        props.action !== "transfer" &&
        isBaseCrossCcy.value &&
        rateSource.value === "manual" &&
        exchangeRate.value
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
        ...feeFx,
      })
    } else if (props.action === "interest") {
      await interestCash(props.portfolioId, {
        amount: amount.value,
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        ...feeFx,
      })
    } else if (props.action === "fee") {
      await feeCash(props.portfolioId, {
        amount: Math.abs(amount.value),
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        ...feeFx,
      })
    } else if (props.action === "conversion") {
      await conversionCash(props.portfolioId, {
        amount: -handedOver.value,
        currency: currency.value,
        toCurrency: receivedCurrency.value,
        toAmount: receivedNet.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        ...feeFx,
      })
    } else {
      await transferCash(props.portfolioId, {
        amount: amount.value,
        currency: currency.value,
        description: description.value || undefined,
        transactionDate: transactionDate.value || undefined,
        toPortfolioId: toPortfolioId.value,
        ...(isTransferCrossCcy.value &&
        targetRateSource.value === "manual" &&
        manualTargetAmount.value != null
          ? { targetAmount: manualTargetAmount.value }
          : {}),
        ...(isTransferCrossCcy.value && transferRateValue.value != null
          ? { targetFxRate: transferRateValue.value }
          : {}),
        ...feeFx,
      })
    }
    emit("done")
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("cashModal.processError")
  } finally {
    busy.value = false
  }
}

function actionLabel(action: CashAction): string {
  const labels: Record<CashAction, string> = {
    deposit: t("cashModal.deposit"),
    withdraw: t("cashModal.withdraw"),
    transfer: t("cashModal.transfer"),
    interest: t("cashModal.interest"),
    fee: t("cashModal.fee"),
    conversion: t("cashModal.conversion"),
  }
  return labels[action]
}
const title = computed(() => {
  if (isEdit.value) return t("cashModal.editTitle", { label: submitLabel.value })
  if (props.action === "deposit") return t("cashModal.titleDeposit")
  if (props.action === "withdraw") return t("cashModal.titleWithdraw")
  if (props.action === "transfer") return t("cashModal.titleTransfer")
  if (props.action === "interest") return t("cashModal.titleInterest")
  if (props.action === "fee") return t("cashModal.titleFee")
  return t("cashModal.titleConversion")
})
const submitLabel = computed(() => actionLabel(props.action))
const amountLabel = computed(() => {
  if (props.action === "conversion") return t("cashModal.amountHandedOver")
  if (props.action === "fee") return t("cashModal.chargeAmount")
  return t("cashModal.amountLabel")
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
    @click.self.stop="emit('close')"
  >
    <div class="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true" :aria-label="t('cashModal.aria')">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">
          {{ title }}
          <span v-if="portfolioName" class="block text-xs font-normal text-muted" data-testid="pc-portfolio-name">{{ portfolioName }}</span>
        </h3>
        <button type="button" class="btn-ghost px-2 py-1" :aria-label="t('cashModal.closeModal')" @click="emit('close')">✕</button>
      </div>

      <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="pc-form" @submit.prevent="submit">
        <template v-if="action === 'withdraw'">
          <p class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text sm:col-span-2">
            {{ t("cashModal.availableIn", { ccy: currency || baseCurrency, amount: formatCurrency(availableBalance, currency || baseCurrency) }) }}
          </p>
        </template>

        <template v-if="action === 'transfer' && !isEdit">
          <div>
            <label for="pc-to-portfolio" class="mb-1 block text-sm text-muted">{{ t("cashModal.toPortfolio") }}</label>
            <select id="pc-to-portfolio" v-model="toPortfolioId" class="input" required data-testid="pc-to-portfolio">
              <option value="" disabled>{{ t("cashModal.selectDestination") }}</option>
              <option v-for="p in targetPortfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
        </template>

        <div>
          <label for="pc-currency" class="mb-1 block text-sm text-muted">{{ t("cashModal.currency") }}</label>
          <select
            id="pc-currency"
            v-model="currency"
            class="input"
            :disabled="isLegacyNonBaseEdit"
            :data-cash-base-only="ledgerCurrency != null"
            data-testid="pc-currency"
          >
            <option v-for="c in currencyOptions" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <p v-if="isLegacyNonBaseEdit" class="text-sm text-amber-700 dark:text-amber-300 sm:col-span-2">
          {{ t("cashModal.legacyNonBaseEdit", { ccy: props.editTx?.currency, base: baseCurrency }) }}
        </p>

        <div>
          <label for="pc-amount" class="mb-1 block text-sm text-muted">{{ amountLabel }}</label>
          <div class="flex gap-2">
            <div class="flex min-w-0 flex-1 items-center rounded-lg border border-border focus-within:border-blue-500">
              <span class="pl-3 text-sm text-muted">{{ currency }}</span>
              <input id="pc-amount" v-model.number="amount" type="number" :min="action === 'interest' ? undefined : 0" step="0.01" required class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" :placeholder="t('cashModal.enterAmount')" data-testid="pc-amount" />
            </div>
            <button v-if="action === 'transfer' && !isEdit" type="button" class="btn-secondary shrink-0 text-sm" @click="transferAll">{{ t("cashModal.transferAll") }}</button>
          </div>
          <p v-if="action === 'interest'" class="mt-1 text-xs text-muted">{{ t("cashModal.interestHint") }}</p>
          <p v-else-if="action === 'conversion'" class="mt-1 text-xs text-muted">{{ t("cashModal.conversionHint") }}</p>
          <p v-else class="mt-1 text-xs text-muted">{{ t("cashModal.available", { amount: formatCurrency(availableBalance, currency) }) }}</p>
        </div>

        <template v-if="action === 'conversion'">
          <div>
            <label for="pc-to-currency" class="mb-1 block text-sm text-muted">{{ t("cashModal.receivedCurrency") }}</label>
            <select id="pc-to-currency" v-model="toCurrency" class="input" data-testid="pc-to-currency">
              <option v-for="c in receivedOptions" :key="c" :value="c">{{ c }}</option>
            </select>
            <p class="mt-1 text-xs text-muted">{{ t("cashModal.sameCurrencyCorrection") }}</p>
          </div>
          <div>
            <label for="pc-to-amount" class="mb-1 block text-sm text-muted">{{ t("cashModal.amountReceived") }}</label>
            <div class="flex min-w-0 items-center rounded-lg border border-border focus-within:border-blue-500">
              <span class="pl-3 text-sm text-muted">{{ receivedCurrency }}</span>
              <input id="pc-to-amount" v-model.number="toAmount" type="number" min="0" step="0.01" class="input !rounded-l-none !border-0 !ring-0 focus:ring-0" placeholder="0.00" data-testid="pc-to-amount" />
            </div>
          </div>
          <p v-if="!conversionLegsValid" class="text-sm text-amber-700 dark:text-amber-300 sm:col-span-2">
            {{ t("cashModal.conversionChargeInvalid", { feeCcy: feeCurrency, from: currency, to: receivedCurrency }) }}
            <template v-if="ledgerCurrency">{{ t("cashModal.settledNeedsLeg", { ledger: ledgerCurrency }) }}</template>
          </p>
        </template>

        <div>
          <label for="pc-date" class="mb-1 block text-sm text-muted">{{ t("cashModal.transactionDate") }}</label>
          <input id="pc-date" v-model="transactionDate" type="date" class="input" data-testid="pc-date" />
        </div>

        <template v-if="!isEdit && (needsAmountFx || action === 'transfer')">
          <FxRateFields
            :leg="action === 'transfer' ? t('cashModal.transfer') : t('cashModal.deposit')"
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
              <div class="space-y-3">
                <div>
                  <label for="pc-target-rate" class="mb-1 block text-xs text-muted">
                    {{ t("cashModal.customRate", { to: targetCurrency, from: currency }) }}
                  </label>
                  <input
                    id="pc-target-rate"
                    v-model="exchangeRate"
                    type="number"
                    min="0"
                    step="any"
                    class="input"
                    :placeholder="transferSuggestion ? transferSuggestion.rate.toFixed(4) : t('fields.ratePlaceholder')"
                    data-testid="pc-target-rate"
                  />
                </div>
                <div>
                  <label for="pc-target-amount" class="mb-1 block text-xs text-muted">
                    {{ t("cashModal.targetAmountOptional", { ccy: targetCurrency }) }}
                  </label>
                  <input
                    id="pc-target-amount"
                    v-model.number="manualTargetAmount"
                    type="number"
                    min="0"
                    step="any"
                    class="input"
                    :placeholder="t('cashModal.auto')"
                    data-testid="pc-target-amount"
                  />
                </div>
              </div>
            </template>
          </FxRateFields>
        </template>

        <div class="sm:col-span-2">
          <label for="pc-description" class="mb-1 block text-sm text-muted">{{ t("cashModal.descriptionOptional") }}</label>
          <input
            id="pc-description"
            v-model="description"
            type="text"
            class="input"
            data-testid="pc-description"
            :placeholder="action === 'withdraw' ? t('cashModal.descWithdraw') : action === 'deposit' ? t('cashModal.descDeposit') : t('cashModal.descOther')"
          />
        </div>

        <div v-if="action !== 'interest'" class="sm:col-span-2">
          <label for="pc-fees" class="mb-1 block text-sm text-muted">{{ action === 'conversion' ? t("cashModal.conversionChargeOptional") : t("cashModal.feesOptional") }}</label>
          <FeeFields v-model:fees="fees" v-model:fees-type="feesType" v-model:fee-currency="feeCurrency" testid="pc" input-id="pc-fees" />

          <FxRateFields
            :leg="t('addPosition.legFee')"
            :from="feeCurrency"
            :to="chargeLeg === 'to' ? receivedCurrency : currency"
            :date="transactionDate"
            :hidden="feesType !== 'fixed' || feeCurrency === (chargeLeg === 'to' ? receivedCurrency : currency)"
            :rate-source="feeRateSource"
            :rate="feeExchangeRate"
            @update:rate-source="(v: 'automatic' | 'manual') => (feeRateSource = v)"
            @update:rate="(v: string) => (feeExchangeRate = v)"
            @suggestion="(r: LatestRate | null) => (feeSuggestion = r)"
            testid="pc-fee-fx"
            class="mt-3"
          />
        </div>

        <div class="rounded-lg bg-surface-2 px-3 py-2 text-sm sm:col-span-2">
          <p class="text-xs font-medium uppercase tracking-wide text-muted dark:text-muted">{{ t("cashModal.confirmation") }}</p>
          <dl class="mt-1 space-y-0.5 tabular-nums text-muted">
            <div class="flex justify-between gap-3">
              <dt>{{ action === "transfer" ? t("cashModal.transferAmount") : action === "conversion" ? t("cashModal.legHandedOver") : t("cashModal.amount") }}</dt>
              <dd>{{ formatCurrency(amount || 0, currency) }}</dd>
            </div>
            <div v-if="action === 'conversion'" class="flex justify-between gap-3">
              <dt>{{ t("cashModal.legReceived", { ccy: receivedCurrency }) }}</dt>
              <dd>{{ formatCurrency(toAmount || 0, receivedCurrency) }}</dd>
            </div>
            <div v-if="feeAmount > 0" class="flex justify-between gap-3">
              <dt>{{ t("cashModal.feeLabel", { ccy: feesType === "pct" ? `${fees}%` : feeCurrency }) }}</dt>
              <dd>
                {{ formatCurrency(feeAmount, feeCurrency) }}
                <template v-if="feeCurrency !== currency">
                  <template v-if="feeInCcy != null"> &asymp; {{ formatCurrency(feeInCcy, currency) }}</template>
                  <template v-else> {{ t("cashModal.ratePending") }}</template>
                </template>
              </dd>
            </div>
            <div v-if="action === 'deposit' && netCredited != null" class="flex justify-between gap-3 border-t border-border pt-0.5 font-semibold text-text dark:border-slate-700">
              <dt>{{ t("cashModal.totalCredited") }}</dt>
              <dd>{{ formatCurrency(netCredited, currency) }}</dd>
            </div>
            <div v-if="action === 'conversion' && receivedCurrency === currency" class="flex justify-between gap-3 border-t border-border pt-0.5 font-semibold text-text dark:border-slate-700">
              <dt>{{ t("cashModal.balanceCorrection") }}</dt>
              <dd>{{ formatCurrency(netEffect, currency) }}</dd>
            </div>
            <div v-if="action !== 'deposit' && action !== 'conversion'" class="flex justify-between gap-3 border-t border-border pt-0.5 font-semibold text-text dark:border-slate-700">
              <dt>{{ t("cashModal.totalDebited") }}</dt>
              <dd>{{ formatCurrency(totalDebited, currency) }}</dd>
            </div>
            <div v-if="action === 'transfer' && isTransferCrossCcy" class="flex justify-between gap-3">
              <dt>{{ t("cashModal.target", { ccy: targetCurrency }) }}</dt>
              <dd>
                <template v-if="targetAmountValue != null">{{ formatCurrency(targetAmountValue, targetCurrency || "") }}</template>
                <template v-else>—</template>
                <span class="text-xs text-muted">{{ transferRateValue != null ? `@ ${transferRateValue.toFixed(4)}` : t("cashModal.ratePending") }}</span>
              </dd>
            </div>
            <div v-if="action !== 'deposit' && action !== 'conversion'" class="flex justify-between gap-3">
              <dt>{{ t("cashModal.remainingBalance") }}</dt>
              <dd>{{ formatCurrency(remainingBalance, currency) }}</dd>
            </div>
          </dl>
        </div>

        <p v-if="error" class="text-sm text-danger sm:col-span-2">{{ error }}</p>

        <div class="flex justify-end gap-2 sm:col-span-2">
          <button type="button" class="btn-ghost" @click="emit('close')">{{ t("cashModal.cancel") }}</button>
          <button type="submit" class="btn-primary capitalize" :disabled="busy || !canSubmit" data-testid="pc-submit">
            {{ busy ? t("cashModal.processing") : submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
