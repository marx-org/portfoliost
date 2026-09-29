<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useWatchlistsStore } from "@/stores/watchlists"
import type { Watchlist } from "@/api/watchlists"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"
import { useRoute } from "vue-router"
import TickerBadge from "@/components/TickerBadge.vue"
import { researchRoute } from "@/utils/research"

const store = useWatchlistsStore()
const route = useRoute()
const loading = ref(true)
const error = ref<string | null>(null)
const showCreate = ref(false)
const newName = ref("")
const newDescription = ref("")
const creating = ref(false)
const createError = ref<string | null>(null)

const addInputs = ref<Record<string, string>>({})
const adding = ref<Record<string, boolean>>({})
const itemErrors = ref<Record<string, string>>({})

onMounted(async () => {
  try {
    await store.fetchAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load watchlists"
  } finally {
    loading.value = false
  }
})

async function submitCreate() {
  if (!newName.value.trim()) return
  creating.value = true
  createError.value = null
  try {
    await store.create(newName.value.trim(), newDescription.value.trim() || undefined)
    newName.value = ""
    newDescription.value = ""
    showCreate.value = false
  } catch (err) {
    createError.value = err instanceof Error ? err.message : "Failed to create watchlist"
  } finally {
    creating.value = false
  }
}

async function submitItem(wl: Watchlist) {
  const symbol = addInputs.value[wl.id]?.trim().toUpperCase()
  if (!symbol) return
  adding.value[wl.id] = true
  itemErrors.value[wl.id] = ""
  try {
    await store.addItem(wl.id, symbol)
    addInputs.value[wl.id] = ""
  } catch (err) {
    itemErrors.value[wl.id] = err instanceof Error ? err.message : "Failed to add symbol"
  } finally {
    adding.value[wl.id] = false
  }
}

async function removeItem(wl: Watchlist, symbol: string) {
  itemErrors.value[wl.id] = ""
  try {
    await store.removeItem(wl.id, symbol)
  } catch (err) {
    itemErrors.value[wl.id] = err instanceof Error ? err.message : "Failed to remove symbol"
  }
}

async function deleteWatchlist(wl: Watchlist) {
  try {
    await store.remove(wl.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to delete watchlist"
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Watchlists</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ store.watchlists.length }} watchlist{{ store.watchlists.length === 1 ? "" : "s" }}</p>
        <p class="text-sm text-slate-400 dark:text-slate-500">Track symbols you don't own — prices, news and fundamentals in one place.</p>
      </div>
      <button type="button" class="btn-primary" @click="showCreate = true">New watchlist</button>
    </div>

    <InvestmentsTabs />

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading watchlists...</p>

    <div v-if="!loading && !error && store.watchlists.length" class="space-y-4">
      <div v-for="wl in store.watchlists" :key="wl.id" class="card p-5">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900 dark:text-slate-100">{{ wl.name }}</h2>
            <p v-if="wl.description" class="text-xs text-slate-500 dark:text-slate-400">{{ wl.description }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ wl.items.length }} item{{ wl.items.length === 1 ? "" : "s" }}</p>
          </div>
          <button type="button" class="btn-ghost text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" @click="deleteWatchlist(wl)">Delete</button>
        </div>

        <form class="mb-3 flex gap-2" @submit.prevent="submitItem(wl)">
          <input
            v-model="addInputs[wl.id]"
            type="text"
            class="input flex-1"
            :placeholder="`Add symbol to ${wl.name}...`"
            aria-label="Add symbol"
          />
          <button type="submit" class="btn-secondary" :disabled="adding[wl.id] || !addInputs[wl.id]?.trim()">
            {{ adding[wl.id] ? "Adding..." : "Add" }}
          </button>
        </form>
        <p v-if="itemErrors[wl.id]" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ itemErrors[wl.id] }}</p>

        <ul v-if="wl.items.length" class="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60">
          <li v-for="item in wl.items" :key="item.symbol" class="flex items-center gap-3 px-3 py-2">
            <!-- A watchlist item stores no country or asset class, so the
                 badge degrades to logo + ticker + name (§61.9). -->
            <router-link
              :to="researchRoute(item.symbol, route.fullPath)"
              class="min-w-0 flex-1 hover:opacity-80"
            >
              <TickerBadge :symbol="item.symbol" :name="item.name" />
            </router-link>
            <button type="button" class="btn-ghost px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" @click="removeItem(wl, item.symbol)">
              Remove
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">No items yet. Add a symbol above.</p>
      </div>
    </div>

    <div v-else-if="!loading && !error" class="card flex flex-col items-center gap-3 p-10 text-center">
      <p class="font-medium text-slate-900 dark:text-slate-100">No watchlists yet</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">Create a watchlist to track symbols you care about.</p>
      <button type="button" class="btn-primary" @click="showCreate = true">Create First Watchlist</button>
    </div>

    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="showCreate = false">
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Create watchlist">
        <h3 class="mb-4 text-base font-semibold">Create a watchlist</h3>
        <form @submit.prevent="submitCreate">
          <label for="watchlist-name" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Name</label>
          <input id="watchlist-name" v-model="newName" type="text" required class="input mb-4" placeholder="e.g. Tech leaders" />
          <label for="watchlist-description" class="mb-1 block text-sm text-slate-600 dark:text-slate-300">Description</label>
          <textarea id="watchlist-description" v-model="newDescription" rows="2" class="input mb-4" placeholder="Optional"></textarea>
          <p v-if="createError" class="mb-3 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creating || !newName.trim()">
              {{ creating ? "Creating..." : "Create" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
