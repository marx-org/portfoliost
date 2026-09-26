<script setup lang="ts">
/**
 * §62.8 — per-portfolio cash tab (example-service parity). Balance block (one row per
 * currency + base-currency total), the CashBalanceChart over the base-currency
 * PortfolioCashHistory series, Deposit/Withdraw/Transfer via
 * PortfolioCashModals, and a cash-transactions table. An amber negative-cash
 * badge shows on a non-margin portfolio when any currency balance < 0.
 */
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import {
  getPortfolioCash,
  getPortfolioCashHistory,
  getPortfolioCashTransactions,
  deleteCashTransaction,
} from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatSignedCurrency } from "@/utils/format"
import CashBalanceChart from "@/components/CashBalanceChart.vue"
import LabelChips from "@/components/LabelChips.vue"
import LabelPickerPopover from "@/components/LabelPickerPopover.vue"
import PortfolioCashModals from "@/modules/portfolios/PortfolioCashModals.vue"
import ConfirmDeleteModal from "@/modules/portfolios/ConfirmDeleteModal.vue"
import type { components } from "@/api/types"

type CashTransaction = components["schemas"]["CashTransaction"]
type PortfolioCash = components["schemas"]["PortfolioCash"]

const route = useRoute()
const id = String(route.params.id)
const store = usePortfolioStore()

const cash = ref<PortfolioCash | null>(null)
const historyPoints = ref<Array<{ date: string; balance: number }>>([])
const transactions = ref<CashTransaction[]>([])
const loading = ref(true)
const chartBusy = ref(false)
const error = ref<string | null>(null)

// Modal state
const modalOpen = ref(false)
const modalAction = ref<"deposit" | "withdraw" | "transfer">("deposit")

// Edit / delete / labels — edit reuses the Deposit/Withdraw/Transfer modal in
// edit mode (§62 follow-up) so every field (amount, currency, fees, date, …)
// is editable, not just the description.
const editing = ref<CashTransaction | null>(null)
const deleteTarget = ref<CashTransaction | null>(null)
const pickerTx = ref<CashTransaction | null>(null)

const isMarginEnabled = computed(() => store.detail?.isMarginEnabled ?? false)
const baseCurrency = computed(() => cash.value?.baseCurrency ?? store.detail?.baseCurrency ?? "USD")

// Any currency balance below zero on a non-margin portfolio → amber badge.
const negativeBalances = computed(() => {
  if (isMarginEnabled.value) return []
  return (cash.value?.balances ?? []).filter((b) => b.balance < 0)
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [c, h, txs] = await Promise.all([
      getPortfolioCash(id),
      getPortfolioCashHistory(id, "1Y"),
      getPortfolioCashTransactions(id, 1, 20),
    ])
    cash.value = c
    historyPoints.value = (h.data ?? []).map((p) => ({ date: p.date, balance: p.balance }))
    transactions.value = txs.items ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load cash"
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!store.detail) void store.fetchDetail(id)
  void load()
})

watch(() => route.params.id, (nid, oid) => {
  if (nid && nid !== oid) {
    void load()
  }
})

function openModal(action: "deposit" | "withdraw" | "transfer") {
  modalAction.value = action
  modalOpen.value = true
}

function onModalDone() {
  modalOpen.value = false
  editing.value = null
  void load()
}

function openEdit(tx: CashTransaction) {
  editing.value = tx
  modalAction.value =
    tx.type === "WITHDRAWAL" ? "withdraw" : tx.type === "TRANSFER" ? "transfer" : "deposit"
  modalOpen.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await deleteCashTransaction(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to delete transaction"
  }
}

function typeLabel(t: string): string {
  switch (t) {
    case "DEPOSIT": return "Deposit"
    case "WITHDRAWAL": return "Withdrawal"
    case "TRANSFER": return "Transfer"
    default: return t
  }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading cash...</p>

    <template v-if="!loading && cash">
      <!-- Balance block + actions -->
      <section class="card p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Cash Balance</h2>
            <p class="text-sm tabular-nums text-slate-600 dark:text-slate-300" data-testid="cash-tab-total">
              {{ formatCurrency(cash.total, baseCurrency) }}
            </p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary text-sm" data-testid="cash-tab-deposit" @click="openModal('deposit')">Deposit</button>
            <button type="button" class="btn-secondary text-sm" data-testid="cash-tab-withdraw" @click="openModal('withdraw')">Withdraw</button>
            <button type="button" class="btn-secondary text-sm" data-testid="cash-tab-transfer" @click="openModal('transfer')">Transfer</button>
          </div>
        </div>

        <!-- Negative-cash warning (informational, non-margin only) -->
        <div
          v-if="negativeBalances.length"
          class="mb-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          data-testid="cash-negative-badge"
        >
          <span class="font-semibold">Negative cash:</span>
          <span v-for="b in negativeBalances" :key="b.currency" class="ml-1 tabular-nums">
            {{ b.currency }} {{ formatSignedCurrency(b.balance, b.currency) }}
          </span>
        </div>

        <!-- Per-currency balances -->
        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <div
            v-for="b in cash.balances"
            :key="b.currency"
            class="flex items-center justify-between py-2"
            :data-testid="`cash-balance-${b.currency}`"
          >
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ b.currency }}</span>
            <span class="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100" :class="b.balance < 0 ? 'text-amber-700 dark:text-amber-400' : ''">
              {{ formatCurrency(b.balance, b.currency) }}
            </span>
          </div>
        </div>
      </section>

      <!-- Balance history chart -->
      <section class="card p-5">
        <h2 class="mb-4 text-lg font-semibold">Balance History</h2>
        <CashBalanceChart
          :points="historyPoints"
          :busy="chartBusy"
          :height="220"
        />
      </section>

      <!-- Cash transactions -->
      <section class="card overflow-hidden">
        <h2 class="mb-4 px-5 pt-5 text-lg font-semibold">Cash Transactions</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700/60">
            <thead>
              <tr>
                <th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Balance</th>
                <th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
                <th class="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Labels</th>
                <th class="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="tx in transactions" :key="tx.id" :data-testid="`cash-tx-${tx.id}`">
                <td class="px-5 py-3 text-sm text-slate-900 dark:text-slate-100">{{ typeLabel(tx.type) }}</td>
                <td class="px-5 py-3 text-right text-sm tabular-nums text-slate-900 dark:text-slate-100">
                  {{ formatSignedCurrency(tx.amount, tx.currency) }}
                </td>
                <td class="px-5 py-3 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  {{ tx.balanceAfter != null ? formatCurrency(tx.balanceAfter, tx.currency) : "—" }}
                </td>
                <td class="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">{{ tx.description || "—" }}</td>
                <td class="px-5 py-3">
                  <div class="relative">
                    <LabelChips v-if="tx.labels?.length" :labels="tx.labels" :max="3" @badge-click="pickerTx = tx" />
                    <button
                      v-else
                      type="button"
                      class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      data-testid="cash-add-label"
                      @click="pickerTx = tx"
                    >+ label</button>
                  </div>
                </td>
                <td class="px-5 py-3 text-right">
                  <div class="flex justify-end gap-3">
                    <button type="button" class="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" @click="openEdit(tx)">Edit</button>
                    <button type="button" class="text-sm text-red-600 dark:text-red-400 hover:underline" @click="deleteTarget = tx">Delete</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!transactions.length">
                <td colspan="6" class="px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No cash transactions yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <PortfolioCashModals
      :open="modalOpen"
      :action="modalAction"
      :portfolio-id="id"
      :cash="cash ?? { baseCurrency: 'USD', balances: [], total: 0 }"
      :edit-tx="editing"
      @close="modalOpen = false; editing = null"
      @done="onModalDone"
    />

    <ConfirmDeleteModal
      :open="deleteTarget != null"
      :busy="false"
      :message="`Delete this ${deleteTarget ? typeLabel(deleteTarget.type).toLowerCase() : 'cash transaction'}? This cannot be undone.`"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />

    <LabelPickerPopover
      :open="pickerTx != null"
      :entity-id="pickerTx?.id ?? ''"
      entity-kind="cash-transaction"
      :current-labels="pickerTx?.labels ?? []"
      @close="pickerTx = null"
      @saved="pickerTx = null; void load()"
    />
  </div>
</template>
