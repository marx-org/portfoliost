<script setup lang="ts">
import { onMounted, ref } from "vue"
import {
  createListingOverride,
  disableListingOverride,
  fetchListingOverrideHistory,
  fetchListingOverrides,
  updateListingOverride,
  type ListingOverride,
  type ListingOverrideHistoryEntry,
} from "@/api/admin"

type OverrideForm = {
  ticker: string
  exchange: string
  quoteCurrency: string
  assetType: string
  status: "active" | "disabled"
  rationale: string
  provenance: string
}

const emptyForm = (): OverrideForm => ({
  ticker: "",
  exchange: "",
  quoteCurrency: "",
  assetType: "Stock",
  status: "active",
  rationale: "",
  provenance: "",
})

const items = ref<ListingOverride[]>([])
const history = ref<ListingOverrideHistoryEntry[]>([])
const form = ref<OverrideForm>(emptyForm())
const search = ref("")
const status = ref<"" | "active" | "disabled">("")
const editingKey = ref<string | null>(null)
const selectedKey = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const formError = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const params: Record<string, string> = { per_page: "100" }
    if (search.value.trim()) params.search = search.value.trim()
    if (status.value) params.status = status.value
    items.value = (await fetchListingOverrides(params)).items
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load listing overrides"
  } finally {
    loading.value = false
  }
}

function edit(item: ListingOverride) {
  editingKey.value = item.listingKey
  form.value = {
    ticker: item.ticker,
    exchange: item.exchange,
    quoteCurrency: item.quoteCurrency,
    assetType: item.assetType,
    status: item.status,
    rationale: item.rationale,
    provenance: item.provenance,
  }
  formError.value = null
}

function resetForm() {
  editingKey.value = null
  form.value = emptyForm()
  formError.value = null
}

async function save() {
  saving.value = true
  formError.value = null
  try {
    if (editingKey.value) await updateListingOverride(editingKey.value, form.value)
    else await createListingOverride(form.value)
    resetForm()
    await load()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "Failed to save override"
  } finally {
    saving.value = false
  }
}

async function disable(item: ListingOverride) {
  if (item.status === "disabled" || !window.confirm(`Disable ${item.listingKey}?`)) return
  try {
    await disableListingOverride(item.listingKey)
    await load()
    if (selectedKey.value === item.listingKey) await showHistory(item)
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to disable override"
  }
}

async function showHistory(item: ListingOverride) {
  selectedKey.value = item.listingKey
  try {
    history.value = (await fetchListingOverrideHistory(item.listingKey)).items
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load history"
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-5" data-testid="listing-overrides-view">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-slate-900 dark:text-slate-100">Curated Listing Overrides</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Reviewed venue facts take precedence without changing upstream reference rows.</p>
      </div>
      <button type="button" class="btn-secondary" data-testid="listing-overrides-new" @click="resetForm">New override</button>
    </div>

    <form class="card flex flex-wrap items-end gap-3 p-4" @submit.prevent="load">
      <div class="min-w-56 flex-1">
        <label for="listing-overrides-search" class="label">Search</label>
        <input id="listing-overrides-search" v-model="search" class="input" type="search" placeholder="Ticker or venue" data-testid="listing-overrides-search" />
      </div>
      <div>
        <label for="listing-overrides-status" class="label">Status</label>
        <select id="listing-overrides-status" v-model="status" class="input" data-testid="listing-overrides-status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <button type="submit" class="btn-primary" data-testid="listing-overrides-search-submit">Search</button>
    </form>

    <form class="card space-y-4 p-4" data-testid="listing-overrides-form" @submit.prevent="save">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">{{ editingKey ? `Edit ${editingKey}` : "Add override" }}</h3>
        <button v-if="editingKey" type="button" class="btn-ghost text-sm" @click="resetForm">Cancel edit</button>
      </div>
      <p v-if="formError" class="text-sm text-red-600 dark:text-red-400">{{ formError }}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><label for="override-ticker" class="label">Ticker</label><input id="override-ticker" v-model="form.ticker" class="input" required data-testid="override-ticker" /></div>
        <div><label for="override-exchange" class="label">Venue</label><input id="override-exchange" v-model="form.exchange" class="input" required data-testid="override-exchange" /></div>
        <div><label for="override-currency" class="label">Quote currency</label><input id="override-currency" v-model="form.quoteCurrency" class="input" maxlength="3" required data-testid="override-currency" /></div>
        <div><label for="override-asset-type" class="label">Asset type</label><input id="override-asset-type" v-model="form.assetType" class="input" required data-testid="override-asset-type" /></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label for="override-rationale" class="label">Rationale</label><textarea id="override-rationale" v-model="form.rationale" class="input min-h-20" required data-testid="override-rationale" /></div>
        <div><label for="override-provenance" class="label">Provenance</label><textarea id="override-provenance" v-model="form.provenance" class="input min-h-20" required data-testid="override-provenance" /></div>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button type="submit" class="btn-primary" :disabled="saving" data-testid="override-save">{{ saving ? "Saving..." : editingKey ? "Save changes" : "Add override" }}</button>
      </div>
    </form>

    <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    <div v-if="loading" class="card p-6 text-sm text-slate-500">Loading overrides...</div>
    <div v-else class="card overflow-x-auto">
      <table class="min-w-full text-sm" data-testid="listing-overrides-table">
        <thead class="bg-slate-50 text-left dark:bg-slate-800"><tr><th class="px-4 py-3">Listing</th><th class="px-4 py-3">Currency</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Source</th><th class="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.listingKey" class="border-t border-slate-200 dark:border-slate-700">
            <td class="px-4 py-3"><div class="font-mono font-semibold">{{ item.listingKey }}</div><div class="text-xs text-slate-500">{{ item.assetType }}</div></td>
            <td class="px-4 py-3">{{ item.quoteCurrency }}</td>
            <td class="px-4 py-3"><span :class="item.status === 'active' ? 'text-emerald-600' : 'text-slate-500'">{{ item.status }}</span></td>
            <td class="px-4 py-3"><div class="space-y-1 text-xs"><span class="mr-2 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{{ item.precedence }}</span><span v-if="item.upstreamPresent" class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">upstream row</span><span v-if="item.tickerConflict" class="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-red-700">ticker collision</span></div></td>
            <td class="px-4 py-3 text-right"><button type="button" class="btn-ghost mr-1 text-xs" @click="edit(item)">Edit</button><button type="button" class="btn-ghost mr-1 text-xs" @click="showHistory(item)">History</button><button type="button" class="btn-danger text-xs" :disabled="item.status === 'disabled'" @click="disable(item)">Disable</button></td>
          </tr>
          <tr v-if="items.length === 0"><td colspan="5" class="px-4 py-8 text-center text-slate-500">No overrides found.</td></tr>
        </tbody>
      </table>
    </div>

    <section v-if="selectedKey" class="card p-4" data-testid="listing-overrides-history">
      <div class="mb-3 flex items-center justify-between"><h3 class="font-semibold">History: {{ selectedKey }}</h3><button type="button" class="btn-ghost text-sm" @click="selectedKey = null">Close</button></div>
      <div v-if="history.length === 0" class="text-sm text-slate-500">No history entries.</div>
      <ul v-else class="space-y-2 text-sm"><li v-for="entry in history" :key="entry.id" class="border-t border-slate-200 pt-2 dark:border-slate-700"><strong>{{ entry.action }}</strong> by {{ entry.actor }} <span class="text-slate-500">{{ entry.createdAt }}</span><div class="text-xs text-slate-500">{{ JSON.stringify(entry.snapshot) }}</div></li></ul>
    </section>
  </div>
</template>
