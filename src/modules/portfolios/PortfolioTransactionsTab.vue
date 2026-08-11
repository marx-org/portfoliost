<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioTransactions } from "@/api/portfolios"
import { formatCurrency, formatDate, formatNumber } from "@/utils/format"
import type { PortfolioTransactionsPage } from "@/api/types"

type Tx = PortfolioTransactionsPage["items"][number]

const route = useRoute()
const id = String(route.params.id)
const transactions = ref<Tx[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref<string | null>(null)

async function load(targetPage = page.value) {
  loading.value = true
  error.value = null
  try {
    const res = await getPortfolioTransactions(id, targetPage, 20)
    transactions.value = res.items
    total.value = res.total
    page.value = res.page
    totalPages.value = res.totalPages
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load transactions"
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

function typeClass(type: string): string {
  const t = type.toUpperCase()
  if (t === "BUY") return "bg-green-50 text-green-700"
  if (t === "SELL") return "bg-red-50 text-red-700"
  return "bg-slate-100 text-slate-600"
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-baseline justify-between border-b border-slate-200 px-5 py-3">
      <h2 class="text-base font-semibold">Transactions</h2>
      <p v-if="!loading" class="text-sm text-slate-500">{{ total.toLocaleString() }} total transactions</p>
    </div>

    <p v-if="error" class="border-b border-slate-100 px-5 py-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="px-5 py-6 text-sm text-slate-500">Loading transactions...</p>

    <template v-if="!loading && !error">
      <div v-if="transactions.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th class="px-5 py-2.5 font-medium">Date</th>
              <th class="px-5 py-2.5 font-medium">Type</th>
              <th class="px-5 py-2.5 font-medium">Symbol</th>
              <th class="px-5 py-2.5 text-right font-medium">Quantity</th>
              <th class="px-5 py-2.5 text-right font-medium">Price</th>
              <th class="px-5 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="tx in transactions" :key="tx.id" class="hover:bg-slate-50">
              <td class="px-5 py-3 whitespace-nowrap">{{ formatDate(tx.executedAt) }}</td>
              <td class="px-5 py-3">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="typeClass(tx.type)">{{ tx.type }}</span>
              </td>
              <td class="px-5 py-3">
                <router-link
                  :to="{ name: 'research-overview', params: { symbol: tx.instrumentSymbol } }"
                  class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                >
                  {{ tx.instrumentSymbol }}
                </router-link>
                <p class="text-xs text-slate-500">{{ tx.instrumentName }}</p>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(tx.quantity) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(tx.price) }}</td>
              <td class="px-5 py-3 text-right font-medium tabular-nums">{{ formatCurrency(tx.totalAmount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-6 text-sm text-slate-500">No transactions found.</p>

      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-slate-200 px-5 py-3">
        <button type="button" class="btn-ghost text-sm" :disabled="page <= 1" @click="load(page - 1)">Previous</button>
        <span class="text-sm text-slate-500">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn-ghost text-sm" :disabled="page >= totalPages" @click="load(page + 1)">Next</button>
      </div>
    </template>
  </div>
</template>
