import { http } from "./client"

// ── Types ────────────────────────────────────────────────────────────────────

export const STOOQ_DATASETS = [
  "daily_world", "hourly_world", "5min_world",
  "daily_us",    "hourly_us",    "5min_us",
  "daily_uk",    "hourly_uk",    "5min_uk",
  "daily_jp",
  "daily_hk",    "hourly_hk",    "5min_hk",
  "daily_pl",    "hourly_pl",    "5min_pl",
  "daily_hu",    "hourly_hu",    "5min_hu",
  "daily_macro",
] as const

export type StooqDataset = (typeof STOOQ_DATASETS)[number]

export interface StooqImportUploadResponse {
  uploadId: string
  dataset: StooqDataset
  sizeBytes: number
}

export interface StooqImportRunResponse {
  jobName: string
  namespace: string
  status: "Running" | "Succeeded" | "Failed" | "NotFound"
}

export interface StooqImportStatusResponse {
  dataset: StooqDataset
  jobName: string
  status: "Running" | "Succeeded" | "Failed" | "NotFound"
  details: { active: number; succeeded: number; failed: number } | null
}

export interface StooqImportLogEntry {
  dataset: StooqDataset
  latestDate: string | null
  importedAt: string | null
  rowsDeleted: number | null
}

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
