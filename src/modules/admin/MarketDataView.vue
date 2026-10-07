<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { researchRoute } from "@/utils/research"
import TickerBadge from "@/components/TickerBadge.vue"
import {
  fetchStooqImportLog,
  fetchSplitCandidates,
  fetchOverflowSummary,
  applySplitCandidate,
  dismissSplitCandidate,
  type SplitCandidate,
  type OverflowSummary,
} from "@/api/admin"

interface StooqLogEntry {
  dataset: string
  latestDate: string | null
  importedAt: string | null
  rowsDeleted: number | null
}

const importLog = ref<Array<{ dataset: string; latestDate?: string | null; importedAt?: string | null; rowsDeleted?: number | null }>>([])
const splitCandidates = ref<SplitCandidate[]>([])
const overflow = ref<OverflowSummary | null>(null)
const route = useRoute()
const loading = ref(true)
const error = ref<string | null>(null)

const applyFactor = ref<Record<string, string>>({})
const applyDate = ref<Record<string, string>>({})
const actionBusy = ref<Record<string, boolean>>({})
const actionResult = ref<Record<string, string>>({})

function setCandidateDates(candidates: SplitCandidate[]) {
  for (const candidate of candidates) {
    if (candidate.effectiveDate) applyDate.value[candidateKey(candidate)] = candidate.effectiveDate
  }
}

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const [log, candidates, ov] = await Promise.all([
      fetchStooqImportLog().catch(() => [] as StooqLogEntry[]),
      fetchSplitCandidates().catch(() => [] as SplitCandidate[]),
      fetchOverflowSummary().catch(() => null),
    ])
    importLog.value = log
    splitCandidates.value = candidates
    setCandidateDates(candidates)
    overflow.value = ov
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load market data"
  } finally {
    loading.value = false
  }
})

function candidateKey(c: SplitCandidate) {
  return `${c.symbol}:${c.effectiveDate ?? c.detectedAt}`
}

function providerRatio(c: SplitCandidate) {
  if (!c.providerNumerator || !c.providerDenominator) return null
  return `${c.providerNumerator}:${c.providerDenominator}`
}

async function apply(c: SplitCandidate) {
  const key = candidateKey(c)
  const f = Number(applyFactor.value[key] ?? c.providerFactor)
  const effectiveDate = applyDate.value[key] ?? c.effectiveDate
  if (!effectiveDate) {
    actionResult.value[key] = "Effective date required"
    return
  }
  if (!Number.isFinite(f) || f <= 0) {
    actionResult.value[key] = "Invalid quantity factor"
    return
  }
  actionBusy.value[key] = true
  try {
    await applySplitCandidate(c.symbol, f, effectiveDate)
    actionResult.value[key] = "Applied"
    splitCandidates.value = await fetchSplitCandidates()
    setCandidateDates(splitCandidates.value)
  } catch {
    actionResult.value[key] = "Error"
  } finally {
    actionBusy.value[key] = false
  }
}

async function dismiss(c: SplitCandidate) {
  const key = candidateKey(c)
  actionBusy.value[key] = true
  try {
    await dismissSplitCandidate(c.symbol)
    actionResult.value[key] = "Dismissed"
    splitCandidates.value = await fetchSplitCandidates()
    setCandidateDates(splitCandidates.value)
  } catch {
    actionResult.value[key] = "Error"
  } finally {
    actionBusy.value[key] = false
  }
}

const pendingCandidates = () => splitCandidates.value.filter(c => c.status === "pending")
const historyCandidates = () => splitCandidates.value.filter(c => c.status !== "pending")
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-xl font-semibold">Market Data</h1>

    <div v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>

    <template v-else>
      <!-- Stooq datasets panel -->
      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Stooq Datasets</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
              <th class="pb-2 pr-4">Dataset</th>
              <th class="pb-2 pr-4">Latest Date</th>
              <th class="pb-2 pr-4">Imported At</th>
              <th class="pb-2">Overflow Rows Cleaned</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in importLog" :key="entry.dataset" class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2 pr-4 font-mono">{{ entry.dataset }}</td>
              <td class="py-2 pr-4">{{ entry.latestDate ?? '—' }}</td>
              <td class="py-2 pr-4">{{ entry.importedAt ? new Date(entry.importedAt).toLocaleString() : '—' }}</td>
              <td class="py-2">{{ entry.rowsDeleted ?? '—' }}</td>
            </tr>
            <tr v-if="importLog.length === 0">
              <td colspan="4" class="py-4 text-center text-slate-400 dark:text-slate-500">No import history yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Split candidates panel -->
      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Split Candidates</h2>

        <div v-if="pendingCandidates().length === 0" class="mb-4 text-sm text-slate-500 dark:text-slate-400">
          No pending split candidates.
        </div>
        <table v-else class="mb-6 w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
              <th class="pb-2 pr-4">Symbol</th>
              <th class="pb-2 pr-4">Effective</th>
              <th class="pb-2 pr-4">Detected</th>
              <th class="pb-2 pr-4">Last Stooq Close</th>
              <th class="pb-2 pr-4">First Overflow Close</th>
              <th class="pb-2 pr-4">Split ratio</th>
              <th class="pb-2 pr-4">Quantity factor</th>
              <th class="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in pendingCandidates()" :key="candidateKey(c)"
                class="border-b border-slate-100 dark:border-slate-800">
              <!-- §85.6 — operational table, so this link navigates away from a
                   half-filled "Apply factor" form. The input state is not
                   persisted today, so nothing is lost; noted here and in the
                   commit body rather than shipped silently. No name on these
                   rows, so the badge is logo + ticker. -->
              <td class="py-2 pr-4 font-mono font-semibold">
                <router-link :to="researchRoute(c.symbol, route.fullPath)" class="inline-block">
                  <TickerBadge size="sm" :symbol="c.symbol" />
                </router-link>
              </td>
               <td class="py-2 pr-4">{{ c.effectiveDate ?? '—' }}</td>
               <td class="py-2 pr-4">{{ c.detectedAt }}</td>
              <td class="py-2 pr-4">{{ c.lastStooqClose ?? '—' }}</td>
              <td class="py-2 pr-4">{{ c.firstOverflowClose ?? '—' }}</td>
               <td class="py-2 pr-4" :title="c.provider ? `OpenST factor: ${c.providerFactor ?? '—'}; observed ratio: ${c.ratio ?? '—'}` : `Observed ratio: ${c.ratio ?? '—'}`">
                 {{ providerRatio(c) ?? 'ambiguous' }}
               </td>
               <td class="py-2 pr-4">{{ c.providerFactor ?? '—' }}</td>
               <td class="py-2">
                 <div class="flex items-center gap-2">
                   <input v-model="applyDate[candidateKey(c)]" type="date" :placeholder="c.effectiveDate ?? 'effective date'" class="input w-36 text-xs" />
                   <input
                     v-model="applyFactor[candidateKey(c)]"
                     :placeholder="c.providerFactor ?? 'quantity factor'"
                     class="input w-24 text-xs"
                   />
                  <button
                    class="btn-primary text-xs"
                     :disabled="actionBusy[candidateKey(c)]"
                     @click="apply(c)"
                  >Apply</button>
                  <button
                    class="btn-secondary text-xs"
                     :disabled="actionBusy[candidateKey(c)]"
                     @click="dismiss(c)"
                  >Dismiss</button>
                   <span v-if="actionResult[candidateKey(c)]" class="text-xs text-slate-500">{{ actionResult[candidateKey(c)] }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- History (collapsed) -->
        <details v-if="historyCandidates().length">
          <summary class="cursor-pointer text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
            History ({{ historyCandidates().length }})
          </summary>
          <table class="mt-3 w-full text-xs text-slate-500 dark:text-slate-400">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-left">
                <th class="pb-1 pr-4">Symbol</th>
                <th class="pb-1 pr-4">Effective</th>
                <th class="pb-1 pr-4">Detected</th>
                <th class="pb-1 pr-4">Split ratio</th>
                <th class="pb-1">Status</th>
              </tr>
            </thead>
            <tbody>
                <tr v-for="c in historyCandidates()" :key="candidateKey(c)"
                  class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-1 pr-4 font-mono">
                  <router-link :to="researchRoute(c.symbol, route.fullPath)" class="inline-block">
                    <TickerBadge size="sm" :symbol="c.symbol" />
                  </router-link>
                </td>
                <td class="py-1 pr-4">{{ c.effectiveDate ?? '—' }}</td>
                <td class="py-1 pr-4">{{ c.detectedAt }}</td>
                <td class="py-1 pr-4">{{ providerRatio(c) ?? 'ambiguous' }}</td>
                <td class="py-1">{{ c.status }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>

      <!-- Overflow summary -->
      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Overflow Summary</h2>
        <template v-if="overflow">
          <p class="mb-3 text-sm">Total rows: <span class="font-semibold">{{ overflow.total.toLocaleString() }}</span></p>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
                <th class="pb-2 pr-4">Symbol</th>
                <th class="pb-2">Rows</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in overflow.topSymbols" :key="s.symbol"
                  class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-1 pr-4 font-mono">
                  <router-link :to="researchRoute(s.symbol, route.fullPath)" class="inline-block">
                    <TickerBadge size="sm" :symbol="s.symbol" />
                  </router-link>
                </td>
                <td class="py-1">{{ s.rowCount.toLocaleString() }}</td>
              </tr>
              <tr v-if="overflow.topSymbols.length === 0">
                <td colspan="2" class="py-4 text-center text-slate-400 dark:text-slate-500">No overflow rows.</td>
              </tr>
            </tbody>
          </table>
        </template>
        <p v-else class="text-sm text-slate-400 dark:text-slate-500">Unavailable.</p>
      </div>
    </template>
  </div>
</template>
