import { defineStore } from "pinia"
import { ref } from "vue"
import { getUserProfile, updateUserProfile } from "@/api/users"

const MAX_RECENT = 10

export const useRecentSearchesStore = defineStore("recentSearches", () => {
  const symbols = ref<string[]>([])
  const loaded = ref(false)
  let loadPromise: Promise<void> | null = null

  function load(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (loadPromise) return loadPromise
    loadPromise = getUserProfile()
      .then((profile) => {
        symbols.value = profile.recentSearches ?? []
        loaded.value = true
      })
      .finally(() => {
        loadPromise = null
      })
    return loadPromise
  }

  // Record a search as an LRU queue: the new symbol goes to the front, any
  // existing occurrence is removed, and the oldest symbol is dropped off the
  // end once the queue reaches MAX_RECENT. When revisiting an existing symbol
  // it is simply moved to the front.
  async function record(symbol: string): Promise<void> {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    await load()
    const current = symbols.value
    const next = [sym, ...current.filter((s) => s.toUpperCase() !== sym)].slice(0, MAX_RECENT)
    symbols.value = next
    try {
      await updateUserProfile({ recentSearches: next })
    } catch {
      // profile persistence is best-effort — keep local ordering on failure
    }
  }

  return { symbols, loaded, load, record }
})
