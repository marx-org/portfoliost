<script setup lang="ts">
import { onMounted, ref } from "vue"
import { getAllWalletTransactions, updateWalletTransaction, deleteWalletTransaction } from "@/api/wallets"
import { formatCurrency, formatDateTime } from "@/utils/format"
import type { RecentCashTransaction } from "@/api/wallets"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import TransactionsSubTabs from "@/modules/portfolios/TransactionsSubTabs.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"

type Tx = RecentCashTransaction

const transactions = ref<Tx[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const pageSize = ref(10)
const pageSizes = [5, 10, 20, 50]
const sortBy = ref("date")
const sortOrder = ref<"asc" | "desc">("desc")

const sortableColumns: { key: string; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "walletName", label: "Wallet" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount" },
]

const editing = ref<Tx | null>(null)
const editForm = ref({ type: "DEPOSIT", amount: 0, description: "", date: "" })
const editBusy = ref(false)
const editError = ref<string | null>(null)

const deleteTarget = ref<Tx | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

async function load(targetPage = page.value) {
  loading.value = true
  error.value = null
  try {
    const res = await getAllWalletTransactions(targetPage, pageSize.value, sortBy.value, sortOrder.value)
    transactions.value = res.data
    total.value = res.meta.total
    page.value = res.meta.page
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load wallet transactions"
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

function toggleSort(key: string) {
  if (sortBy.value === key) {
    sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc"
  } else {
    sortBy.value = key
    sortOrder.value = "asc"
  }
  load(1)
}

function changePageSize(size: number) {
  pageSize.value = size
  load(1)
}

function onPageSizeChange(e: Event) {
  changePageSize(Number((e.target as HTMLSelectElement).value))
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  load(p)
}

function pageNumbers(): (number | "…")[] {
  const t = totalPages.value
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
  const cur = page.value
  const set = new Set<number>([1, t, cur - 1, cur, cur + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= t).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  let prev = 0
  for (const n of nums) {
    if (n - prev > 1) out.push("…")
    out.push(n)
    prev = n
  }
  return out
}

function amountValue(tx: Tx): number {
  return Number(tx.amount) || 0
}

function openEdit(tx: Tx) {
  editing.value = tx
  editForm.value = {
    type: tx.type,
    amount: Math.abs(amountValue(tx)),
    description: tx.description ?? "",
    date: tx.date.slice(0, 10),
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
      date: editForm.value.date ? new Date(editForm.value.date).toISOString() : editing.value.date,
    })
    editing.value = null
    notice.value = "Transaction updated"
    await load()
  } catch (err) {
    editError.value = err instanceof Error ? err.message : "Failed to update transaction"
  } finally {
    editBusy.value = false
  }
}

function openDelete(tx: Tx) {
  deleteTarget.value = tx
  deleteError.value = null
}

async function submitDelete() {
  if (!deleteTarget.value) return
  deleteBusy.value = true
  deleteError.value = null
  const target = deleteTarget.value
  try {
    await deleteWalletTransaction(target.id)
    deleteTarget.value = null
    notice.value = "Transaction deleted"
    await load()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : "Failed to delete transaction"
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">Transactions</h1>
      <p class="mt-1 text-sm text-slate-500">All investing and cash transactions from across your account.</p>
    </div>

    <InvestmentsTabs />
    <TransactionsSubTabs />

    <p v-if="notice" class="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading transactions...</p>

    <div v-if="!loading && !error" class="card overflow-hidden">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th
                v-for="col in sortableColumns"
                :key="col.key"
                :data-testid="`table-th-${col.key}`"
                class="px-5 py-2.5 font-medium"
              >
                <button type="button" class="inline-flex items-center gap-1 hover:text-slate-900" @click="toggleSort(col.key)">
                  {{ col.label }}
                  <span v-if="sortBy === col.key">{{ sortOrder === "asc" ? "↑" : "↓" }}</span>
                </button>
              </th>
              <th class="px-5 py-2.5 font-medium">Description</th>
              <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="tx in transactions" :key="tx.id" class="hover:bg-slate-50">
              <td class="px-5 py-3 whitespace-nowrap text-slate-600">{{ formatDateTime(tx.date) }}</td>
              <td class="px-5 py-3 text-slate-900">{{ tx.walletName || "—" }}</td>
              <td class="px-5 py-3 text-slate-600">{{ tx.displayLabel }}</td>
              <td class="px-5 py-3 text-slate-600">{{ tx.description || "—" }}</td>
              <td class="px-5 py-3 text-right font-medium tabular-nums" :class="amountValue(tx) < 0 ? 'text-red-600' : 'text-green-700'">
                {{ formatCurrency(amountValue(tx), tx.currency) }}
              </td>
              <td class="px-5 py-3">
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
                    class="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    aria-label="Delete transaction"
                    @click="openDelete(tx)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500">No cash transactions found.</p>

      <div v-if="transactions.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
        <p class="text-sm text-slate-500">
          {{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, total) }} of {{ total }}
        </p>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-500">
            Rows per page
            <select class="input py-1" :value="pageSize" @change="onPageSizeChange">
              <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} per page</option>
            </select>
          </label>
          <nav aria-label="Pagination" class="flex items-center gap-1">
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="First page"
              :disabled="page <= 1"
              @click="goToPage(1)"
            >
              «
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Previous page"
              :disabled="page <= 1"
              @click="goToPage(page - 1)"
            >
              ‹
            </button>
            <button
              v-for="n in pageNumbers()"
              :key="n"
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              :class="n === page ? 'bg-slate-900 text-white' : ''"
              :aria-current="n === page ? 'page' : undefined"
              :disabled="n === '…'"
              @click="goToPage(Number(n))"
            >
              {{ n }}
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Next page"
              :disabled="page >= totalPages"
              @click="goToPage(page + 1)"
            >
              ›
            </button>
            <button
              type="button"
              class="btn-ghost px-2 py-1 text-xs"
              aria-label="Last page"
              :disabled="page >= totalPages"
              @click="goToPage(totalPages)"
            >
              »
            </button>
          </nav>
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
          <label for="wt-type" class="mb-1 block text-sm text-slate-600">Transaction Type</label>
          <select id="wt-type" v-model="editForm.type" class="input mb-4">
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAWAL">Withdrawal</option>
            <option value="TRANSFER">Transfer</option>
            <option value="INVEST">Investment</option>
          </select>
          <label for="wt-amount" class="mb-1 block text-sm text-slate-600">Amount</label>
          <input id="wt-amount" v-model.number="editForm.amount" type="number" min="0" step="0.01" required class="input mb-4" />
          <label for="wt-date" class="mb-1 block text-sm text-slate-600">Date</label>
          <input id="wt-date" v-model="editForm.date" type="date" required class="input mb-4" />
          <label for="wt-description" class="mb-1 block text-sm text-slate-600">Description</label>
          <input id="wt-description" v-model="editForm.description" type="text" class="input mb-4" placeholder="Transaction description" />
          <p v-if="editError" class="mb-3 text-sm text-red-600">{{ editError }}</p>
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
      :busy="deleteBusy"
      :error="deleteError"
      @close="deleteTarget = null"
      @confirm="submitDelete"
    />
  </div>
</template>
