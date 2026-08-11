<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useWatchlistsStore } from "@/stores/watchlists"
import type { Watchlist } from "@/api/watchlists"

const store = useWatchlistsStore()
const loading = ref(true)
const error = ref<string | null>(null)
const showCreate = ref(false)
const newName = ref("")
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
    await store.create(newName.value.trim())
    newName.value = ""
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
        <p class="text-sm text-slate-500">{{ store.watchlists.length }} watchlist{{ store.watchlists.length === 1 ? "" : "s" }}</p>
      </div>
      <button type="button" class="btn-primary" @click="showCreate = true">New watchlist</button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading watchlists...</p>

    <div v-if="!loading && !error && store.watchlists.length" class="space-y-4">
      <div v-for="wl in store.watchlists" :key="wl.id" class="card p-5">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900">{{ wl.name }}</h2>
            <p class="text-xs text-slate-500">{{ wl.items.length }} item{{ wl.items.length === 1 ? "" : "s" }}</p>
          </div>
          <button type="button" class="btn-ghost text-xs text-red-600 hover:bg-red-50" @click="deleteWatchlist(wl)">Delete</button>
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
        <p v-if="itemErrors[wl.id]" class="mb-3 text-sm text-red-600">{{ itemErrors[wl.id] }}</p>

        <ul v-if="wl.items.length" class="divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li v-for="item in wl.items" :key="item.symbol" class="flex items-center gap-3 px-3 py-2">
            <router-link
              :to="{ name: 'research-overview', params: { symbol: item.symbol } }"
              class="flex-1 text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline"
            >
              {{ item.symbol }}
            </router-link>
            <span class="flex-1 text-xs text-slate-500">{{ item.name }}</span>
            <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">{{ item.type }}</span>
            <button type="button" class="btn-ghost px-2 py-0.5 text-xs text-slate-500 hover:text-red-600" @click="removeItem(wl, item.symbol)">
              Remove
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500">No items yet. Add a symbol above.</p>
      </div>
    </div>

    <div v-else-if="!loading && !error" class="card flex flex-col items-center gap-3 p-10 text-center">
      <p class="font-medium text-slate-900">No watchlists yet</p>
      <p class="text-sm text-slate-500">Create a watchlist to track symbols you care about.</p>
      <button type="button" class="btn-primary" @click="showCreate = true">New watchlist</button>
    </div>

    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" @click.self="showCreate = false">
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Create watchlist">
        <h3 class="mb-4 text-base font-semibold">Create a watchlist</h3>
        <form @submit.prevent="submitCreate">
          <label for="watchlist-name" class="mb-1 block text-sm text-slate-600">Name</label>
          <input id="watchlist-name" v-model="newName" type="text" required class="input mb-4" placeholder="e.g. Tech leaders" />
          <p v-if="createError" class="mb-3 text-sm text-red-600">{{ createError }}</p>
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
