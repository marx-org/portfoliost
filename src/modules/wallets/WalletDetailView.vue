<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useWalletsStore } from "@/stores/wallets"
import { ApiError } from "@/api/client"
import FeeCell from "@/components/FeeCell.vue"
import { getWalletBalanceHistory, updateWalletTransaction, deleteWalletTransaction } from "@/api/wallets"
import FeeFields from "@/components/FeeFields.vue"
import FxRateFields from "@/components/FxRateFields.vue"
import type { LatestRate } from "@/api/fx"
import { formatCurrency, formatDate, formatSignedCurrency } from "@/utils/format"
import WalletCashModals from "@/modules/portfolios/WalletCashModals.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import type { CashTransaction } from "@/api/wallets"
import type { Wallets } from "@/api/types"

const route = useRoute()
const router = useRouter()
const store = useWalletsStore()

const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)

const wallet = computed<Wallets[number] | null>(() => store.wallets.find((w) => w.id === route.params.id) ?? null)

const showCashModal = ref(false)
const cashAction = ref<"deposit" | "withdraw" | "transfer">("deposit")

const showRename = ref(false)
const renameName = ref("")
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

const notice = ref<string | null>(null)

const editing = ref<CashTransaction | null>(null)
const editForm = ref({
  type: "DEPOSIT" as string,
  amount: 0,
  description: "",
  date: "",
  fees: 0,
  feesType: "fixed" as "fixed" | "pct",
  feeCurrency: "USD",
  feeRateSource: "automatic" as "automatic" | "manual",
  feeExchangeRate: "",
})
const editFeeSuggestion = ref<LatestRate | null>(null)
const editBusy = ref(false)
const editError = ref<string | null>(null)

const deleteTarget = ref<CashTransaction | null>(null)
const deleteTxBusy = ref(false)
const deleteTxError = ref<string | null>(null)

const history = ref<Array<{ date: string; balance: number }>>([])
const historyError = ref<string | null>(null)

const RANGES = ["1W", "1M", "3M", "1Y", "2Y", "3Y", "5Y", "10Y", "ALL"] as const
const RANGE_DAYS: Record<string, number> = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "2Y": 730, "3Y": 1095, "5Y": 1825, "10Y": 3650 }
const historyRange = ref<string>("2Y")

onMounted(load)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await store.fetchAll()
    if (!wallet.value) {
      notFound.value = true
      return
    }
    renameName.value = wallet.value.name
    await Promise.all([loadHistory(), store.fetchTransactions(route.params.id as string)])
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "Failed to load wallet"
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  historyError.value = null
  try {
    const res = await getWalletBalanceHistory(route.params.id as string)
    history.value = res.data.map((p) => ({ date: p.date, balance: p.balance }))
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : "Failed to load balance history"
  }
}

function openCash(action: "deposit" | "withdraw" | "transfer") {
  cashAction.value = action
  showCashModal.value = true
}

function closeCash() {
  showCashModal.value = false
}

async function cashDone() {
  showCashModal.value = false
  await store.fetchTransactions(route.params.id as string)
}

function openRename() {
  renameName.value = wallet.value?.name ?? ""
  renameError.value = null
  showRename.value = true
}

async function submitRename() {
  if (!wallet.value || !renameName.value.trim()) return
  renameBusy.value = true
  renameError.value = null
  try {
    await store.rename(wallet.value.id, renameName.value.trim())
    showRename.value = false
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : "Failed to rename wallet"
  } finally {
    renameBusy.value = false
  }
}

function openDelete() {
  deleteError.value = null
  showDeleteConfirm.value = true
}

async function submitDelete() {
  if (!wallet.value) return
  deleteBusy.value = true
  deleteError.value = null
  const target = wallet.value
  try {
    await store.remove(target.id)
    showDeleteConfirm.value = false
    router.push({ name: "investments" })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      showDeleteConfirm.value = false
      store.setDeleteNotice(err.message)
      router.push({ name: "wallets" })
      return
    }
    deleteError.value = err instanceof Error ? err.message : "Failed to delete wallet"
  } finally {
    deleteBusy.value = false
  }
}

function openEdit(tx: CashTransaction) {
  editing.value = tx
  editForm.value = {
    type: tx.type,
    amount: Math.abs(tx.amount),
    description: tx.description ?? "",
    date: tx.createdAt.slice(0, 10),
    fees: tx.fees ?? 0,
    feesType: "fixed",
    feeCurrency: tx.feeCurrency ?? tx.currency ?? "USD",
    feeRateSource: "automatic",
    feeExchangeRate: "",
  }
  editError.value = null
}

async function submitEdit() {
  if (!editing.value) return
  editBusy.value = true
  editError.value = null
  try {
    await updateWalletTransaction(editing.value.id, {
      type: editForm.value.type,
      amount: editForm.value.amount,
      description: editForm.value.description,
      date: editForm.value.date ? new Date(editForm.value.date).toISOString() : editing.value.createdAt,
      fees: editForm.value.fees || undefined,
      fees_type: editForm.value.feesType,
      feeCurrency: editForm.value.feesType === "fixed" ? editForm.value.feeCurrency : undefined,
      feeRateSource:
        editForm.value.feesType === "fixed" && editForm.value.feeCurrency !== wallet.value?.currency
          ? editForm.value.feeRateSource
          : undefined,
      feeExchangeRate:
        editForm.value.feesType === "fixed" &&
        editForm.value.feeCurrency !== wallet.value?.currency &&
        editForm.value.feeRateSource === "manual" &&
        editForm.value.feeExchangeRate
          ? Number(editForm.value.feeExchangeRate)
          : undefined,
    })
    editing.value = null
    notice.value = "Transaction updated"
    await Promise.all([store.fetchTransactions(route.params.id as string), store.fetchAll()])
  } catch (err) {
    editError.value = err instanceof Error ? err.message : "Failed to update transaction"
  } finally {
    editBusy.value = false
  }
}

function openDeleteTx(tx: CashTransaction) {
  deleteTarget.value = tx
  deleteTxError.value = null
}

async function submitDeleteTx() {
  if (!deleteTarget.value) return
  deleteTxBusy.value = true
  deleteTxError.value = null
  const target = deleteTarget.value
  try {
    await deleteWalletTransaction(target.id)
    deleteTarget.value = null
    notice.value = "Transaction deleted"
    await Promise.all([store.fetchTransactions(route.params.id as string), store.fetchAll()])
  } catch (err) {
    deleteTxError.value = err instanceof Error ? err.message : "Failed to delete transaction"
  } finally {
    deleteTxBusy.value = false
  }
}

const filteredHistory = computed(() => {
  const days = RANGE_DAYS[historyRange.value]
  if (!days) return history.value
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return history.value.filter((p) => new Date(p.date).getTime() >= cutoff)
})

const historyStats = computed(() => {
  const points = filteredHistory.value
  if (!points.length) return null
  const balances = points.map((p) => p.balance)
  return {
    high: Math.max(...balances),
    low: Math.min(...balances),
    average: balances.reduce((s, b) => s + b, 0) / balances.length,
    change: balances[balances.length - 1] - balances[0],
  }
})

const historyChart = computed(() => ({
  chart: { type: "area" as const, height: 220, toolbar: { show: false } },
  colors: ["#16a34a"],
  series: [{ name: "Balance", data: filteredHistory.value.map((p) => p.balance) }],
  xaxis: { categories: filteredHistory.value.map((p) => formatDate(p.date)), labels: { show: false } },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.3, opacityTo: 0 } },
}))

const TYPE_LABELS: Record<string, string> = { DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", TRANSFER: "Transfer", INVEST: "Investment" }

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

function isDebit(tx: CashTransaction): boolean {
  return tx.type === "WITHDRAWAL" || tx.type === "TRANSFER"
}

function signedAmount(tx: CashTransaction): number {
  return isDebit(tx) ? -tx.amount : tx.amount
}

const recentTransactions = computed(() => {
  const items = [...(store.transactions?.items ?? [])].sort((a, b) =>
    (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
  )
  let running = wallet.value?.balance ?? 0
  const rows: Array<{ tx: CashTransaction; balance: number }> = []
  for (const tx of items) {
    rows.push({ tx, balance: running })
    running -= signedAmount(tx)
  }
  return rows
})

function exportHistory() {
  if (!filteredHistory.value.length) return
  const lines = [
    "Date,Balance",
    ...filteredHistory.value.map((p) => `${p.date},${p.balance}`),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "balance-history.csv"
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading wallet...</p>

    <div v-else-if="notFound" class="card flex flex-col items-center gap-3 p-10 text-center">
      <p class="font-medium text-slate-900 dark:text-slate-100">Wallet not found</p>
      <router-link :to="{ name: 'investments' }" class="btn-primary">Back to portfolios</router-link>
    </div>

    <template v-else-if="wallet">
      <p v-if="loadError" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ loadError }}</p>

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <button type="button" aria-label="Go back" class="mt-1 rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200" @click="router.back()">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
            </svg>
          </button>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-semibold">{{ wallet.name }}</h1>
              <button type="button" class="rounded-lg border border-slate-200 dark:border-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50" @click="openRename">
                Rename
              </button>
            </div>
            <div class="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">Balance</p>
                <p class="font-semibold tabular-nums">{{ formatCurrency(wallet.balance, wallet.currency) }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">Available</p>
                <p class="font-semibold tabular-nums">{{ formatCurrency(wallet.availableBalance, wallet.currency) }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500 dark:text-slate-400">Currency</p>
                <p class="font-semibold">{{ wallet.currency }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn-emerald text-xs" @click="openCash('deposit')">Deposit</button>
          <button type="button" class="btn-secondary text-xs" @click="openCash('transfer')">Transfer</button>
          <button type="button" class="btn-red-ghost text-xs" @click="openCash('withdraw')">Withdraw</button>
          <button type="button" class="btn-danger text-xs" @click="openDelete">Delete wallet</button>
        </div>
      </div>

      <div class="card mt-6 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold">Balance History</h2>
          <button type="button" class="btn-ghost text-xs" :disabled="!filteredHistory.length" @click="exportHistory">Export</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-1">
          <button
            v-for="r in RANGES"
            :key="r"
            type="button"
            class="rounded px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            :class="historyRange === r ? 'bg-slate-900 text-white dark:bg-slate-700' : ''"
            @click="historyRange = r"
          >
            {{ r }}
          </button>
        </div>
        <div v-if="historyStats" class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">High</p>
            <p class="font-medium tabular-nums">{{ formatCurrency(historyStats.high, wallet.currency) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Low</p>
            <p class="font-medium tabular-nums">{{ formatCurrency(historyStats.low, wallet.currency) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Average</p>
            <p class="font-medium tabular-nums">{{ formatCurrency(historyStats.average, wallet.currency) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Change</p>
            <p class="font-medium tabular-nums" :class="historyStats.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ formatSignedCurrency(historyStats.change, wallet.currency) }}
            </p>
          </div>
        </div>
        <p v-if="historyError" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ historyError }}</p>
        <component :is="'apexchart'" v-else-if="filteredHistory.length" :options="historyChart" :series="historyChart.series" />
        <p v-else class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No balance history available.</p>
      </div>

      <div class="card mt-6 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold">Recent Transactions</h2>
          <router-link :to="{ name: 'transactions-cash' }" class="btn-ghost text-xs">View All</router-link>
        </div>
        <p v-if="notice" class="mt-3 rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
        <div class="mt-4 overflow-x-auto">
          <table v-if="recentTransactions.length" class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-4 font-medium">Date</th>
                <th class="py-2 pr-4 font-medium">Type</th>
                <th class="py-2 pr-4 font-medium">Description</th>
                <th class="py-2 pr-4 text-right font-medium">Amount</th>
                <th class="py-2 pr-4 text-right font-medium">Balance</th>
                <th class="py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ tx, balance } in recentTransactions" :key="tx.id" class="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td class="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{{ formatDate(tx.createdAt) }}</td>
                <td class="py-2.5 pr-4 font-medium">
                  {{ typeLabel(tx.type) }}
                  <FeeCell
                    v-if="Number(tx.fees) > 0"
                    :fees="tx.fees"
                    :fee-currency="tx.feeCurrency"
                    :fallback-currency="tx.currency"
                    :rate-source="tx.rateSource"
                    class="ml-1 align-middle text-[11px] font-normal"
                  />
                </td>
                <td class="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{{ tx.description ?? "—" }}</td>
                <td class="py-2.5 pr-4 text-right font-medium tabular-nums" :class="isDebit(tx) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">
                  {{ formatSignedCurrency(signedAmount(tx), tx.currency) }}
                </td>
                <td class="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{{ formatCurrency(balance, tx.currency) }}</td>
                <td class="py-2.5">
                  <div class="flex justify-end gap-1">
                    <button
                      type="button"
                      class="btn-ghost px-2 py-1 text-xs"
                      aria-label="Edit transaction"
                      @click="openEdit(tx)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label="Delete transaction"
                      @click="openDeleteTx(tx)"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No transactions yet.</p>
        </div>
      </div>

      <WalletCashModals
        :open="showCashModal"
        :action="cashAction"
        :wallet="wallet"
        @close="closeCash"
        @done="cashDone"
      />

      <div v-if="showRename" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="showRename = false">
        <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Rename wallet">
          <h3 class="mb-4 text-base font-semibold">Rename wallet</h3>
          <form @submit.prevent="submitRename">
            <label for="wallet-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
            <input id="wallet-name" v-model="renameName" type="text" required class="input mb-4" />
            <p v-if="renameError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ renameError }}</p>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" @click="showRename = false">Cancel</button>
              <button type="submit" class="btn-primary" :disabled="renameBusy || !renameName.trim()">
                {{ renameBusy ? "Saving..." : "Save" }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="showDeleteConfirm = false">
        <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete wallet">
          <h3 class="mb-4 text-base font-semibold">Delete wallet</h3>
          <p class="text-sm text-slate-600 dark:text-slate-300">Delete "{{ wallet.name }}" and its cash history? This cannot be undone.</p>
          <p v-if="deleteError" class="mb-3 mt-2 text-sm text-red-600 dark:text-red-400">{{ deleteError }}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
            <button type="button" class="btn-primary bg-red-600" :disabled="deleteBusy" @click="submitDelete">
              {{ deleteBusy ? "Deleting..." : "Delete" }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="editing"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
        @click.self="editing = null"
      >
        <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Edit transaction">
          <h3 class="mb-4 text-base font-semibold">Edit Transaction</h3>
          <form @submit.prevent="submitEdit">
            <label for="wallet-tx-type" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Transaction Type</label>
            <select id="wallet-tx-type" v-model="editForm.type" class="input mb-4">
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAWAL">Withdrawal</option>
              <option value="TRANSFER">Transfer</option>
              <option value="INVEST">Investment</option>
            </select>
            <label for="wallet-tx-amount" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Amount</label>
            <input id="wallet-tx-amount" v-model.number="editForm.amount" type="number" min="0" step="0.01" required class="input mb-4" />
            <label for="wallet-tx-fees" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Fees (Optional)</label>
            <FeeFields
              v-model:fees="editForm.fees"
              v-model:fees-type="editForm.feesType"
              v-model:fee-currency="editForm.feeCurrency"
              testid="wallet-tx"
              input-id="wallet-tx-fees"
              class="mb-4"
            />
            <FxRateFields
              leg="Fee"
              :from="editForm.feeCurrency"
              :to="wallet?.currency ?? 'USD'"
              :date="editForm.date"
              :hidden="editForm.feesType !== 'fixed' || editForm.feeCurrency === wallet?.currency"
              v-model:rate-source="editForm.feeRateSource"
              v-model:rate="editForm.feeExchangeRate"
              @suggestion="editFeeSuggestion = $event"
              testid="wallet-tx-fee-fx"
              class="mb-4"
            />
            <label for="wallet-tx-date" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Date</label>
            <input id="wallet-tx-date" v-model="editForm.date" type="date" required class="input mb-4" />
            <label for="wallet-tx-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description</label>
            <input id="wallet-tx-description" v-model="editForm.description" type="text" class="input mb-4" placeholder="Transaction description" />
            <p v-if="editError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ editError }}</p>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" @click="editing = null">Cancel</button>
              <button type="submit" class="btn-primary" :disabled="editBusy">
                {{ editBusy ? "Saving..." : "Update Transaction" }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDeleteModal
        :open="!!deleteTarget"
        message="Are you sure you want to delete this transaction?"
        :busy="deleteTxBusy"
        :error="deleteTxError"
        @close="deleteTarget = null"
        @confirm="submitDeleteTx"
      />
    </template>
  </div>
</template>
