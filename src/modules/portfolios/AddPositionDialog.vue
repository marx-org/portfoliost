<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { createPortfolioPosition } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency } from "@/utils/format"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"

const props = defineProps<{ open: boolean; portfolioId: string }>()
const emit = defineEmits<{ (e: "close"): void; (e: "added"): void }>()

const store = usePortfolioStore()
const walletsStore = useWalletsStore()
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
  executedAt: new Date().toISOString().slice(0, 10),
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
  feeMode: "$",
})
const optionPending = ref<{ symbol: string; name: string } | null>(null)

const cfdForm = ref({ symbol: "", direction: "Long", quantity: "", openPrice: "", openDate: new Date().toISOString().slice(0, 10) })

watch(
  () => props.open,
  (open) => {
    if (open) {
      step.value = "chooser"
      showSearch.value = false
      error.value = null
      if (!walletsStore.wallets.length) {
        walletsStore.fetchAll().then(() => {
          if (!stockForm.value.walletId) stockForm.value.walletId = walletsStore.wallets[0]?.id || ""
        })
      }
    }
  },
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
    stockForm.value = {
      symbol,
      name,
      quantity: "1",
      price: "",
      fees: "0",
      feesType: "fixed",
      executedAt: new Date().toISOString().slice(0, 10),
      walletId: walletsStore.wallets[0]?.id ?? "",
    }
    step.value = "stock"
    error.value = null
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
      feeMode: "$",
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

const stockTotal = computed(() => {
  const qty = Number(stockForm.value.quantity) || 0
  const price = Number(stockForm.value.price) || 0
  return qty * price + stockFeeValue.value
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
    await createPortfolioPosition(props.portfolioId, {
      symbol,
      quantity,
      price: stockForm.value.price ? Number(stockForm.value.price) : undefined,
      assetType: "STOCK",
      fees: stockFeeValue.value || undefined,
      feesType: stockForm.value.feesType,
      walletId: stockForm.value.walletId || undefined,
      executedAt: stockForm.value.executedAt ? new Date(stockForm.value.executedAt).toISOString() : undefined,
    })
    await store.fetchPositions(props.portfolioId)
    close()
    emit("added")
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
</script>

<template>

  <div v-if="open">
    <div
      v-if="step === 'chooser'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Add position">
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
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Buy Position">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold">Buy Position</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="close">✕</button>
        </div>
        <div class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <img :src="`/api/logos/${stockForm.symbol}`" :alt="stockForm.symbol" class="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800" />
          <div class="flex-1">
            <p class="font-medium text-slate-900 dark:text-slate-100">
              {{ stockForm.symbol }} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">(US)</span>
              <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">Stock</span>
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ stockForm.name || "—" }}</p>
          </div>
          <div class="text-right">
            <button type="button" class="text-xs text-blue-600 hover:underline" @click="goResearch">View chart</button>
            <p class="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(Number(stockForm.price) || 0, "USD") }}</p>
          </div>
        </div>
        <form @submit.prevent="submitStock">
          <label for="stock-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Purchase Date</label>
          <input id="stock-date" v-model="stockForm.executedAt" type="date" required class="input mb-4" data-testid="add-position-date" />

          <label for="stock-wallet" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Cash portfolio</label>
          <select id="stock-wallet" v-model="stockForm.walletId" class="input mb-4" data-testid="add-position-wallet">
            <option v-if="!walletsStore.wallets.length" value="" disabled>Loading wallets…</option>
            <option v-for="w in walletsStore.wallets" :key="w.id" :value="w.id">
              {{ w.name }} ({{ formatCurrency(w.balance, w.currency) }})
            </option>
          </select>

          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label for="stock-qty" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Quantity</label>
              <input id="stock-qty" v-model="stockForm.quantity" type="number" min="0.000001" step="any" required class="input" data-testid="add-position-quantity" />
            </div>
            <div>
              <label for="stock-price" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Price per share ($)</label>
              <input id="stock-price" v-model="stockForm.price" type="number" min="0" step="any" required class="input" data-testid="add-position-price" />
            </div>
          </div>
          <label for="stock-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Fees</label>
          <div class="mb-4 flex gap-2">
            <div class="flex flex-1 items-center rounded-lg border border-slate-300 focus-within:border-blue-500">
              <span class="pl-3 text-sm text-slate-500 dark:text-slate-400">{{ stockForm.feesType === "fixed" ? "$" : "%" }}</span>
              <input
                id="stock-fees"
                v-model="stockForm.fees"
                type="number"
                min="0"
                step="0.01"
                class="input !rounded-l-none !border-0 !ring-0 focus:ring-0"
                data-testid="add-position-fees"
              />
            </div>
            <button
              type="button"
              class="btn-secondary shrink-0 text-sm"
              :class="stockForm.feesType === 'pct' ? 'bg-slate-200 text-slate-900' : ''"
              data-testid="add-position-fees-toggle"
              @click="stockForm.feesType = stockForm.feesType === 'fixed' ? 'pct' : 'fixed'"
            >
              {{ stockForm.feesType === "fixed" ? "$" : "%" }}
            </button>
          </div>
          <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <span class="text-sm text-slate-600 dark:text-slate-300">Total Cost</span>
            <span class="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{{ formatCurrency(stockTotal, "USD") }}</span>
          </div>
          <p v-if="error" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="close">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="busy || !stockForm.symbol || !Number(stockForm.quantity)">
              {{ busy ? "Adding..." : `Buy for ${formatCurrency(stockTotal, "USD")}` }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-else-if="step === 'option'"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="close"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Buy Position">
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
              <input id="opt-fees" v-model="optionForm.fees" type="number" min="0" step="any" class="input" data-testid="add-position-fees" />
            </div>
          </div>
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
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Add CFD position">
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
