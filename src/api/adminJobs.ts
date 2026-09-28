import { http } from "./client"
import type { components } from "../../generated/api-types"

// ── Contract types (generated from @marx2/contracts openapi.yaml) ─────────────

export type StooqDataset            = components["schemas"]["StooqDataset"]
export type StooqImportUploadResponse = components["schemas"]["StooqImportUploadResponse"]
export type StooqImportRunResponse  = components["schemas"]["StooqImportRunResponse"]
export type StooqImportStatusResponse = components["schemas"]["StooqImportStatusResponse"]
export type StooqImportLogEntry     = components["schemas"]["StooqImportLogEntry"]

// STOOQ_DATASETS drives the UI dataset list; kept in sync with the contract enum.
// TypeScript will error here if this array diverges from StooqDataset.
export const STOOQ_DATASETS: readonly StooqDataset[] = [
  "daily_world",
  "daily_us",
  "daily_uk",
  "daily_jp",
  "daily_hk",
  "daily_pl",
  "daily_hu",
  "daily_macro",
] as const

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Upload a stooq zip file. Returns a promise that resolves with the upload
 * response, and calls onProgress(0–100) as the upload progresses.
 * Uses XMLHttpRequest because fetch does not expose upload progress events.
 */
export function uploadStooqZip(
  dataset: StooqDataset,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<StooqImportUploadResponse> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("portfoliost_token") ?? ""
    // dataset goes in the query string so the server can read it before
    // touching the multipart body (avoids buffering the file to get the field)
    const form = new FormData()
    form.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/api/admin/jobs/stooq-import/upload?dataset=${encodeURIComponent(dataset)}`)
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as StooqImportUploadResponse)
        } catch {
          reject(new Error("Invalid response from upload endpoint"))
        }
      } else {
        let msg = `Upload failed (${xhr.status})`
        try { msg = JSON.parse(xhr.responseText).error ?? msg } catch { /* ignore */ }
        reject(new Error(msg))
      }
    })

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")))

    xhr.send(form)
  })
}

export function runStooqImport(
  dataset: StooqDataset,
  uploadId: string,
): Promise<StooqImportRunResponse> {
  return http.post<StooqImportRunResponse>("/api/admin/jobs/stooq-import/run", {
    dataset,
    uploadId,
  })
}

export function getStooqImportStatus(
  dataset: StooqDataset,
): Promise<StooqImportStatusResponse> {
  return http.get<StooqImportStatusResponse>(
    `/api/admin/jobs/stooq-import/status?dataset=${encodeURIComponent(dataset)}`,
  )
}

export function getStooqImportLog(): Promise<StooqImportLogEntry[]> {
  return http.get<StooqImportLogEntry[]>("/api/admin/jobs/stooq-import/log")
}

// ── Google Sheets sync (plan §24.9) ──────────────────────────────────────────

// The sheets-sync endpoints are not in the @marx2/contracts generated types yet;
// local mirrors of the admin backend responses (src/sheets-sync.ts).
export interface SheetsSyncRunResponse {
  jobName: string
  namespace: string
  status: string
}

export interface SheetsSyncStatusResponse {
  jobName: string
  status: "Running" | "Succeeded" | "Failed" | "NotFound" | string
  details: { active: number; succeeded: number; failed: number } | null
  startedAt?: string | null
}

export interface SheetsSyncLogEntry {
  startedAt: string | null
  status: string | null
  mode: "wipe" | "incremental" | null
}

/** Trigger the sheets-sync Job (optionally wiping previously imported data first). */
export function runSheetsSync(wipe: boolean): Promise<SheetsSyncRunResponse> {
  return http.post<SheetsSyncRunResponse>("/api/admin/jobs/sheets-sync/run", { wipe })
}

export function getSheetsSyncStatus(): Promise<SheetsSyncStatusResponse> {
  return http.get<SheetsSyncStatusResponse>("/api/admin/jobs/sheets-sync/status")
}

export function getSheetsSyncLog(): Promise<SheetsSyncLogEntry> {
  return http.get<SheetsSyncLogEntry>("/api/admin/jobs/sheets-sync/log")
}

// ── Price audit (plan §72) ───────────────────────────────────────────────────

// Like the sheets-sync endpoints, these are not in the generated contracts yet;
// local mirrors of the admin backend responses (src/price-audit.ts).
export interface PriceAuditRunResponse {
  jobName: string
  namespace: string
  status: string
}

export interface PriceAuditStatusResponse {
  jobName: string
  status: "Running" | "Succeeded" | "Failed" | "NotFound" | "Unknown" | string
  details: unknown
  startedAt?: string | null
}

/** Trigger the price-audit Job. `tolerance` is a fraction (0.1 = 10%). */
export function runPriceAudit(tolerance?: number): Promise<PriceAuditRunResponse> {
  return http.post<PriceAuditRunResponse>("/api/admin/jobs/price-audit/run", { tolerance })
}

export function getPriceAuditStatus(): Promise<PriceAuditStatusResponse> {
  return http.get<PriceAuditStatusResponse>("/api/admin/jobs/price-audit/status")
}
