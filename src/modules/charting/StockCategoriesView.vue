<script setup lang="ts">
/**
 * Charting → Stock categories (feature #253, sub-issue #258).
 *
 * The assignment editor: one fixed category per STOCK, shared across every
 * account that holds it. Options and other asset types are never listed (a
 * same-ticker option contract is not the equity), and an assignment is retained
 * when the stock is temporarily unheld. The category set is fixed — no
 * catalogue, no automatic yield/growth rules.
 */
import { computed, onMounted, ref, watch } from "vue"
import { getStockChartCategories, setStockChartCategory } from "@/api/charting"
import type { components } from "@/api/types"
import { getAllPositions } from "@/api/portfolios"
import { useChartScope } from "./useChartScope"

type Assignment = components["schemas"]["StockChartCategoryAssignment"]
type Category = components["schemas"]["StockChartCategory"]

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "high_yield", label: "High yield" },
  { value: "high_growth", label: "High growth" },
  { value: "very_high_growth", label: "Very high growth" },
  { value: "not_classified", label: "Not classified" },
]

const scope = useChartScope()
const assignments = ref<Assignment[]>([])
const positions = ref<Awaited<ReturnType<typeof getAllPositions>>>([])
const loading = ref(false)
const error = ref<string | null>(null)
const savingKey = ref<string | null>(null)

interface CategoryRow {
  symbol: string
  instrumentCurrency: string
  name: string | null
  category: Category
  updatedAt: string | null
}

const key = (symbol: string, currency: string) => `${symbol}|${currency}`

const byKey = computed(
  () => new Map(assignments.value.map((a) => [key(a.symbol, a.instrumentCurrency), a])),
)

/**
 * The held STOCK universe (deduped by symbol + currency) merged with stored
 * assignments. Assignments for stocks not currently held are kept at the end, so
 * an unheld stock keeps its category.
 */
const displayRows = computed<CategoryRow[]>(() => {
  const out = new Map<string, CategoryRow>()
  for (const p of positions.value) {
    if ((p.assetType ?? "").toUpperCase() !== "STOCK") continue
    const k = key(p.symbol, p.instrumentCurrency)
    if (out.has(k)) continue
    const a = byKey.value.get(k)
    out.set(k, {
      symbol: p.symbol,
      instrumentCurrency: p.instrumentCurrency,
      name: p.companyName ?? a?.name ?? null,
      category: a?.category ?? "not_classified",
      updatedAt: a?.updatedAt ?? null,
    })
  }
  for (const a of assignments.value) {
    const k = key(a.symbol, a.instrumentCurrency)
    if (out.has(k)) continue
    out.set(k, {
      symbol: a.symbol,
      instrumentCurrency: a.instrumentCurrency,
      name: a.name ?? null,
      category: a.category,
      updatedAt: a.updatedAt,
    })
  }
  return [...out.values()].sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.instrumentCurrency.localeCompare(b.instrumentCurrency),
  )
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [stored, held] = await Promise.all([
      getStockChartCategories(scope.scopeQuery.value),
      getAllPositions(),
    ])
    assignments.value = stored
    positions.value = held
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load stock categories"
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
watch(scope.scopeQuery, () => void load())

async function save(row: CategoryRow, category: Category) {
  const k = key(row.symbol, row.instrumentCurrency)
  savingKey.value = k
  error.value = null
  try {
    const updated = await setStockChartCategory({
      symbol: row.symbol,
      instrumentCurrency: row.instrumentCurrency,
      category,
    })
    assignments.value = [
      ...assignments.value.filter((a) => key(a.symbol, a.instrumentCurrency) !== k),
      updated,
    ]
  } catch (e) {
    // A rejected save must not leave the select showing the rejected value.
    error.value = e instanceof Error ? e.message : "Failed to save category"
    await load()
  } finally {
    savingKey.value = null
  }
}

function onChange(row: CategoryRow, event: Event) {
  void save(row, (event.target as HTMLSelectElement).value as Category)
}
</script>

<template>
  <div class="space-y-3" data-testid="charting-categories">
  <div class="page-header" data-testid="charting-categories">
    <div>
      <p class="page-eyebrow"><span class="signal-dot" /> CHARTING</p>
      <h1 class="page-title">Stock categories</h1>
    </div>
  </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted">
        One category per stock, shared across every account that holds it. Options are never classified as the equity.
      </p>
      <button type="button" class="btn-secondary text-xs" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="loading && !displayRows.length" class="text-sm text-muted">Loading…</p>
    <p v-else-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-else-if="!displayRows.length" class="text-sm text-muted">No stocks to classify for this scope.</p>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-muted">
          <th class="py-1">Symbol</th><th>Name</th><th>Currency</th><th>Category</th><th>Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in displayRows"
          :key="key(row.symbol, row.instrumentCurrency)"
          class="border-t border-border"
          :data-symbol="row.symbol"
          :data-currency="row.instrumentCurrency"
        >
          <td class="py-1 font-medium">{{ row.symbol }}</td>
          <td>{{ row.name ?? "—" }}</td>
          <td>{{ row.instrumentCurrency }}</td>
          <td>
            <select
              class="input py-1 text-xs"
              :data-testid="`category-select-${row.symbol}-${row.instrumentCurrency}`"
              :value="row.category"
              :disabled="savingKey === key(row.symbol, row.instrumentCurrency)"
              @change="onChange(row, $event)"
            >
              <option v-for="o in CATEGORY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </td>
          <td class="text-muted">{{ row.updatedAt ? row.updatedAt.slice(0, 10) : "—" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>