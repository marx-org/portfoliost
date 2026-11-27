<script setup lang="ts">
import { ref, onMounted } from "vue"
import { fetchFxRates, type FxRateItem } from "@/api/admin"
import CurrencySelect from "@/components/CurrencySelect.vue"
import { useCurrenciesStore } from "@/stores/currencies"

const currenciesStore = useCurrenciesStore()
if (!currenciesStore.loaded) void currenciesStore.load()

const items = ref<FxRateItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const page = ref(1)
const totalPages = ref(1)
const sortBy = ref("date")
const sortDir = ref<"asc" | "desc">("desc")
const quoteCurrency = ref("")
const dateFrom = ref("")
const dateTo = ref("")

async function load() {
  try {
    loading.value = true
    const params: Record<string, string> = {
      page: String(page.value),
      per_page: "50",
      sort_by: sortBy.value,
      sort_dir: sortDir.value,
    }
    if (quoteCurrency.value) params.quote_currency = quoteCurrency.value
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value) params.date_to = dateTo.value
    const res = await fetchFxRates(params)
    items.value = res.items
    totalPages.value = res.pagination.total_pages
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load"
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

function resetFilters() {
  quoteCurrency.value = ""
  dateFrom.value = ""
  dateTo.value = ""
  page.value = 1
  load()
}

onMounted(load)

function toggleSort(col: string) {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortBy.value = col
    sortDir.value = "desc"
  }
  page.value = 1
  load()
}

function sortIcon(col: string) {
  if (sortBy.value !== col) return ""
  return sortDir.value === "asc" ? " ↑" : " ↓"
}

function prevPage() { if (page.value > 1) { page.value--; load() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; load() } }
</script>

<template>
  <div class="mission-control">
    <header class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> ADMIN / CURRENCY RATES</p>
        <h1 class="page-title">Currency Rates</h1>
      </div>
    </header>

    <div v-if="loading && !items.length" class="text-sm text-muted">Loading...</div>
    <div v-else-if="error" class="text-sm text-danger">{{ error }}</div>

    <div v-else>
      <div class="toolbar mb-4">
        <div>
          <label for="fx-base" class="label">Base currency</label>
          <div id="fx-base" class="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text">
            EUR <span class="text-xs text-muted">(fixed)</span>
          </div>
        </div>
        <div>
          <label for="fx-quote" class="label">Quote currency</label>
          <CurrencySelect
            v-model="quoteCurrency"
            :aria-label="'Quote currency'"
            testid="fx-quote"
            allow-empty
            empty-label="All currencies"
            class="input"
          />
        </div>
        <div>
          <label for="fx-date-from" class="label">From</label>
          <input id="fx-date-from" v-model="dateFrom" type="date" class="input w-40" data-testid="fx-date-from" />
        </div>
        <div>
          <label for="fx-date-to" class="label">To</label>
          <input id="fx-date-to" v-model="dateTo" type="date" class="input w-40" data-testid="fx-date-to" />
        </div>
        <button type="button" class="btn-primary text-sm" data-testid="fx-apply" @click="applyFilters">Apply</button>
        <button type="button" class="btn-secondary text-sm" data-testid="fx-reset" @click="resetFilters">Reset</button>
      </div>

      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-2">
            <tr>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('date')">
                Date{{ sortIcon("date") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('base_currency')">
                Base{{ sortIcon("base_currency") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-left font-medium text-muted" @click="toggleSort('quote_currency')">
                Quote{{ sortIcon("quote_currency") }}
              </th>
              <th class="cursor-pointer px-4 py-2 text-right font-medium text-muted" @click="toggleSort('rate')">
                Rate{{ sortIcon("rate") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(item, i) in items" :key="i" class="bg-surface">
              <td class="px-4 py-2 text-text">{{ item.date }}</td>
              <td class="px-4 py-2 text-text">{{ item.baseCurrency }}</td>
              <td class="px-4 py-2 text-text">{{ item.quoteCurrency }}</td>
              <td class="px-4 py-2 text-right text-text">{{ item.rate }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button class="btn-secondary text-sm" :disabled="page <= 1" @click="prevPage">Previous</button>
        <span class="text-sm text-muted">Page {{ page }} of {{ totalPages }}</span>
        <button class="btn-secondary text-sm" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>
