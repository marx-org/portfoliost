<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import {
  STOOQ_DATASETS,
  type StooqDataset,
  type StooqImportLogEntry,
  type StooqImportStatusResponse,
  uploadStooqZip,
  runStooqImport,
  getStooqImportStatus,
  getStooqImportLog,
} from "@/api/adminJobs"

// ── Dataset metadata ──────────────────────────────────────────────────────────

interface DatasetMeta {
  id: StooqDataset
  label: string
  description: string
  group: string
}

const DATASET_META: DatasetMeta[] = [
  { id: "daily_world",  label: "World — Daily",     description: "d_world_txt.zip → daily_world",  group: "World" },
  { id: "hourly_world", label: "World — Hourly",    description: "h_world_txt.zip → hourly_world", group: "World" },
  { id: "5min_world",   label: "World — 5-min",     description: "5_world_txt.zip → 5min_world",   group: "World" },
  { id: "daily_us",     label: "U.S. — Daily",      description: "d_us_txt.zip → daily_us",        group: "U.S." },
  { id: "hourly_us",    label: "U.S. — Hourly",     description: "h_us_txt.zip → hourly_us",       group: "U.S." },
  { id: "5min_us",      label: "U.S. — 5-min",      description: "5_us_txt.zip → 5min_us",         group: "U.S." },
  { id: "daily_uk",     label: "U.K. — Daily",      description: "d_uk_txt.zip → daily_uk",        group: "U.K." },
  { id: "hourly_uk",    label: "U.K. — Hourly",     description: "h_uk_txt.zip → hourly_uk",       group: "U.K." },
  { id: "5min_uk",      label: "U.K. — 5-min",      description: "5_uk_txt.zip → 5min_uk",         group: "U.K." },
  { id: "daily_jp",     label: "Japan — Daily",     description: "d_jp_txt.zip → daily_jp",        group: "Japan" },
  { id: "daily_hk",     label: "Hong Kong — Daily", description: "d_hk_txt.zip → daily_hk",        group: "Hong Kong" },
  { id: "hourly_hk",    label: "Hong Kong — Hourly",description: "h_hk_txt.zip → hourly_hk",       group: "Hong Kong" },
  { id: "5min_hk",      label: "Hong Kong — 5-min", description: "5_hk_txt.zip → 5min_hk",         group: "Hong Kong" },
  { id: "daily_pl",     label: "Poland — Daily",    description: "d_pl_txt.zip → daily_pl",        group: "Poland" },
  { id: "hourly_pl",    label: "Poland — Hourly",   description: "h_pl_txt.zip → hourly_pl",       group: "Poland" },
  { id: "5min_pl",      label: "Poland — 5-min",    description: "5_pl_txt.zip → 5min_pl",         group: "Poland" },
  { id: "daily_hu",     label: "Hungary — Daily",   description: "d_hu_txt.zip → daily_hu",        group: "Hungary" },
  { id: "hourly_hu",    label: "Hungary — Hourly",  description: "h_hu_txt.zip → hourly_hu",       group: "Hungary" },
  { id: "5min_hu",      label: "Hungary — 5-min",   description: "5_hu_txt.zip → 5min_hu",         group: "Hungary" },
  { id: "daily_macro",  label: "Macroeconomy",      description: "d_macro_txt.zip → daily_macro",  group: "Macro" },
]

const GROUPS = [...new Set(DATASET_META.map((d) => d.group))]

function datasetsInGroup(group: string): DatasetMeta[] {
  return DATASET_META.filter((d) => d.group === group)
}

// ── Per-dataset state ─────────────────────────────────────────────────────────

type JobPhase = "idle" | "uploading" | "running" | "succeeded" | "failed"

interface DatasetState {
  file: File | null
  uploadProgress: number
  uploadId: string | null
  phase: JobPhase
  errorMsg: string | null
  jobName: string | null
  log: StooqImportLogEntry | null
}

function makeState(): DatasetState {
  return { file: null, uploadProgress: 0, uploadId: null, phase: "idle", errorMsg: null, jobName: null, log: null }
}

const states = ref<Record<StooqDataset, DatasetState>>(
  Object.fromEntries(STOOQ_DATASETS.map((d) => [d, makeState()])) as Record<StooqDataset, DatasetState>,
)

const pageLoading = ref(true)
const pageError   = ref<string | null>(null)

// ── Load initial log ──────────────────────────────────────────────────────────

async function loadLog() {
  try {
    const log = await getStooqImportLog()
    for (const entry of log) {
      if (states.value[entry.dataset]) {
        states.value[entry.dataset].log = entry
      }
    }
  } catch (e) {
    pageError.value = e instanceof Error ? e.message : "Failed to load import log"
  } finally {
    pageLoading.value = false
  }
}

// ── Status polling ────────────────────────────────────────────────────────────

const pollers = new Map<StooqDataset, ReturnType<typeof setInterval>>()

function startPolling(dataset: StooqDataset) {
  stopPolling(dataset)
  // Poll every 30 s — imports take hours, no timeout.
  pollers.set(
    dataset,
    setInterval(() => pollStatus(dataset), 30_000),
  )
}

function stopPolling(dataset: StooqDataset) {
  const id = pollers.get(dataset)
  if (id !== undefined) clearInterval(id)
  pollers.delete(dataset)
}

async function pollStatus(dataset: StooqDataset) {
  try {
    const status: StooqImportStatusResponse = await getStooqImportStatus(dataset)
    applyStatus(dataset, status)
  } catch {
    // transient — keep polling
  }
}

function applyStatus(dataset: StooqDataset, status: StooqImportStatusResponse) {
  const s = states.value[dataset]
  if (status.status === "Running") {
    s.phase = "running"
  } else if (status.status === "Succeeded") {
    s.phase = "succeeded"
    stopPolling(dataset)
    // Refresh log entry
    getStooqImportLog().then((log) => {
      const entry = log.find((e) => e.dataset === dataset)
      if (entry) s.log = entry
    }).catch(() => { /* ignore */ })
  } else if (status.status === "Failed") {
    s.phase = "failed"
    s.errorMsg = "Import job failed. Check cluster logs."
    stopPolling(dataset)
  } else {
    // NotFound — job completed and was cleaned up, or never ran
    if (s.phase === "running") {
      // Was running, now gone → treat as succeeded (jobshot deletes jobs after completion)
      s.phase = "succeeded"
      stopPolling(dataset)
    }
  }
}

// ── File selection ────────────────────────────────────────────────────────────

function onFileChange(dataset: StooqDataset, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const s = states.value[dataset]
  s.file = file
  s.uploadId = null
  s.errorMsg = null
  if (s.phase === "succeeded" || s.phase === "failed") {
    s.phase = "idle"
  }
}

// ── Run import ────────────────────────────────────────────────────────────────

async function runImport(dataset: StooqDataset) {
  const s = states.value[dataset]
  if (!s.file) return
  s.errorMsg = null
  s.uploadProgress = 0

  // Step 1: upload
  s.phase = "uploading"
  try {
    const upload = await uploadStooqZip(dataset, s.file, (pct) => {
      s.uploadProgress = pct
    })
    s.uploadId = upload.uploadId
  } catch (e) {
    s.phase = "failed"
    s.errorMsg = e instanceof Error ? e.message : "Upload failed"
    return
  }

  // Step 2: trigger job
  try {
    const run = await runStooqImport(dataset, s.uploadId!)
    s.jobName = run.jobName
    s.phase = "running"
    startPolling(dataset)
  } catch (e) {
    s.phase = "failed"
    s.errorMsg = e instanceof Error ? e.message : "Failed to start import job"
  }
}

// ── Button label helpers ──────────────────────────────────────────────────────

function buttonLabel(s: DatasetState): string {
  if (s.phase === "uploading") return `Uploading… ${s.uploadProgress}%`
  if (s.phase === "running")   return "Running…"
  return "Run Import"
}

function buttonDisabled(s: DatasetState): boolean {
  return !s.file || s.phase === "uploading" || s.phase === "running"
}

function statusBadge(dataset: StooqDataset): { label: string; cls: string } | null {
  const s = states.value[dataset]
  if (s.phase === "uploading") return { label: "Uploading", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" }
  if (s.phase === "running")   return { label: "Running",   cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  if (s.phase === "succeeded") return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  if (s.phase === "failed")    return { label: "Failed",    cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
  const log = s.log
  if (!log || !log.importedAt) return null
  return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadLog)
onUnmounted(() => {
  for (const dataset of STOOQ_DATASETS) stopPolling(dataset)
})
</script>

<template>
  <div>
    <div v-if="pageLoading" class="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
    <div v-else-if="pageError" class="text-sm text-red-600 dark:text-red-400">{{ pageError }}</div>

    <div v-else class="space-y-8">
      <section v-for="group in GROUPS" :key="group">
        <h2 class="mb-3 text-base font-semibold text-slate-700 dark:text-slate-300">{{ group }}</h2>

        <div class="space-y-3">
          <div
            v-for="meta in datasetsInGroup(group)"
            :key="meta.id"
            class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            :data-testid="`job-card-${meta.id}`"
          >
            <!-- Header row -->
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-slate-900 dark:text-slate-100">{{ meta.label }}</div>
                <div class="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">{{ meta.description }}</div>
              </div>
              <span
                v-if="statusBadge(meta.id)"
                class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="statusBadge(meta.id)!.cls"
              >
                {{ statusBadge(meta.id)!.label }}
              </span>
            </div>

            <!-- Last run info -->
            <div class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="states[meta.id].log?.importedAt">
                Last import: {{ formatDate(states[meta.id].log!.importedAt) }}
                <template v-if="states[meta.id].log!.latestDate">
                  · Data through {{ states[meta.id].log!.latestDate }}
                </template>
              </span>
              <span v-else>Never imported</span>
            </div>

            <!-- Error message -->
            <div
              v-if="states[meta.id].errorMsg"
              class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ states[meta.id].errorMsg }}
            </div>

            <!-- Upload progress bar -->
            <div
              v-if="states[meta.id].phase === 'uploading'"
              class="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            >
              <div
                class="h-full rounded-full bg-blue-500 transition-all"
                :style="{ width: `${states[meta.id].uploadProgress}%` }"
              />
            </div>

            <!-- File + button row -->
            <div class="flex items-center gap-3">
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span class="truncate">
                  {{ states[meta.id].file ? states[meta.id].file!.name : "Choose .zip file…" }}
                </span>
                <input
                  type="file"
                  accept=".zip"
                  class="sr-only"
                  :data-testid="`file-input-${meta.id}`"
                  @change="onFileChange(meta.id, $event)"
                />
              </label>

              <button
                class="btn-primary shrink-0"
                :disabled="buttonDisabled(states[meta.id])"
                :data-testid="`run-btn-${meta.id}`"
                @click="runImport(meta.id)"
              >
                {{ buttonLabel(states[meta.id]) }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
