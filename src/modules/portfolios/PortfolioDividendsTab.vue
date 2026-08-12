<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioDividends } from "@/api/portfolios"
import { formatCurrency } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { PortfolioDividends } from "@/api/types"

const route = useRoute()
const id = String(route.params.id)
const data = ref<PortfolioDividends | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const limit = ref(50)

onMounted(async () => {
  try {
    data.value = await getPortfolioDividends(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load dividends"
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading dividends...</p>

    <template v-if="!loading && !error && data">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="card p-4">
          <p class="text-sm text-slate-500">Total Dividends</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ formatCurrency(data.totalDividends) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Payments</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ data.count.toLocaleString() }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-slate-500">Holdings</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ new Set(data.items.map((i) => i.symbol)).size }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="border-b border-slate-200 px-5 py-3">
          <h2 class="text-base font-semibold">Dividend History</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <th class="px-5 py-2.5 font-medium">Date</th>
                <th class="px-5 py-2.5 font-medium">Symbol</th>
                <th class="px-5 py-2.5 font-medium">Type</th>
                <th class="px-5 py-2.5 text-right font-medium">Amount</th>
                <th class="px-5 py-2.5 text-right font-medium">Currency</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(d, i) in data.items.slice(0, limit)" :key="`${d.symbol}-${d.date}-${i}`" class="hover:bg-slate-50">
                <td class="px-5 py-3 whitespace-nowrap">{{ d.date }}</td>
                <td class="px-5 py-3">
                  <router-link
                    :to="{ name: 'research-overview', params: { symbol: researchSymbol(d.symbol) } }"
                    class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                  >
                    {{ d.symbol }}
                  </router-link>
                </td>
                <td class="px-5 py-3 capitalize text-slate-600">{{ d.type }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ d.amount.toFixed(4) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ d.currency }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="data.items.length > limit" class="flex justify-center border-t border-slate-200 px-5 py-3">
          <button type="button" class="btn-ghost text-sm" @click="limit = data.items.length">Show all {{ data.items.length }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
