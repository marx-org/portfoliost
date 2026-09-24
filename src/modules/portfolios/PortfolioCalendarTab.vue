<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioCalendar } from "@/api/portfolios"
import { formatAmount } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import type { components } from "../../../generated/api-types"

type CalendarHolding = components["schemas"]["CalendarHolding"]
type FlatEvent = {
  symbol?: string
  companyName?: string
  type: string
  date: string
  title?: string
  amount?: number | null
  quarter?: number | null
}

type EventType = "earnings" | "exDividend" | "dividend"
type FilterValue = "all" | EventType

interface Chip {
  symbol: string
  type: EventType
  date: string
  amount?: number
  currency?: string
}

interface DayCell {
  iso: string
  day: number
  inMonth: boolean
  isToday: boolean
  chips: Chip[]
}

const MAX_CHIPS_PER_DAY = 3

const route = useRoute()
const id = String(route.params.id)
const raw = ref<components["schemas"]["CalendarData"] | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())
const filter = ref<FilterValue>("all")

onMounted(async () => {
  try {
    raw.value = await getPortfolioCalendar(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load calendar"
  } finally {
    loading.value = false
  }
})

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

const todayIso = computed(
  () => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
)

const monthLabel = computed(
  () => new Date(viewYear.value, viewMonth.value, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
)

function fromHoldings(holdings: CalendarHolding[]): Chip[] {
  const out: Chip[] = []
  for (const h of holdings) {
    for (const e of h.earnings ?? []) {
      out.push({ symbol: h.symbol, type: "earnings", date: e.date, currency: h.currency })
    }
    for (const e of h.exDividend ?? []) {
      out.push({ symbol: h.symbol, type: "exDividend", date: e.date, amount: e.amount, currency: h.currency })
    }
    for (const e of h.dividend ?? []) {
      out.push({ symbol: h.symbol, type: "dividend", date: e.date, amount: e.amount, currency: h.currency })
    }
  }
  return out
}

/**
 * Flat-shape compat — the mock endpoint (and any flat consumer) returns
 * `upcoming`/`past` instead of `holdings`; group by symbol. The flat shape
 * carries no currency, so amounts are omitted on the chips.
 */
function fromFlat(upcoming: FlatEvent[] | undefined, past: FlatEvent[] | undefined): Chip[] {
  return [...(upcoming ?? []), ...(past ?? [])].flatMap((e) =>
    e.symbol && e.date
      ? [{ symbol: e.symbol, type: e.type as EventType, date: e.date, amount: e.amount ?? undefined }]
      : [],
  )
}

const chips = computed<Chip[]>(() => {
  if (!raw.value) return []
  if (raw.value.holdings) return fromHoldings(raw.value.holdings)
  return fromFlat(raw.value.upcoming, raw.value.past)
})

const filteredChips = computed(() =>
  filter.value === "all" ? chips.value : chips.value.filter((c) => c.type === filter.value),
)

const cells = computed<DayCell[]>(() => {
  const firstDow = new Date(viewYear.value, viewMonth.value, 1).getDay()
  const byDay = new Map<string, Chip[]>()
  for (const c of filteredChips.value) {
    const list = byDay.get(c.date) ?? []
    list.push(c)
    byDay.set(c.date, list)
  }
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(viewYear.value, viewMonth.value, 1 - firstDow + i)
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const inMonth = d.getMonth() === viewMonth.value
    return {
      iso,
      day: d.getDate(),
      inMonth,
      isToday: iso === todayIso.value,
      chips: inMonth ? (byDay.get(iso) ?? []) : [],
    }
  })
})

const monthHasEvents = computed(() => cells.value.some((c) => c.chips.length > 0))

function shiftMonth(delta: number): void {
  const d = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}

function goToday(): void {
  const d = new Date()
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}

function typeLabel(type: EventType): string {
  if (type === "earnings") return "Earnings"
  if (type === "exDividend") return "Ex-Div"
  return "Div"
}

function chipClass(type: EventType): string {
  if (type === "earnings") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
  if (type === "exDividend") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
  return "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
}

function chipText(c: Chip): string {
  if (c.currency && c.amount != null) return `${c.symbol} ${typeLabel(c.type)}: ${formatAmount(c.amount, c.currency)}`
  return `${c.symbol} ${typeLabel(c.type)}`
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading calendar...</p>

    <div v-if="!loading && !error" class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-slate-700/60 px-5 py-3">
        <h2 class="text-base font-semibold">Calendar</h2>
        <div class="flex items-center gap-1">
          <button type="button" class="btn-ghost px-2" data-testid="pf-cal-prev-month" aria-label="Previous month" @click="shiftMonth(-1)">‹</button>
          <span class="min-w-32 text-center text-sm font-medium text-slate-700 dark:text-slate-200" data-testid="pf-cal-month">{{ monthLabel }}</span>
          <button type="button" class="btn-ghost px-2" data-testid="pf-cal-next-month" aria-label="Next month" @click="shiftMonth(1)">›</button>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <select v-model="filter" class="input w-40" data-testid="pf-cal-filter" aria-label="Event type">
            <option value="all">All events</option>
            <option value="earnings">Earnings</option>
            <option value="exDividend">Ex-Dividend</option>
            <option value="dividend">Dividend payment</option>
          </select>
          <button type="button" class="btn-secondary" data-testid="pf-cal-today" @click="goToday">Today</button>
        </div>
      </div>

      <div class="p-5">
        <div data-testid="pf-cal-grid" class="grid grid-cols-7 gap-1">
          <div
            v-for="dow in ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']"
            :key="dow"
            class="pb-1 text-center text-xs font-medium uppercase text-slate-500 dark:text-slate-400"
          >
            {{ dow }}
          </div>
          <div
            v-for="cell in cells"
            :key="cell.iso"
            data-testid="pf-cal-day"
            class="min-h-16 rounded-lg border border-slate-100 dark:border-slate-800 p-1"
          >
            <span
              class="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums"
              :class="[
                cell.inMonth
                  ? 'text-slate-700 dark:text-slate-200'
                  : 'text-slate-300 dark:text-slate-600',
                cell.isToday ? 'bg-blue-600 font-semibold text-white' : '',
              ]"
            >
              {{ cell.day }}
            </span>
            <div class="space-y-0.5">
              <router-link
                v-for="(chip, i) in cell.chips.slice(0, MAX_CHIPS_PER_DAY)"
                :key="`${chip.symbol}-${chip.type}-${i}`"
                :to="{ name: 'research-overview', params: { symbol: researchSymbol(chip.symbol) } }"
                class="block truncate rounded px-1 py-0.5 text-xs font-medium tabular-nums hover:underline"
                :class="chipClass(chip.type)"
              >
                {{ chipText(chip) }}
              </router-link>
              <span
                v-if="cell.chips.length > MAX_CHIPS_PER_DAY"
                class="block px-1 text-xs text-slate-400 dark:text-slate-500"
              >
                +{{ cell.chips.length - MAX_CHIPS_PER_DAY }} more
              </span>
            </div>
          </div>
        </div>
        <p v-if="!monthHasEvents" class="mt-3 text-sm text-slate-500 dark:text-slate-400">No events in this month.</p>
      </div>
    </div>
  </div>
</template>
