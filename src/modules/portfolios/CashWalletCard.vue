<script setup lang="ts">
import { computed, ref } from "vue"
import { useWalletsStore } from "@/stores/wallets"
import { getWalletBalanceHistory } from "@/api/wallets"
import { formatCurrency, formatDate, formatNumber } from "@/utils/format"
import type { Wallets } from "@/api/types"

const props = defineProps<{ wallet: Wallets[number] }>()

const store = useWalletsStore()

const openMenu = ref(false)
const notice = ref<string | null>(null)

const showCashModal = ref(false)
const cashAction = ref<"deposit" | "withdraw" | "transfer">("deposit")
const cashAmount = ref(0)
const cashDescription = ref("")
const cashBusy = ref(false)
const cashError = ref<string | null>(null)

const showHistory = ref(false)
const history = ref<Array<{ date: string; balance: number }>>([])
const historyError = ref<string | null>(null)

const showRename = ref(false)
const renameName = ref(props.wallet.name)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function openCash(action: "deposit" | "withdraw" | "transfer") {
  openMenu.value = false
  cashAction.value = action
  cashAmount.value = 0
  cashDescription.value = ""
  cashError.value = null
  showCashModal.value = true
}

async function submitCash() {
  if (cashAmount.value <= 0) return
  cashBusy.value = true
  cashError.value = null
  try {
    if (cashAction.value === "deposit") {
      await store.deposit(props.wallet.id, { amount: cashAmount.value, description: cashDescription.value || undefined })
      notice.value = `Deposited ${formatCurrency(cashAmount.value, props.wallet.currency)}`
    } else if (cashAction.value === "withdraw") {
      await store.withdraw(props.wallet.id, { amount: cashAmount.value, description: cashDescription.value || undefined })
      notice.value = `Withdrew ${formatCurrency(cashAmount.value, props.wallet.currency)}`
    } else {
      await store.transfer(props.wallet.id, { amount: cashAmount.value, description: cashDescription.value || undefined })
      notice.value = `Transferred ${formatCurrency(cashAmount.value, props.wallet.currency)}`
    }
    showCashModal.value = false
  } catch (err) {
    cashError.value = err instanceof Error ? err.message : "Failed to process cash movement"
  } finally {
    cashBusy.value = false
  }
}

async function toggleHistory() {
  showHistory.value = !showHistory.value
  if (!showHistory.value) return
  historyError.value = null
  try {
    const res = await getWalletBalanceHistory(props.wallet.id)
    history.value = res.data
      .filter((p) => p.balance > 0)
      .map((p) => ({ date: p.date, balance: p.balance }))
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : "Failed to load balance history"
  }
}

function openRename() {
  openMenu.value = false
  renameName.value = props.wallet.name
  renameError.value = null
  showRename.value = true
}

async function submitRename() {
  if (!renameName.value.trim()) return
  renameBusy.value = true
  renameError.value = null
  try {
    await store.rename(props.wallet.id, renameName.value.trim())
    showRename.value = false
    notice.value = "Wallet renamed"
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : "Failed to rename wallet"
  } finally {
    renameBusy.value = false
  }
}

function openDelete() {
  openMenu.value = false
  deleteError.value = null
  showDeleteConfirm.value = true
}

async function submitDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await store.remove(props.wallet.id)
    showDeleteConfirm.value = false
    notice.value = `Deleted ${props.wallet.name}`
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete wallet"
  } finally {
    deleteBusy.value = false
  }
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
  <div class="card p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-slate-900">{{ wallet.name }}</h3>
        <p class="text-xs text-slate-500">{{ wallet.currency }} &middot; {{ wallet.isDefault ? "Default" : "Secondary" }}</p>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-right">
          <p class="text-lg font-semibold tabular-nums">{{ formatCurrency(wallet.balance, wallet.currency) }}</p>
          <p class="text-xs text-slate-500">{{ formatNumber(wallet.availableBalance) }} available</p>
        </div>
        <div class="relative">
          <button
            type="button"
            aria-label="Wallet actions"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            @click="openMenu = !openMenu"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>
          <template v-if="openMenu">
            <div class="fixed inset-0 z-20" @click="openMenu = false"></div>
            <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openRename">Edit name</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50" @click="openDelete">Delete wallet</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <button type="button" class="btn-emerald text-xs" @click="openCash('deposit')">Deposit</button>
      <button type="button" class="btn-red-ghost text-xs" @click="openCash('withdraw')">Withdraw</button>
      <button type="button" class="btn-secondary text-xs" @click="openCash('transfer')">Transfer</button>
      <button
        type="button"
        class="btn-ghost text-xs"
        :class="showHistory ? 'bg-slate-100 text-slate-900' : ''"
        @click="toggleHistory"
      >
        History
      </button>
    </div>

    <p v-if="notice" class="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{{ notice }}</p>

    <div v-if="showHistory" class="mt-4 border-t border-slate-100 pt-4">
      <h4 class="mb-2 text-sm font-semibold text-slate-700">Balance History</h4>
      <p v-if="historyError" class="text-sm text-red-600">{{ historyError }}</p>
      <component :is="'apexchart'" v-else-if="history.length" :options="historyChart" :series="historyChart.series" />
      <p v-else class="text-sm text-slate-500">No balance history available.</p>
    </div>

    <div
      v-if="showCashModal"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showCashModal = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" :aria-label="`${cashAction} cash`">
        <h3 class="mb-4 text-base font-semibold capitalize">{{ cashAction }} &middot; {{ wallet.name }}</h3>
        <form @submit.prevent="submitCash">
          <label for="cash-amount" class="mb-1 block text-sm text-slate-600">Amount</label>
          <input id="cash-amount" v-model.number="cashAmount" type="number" min="0" step="0.01" required class="input mb-4" />
          <label for="cash-description" class="mb-1 block text-sm text-slate-600">Description (optional)</label>
          <input id="cash-description" v-model="cashDescription" type="text" class="input mb-4" />
          <p v-if="cashError" class="mb-3 text-sm text-red-600">{{ cashError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCashModal = false">Cancel</button>
            <button type="submit" class="btn-primary capitalize" :disabled="cashBusy || cashAmount <= 0">
              {{ cashBusy ? "Processing..." : cashAction }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showRename"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showRename = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Rename wallet">
        <h3 class="mb-4 text-base font-semibold">Rename wallet</h3>
        <form @submit.prevent="submitRename">
          <label for="wallet-name" class="mb-1 block text-sm text-slate-600">Name</label>
          <input id="wallet-name" v-model="renameName" type="text" required class="input mb-4" />
          <p v-if="renameError" class="mb-3 text-sm text-red-600">{{ renameError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showRename = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="renameBusy || !renameName.trim()">
              {{ renameBusy ? "Saving..." : "Save" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="showDeleteConfirm = false"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Delete wallet">
        <h3 class="mb-4 text-base font-semibold">Delete wallet</h3>
        <p class="text-sm text-slate-600">Delete "{{ wallet.name }}" and its cash history? This cannot be undone.</p>
        <p v-if="deleteError" class="mb-3 mt-2 text-sm text-red-600">{{ deleteError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button type="button" class="btn-primary bg-red-600" :disabled="deleteBusy" @click="submitDelete">
            {{ deleteBusy ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
