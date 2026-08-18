<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioCalendar } from "@/api/portfolios"
import { formatCurrency } from "@/utils/format"
import { researchSymbol } from "@/utils/research"

const route = useRoute()
const id = String(route.params.id)
const upcoming = ref<Array<{ symbol?: string; companyName?: string; type: string; date: string; title?: string; amount?: number | null; quarter?: number | null }>>([])
const past = ref<Array<{ symbol?: string; companyName?: string; type: string; date: string; title?: string; amount?: number | null; quarter?: number | null }>>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await getPortfolioCalendar(id)
    upcoming.value = res.upcoming ?? []
    past.value = res.past ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load calendar"
  } finally {
    loading.value = false
  }
})

function badgeClass(type: string): string {
  if (type === "earnings") return "bg-blue-50 text-blue-700"
  if (type === "exDividend") return "bg-amber-50 text-amber-700"
  return "bg-green-50 text-green-700"
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading calendar...</p>

    <template v-if="!loading && !error">
      <div class="card overflow-hidden">
        <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
          <h2 class="text-base font-semibold">Upcoming Events</h2>
        </div>
        <div v-if="upcoming.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <th class="px-5 py-2.5 font-medium">Date</th>
                <th class="px-5 py-2.5 font-medium">Symbol</th>
                <th class="px-5 py-2.5 font-medium">Event</th>
                <th class="px-5 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="e in upcoming" :key="`${e.symbol}-${e.date}-${e.type}`" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 whitespace-nowrap">{{ e.date }}</td>
                <td class="px-5 py-3">
                  <router-link
                    :to="{ name: 'research-overview', params: { symbol: researchSymbol(e.symbol ?? '') } }"
                    class="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                  >
                    {{ e.symbol }}
                  </router-link>
                </td>
                <td class="px-5 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="badgeClass(e.type)">{{ e.type }}</span>
                  <span class="ml-2 text-slate-600 dark:text-slate-300">{{ e.title }}</span>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ e.amount != null ? formatCurrency(e.amount) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No upcoming events.</p>
      </div>

      <div class="card overflow-hidden">
        <div class="border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
          <h2 class="text-base font-semibold">Recent Events</h2>
        </div>
        <div v-if="past.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="e in past" :key="`${e.symbol}-${e.date}-${e.type}`" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-5 py-3 whitespace-nowrap">{{ e.date }}</td>
                <td class="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{{ e.symbol }}</td>
                <td class="px-5 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium capitalize" :class="badgeClass(e.type)">{{ e.type }}</span>
                  <span class="ml-2 text-slate-600 dark:text-slate-300">{{ e.title }}</span>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ e.amount != null ? formatCurrency(e.amount) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No recent events.</p>
      </div>
    </template>
  </div>
</template>
