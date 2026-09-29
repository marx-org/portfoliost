<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useRecentSearchesStore } from "@/stores/recentSearches"

withDefaults(defineProps<{ variant?: "bar" | "chips"; activeSymbol?: string }>(), {
  variant: "bar",
  activeSymbol: "",
})

const emit = defineEmits<{ (e: "select", symbol: string): void }>()

const recentSearches = useRecentSearchesStore()

const symbols = computed(() => recentSearches.symbols)

onMounted(() => {
  void recentSearches.load()
})

function onSelect(symbol: string) {
  emit("select", symbol)
}
</script>

<template>
  <div
    v-if="symbols.length"
    role="navigation"
    aria-label="Recent searches"
    :data-testid="`recent-searches-${variant}`"
    :class="variant === 'bar' ? 'flex items-center gap-1 overflow-x-auto' : 'flex flex-wrap gap-2'"
  >
    <button
      v-for="symbol in symbols"
      :key="symbol"
      type="button"
      :data-testid="`recent-search-${symbol}`"
      class="shrink-0"
      :class="[
        variant === 'bar'
          ? 'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800'
          : 'btn-secondary text-xs',
        variant === 'bar' && activeSymbol === symbol ? 'bg-slate-100 dark:bg-slate-800' : '',
      ]"
      @click="onSelect(symbol)"
    >
      <template v-if="variant === 'bar'">
        <!-- Deliberate exception to the "/api/logos only in TickerBadge" rule
             (docs/COMPONENTS.md): this bar is a dense symbol-only chip strip,
             and an identity block per chip would triple its height. §61.9. -->
        <img :src="`/api/logos/${symbol}`" :alt="symbol" class="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800" />
        <span class="text-[10px] font-medium text-slate-600 dark:text-slate-300">{{ symbol }}</span>
      </template>
      <template v-else>
        {{ symbol }}
      </template>
    </button>
  </div>
</template>
