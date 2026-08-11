<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInvestorRelations } from "@/api/instruments"
import { formatDateTime } from "@/utils/format"

interface IrEvent {
  type: string
  id: string
  title: string
  date: string
  symbol: string
  year?: number
  quarter?: number
  audioUrl?: string
  url?: string
}

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const events = ref<IrEvent[]>([])
const error = ref<string | null>(null)
const loading = ref(true)
const filter = ref<"all" | "transcript" | "press-release">("all")

onMounted(async () => {
  try {
    events.value = (await getInvestorRelations(symbol)) as unknown as IrEvent[]
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load investor relations"
  } finally {
    loading.value = false
  }
})

const filtered = computed(() =>
  filter.value === "all" ? events.value : events.value.filter((e) => e.type === filter.value),
)

const types = computed(() => {
  const counts = new Map<string, number>()
  for (const e of events.value) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  return [...counts.entries()]
})

function setFilter(type: string) {
  if (type === "all" || type === "transcript" || type === "press-release") filter.value = type
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading investor relations...</p>

    <template v-if="!loading && !error">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary text-xs"
          :class="filter === 'all' ? 'bg-blue-600 text-white' : ''"
          @click="filter = 'all'"
        >
          All ({{ events.length }})
        </button>
        <button
          v-for="[type, count] in types"
          :key="type"
          type="button"
          class="btn-secondary text-xs"
          :class="filter === type ? 'bg-blue-600 text-white' : ''"
          @click="setFilter(type)"
        >
          {{ type }} ({{ count }})
        </button>
      </div>

      <ul v-if="filtered.length" class="space-y-2">
        <li v-for="event in filtered" :key="event.id" class="card flex items-center gap-4 p-4">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-slate-900">{{ event.title }}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ formatDateTime(event.date) }}
              <template v-if="event.year"> &middot; {{ event.year }}Q{{ event.quarter }}</template>
            </p>
          </div>
          <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{{ event.type }}</span>
          <a
            v-if="event.type === 'transcript' && event.audioUrl"
            :href="event.audioUrl"
            target="_blank"
            rel="noopener"
            class="btn-ghost shrink-0 text-xs"
          >
            Audio
          </a>
          <a v-else-if="event.url" :href="event.url" target="_blank" rel="noopener" class="btn-ghost shrink-0 text-xs">
            Open
          </a>
        </li>
      </ul>

      <p v-else class="text-sm text-slate-500">No events found.</p>
    </template>
  </div>
</template>
