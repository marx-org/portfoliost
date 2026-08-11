<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import {
  createPortfolioTransaction,
  removePortfolioPosition,
  updatePortfolioPosition,
} from "@/api/portfolios"
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/utils/format"
import type { PortfolioPositions } from "@/api/types"

type Position = PortfolioPositions[number]

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const id = String(route.params.id)

const openMenuId = ref<string | null>(null)
const notice = ref<string | null>(null)

type ActionKind = "buy" | "sell" | "dividend" | "edit"
const action = ref<{ kind: ActionKind; position: Position } | null>(null)
const form = ref({ quantity: "", price: "", avgCost: "" })
const saving = ref(false)
const actionError = ref<string | null>(null)

onMounted(() => store.fetchPositions(id))

const positions = computed(() => store.positions.filter((p) => p.isOpen))

const totalValue = computed(() => positions.value.reduce((s, p) => s + (p.marketValue || 0), 0))
const totalUnrealized = computed(() => positions.value.reduce((s, p) => s + (p.unrealizedGainLoss || 0), 0))

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

function assetLabel(pos: Position): string {
  const kind = pos.assetType ? pos.assetType.charAt(0) + pos.assetType.slice(1).toLowerCase() : "Stock"
  return `(${pos.country || "US"}) ${kind}`
}

function openAction(kind: ActionKind, position: Position): void {
  openMenuId.value = null
  action.value = { kind, position }
  form.value = {
    quantity: String(position.quantity),
    price: String(position.currentPrice ?? ""),
    avgCost: String(position.averageCostBasis ?? ""),
  }
  actionError.value = null
}

function dialogTitle(): string {
  if (!action.value) return ""
  const map: Record<ActionKind, string> = {
    buy: `Buy ${action.value.position.symbol}`,
    sell: `Sell ${action.value.position.symbol}`,
    dividend: `Dividend for ${action.value.position.symbol}`,
    edit: `Edit ${action.value.position.symbol}`,
  }
  return map[action.value.kind]
}

async function submitAction(): Promise<void> {
  if (!action.value) return
  saving.value = true
  actionError.value = null
  const { kind, position } = action.value
  const quantity = Number(form.value.quantity)
  const price = Number(form.value.price)
  try {
    if (kind === "buy") {
      await createPortfolioTransaction(id, { type: "BUY", symbol: position.symbol, quantity, price })
      const newQty = (position.quantity || 0) + quantity
      const newAvg = ((position.quantity || 0) * (position.averageCostBasis || 0) + quantity * price) / newQty
      await updatePortfolioPosition(id, position.id, {
        quantity: newQty,
        averageCostBasis: newAvg,
        avgCostBasis: newAvg,
        instrumentAvgCostBasis: newAvg,
      })
      notice.value = `Bought ${quantity} ${position.symbol}`
    } else if (kind === "sell") {
      await createPortfolioTransaction(id, { type: "SELL", symbol: position.symbol, quantity, price })
      const remaining = (position.quantity || 0) - quantity
      if (remaining <= 0) {
        await removePortfolioPosition(id, position.id)
      } else {
        await updatePortfolioPosition(id, position.id, { quantity: remaining })
      }
      notice.value = `Sold ${quantity} ${position.symbol}`
    } else if (kind === "dividend") {
      await createPortfolioTransaction(id, {
        type: "DIVIDEND",
        symbol: position.symbol,
        quantity: position.quantity || 1,
        price,
      })
      notice.value = `Recorded dividend for ${position.symbol}`
    } else {
      await updatePortfolioPosition(id, position.id, {
        quantity,
        averageCostBasis: Number(form.value.avgCost),
        avgCostBasis: Number(form.value.avgCost),
        instrumentAvgCostBasis: Number(form.value.avgCost),
      })
      notice.value = `Updated ${position.symbol}`
    }
    await store.fetchPositions(id)
    action.value = null
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "Action failed"
  } finally {
    saving.value = false
  }
}

async function removePosition(position: Position): Promise<void> {
  openMenuId.value = null
  try {
    await removePortfolioPosition(id, position.id)
    await store.fetchPositions(id)
    notice.value = `Removed ${position.symbol}`
  } catch (err) {
    notice.value = err instanceof Error ? err.message : "Failed to remove position"
  }
}

function goResearch(position: Position): void {
  openMenuId.value = null
  router.push({ name: "research-overview", params: { symbol: position.symbol } })
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
      <h2 class="text-base font-semibold">Positions</h2>
      <span class="text-sm text-slate-500">{{ positions.length }} open</span>
    </div>

    <p v-if="notice" class="border-b border-slate-100 bg-green-50 px-5 py-2 text-sm text-green-700">{{ notice }}</p>

    <div v-if="positions.length" class="overflow-x-auto">
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
            <th class="px-5 py-2.5"><span class="sr-only">Position actions</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="pos in positions" :key="pos.id" class="hover:bg-slate-50">
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <img :src="`/api/logos/${pos.symbol}`" :alt="pos.symbol" class="h-8 w-8 rounded-full bg-slate-100" />
                <div>
                  <router-link
                    :to="{ name: 'research-overview', params: { symbol: pos.symbol } }"
                    class="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                  >
                    {{ pos.symbol }}
                  </router-link>
                  <p class="text-xs text-slate-500">{{ pos.companyName }}</p>
                  <p class="text-[11px] text-slate-400">{{ assetLabel(pos) }}</p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatNumber(pos.quantity, 0) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.averageCostBasis) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(pos.currentPrice) }}</td>
            <td class="px-5 py-3 text-right tabular-nums">
              <p>{{ formatCurrency(pos.marketValue) }}</p>
              <p class="text-xs text-slate-400">Cost {{ formatCurrency(pos.totalCostBasis) }}</p>
            </td>
            <td class="px-5 py-3 text-right tabular-nums" :class="gainClass(pos.unrealizedGainLoss)">
              <p>{{ formatSignedCurrency(pos.unrealizedGainLoss) }}</p>
              <p class="text-xs font-normal" :class="gainClass(pos.percentageChange)">({{ formatPercent(pos.percentageChange) }})</p>
            </td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatPercent(pos.percentOfPortfolio) }}</td>
            <td class="px-5 py-3 text-right">
              <div class="relative inline-block">
                <button
                  type="button"
                  aria-label="Position actions"
                  class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  @click="openMenuId = openMenuId === pos.id ? null : pos.id"
                >
                  <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.4" />
                    <circle cx="8" cy="8" r="1.4" />
                    <circle cx="8" cy="13" r="1.4" />
                  </svg>
                </button>
                <template v-if="openMenuId === pos.id">
                  <div class="fixed inset-0 z-20" @click="openMenuId = null"></div>
                  <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openAction('buy', pos)">Buy</button>
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openAction('sell', pos)">Sell</button>
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openAction('dividend', pos)">Dividend</button>
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="openAction('edit', pos)">Edit position</button>
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" @click="goResearch(pos)">Research</button>
                    <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50" @click="removePosition(pos)">Remove position</button>
                  </div>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-slate-200 bg-slate-50 font-medium">
            <td class="px-5 py-3">Total</td>
            <td class="px-5 py-3"></td>
            <td class="px-5 py-3"></td>
            <td class="px-5 py-3"></td>
            <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(totalValue) }}</td>
            <td class="px-5 py-3 text-right tabular-nums" :class="gainClass(totalUnrealized)">{{ formatSignedCurrency(totalUnrealized) }}</td>
            <td class="px-5 py-3"></td>
            <td class="px-5 py-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-else class="px-5 py-6 text-sm text-slate-500">No open positions.</p>

    <div
      v-if="action"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="action = null"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="dialogTitle()">
        <h3 class="mb-4 text-base font-semibold">{{ dialogTitle() }}</h3>
        <form @submit.prevent="submitAction">
          <label v-if="action.kind !== 'dividend'" for="pos-qty" class="mb-1 block text-sm text-slate-600">Quantity</label>
          <input
            v-if="action.kind !== 'dividend'"
            id="pos-qty"
            v-model="form.quantity"
            type="number"
            min="0.000001"
            step="any"
            required
            class="input mb-4"
            data-testid="action-quantity"
          />
          <label v-if="action.kind === 'edit'" for="pos-avg" class="mb-1 block text-sm text-slate-600">Average cost basis</label>
          <input
            v-if="action.kind === 'edit'"
            id="pos-avg"
            v-model="form.avgCost"
            type="number"
            min="0"
            step="any"
            required
            class="input mb-4"
            data-testid="action-avg-cost"
          />
          <label
            :for="action.kind === 'dividend' ? 'pos-amount' : 'pos-price'"
            class="mb-1 block text-sm text-slate-600"
          >
            {{ action.kind === 'dividend' ? `Amount per share (${action.position.quantity} shares)` : 'Price' }}
          </label>
          <input
            :id="action.kind === 'dividend' ? 'pos-amount' : 'pos-price'"
            v-model="form.price"
            type="number"
            min="0"
            step="any"
            required
            class="input mb-4"
            data-testid="action-price"
          />
          <p v-if="actionError" class="mb-3 text-sm text-red-600">{{ actionError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="action = null">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? "Saving..." : "Confirm" }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
