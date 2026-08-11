import { defineStore } from "pinia"
import { ref } from "vue"
import * as instrumentsApi from "@/api/instruments"
import type { InstrumentSearchResponse } from "@/api/instruments"

export const useInstrumentsStore = defineStore("instruments", () => {
  const searchResults = ref<InstrumentSearchResponse["results"]>([])
  const searching = ref(false)
  const searchError = ref<string | null>(null)

  async function search(query: string): Promise<void> {
    searching.value = true
    searchError.value = null
    try {
      const res = await instrumentsApi.searchInstruments(query)
      searchResults.value = res.results
    } catch (err) {
      searchError.value = err instanceof Error ? err.message : "Search failed"
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }

  function resetSearch(): void {
    searchResults.value = []
    searchError.value = null
    searching.value = false
  }

  return { searchResults, searching, searchError, search, resetSearch }
})
