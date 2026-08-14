<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useWalletsStore } from "@/stores/wallets"
import { formatCurrency, formatDate, formatNumber } from "@/utils/format"
import WalletCashModals from "@/modules/portfolios/WalletCashModals.vue"
import type { Wallets } from "@/api/types"

const store = useWalletsStore()
const loading = ref(true)
const error = ref<string | null>(null)
const showCreate = ref(false)
const newWallet = ref({ name: "", currency: "USD" })
const creating = ref(false)
const createError = ref<string | null>(null)

const showCashModal = ref(false)
const cashAction = ref<"deposit" | "withdraw">("deposit")
const cashWallet = ref<Wallets[number] | null>(null)

const selectedWallet = ref<Wallets[number] | null>(null)
const showTransactions = ref(false)
const showHistory = ref(false)
const history = ref<Array<{ date: string; balance: number }>>([])
const historyError = ref<string | null>(null)

onMounted(load)

async function load() {
  loading.value = true
  error.value = null
  try {
    await store.fetchAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load wallets"
  } finally {
    loading.value = false
  }
}

async function submitCreate() {
  if (!newWallet.value.name.trim()) return
  creating.value = true
  createError.value = null
  try {
    await store.create({ name: newWallet.value.name.trim(), currency: newWallet.value.currency })
    newWallet.value = { name: "", currency: "USD" }
    showCreate.value = false
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create wallet"
  } finally {
    creating.value = false
  }
}

function openCash(wallet: Wallets[number], action: "deposit" | "withdraw") {
  cashWallet.value = wallet
  cashAction.value = action
  showCashModal.value = true
}

function closeCash() {
  showCashModal.value = false
}

async function toggleHistory(wallet: Wallets[number]) {
  if (showHistory.value && selectedWallet.value?.id === wallet.id) {
    showHistory.value = false
    return
  }
  selectedWallet.value = wallet
  showHistory.value = true
  showTransactions.value = false
  historyError.value = null
  try {
    const res = await import("@/api/wallets").then((m) => m.getWalletBalanceHistory(wallet.id))
    history.value = res.data
      .filter((p) => p.balance > 0)
      .map((p) => ({ date: p.date, balance: p.balance }))
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : "Failed to load balance history"
  }
}

async function toggleTransactions(wallet: Wallets[number]) {
  if (showTransactions.value && selectedWallet.value?.id === wallet.id) {
    showTransactions.value = false
    return
  }
  selectedWallet.value = wallet
  showTransactions.value = true
  showHistory.value = false
  await store.fetchTransactions(wallet.id)
}

const historyChart = computed(() => ({
  chart: { type: "area" as const, height: 200, toolbar: { show: false } },
  colors: ["#16a34a"],
  series: [{ name: "Balance", data: history.value.map((p) => p.balance) }],
  xaxis: { categories: history.value.map((p) => formatDate(p.date)), labels: { show: false } },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.3, opacityTo: 0 } },
}))
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Wallets</h1>
        <p v-if="store.totalBalance" class="text-sm text-slate-500 dark:text-slate-400">
          {{ store.wallets.length }} wallet{{ store.wallets.length === 1 ? "" : "s" }} &middot; base currency
          {{ store.totalBalance.baseCurrency }}
        </p>
      </div>
      <button type="button" class="btn-primary" @click="showCreate = true">New wallet</button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading wallets...</p>

    <div v-if="store.totalBalance && !loading" class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="card p-5">
        <p class="text-sm text-slate-500 dark:text-slate-400">Total Balance</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalBalance.totalBalance) }}</p>
      </div>
      <div class="card p-5">
        <p class="text-sm text-slate-500 dark:text-slate-400">Available Balance</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatCurrency(store.totalBalance.totalAvailableBalance) }}</p>
      </div>
    </div>

    <div v-if="!loading && store.wallets.length" class="space-y-4">
      <div v-for="wallet in store.wallets" :key="wallet.id" class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold text-slate-900 dark:text-slate-100">{{ wallet.name }}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ wallet.currency }} &middot; {{ wallet.isDefault ? "Default" : "Secondary" }}</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="text-lg font-semibold tabular-nums">{{ formatCurrency(wallet.balance, wallet.currency) }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ formatNumber(wallet.availableBalance) }} available</p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary text-xs" @click="openCash(wallet, 'deposit')">Deposit</button>
              <button type="button" class="btn-secondary text-xs" @click="openCash(wallet, 'withdraw')">Withdraw</button>
              <button type="button" class="btn-ghost text-xs" @click="toggleHistory(wallet)">History</button>
              <button type="button" class="btn-ghost text-xs" @click="toggleTransactions(wallet)">Transactions</button>
            </div>
          </div>
        </div>

        <div v-if="showHistory && selectedWallet?.id === wallet.id" class="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
          <h3 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Balance History</h3>
          <p v-if="historyError" class="text-sm text-red-600 dark:text-red-400">{{ historyError }}</p>
          <component :is="'apexchart'" v-else-if="history.length" :options="historyChart" :series="historyChart.series" />
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No balance history available.</p>
        </div>

        <div v-if="showTransactions && selectedWallet?.id === wallet.id" class="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
          <h3 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Transactions</h3>
          <ul v-if="store.transactions?.items.length" class="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <li v-for="tx in store.transactions.items" :key="tx.id" class="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span class="font-medium text-slate-900 dark:text-slate-100">{{ tx.type }}</span>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ formatDate(tx.createdAt) }}{{ tx.description ? ` · ${tx.description}` : "" }}</p>
              </div>
              <span class="font-medium tabular-nums" :class="tx.type === 'WITHDRAWAL' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">
                {{ tx.type === "WITHDRAWAL" ? "−" : "+" }}{{ formatCurrency(tx.amount, tx.currency) }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No transactions yet.</p>
        </div>
      </div>
    </div>

    <div v-else-if="!loading && !error" class="card flex flex-col items-center gap-3 p-10 text-center">
      <p class="font-medium text-slate-900 dark:text-slate-100">No wallets yet</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">Create a wallet to hold cash in your account.</p>
      <button type="button" class="btn-primary" @click="showCreate = true">New wallet</button>
    </div>

    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="showCreate = false">
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Create wallet">
        <h3 class="mb-4 text-base font-semibold">Create a wallet</h3>
        <form @submit.prevent="submitCreate">
          <label for="wallet-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
          <input id="wallet-name" v-model="newWallet.name" type="text" required class="input mb-4" placeholder="e.g. USD savings" />
          <label for="wallet-currency" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Currency</label>
          <select id="wallet-currency" v-model="newWallet.currency" class="input mb-4">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="CHF">CHF</option>
            <option value="PLN">PLN</option>
          </select>
          <p v-if="createError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creating || !newWallet.name.trim()">
              {{ creating ? "Creating..." : "Create" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <WalletCashModals
      v-if="cashWallet"
      :open="showCashModal"
      :action="cashAction"
      :wallet="cashWallet"
      @close="closeCash"
      @done="closeCash"
    />
  </div>
</template>
