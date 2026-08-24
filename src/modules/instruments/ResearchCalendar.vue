<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getInstrumentCalendar } from "@/api/instruments"
import type { components } from "@/api/types"
import { formatCurrency } from "@/utils/format"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const data = ref<components["schemas"]["CalendarData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    data.value = await getInstrumentCalendar(symbol)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load calendar"
  } finally {
    loading.value = false
  }
})

const today = new Date().setHours(0, 0, 0, 0)

const earnings = computed(() => data.value?.earnings ?? [])
const exDividend = computed(() => data.value?.exDividend ?? [])
const dividends = computed(() => data.value?.dividend ?? [])

const isUpcoming = (d: string) => new Date(`${d}T00:00:00`).getTime() >= today

const upcomingEarnings = computed(() => earnings.value.filter((e) => isUpcoming(e.date)))
const pastEarnings = computed(() => earnings.value.filter((e) => !isUpcoming(e.date)))
const upcomingEx = computed(() => exDividend.value.filter((e) => isUpcoming(e.date)))
const upcomingDivs = computed(() => dividends.value.filter((e) => isUpcoming(e.date)))

function dateLabel(d: string): string {
  const parts = d.split("-").map((p, i) => (i > 0 ? p.padStart(2, "0") : p))
  const dt = new Date(`${parts.join("-")}T00:00:00`)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading calendar...</p>

    <template v-if="!loading && !error && data">
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div class="card p-6">
          <h2 class="mb-3 text-base font-semibold">Upcoming Earnings</h2>
          <ul v-if="upcomingEarnings.length" class="space-y-2 text-sm">
            <li v-for="e in upcomingEarnings" :key="e.date" class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <div>
                <p class="font-medium">{{ e.title ?? `Q${e.quarter} ${e.year} Earnings Call` }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ dateLabel(e.date) }}</p>
              </div>
              <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">Q{{ e.quarter }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No upcoming earnings.</p>
        </div>

        <div class="card p-6">
          <h2 class="mb-3 text-base font-semibold">Upcoming Ex-Dividend</h2>
          <ul v-if="upcomingEx.length" class="space-y-2 text-sm">
            <li v-for="e in upcomingEx" :key="e.date" class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <div>
                <p class="font-medium">{{ e.title ?? "Ex-Dividend" }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ dateLabel(e.date) }}</p>
              </div>
              <span class="font-semibold text-green-700 dark:text-green-400">{{ formatCurrency(e.amount) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No upcoming ex-dividend dates.</p>
        </div>

        <div class="card p-6">
          <h2 class="mb-3 text-base font-semibold">Upcoming Dividend</h2>
          <ul v-if="upcomingDivs.length" class="space-y-2 text-sm">
            <li v-for="e in upcomingDivs" :key="e.date" class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <div>
                <p class="font-medium">{{ e.title ?? "Dividend" }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ dateLabel(e.date) }}</p>
              </div>
              <span class="font-semibold text-green-700 dark:text-green-400">{{ formatCurrency(e.amount) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No upcoming dividend dates.</p>
        </div>
      </div>

      <div v-if="pastEarnings.length" class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Past Earnings</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3">Event</th>
                <th class="py-2 pr-3 text-right">Quarter</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in pastEarnings" :key="e.date" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-3">{{ dateLabel(e.date) }}</td>
                <td class="py-2 pr-3">{{ e.title ?? `Q${e.quarter} ${e.year} Earnings Call` }}</td>
                <td class="py-2 pr-3 text-right">Q{{ e.quarter }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
