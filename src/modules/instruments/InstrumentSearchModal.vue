<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useInstrumentsStore } from "@/stores/instruments"
import { useRecentSearchesStore } from "@/stores/recentSearches"
import RecentSearchesBar from "@/modules/instruments/RecentSearchesBar.vue"
import { researchRoute } from "@/utils/research"

const props = withDefaults(defineProps<{ open: boolean; mode?: "navigate" | "add"; title?: string }>(), {
  mode: "navigate",
  title: "Search for Instruments",
})
const emit = defineEmits<{ (e: "close"): void; (e: "add", symbol: string, name: string): void }>()

const store = useInstrumentsStore()
const recentSearches = useRecentSearchesStore()
const route = useRoute()
const router = useRouter()
const query = ref("")

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(query, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    // Single-letter queries match thousands of instruments (SEC universe) —
    // rendering them all OOMs browsers. Require 2+ chars.
    if (value.trim().length >= 2) {
      void store.search(value.trim())
    } else {
      store.resetSearch()
    }
  }, 250)
})

// Rendering thousands of rows (each with a logo request) crashes browsers —
// show a bounded slice and ask the user to refine instead.
const MAX_RENDERED = 50
const renderedResults = computed(() => store.searchResults.slice(0, MAX_RENDERED))
const hiddenCount = computed(() => Math.max(0, store.searchResults.length - MAX_RENDERED))

function openResult(symbol: string, name = "") {
  void recentSearches.record(symbol)
  emit("close")
  if (props.mode === "add") {
    emit("add", symbol, name)
    return
  }
  router.push(researchRoute(symbol, route.fullPath))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close")
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="emit('close')"
      @keydown.esc="onKeydown"
    >
      <div class="card w-full max-w-lg overflow-hidden" role="dialog" aria-modal="true" aria-label="Search for Instruments">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 px-4 py-3">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="emit('close')">✕</button>
        </div>

        <div class="p-4">
          <input
            v-model="query"
            type="text"
            class="input"
            placeholder="Search stocks, ETFs, crypto, or paste an ISIN..."
            data-testid="instrument-search"
          />

          <div v-if="query.trim().length < 1" class="mt-4">
            <p class="text-sm text-slate-500 dark:text-slate-400">Recent searches</p>
            <RecentSearchesBar variant="chips" class="mt-2" @select="openResult" />
          </div>

          <div v-else-if="store.searching" class="mt-4 text-sm text-slate-500 dark:text-slate-400">Searching...</div>

          <div v-else-if="store.searchError" class="mt-4 text-sm text-red-600 dark:text-red-400">{{ store.searchError }}</div>

          <ul v-else-if="store.searchResults.length" class="mt-2 max-h-72 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
            <li v-for="result in renderedResults" :key="result.symbol">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                @click="openResult(result.symbol, result.name)"
              >
                <img loading="lazy" :src="`/api/logos/${result.symbol}`" alt="" class="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                <span class="flex-1">
                  <span class="block text-sm font-medium text-slate-900 dark:text-slate-100">{{ result.symbol }}</span>
                  <span class="block text-xs text-slate-500 dark:text-slate-400">{{ result.name }}</span>
                  <span v-if="result.exchange || result.countryCode" class="block text-[10px] text-slate-400 dark:text-slate-500">
                    {{ result.exchange }}<template v-if="result.exchange && result.countryCode"> · </template>{{ result.countryCode }}
                  </span>
                </span>
                <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
                  {{ result.type }}
                </span>
              </button>
            </li>
          </ul>
          <p v-if="hiddenCount > 0" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Showing first {{ renderedResults.length }} of {{ store.searchResults.length }} results — refine your search to narrow it down.
          </p>

          <p v-if="!store.searchResults.length && !store.searching && !store.searchError" class="mt-4 text-sm text-slate-500 dark:text-slate-400">
            No results
          </p>

        </div>
      </div>
    </div>
  </Teleport>
</template>
