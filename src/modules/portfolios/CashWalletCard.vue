<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useWalletsStore } from "@/stores/wallets"
import { ApiError } from "@/api/client"
import { getWalletBalanceHistory } from "@/api/wallets"
import { formatCurrency, formatNumber } from "@/utils/format"
import WalletBalanceChart from "@/components/WalletBalanceChart.vue"
import WalletCashModals from "@/modules/portfolios/WalletCashModals.vue"
import type { Wallets } from "@/api/types"

const props = defineProps<{ wallet: Wallets[number] }>()

const store = useWalletsStore()
const router = useRouter()

const openMenu = ref(false)
const notice = ref<string | null>(null)

const showCashModal = ref(false)
const cashAction = ref<"deposit" | "withdraw" | "transfer">("deposit")

const history = ref<Array<{ date: string; balance: number }>>([])
const historyBusy = ref(false)
const historyLoaded = ref(false)
const historyError = ref<string | null>(null)

const showRename = ref(false)
const renameName = ref(props.wallet.name)
const renameBusy = ref(false)
const renameError = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

onMounted(loadHistory)

function goToDetail() {
  router.push({ name: "wallet-detail", params: { id: props.wallet.id } })
}

function openCash(action: "deposit" | "withdraw" | "transfer") {
  openMenu.value = false
  cashAction.value = action
  showCashModal.value = true
}

function closeCash() {
  showCashModal.value = false
}

function cashDone(amount: number) {
  showCashModal.value = false
  const verb = cashAction.value === "deposit" ? "Deposited" : cashAction.value === "withdraw" ? "Withdrew" : "Transferred"
  notice.value = `${verb} ${formatCurrency(amount, props.wallet.currency)}`
  loadHistory()
}

async function loadHistory() {
  historyBusy.value = true
  historyError.value = null
  try {
    const res = await getWalletBalanceHistory(props.wallet.id)
    history.value = res.data
      .filter((p) => p.balance > 0)
      .map((p) => ({ date: p.date, balance: p.balance }))
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : "Failed to load balance history"
  } finally {
    historyBusy.value = false
    historyLoaded.value = true
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
  const target = props.wallet
  try {
    await store.remove(target.id)
    showDeleteConfirm.value = false
    notice.value = `Deleted ${target.name}`
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

</script>

<template>

  <div class="card cursor-pointer p-5" @click="goToDetail">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-slate-900 dark:text-slate-100">{{ wallet.name }}</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ wallet.currency }} &middot; {{ wallet.isDefault ? "Default" : "Secondary" }}</p>
      </div>
      <div class="flex items-center gap-4" @click.stop>
        <div class="text-right">
          <p class="text-lg font-semibold tabular-nums">{{ formatCurrency(wallet.balance, wallet.currency) }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ formatNumber(wallet.availableBalance) }} available</p>
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
            <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700/60 dark:bg-slate-900">
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openRename">Edit name</button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50" @click="openDelete">Delete wallet</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs text-slate-500 dark:text-slate-400">Balance</span>
        <button type="button" class="text-xs font-medium text-blue-600 hover:underline" @click.stop="goToDetail">History</button>
      </div>
      <p v-if="historyError" class="text-sm text-red-600 dark:text-red-400">{{ historyError }}</p>
      <WalletBalanceChart v-else-if="historyLoaded" :points="history" :busy="historyBusy" :height="160" @recompute="loadHistory" />
      <div v-else class="flex h-[160px] items-center justify-center">
        <p class="text-xs text-slate-400 dark:text-slate-500">Loading balance...</p>
      </div>
    </div>

    <p v-if="notice" class="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-400">{{ notice }}</p>

    <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800" @click.stop>
      <button type="button" class="btn-emerald text-xs" @click="openCash('deposit')">Deposit</button>
      <button type="button" class="btn-red-ghost text-xs" @click="openCash('withdraw')">Withdraw</button>
      <button type="button" class="btn-secondary text-xs" @click="openCash('transfer')">Transfer</button>
    </div>

    <WalletCashModals
      :open="showCashModal"
      :action="cashAction"
      :wallet="wallet"
      @close="closeCash"
      @done="cashDone"
    />

    <div
      v-if="showRename"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self.stop="showRename = false"
    >
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

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self.stop="showDeleteConfirm = false"
    >
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
  </div>
</template>
