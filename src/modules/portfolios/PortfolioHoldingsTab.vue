<script setup lang="ts">
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/utils/format"

const store = usePortfolioStore()

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
      <h2 class="text-base font-semibold">Positions</h2>
      <span class="text-sm text-slate-500">{{ store.positions.length }} open</span>
    </div>
    <div v-if="store.positions.length" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
            <th class="px-5 py-2.5 font-medium">Symbol</th>
            <th class="px-5 py-2.5 text-right font-medium">Quantity</th>
            <th class="px-5 py-2.5 text-right font-medium">Avg Cost</th>
            <th class="px-5 py-2.5 text-right font-medium">Price</th>
            <th class="px-5 py-2.5 text-right font-medium">Market Value</th>
            <th class="px-5 py-2.5 text-right font-medium">Unrealized P/L</th>
            <th class="px-5 py-2.5 text-right font-medium">% of Portfolio</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="pos in store.positions" :key="pos.id" class="hover:bg-slate-50">
            <td class="px-5 py-3">
              <router-link
                :to="{ name: 'research-overview', params: { symbol: pos.symbol } }"
                class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
              >
                {{ pos.symbol }}
              </router-link>
              <p class="text-xs text-slate-500">{{ pos.companyName }}</p>
            </td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.averageCostBasis) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.currentPrice) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.marketValue) }}</td>
            <td class="px-5 py-3 text-right tabular-nums" :class="gainClass(pos.unrealizedGainLoss)">
              {{ formatSignedCurrency(pos.unrealizedGainLoss) }}
              <span class="text-xs font-normal">({{ formatPercent(pos.percentageChange) }})</span>
            </td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(pos.percentOfPortfolio) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="px-5 py-6 text-sm text-slate-500">No open positions.</p>
  </div>
</template>
