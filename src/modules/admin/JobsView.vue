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
  runSheetsSync,
  getSheetsSyncStatus,
  getSheetsSyncLog,
  type SheetsSyncLogEntry,
  runPriceAudit,
  getPriceAuditStatus,
  runCashAudit,
  getCashAuditStatus,
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
  { id: "daily_us",     label: "U.S. — Daily",      description: "d_us_txt.zip → daily_us",        group: "U.S." },
  { id: "daily_uk",     label: "U.K. — Daily",      description: "d_uk_txt.zip → daily_uk",        group: "U.K." },
  { id: "daily_jp",     label: "Japan — Daily",     description: "d_jp_txt.zip → daily_jp",        group: "Japan" },
  { id: "daily_hk",     label: "Hong Kong — Daily", description: "d_hk_txt.zip → daily_hk",        group: "Hong Kong" },
  { id: "daily_pl",     label: "Poland — Daily",    description: "d_pl_txt.zip → daily_pl",        group: "Poland" },
  { id: "daily_hu",     label: "Hungary — Daily",   description: "d_hu_txt.zip → daily_hu",        group: "Hungary" },
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

  // Sheets sync last run — independent of the stooq log (one job → one row).
  try {
    const sheetsLog = await getSheetsSyncLog()
    sheets.value.log = sheetsLog
    if (sheetsLog.status === "Running") {
      sheets.value.phase = "running"
      startSheetsPolling()
    } else if (sheetsLog.status === "Succeeded") {
      sheets.value.phase = "succeeded"
    } else if (sheetsLog.status === "Failed") {
      sheets.value.phase = "failed"
      sheets.value.errorMsg = "Last sync failed. Check cluster logs."
    }
  } catch {
    // transient — the run buttons still work
  }

  try {
    const cashStatus = await getCashAuditStatus()
    if (cashStatus.startedAt) cashAudit.value.startedAt = cashStatus.startedAt
    if (cashStatus.status === "Succeeded") cashAudit.value.phase = "succeeded"
    else if (cashStatus.status === "Failed") cashAudit.value.phase = "failed"
    else if (cashStatus.status === "Running") {
      cashAudit.value.phase = "running"
      startCashAuditPolling()
    }
  } catch {
    // transient — the run button still works
  }
}

// ── Status polling ────────────────────────────────────────────────────────────

const pollers = new Map<StooqDataset, ReturnType<typeof setInterval>>()

function startPolling(dataset: StooqDataset) {
  stopPolling(dataset)
  // Poll every 60 s — backend keeps jobshot status fresh via its own poller (D53).
  pollers.set(
    dataset,
    setInterval(() => pollStatus(dataset), 60_000),
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

// ── Google Sheets sync state (plan §24.9) ────────────────────────────────────

type SheetsPhase = "idle" | "running" | "succeeded" | "failed"

interface SheetsState {
  phase: SheetsPhase
  errorMsg: string | null
  jobName: string | null
  log: SheetsSyncLogEntry | null
}

const sheets = ref<SheetsState>({ phase: "idle", errorMsg: null, jobName: null, log: null })

let sheetsPoller: ReturnType<typeof setInterval> | null = null

function startSheetsPolling() {
  stopSheetsPolling()
  sheetsPoller = setInterval(() => pollSheetsStatus(), 60_000)
}

function stopSheetsPolling() {
  if (sheetsPoller !== null) {
    clearInterval(sheetsPoller)
    sheetsPoller = null
  }
}

async function pollSheetsStatus() {
  try {
    const status = await getSheetsSyncStatus()
    applySheetsStatus(status)
  } catch {
    // transient — keep polling
  }
}

function applySheetsStatus(status: { status: string; details: unknown }) {
  const s = sheets.value
  if (status.status === "Running") {
    s.phase = "running"
  } else if (status.status === "Succeeded") {
    s.phase = "succeeded"
    stopSheetsPolling()
    refreshSheetsLog()
  } else if (status.status === "Failed") {
    s.phase = "failed"
    s.errorMsg = "Sync job failed. Check cluster logs."
    stopSheetsPolling()
  } else if (s.phase === "running") {
    // NotFound — job completed and was cleaned up (jobshot deletes on completion)
    s.phase = "succeeded"
    stopSheetsPolling()
    refreshSheetsLog()
  }
}

function refreshSheetsLog() {
  getSheetsSyncLog()
    .then((log) => {
      sheets.value.log = log
      if (log.status === "Running") {
        sheets.value.phase = "running"
        startSheetsPolling()
      }
    })
    .catch(() => { /* ignore */ })
}

async function runSheets(wipe: boolean) {
  const s = sheets.value
  if (wipe) {
    const ok = window.confirm(
      "Wipe all previously imported Transakcje data and re-import the full sheet?",
    )
    if (!ok) return
  }
  s.errorMsg = null
  s.jobName = null
  try {
    const run = await runSheetsSync(wipe)
    s.jobName = run.jobName
    s.phase = "running"
    startSheetsPolling()
  } catch (e) {
    s.phase = "failed"
    s.errorMsg = e instanceof Error ? e.message : "Failed to start sync job"
  }
}

// ── Price audit (§72) ────────────────────────────────────────────────────────
//
// A read-only reconciliation of every BUY/SELL against the instrument's own
// close. It finds venue overrides that are still wrong and currencies that do
// not match the bar. It changes nothing, so it is safe to run at any time — and
// it exits 0 even when it finds problems, so a successful run with findings is
// shown as Succeeded rather than a red failure.

type AuditPhase = "idle" | "running" | "succeeded" | "failed"

const audit = ref<{
  phase: AuditPhase
  errorMsg: string | null
  startedAt: string | null
}>({ phase: "idle", errorMsg: null, startedAt: null })

const auditTolerance = ref(10)

let auditPoller: ReturnType<typeof setInterval> | null = null

function startAuditPolling() {
  stopAuditPolling()
  auditPoller = setInterval(() => pollAuditStatus(), 30_000)
}

function stopAuditPolling() {
  if (auditPoller !== null) {
    clearInterval(auditPoller)
    auditPoller = null
  }
}

async function pollAuditStatus() {
  try {
    applyAuditStatus(await getPriceAuditStatus())
  } catch {
    // transient — keep polling
  }
}

function applyAuditStatus(status: { status: string; startedAt?: string | null }) {
  const a = audit.value
  if (status.startedAt) a.startedAt = status.startedAt
  if (status.status === "Running") {
    a.phase = "running"
  } else if (status.status === "Failed") {
    a.phase = "failed"
    a.errorMsg = "Audit job failed. Check cluster logs."
    stopAuditPolling()
  } else if (a.phase === "running") {
    // NotFound — jobshot deletes the Job on completion, so a vanished job that
    // we were watching is a finished one, not a lost one.
    a.phase = "succeeded"
    stopAuditPolling()
  }
}

async function runAudit() {
  const a = audit.value
  a.errorMsg = null
  try {
    await runPriceAudit(auditTolerance.value / 100)
    a.phase = "running"
    a.startedAt = new Date().toISOString()
    startAuditPolling()
  } catch (e) {
    a.phase = "failed"
    a.errorMsg = e instanceof Error ? e.message : "Failed to start price audit"
  }
}

// -- Cash audit ---------------------------------------------------------------

const cashAudit = ref<{
  phase: AuditPhase
  errorMsg: string | null
  startedAt: string | null
}>({ phase: "idle", errorMsg: null, startedAt: null })

let cashAuditPoller: ReturnType<typeof setInterval> | null = null

function stopCashAuditPolling() {
  if (cashAuditPoller !== null) {
    clearInterval(cashAuditPoller)
    cashAuditPoller = null
  }
}

function startCashAuditPolling() {
  stopCashAuditPolling()
  cashAuditPoller = setInterval(() => pollCashAuditStatus(), 30_000)
}

async function pollCashAuditStatus() {
  try {
    const status = await getCashAuditStatus()
    if (status.startedAt) cashAudit.value.startedAt = status.startedAt
    if (status.status === "Running") {
      cashAudit.value.phase = "running"
    } else if (status.status === "Failed") {
      cashAudit.value.phase = "failed"
      cashAudit.value.errorMsg = "Cash audit job failed. Check cluster logs."
      stopCashAuditPolling()
    } else if (cashAudit.value.phase === "running") {
      cashAudit.value.phase = "succeeded"
      stopCashAuditPolling()
    }
  } catch {
    // transient — keep polling
  }
}

async function runCashReconciliation() {
  const a = cashAudit.value
  a.errorMsg = null
  try {
    await runCashAudit()
    a.phase = "running"
    a.startedAt = new Date().toISOString()
    startCashAuditPolling()
  } catch (e) {
    a.phase = "failed"
    a.errorMsg = e instanceof Error ? e.message : "Failed to start cash audit"
  }
}

function cashAuditBadge(): { label: string; cls: string } | null {
  const a = cashAudit.value
  if (a.phase === "running") return { label: "Running", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  if (a.phase === "succeeded") return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  if (a.phase === "failed") return { label: "Failed", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
  return null
}

function auditBadge(): { label: string; cls: string } | null {
  const a = audit.value
  if (a.phase === "running")   return { label: "Running",   cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  if (a.phase === "succeeded") return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  if (a.phase === "failed")    return { label: "Failed",    cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
  return null
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

function sheetsBadge(): { label: string; cls: string } | null {
  const s = sheets.value
  if (s.phase === "running")   return { label: "Running",   cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" }
  if (s.phase === "succeeded") return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  if (s.phase === "failed")    return { label: "Failed",    cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" }
  if (s.log?.startedAt)        return { label: "Succeeded", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" }
  return null
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadLog)
onUnmounted(() => {
  for (const dataset of STOOQ_DATASETS) stopPolling(dataset)
  stopSheetsPolling()
  stopAuditPolling()
  stopCashAuditPolling()
})
</script>

<template>
  <div>
    <div v-if="pageLoading" class="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
    <div v-else-if="pageError" class="text-sm text-red-600 dark:text-red-400">{{ pageError }}</div>

    <div v-else class="space-y-8">
      <!-- Google Sheets sync (§24.9) -->
      <section>
        <h2 class="mb-3 text-base font-semibold text-slate-700 dark:text-slate-300">Google Sheets</h2>

        <div class="space-y-3">
          <div
            class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            data-testid="job-card-sheets-sync"
          >
            <!-- Header row -->
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-slate-900 dark:text-slate-100">Transakcje sheet sync</div>
                <div class="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                  Google Sheets → wallets &amp; portfolios
                </div>
              </div>
              <span
                v-if="sheetsBadge()"
                class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="sheetsBadge()!.cls"
              >
                {{ sheetsBadge()!.label }}
              </span>
            </div>

            <!-- Last run info -->
            <div class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="sheets.log?.startedAt">
                Last sync: {{ formatDate(sheets.log.startedAt) }}
                <template v-if="sheets.log.mode">· {{ sheets.log.mode }}</template>
              </span>
              <span v-else>Never synced</span>
            </div>

            <!-- Error message -->
            <div
              v-if="sheets.errorMsg"
              class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ sheets.errorMsg }}
            </div>

            <!-- Buttons -->
            <div class="flex items-center gap-3">
              <button
                class="btn-primary shrink-0"
                :disabled="sheets.phase === 'running'"
                data-testid="sheets-run-btn"
                @click="runSheets(false)"
              >
                {{ sheets.phase === "running" ? "Running…" : "Run Sync" }}
              </button>
              <button
                class="btn-danger shrink-0"
                :disabled="sheets.phase === 'running'"
                data-testid="sheets-wipe-btn"
                @click="runSheets(true)"
              >
                Wipe &amp; re-import
              </button>
            </div>
          </div>

          <div
            class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            data-testid="job-card-cash-audit"
          >
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-slate-900 dark:text-slate-100">Cash audit</div>
                <div class="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                  dated Gotówka balances vs wallets replay
                </div>
              </div>
              <span
                v-if="cashAuditBadge()"
                class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="cashAuditBadge()!.cls"
              >
                {{ cashAuditBadge()!.label }}
              </span>
            </div>

            <p class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Read-only audit of every dated sheet snapshot, including the stock-only
              Equate+ cash invariant. Manual timing and FX differences are reported,
              not silently normalized.
            </p>

            <div class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="cashAudit.startedAt">Last run: {{ formatDate(cashAudit.startedAt) }}</span>
              <span v-else>Never run</span>
            </div>

            <div
              v-if="cashAudit.errorMsg"
              class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ cashAudit.errorMsg }}
            </div>

            <button
              class="btn-primary shrink-0"
              :disabled="cashAudit.phase === 'running'"
              data-testid="cash-audit-run-btn"
              @click="runCashReconciliation"
            >
              {{ cashAudit.phase === "running" ? "Running…" : "Run cash audit" }}
            </button>
          </div>
        </div>
      </section>

      <!-- Price audit (§72) -->
      <section>
        <h2 class="mb-3 text-base font-semibold text-slate-700 dark:text-slate-300">Data quality</h2>

        <div class="space-y-3">
          <div
            class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            data-testid="job-card-price-audit"
          >
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-slate-900 dark:text-slate-100">Price audit</div>
                <div class="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                  every BUY/SELL vs its own close
                </div>
              </div>
              <span
                v-if="auditBadge()"
                class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="auditBadge()!.cls"
              >
                {{ auditBadge()!.label }}
              </span>
            </div>

            <p class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Reconciles each trade against the instrument's own price bar for that
              day, without converting first. Symbols that do not line up are a wrong
              venue (needs a sheets-sync override) or a wrong currency. Read-only —
              it changes nothing.
            </p>

            <div class="mb-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="audit.startedAt">Last run: {{ formatDate(audit.startedAt) }}</span>
              <span v-else>Never run</span>
            </div>

            <div
              v-if="audit.errorMsg"
              class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-400"
            >
              {{ audit.errorMsg }}
            </div>

            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                Tolerance
                <input
                  v-model.number="auditTolerance"
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  class="input w-20 py-1 text-sm"
                  data-testid="price-audit-tolerance"
                />
                %
              </label>
              <button
                class="btn-primary shrink-0"
                :disabled="audit.phase === 'running'"
                data-testid="price-audit-run-btn"
                @click="runAudit"
              >
                {{ audit.phase === "running" ? "Running…" : "Run audit" }}
              </button>
            </div>
          </div>
        </div>
      </section>

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
