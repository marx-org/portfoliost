<script setup lang="ts">
import { ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useInstrumentsStore } from "@/stores/instruments"
import { researchSymbol } from "@/utils/research"

const props = withDefaults(defineProps<{ open: boolean; mode?: "navigate" | "add"; title?: string }>(), {
  mode: "navigate",
  title: "Search for Instruments",
})
const emit = defineEmits<{ (e: "close"): void; (e: "add", symbol: string, name: string): void }>()

const store = useInstrumentsStore()
const router = useRouter()
const query = ref("")

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ""
      store.resetSearch()
    }
  },
)

watch(query, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (value.trim().length >= 1) {
      void store.search(value.trim())
    } else {
      store.resetSearch()
    }
  }, 250)
})

const popular = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "SPY", "QQQ"]

function openResult(symbol: string, name = "") {
  emit("close")
  if (props.mode === "add") {
    emit("add", symbol, name)
    return
  }
  router.push({ name: "research-overview", params: { symbol: researchSymbol(symbol) } })
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
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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
            <p class="text-sm text-slate-500">Popular searches</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="symbol in popular"
                :key="symbol"
                type="button"
                class="btn-secondary text-xs"
                @click="openResult(symbol)"
              >
                {{ symbol }}
              </button>
            </div>
          </div>

          <div v-else-if="store.searching" class="mt-4 text-sm text-slate-500">Searching...</div>

          <div v-else-if="store.searchError" class="mt-4 text-sm text-red-600">{{ store.searchError }}</div>

          <ul v-else-if="store.searchResults.length" class="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">
            <li v-for="result in store.searchResults" :key="result.symbol">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-slate-50"
                @click="openResult(result.symbol, result.name)"
              >
                <img :src="`/api/logos/${result.symbol}`" alt="" class="h-8 w-8 rounded-full bg-slate-100" />
                <span class="flex-1">
                  <span class="block text-sm font-medium text-slate-900">{{ result.symbol }}</span>
                  <span class="block text-xs text-slate-500">{{ result.name }}</span>
                </span>
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                  {{ result.type }}
                </span>
              </button>
            </li>
          </ul>

          <p v-else class="mt-4 text-sm text-slate-500">No results</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
