import { defineStore } from "pinia"
import { ref } from "vue"
import * as watchlistsApi from "@/api/watchlists"
import type { Watchlist } from "@/api/watchlists"

export const useWatchlistsStore = defineStore("watchlists", () => {
  const watchlists = ref<Watchlist[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      watchlists.value = await watchlistsApi.getWatchlists()
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load watchlists"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function create(name: string): Promise<void> {
    const created = await watchlistsApi.createWatchlist(name)
    watchlists.value.push(created)
  }

  async function remove(id: string): Promise<void> {
    await watchlistsApi.deleteWatchlist(id)
    watchlists.value = watchlists.value.filter((w) => w.id !== id)
  }

  async function addItem(id: string, symbol: string): Promise<void> {
    const updated = await watchlistsApi.addWatchlistItem(id, symbol)
    const idx = watchlists.value.findIndex((w) => w.id === id)
    if (idx >= 0) watchlists.value[idx] = updated
  }

  async function removeItem(id: string, symbol: string): Promise<void> {
    const updated = await watchlistsApi.removeWatchlistItem(id, symbol)
    const idx = watchlists.value.findIndex((w) => w.id === id)
    if (idx >= 0) watchlists.value[idx] = updated
  }

  return { watchlists, loading, error, fetchAll, create, remove, addItem, removeItem }
})
