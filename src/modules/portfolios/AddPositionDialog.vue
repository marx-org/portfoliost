<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { createPortfolioPosition, createPortfolioTransaction, updatePortfolioPosition, removePortfolioPosition } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency } from "@/utils/format"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import { getQuote, getHistory, getInstrumentDetail } from "@/api/instruments"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import TransactionFormFields from "@/components/TransactionFormFields.vue"
import { useCurrenciesStore } from "@/stores/currencies"
import { useTargetCurrency } from "@/composables/useTargetCurrency"
import type { PortfolioPositions } from "@/api/types"

type Position = PortfolioPositions[number]

interface PositionAction {
  kind: "buy" | "sell" | "dividend"
  position: Position
}

const props = defineProps<{ open: boolean; portfolioId: string; positionAction?: PositionAction }>()
const emit = defineEmits<{ (e: "close"): void; (e: "added"): void; (e: "saved"): void }>()

const store = usePortfolioStore()
const walletsStore = useWalletsStore()
const currenciesStore = useCurrenciesStore()
const router = useRouter()

type Step = "chooser" | "stock" | "option" | "cfd"
const step = ref<Step | null>(null)

const showSearch = ref(false)
const searchTitle = ref("Search for Instruments")
let pendingStep: Step = "stock"

const stockForm = ref({
  symbol: "",
  name: "",
  quantity: "1",
  price: "",
  fees: "0",
  feesType: "fixed" as "fixed" | "pct",
  feeCurrency: "USD",
  feeRateSource: "automatic" as "automatic" | "manual",
  feeExchangeRate: "",
  rateSource: "automatic" as "automatic" | "manual",
  exchangeRate: "",
  date: new Date().toISOString().slice(0, 10),
  walletId: "",
})
const busy = ref(false)
const error = ref<string | null>(null)

const optionForm = ref({
  transactionType: "Buy to Open (new long position)",
  optionType: "CALL",
  strike: "0",
  tradeDate: new Date().toISOString().slice(0, 10),
  expirationDate: "",
  contracts: "1",
  sharesPerContract: "100",
  premium: "0",
  fees: "0",
  feesType: "fixed" as "fixed" | "pct",
  feeCurrency: "USD",
  rateSource: "automatic" as "automatic" | "manual",
  exchangeRate: "",
  feeRateSource: "automatic" as "automatic" | "manual",
  feeExchangeRate: "",
})
const optionPending = ref<{ symbol: string; name: string } | null>(null)

const cfdForm = ref({ symbol: "", direction: "Long", quantity: "", openPrice: "", openDate: new Date().toISOString().slice(0, 10) })

watch(
  () => props.open,
  (open) => {
    if (open) {
      showSearch.value = false
      error.value = null
      if (!currenciesStore.loaded) void currenciesStore.load()
      const loadWallets = () => {
        if (!walletsStore.wallets.length) {
          walletsStore.fetchAll().then(() => {
            if (!stockForm.value.walletId) stockForm.value.walletId = walletsStore.wallets[0]?.id || ""
          })
        }
      }
      if (props.positionAction) {
        const { kind, position } = props.positionAction
        priceTouched.value = false
        stockForm.value = {
          symbol: position.symbol,
          name: position.companyName ?? "",
          quantity: kind === "sell" ? String(position.quantity ?? "") : "1",
          price: String(position.currentPrice ?? ""),
          fees: "0",
          feesType: "fixed",
          feeCurrency: position.instrumentCurrency ?? "USD",
          feeRateSource: "automatic",
          feeExchangeRate: "",
          rateSource: "automatic",
          exchangeRate: "",
          date: new Date().toISOString().slice(0, 10),
          walletId: walletsStore.wallets[0]?.id ?? "",
        }
        TX_CCY.value = position.instrumentCurrency ?? "USD"
        step.value = "stock"
        loadWallets()
        void triggerLoadMarketPrice()
      } else {
        step.value = "chooser"
        loadWallets()
      }
    }
  },
)

const TX_CCY = ref("USD") // reactive: updated when instrument is selected
const marketPrice = ref<number | null>(null)
const quotePrice = ref<number | null>(null)
const priceTouched = ref(false)
const pendingMarketPrice = ref<Promise<void> | null>(null)

const today = () => new Date().toISOString().slice(0, 10)

async function applyInstrumentCurrency(symbol: string): Promise<void> {
  try {
    const detail = await getInstrumentDetail(symbol)
    const ccy = detail.currency?.toUpperCase() || "USD"
    TX_CCY.value = ccy
    stockForm.value.feeCurrency = ccy
  } catch {
    // fallback: keep USD
  }
}

async function loadMarketPrice(symbol: string, date: string): Promise<void> {
  try {
    if (date >= today()) {
      const q = await getQuote(symbol)
      quotePrice.value = q.currentPrice ?? null
      marketPrice.value = quotePrice.value
    } else {
      quotePrice.value = null
      const hist = await getHistory(symbol, "daily")
      const target = new Date(`${date}T00:00:00Z`).getTime()
      let idx = -1
      for (let i = 0; i < hist.timestamps.length; i++) {
        if (hist.timestamps[i] <= target) idx = i
        else break
      }
      marketPrice.value = idx >= 0 ? hist.closePrices[idx] : null
    }
    if (!priceTouched.value && marketPrice.value != null) {
      stockForm.value.price = String(marketPrice.value)
    }
  } catch {
    marketPrice.value = null
  }
}

function triggerLoadMarketPrice() {
  const p = loadMarketPrice(stockForm.value.symbol, stockForm.value.date)
  pendingMarketPrice.value = p
  return p
}

watch(
  () => stockForm.value.date,
  (_date) => {
    if (step.value === "stock" && stockForm.value.symbol) void triggerLoadMarketPrice()
  },
)

function onPriceInput() {
  priceTouched.value = true
}

const targetCurrency = useTargetCurrency(
  computed(() => store.portfolios.find((p) => p.id === props.portfolioId)?.currency ?? null),
)

function chooseStock() {
  pendingStep = "stock"
  searchTitle.value = "Search for Instruments"
  step.value = null
  showSearch.value = true
}

function chooseOption() {
  pendingStep = "option"
  searchTitle.value = "Pick the underlying"
  step.value = null
  showSearch.value = true
}

function chooseCfd() {
  step.value = "cfd"
  cfdForm.value = {
    symbol: "",
    direction: "Long",
    quantity: "",
    openPrice: "",
    openDate: new Date().toISOString().slice(0, 10),
  }
  error.value = null
}

function onSearchClose() {
  showSearch.value = false
  if (step.value === null && pendingStep) step.value = pendingStep
}

function onSearchAdd(symbol: string, name: string) {
  showSearch.value = false
  if (pendingStep === "stock") {
    priceTouched.value = false
    stockForm.value = {
      symbol,
      name,
      quantity: "1",
      price: "",
      fees: "0",
      feesType: "fixed",
      feeCurrency: "USD",
      feeRateSource: "automatic",
      feeExchangeRate: "",
      rateSource: "automatic",
      exchangeRate: "",
      date: new Date().toISOString().slice(0, 10),
      walletId: walletsStore.wallets[0]?.id ?? "",
    }
    step.value = "stock"
    error.value = null
    void applyInstrumentCurrency(symbol)
    void triggerLoadMarketPrice()
  } else if (pendingStep === "option") {
    optionPending.value = { symbol, name }
    optionForm.value = {
      transactionType: "Buy to Open (new long position)",
      optionType: "CALL",
      strike: "0",
      tradeDate: new Date().toISOString().slice(0, 10),
      expirationDate: "",
      contracts: "1",
      sharesPerContract: "100",
      premium: "0",
      fees: "0",
      feesType: "fixed",
      feeCurrency: "USD",
      rateSource: "automatic",
      exchangeRate: "",
      feeRateSource: "automatic",
      feeExchangeRate: "",
    }
    step.value = "option"
    error.value = null
  }
  pendingStep = "chooser"
}

const stockFeeValue = computed(() => {
  const qty = Number(stockForm.value.quantity) || 0
  const price = Number(stockForm.value.price) || 0
  const fees = Number(stockForm.value.fees) || 0
  if (stockForm.value.feesType === "pct") return (qty * price * fees) / 100
  return fees
})

const optionTotal = computed(() => {
  const contracts = Number(optionForm.value.contracts) || 0
  const shares = Number(optionForm.value.sharesPerContract) || 0
  const premium = Number(optionForm.value.premium) || 0
  const fees = Number(optionForm.value.fees) || 0
  return contracts * shares * premium + fees
})

function optionSymbol(): string {
  if (!optionPending.value?.symbol) return "-"
  const year = optionForm.value.expirationDate ? new Date(optionForm.value.expirationDate).getFullYear().toString().slice(-2) : "YY"
  const month = optionForm.value.expirationDate ? String(new Date(optionForm.value.expirationDate).getMonth() + 1).padStart(2, "0") : "MM"
  const day = optionForm.value.expirationDate ? String(new Date(optionForm.value.expirationDate).getDate()).padStart(2, "0") : "DD"
  const strike = String(Math.round((Number(optionForm.value.strike) || 0) * 1000)).padStart(8, "0")
  return `${optionPending.value.symbol}${year}${month}${day}${optionForm.value.optionType}${strike}`
}

async function submitStock() {
  const symbol = stockForm.value.symbol.toUpperCase()
  const quantity = Number(stockForm.value.quantity)
  if (!symbol || !quantity) return
  if (!stockForm.value.walletId) {
    error.value = "Select a cash portfolio"
    return
  }
  busy.value = true
  error.value = null
  try {
    if (props.positionAction) {
      const { kind, position } = props.positionAction
      const txType = kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : "DIVIDEND"
      const txQty = kind === "dividend" ? (position.quantity || 1) : quantity
      const txPayload: Parameters<typeof createPortfolioTransaction>[1] = {
        type: txType,
        symbol,
        quantity: txQty,
        price: Number(stockForm.value.price) || 0,
        positionId: position.id,
        currency: position.instrumentCurrency || "USD",
        walletId: stockForm.value.walletId || undefined,
        executedAt: stockForm.value.date ? new Date(stockForm.value.date).toISOString() : undefined,
      }
      if (stockForm.value.feesType === "fixed" && Number(stockForm.value.fees) > 0) {
        txPayload.fees = Number(stockForm.value.fees)
        txPayload.feesType = "fixed"
        const instCcy = position.instrumentCurrency ?? "USD"
        if (stockForm.value.feeCurrency !== instCcy) {
          txPayload.feeCurrency = stockForm.value.feeCurrency
          txPayload.feeRateSource = stockForm.value.feeRateSource
          if (stockForm.value.feeRateSource === "manual" && stockForm.value.feeExchangeRate) {
            txPayload.feeExchangeRate = Number(stockForm.value.feeExchangeRate)
          }
        }
      } else if (stockForm.value.feesType === "pct" && Number(stockForm.value.fees) > 0) {
        txPayload.fees = (txQty * Number(stockForm.value.price) * Number(stockForm.value.fees)) / 100
        txPayload.feesType = "pct"
      }
      if (stockForm.value.rateSource === "manual" && stockForm.value.exchangeRate) {
        txPayload.rateSource = "manual"
        txPayload.exchangeRate = Number(stockForm.value.exchangeRate)
      }
      await createPortfolioTransaction(props.portfolioId, txPayload)
      if (kind === "buy") {
        const newQty = (position.quantity || 0) + quantity
        const newAvg = ((position.quantity || 0) * (position.averageCostBasis || 0) + quantity * (Number(stockForm.value.price) || 0)) / newQty
        await updatePortfolioPosition(props.portfolioId, position.id, { quantity: newQty, averageCostBasis: newAvg })
      } else if (kind === "sell") {
        const remaining = (position.quantity || 0) - quantity
        if (remaining <= 0) {
          await removePortfolioPosition(props.portfolioId, position.id)
        } else {
          await updatePortfolioPosition(props.portfolioId, position.id, { quantity: remaining })
        }
      }
      await store.fetchPositions(props.portfolioId)
      close()
      emit("saved")
    } else {
      await createPortfolioPosition(props.portfolioId, {
        symbol,
        quantity,
        price: stockForm.value.price ? Number(stockForm.value.price) : undefined,
        assetType: "STOCK",
        currency: TX_CCY.value,
        instrumentCurrency: TX_CCY.value,
        fees: stockFeeValue.value || undefined,
        feesType: stockForm.value.feesType,
        feeCurrency: stockForm.value.feesType === "fixed" ? stockForm.value.feeCurrency : undefined,
        rateSource: stockForm.value.rateSource,
        exchangeRate:
          stockForm.value.rateSource === "manual" && stockForm.value.exchangeRate
            ? Number(stockForm.value.exchangeRate)
            : undefined,
        feeRateSource:
          stockForm.value.feesType === "fixed" && stockForm.value.feeCurrency !== TX_CCY.value
            ? stockForm.value.feeRateSource
            : undefined,
        feeExchangeRate:
          stockForm.value.feesType === "fixed" &&
          stockForm.value.feeCurrency !== TX_CCY.value &&
          stockForm.value.feeRateSource === "manual" &&
          stockForm.value.feeExchangeRate
            ? Number(stockForm.value.feeExchangeRate)
            : undefined,
        walletId: stockForm.value.walletId || undefined,
        executedAt: stockForm.value.date ? new Date(stockForm.value.date).toISOString() : undefined,
      })
      await store.fetchPositions(props.portfolioId)
      close()
      emit("added")
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to add position"
  } finally {
    busy.value = false
  }
}

async function submitOption() {
  if (!optionPending.value?.symbol) return
  const contracts = Number(optionForm.value.contracts) || 1
  busy.value = true
  error.value = null
  try {
    await createPortfolioPosition(props.portfolioId, {
      symbol: optionPending.value.symbol.toUpperCase(),
      quantity: contracts,
      price: (Number(optionForm.value.premium) || 0) * (Number(optionForm.value.sharesPerContract) || 100),
      assetType: "OPTION",
      contractSize: Number(optionForm.value.sharesPerContract) || 100,
      optionType: optionForm.value.optionType,
      strikePrice: Number(optionForm.value.strike) || 0,
      expirationDate: optionForm.value.expirationDate || undefined,
      openedAt: new Date(optionForm.value.tradeDate).toISOString(),
      fees: Number(optionForm.value.fees) || undefined,
      feesType: optionForm.value.feesType,
      feeCurrency: optionForm.value.feesType === "fixed" ? optionForm.value.feeCurrency : undefined,
      rateSource: optionForm.value.rateSource,
      exchangeRate:
        optionForm.value.rateSource === "manual" && optionForm.value.exchangeRate
          ? Number(optionForm.value.exchangeRate)
          : undefined,
      feeRateSource:
        optionForm.value.feesType === "fixed" && optionForm.value.feeCurrency !== TX_CCY.value
          ? optionForm.value.feeRateSource
          : undefined,
      feeExchangeRate:
        optionForm.value.feesType === "fixed" &&
        optionForm.value.feeCurrency !== TX_CCY.value &&
        optionForm.value.feeRateSource === "manual" &&
        optionForm.value.feeExchangeRate
          ? Number(optionForm.value.feeExchangeRate)
          : undefined,
    })
    await store.fetchPositions(props.portfolioId)
    close()
    emit("added")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to add option"
  } finally {
    busy.value = false
  }
}

async function submitCfd() {
  const symbol = cfdForm.value.symbol.trim().toUpperCase()
  const quantity = Number(cfdForm.value.quantity)
  if (!symbol || !quantity) return
  busy.value = true
  error.value = null
  try {
    await createPortfolioPosition(props.portfolioId, {
      symbol,
      quantity,
      price: cfdForm.value.openPrice ? Number(cfdForm.value.openPrice) : undefined,
      assetType: "CFD",
      direction: cfdForm.value.direction === "Short" ? "SHORT" : "LONG",
      openedAt: new Date(cfdForm.value.openDate).toISOString(),
    })
    await store.fetchPositions(props.portfolioId)
    close()
    emit("added")
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to add CFD"
  } finally {
    busy.value = false
  }
}

function close() {
  step.value = null
  showSearch.value = false
  error.value = null
  emit("close")
}

function goResearch() {
  const symbol = stockForm.value.symbol
  close()
  if (symbol) router.push({ name: "research-overview", params: { symbol: symbol.endsWith(".US") ? symbol : `${symbol}.US` } })
}

defineExpose({ pendingMarketPrice })
</script>

<template>

  <div v-if="open">
    <div
      v-if="step === 'chooser'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Add position">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">Add Position</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
        </div>
        <div class="space-y-3">
          <button type="button" class="block w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50/50" data-testid="add-position-instrument" @click="chooseStock">
            <span class="block font-medium text-slate-900 dark:text-slate-100">Stock, ETF or crypto</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Search by ticker or name</span>
          </button>
          <button type="button" class="block w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50/50" data-testid="add-position-option" @click="chooseOption">
            <span class="block font-medium text-slate-900 dark:text-slate-100">Option</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Pick the underlying, then describe the contract</span>
          </button>
          <button type="button" class="block w-full rounded-xl border border-slate-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50/50" data-testid="add-position-cfd" @click="chooseCfd">
            <span class="block font-medium text-slate-900 dark:text-slate-100">CFD</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">A leveraged position, entered by hand</span>
          </button>
        </div>
      </div>
    </div>

    <div
      v-else-if="step === 'stock'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" :aria-label="positionAction ? `${positionAction.kind} ${positionAction.position.symbol}` : 'Buy Position'">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ positionAction ? `${positionAction.kind === 'buy' ? 'Buy' : positionAction.kind === 'sell' ? 'Sell' : 'Dividend for'} ${positionAction.position.symbol}` : 'Buy Position' }}</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
        </div>
        <TransactionFormFields
          :symbol="stockForm.symbol"
          :name="stockForm.name"
          :asset-type="'Stock'"
          :country="'US'"
          :market-price="marketPrice"
          :price-as-of-label="stockForm.date >= today() ? 'current price' : `close on ${stockForm.date}`"
          :wallets="walletsStore.wallets"
          :target-currency="targetCurrency"
          :tx-currency="TX_CCY"
          :testid="'add-position'"
          v-model:form="stockForm"
          @price-input="onPriceInput"
          @view-chart="goResearch"
          @submit="submitStock"
        >
          <template #footer="{ totalCost }">
            <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" @click="close">Cancel</button>
              <button type="submit" class="btn-primary" :disabled="busy || !stockForm.symbol || !Number(stockForm.quantity)">
                {{ busy ? "Saving..." : positionAction
                  ? `${positionAction.kind === 'buy' ? 'Buy' : positionAction.kind === 'sell' ? 'Sell' : 'Record dividend'} for ${formatCurrency(totalCost, "USD")}`
                  : `Buy for ${formatCurrency(totalCost, "USD")}`
                }}
              </button>
            </div>
          </template>
        </TransactionFormFields>
      </div>
    </div>

    <div
      v-else-if="step === 'option'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Buy Position">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">Buy Position</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
        </div>
        <div class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <img :src="`/api/logos/${optionPending?.symbol}`" :alt="optionPending?.symbol" class="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800" />
          <div class="flex-1">
            <p class="font-medium text-slate-900 dark:text-slate-100">{{ optionPending?.symbol }} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">(US)</span></p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ optionPending?.name }}</p>
          </div>
        </div>
        <form @submit.prevent="submitOption">
          <label for="opt-trans-type" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Type</label>
          <select id="opt-trans-type" v-model="optionForm.transactionType" class="input mb-4">
            <option>Buy to Open (new long position)</option>
            <option>Sell to Close (closes position)</option>
          </select>
          <div class="mb-4">
            <p class="mb-1 text-sm text-slate-600 dark:text-slate-300">Option Type</p>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary flex-1" :class="optionForm.optionType === 'CALL' ? '!bg-blue-600 !text-white' : ''" @click="optionForm.optionType = 'CALL'">CALL</button>
              <button type="button" class="btn-secondary flex-1" :class="optionForm.optionType === 'PUT' ? '!bg-blue-600 !text-white' : ''" @click="optionForm.optionType = 'PUT'">PUT</button>
            </div>
          </div>
          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="opt-strike" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Strike Price ($)</label>
              <input id="opt-strike" v-model="optionForm.strike" type="number" min="0" step="any" class="input" data-testid="add-position-strike" />
            </div>
            <div>
              <label for="opt-expiry" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Expiration Date</label>
              <input id="opt-expiry" v-model="optionForm.expirationDate" type="date" class="input" data-testid="add-position-expiration" />
            </div>
          </div>
          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="opt-contracts" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Contracts</label>
              <input id="opt-contracts" v-model="optionForm.contracts" type="number" min="1" step="1" class="input" data-testid="add-position-contracts" />
            </div>
            <div>
              <label for="opt-shares" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Shares per contract</label>
              <input id="opt-shares" v-model="optionForm.sharesPerContract" type="number" min="1" step="any" class="input" data-testid="add-position-shares-per-contract" />
            </div>
          </div>
          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="opt-premium" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Premium per share</label>
              <input id="opt-premium" v-model="optionForm.premium" type="number" min="0" step="any" class="input" data-testid="add-position-premium" />
            </div>
            <div>
              <label for="opt-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Fees</label>
              <FeeFields
                v-model:fees="optionForm.fees"
                v-model:fees-type="optionForm.feesType"
                v-model:fee-currency="optionForm.feeCurrency"
                testid="add-position-opt"
                input-id="opt-fees"
              />
            </div>
          </div>

          <FxRateFields
            leg="Transaction"
            :from="TX_CCY"
            :to="targetCurrency"
            :date="optionForm.tradeDate"
            v-model:rate-source="optionForm.rateSource"
            v-model:rate="optionForm.exchangeRate"
            testid="add-position-opt-fx"
          />

          <FxRateFields
            leg="Fee"
            :from="optionForm.feeCurrency"
            :to="TX_CCY"
            :date="optionForm.tradeDate"
            :hidden="optionForm.feesType !== 'fixed' || optionForm.feeCurrency === TX_CCY"
            v-model:rate-source="optionForm.feeRateSource"
            v-model:rate="optionForm.feeExchangeRate"
            testid="add-position-opt-fee-fx"
          />
          <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <div>
              <p class="text-sm text-slate-600 dark:text-slate-300">Total Cost</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">Option Symbol (OCC): {{ optionSymbol() }}</p>
            </div>
            <span class="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(optionTotal, "USD") }}</span>
          </div>
          <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="close">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="busy || !optionPending || !Number(optionForm.premium)">
              {{ busy ? "Adding..." : "Enter a price" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-else-if="step === 'cfd'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Add CFD position">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">Add CFD position</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
        </div>
        <form @submit.prevent="submitCfd">
          <label for="cfd-symbol" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Symbol</label>
          <input id="cfd-symbol" v-model="cfdForm.symbol" type="text" placeholder="e.g. US100, GOLD, ORCL.US" required class="input mb-4" data-testid="add-position-symbol" />
          <label for="cfd-direction" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Direction</label>
          <select id="cfd-direction" v-model="cfdForm.direction" class="input mb-4">
            <option>Long</option>
            <option>Short</option>
          </select>
          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="cfd-qty" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Quantity (lots)</label>
              <input id="cfd-qty" v-model="cfdForm.quantity" type="number" min="0.000001" step="any" required class="input" data-testid="add-position-quantity" />
            </div>
            <div>
              <label for="cfd-price" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Open price</label>
              <input id="cfd-price" v-model="cfdForm.openPrice" type="number" min="0" step="any" required class="input" data-testid="add-position-price" />
            </div>
          </div>
          <label for="cfd-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Open date</label>
          <input id="cfd-date" v-model="cfdForm.openDate" type="date" class="input mb-4" data-testid="add-position-date" />
          <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="close">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="busy || !cfdForm.symbol.trim() || !Number(cfdForm.quantity)">
              {{ busy ? "Adding..." : "Enter a symbol" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <InstrumentSearchModal
      :open="showSearch"
      mode="add"
      :title="searchTitle"
      @close="onSearchClose"
      @add="onSearchAdd"
    />
  </div>
</template>
