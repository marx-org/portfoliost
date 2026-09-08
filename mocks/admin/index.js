import { requireAuth } from "../lib/auth.js"
import { nowIso, uuid } from "../lib/http.js"
import { DEMO_RATES, DEMO_FX_DATE } from "../lib/demo-fx.js"

const DATASETS = [
  "daily_world",
  "daily_us",
  "daily_uk",
  "daily_jp",
  "daily_hk",
  "daily_pl",
  "daily_hu",
  "daily_macro",
]

function isValidDataset(v) {
  return typeof v === "string" && DATASETS.includes(v)
}

// In-memory state for mock: pending uploads + job status per dataset
const uploads = new Map()    // uploadId → { dataset, size }
const jobStatus = new Map()  // dataset  → "Running" | "Succeeded" | "Failed" | null
const jobLog    = new Map()  // dataset  → { latestDate, importedAt, rowsDeleted }

// Pre-seed daily_us as already imported
jobLog.set("daily_us", { latestDate: "2026-08-28", importedAt: "2026-08-28T14:32:00Z", rowsDeleted: 142 })

export function register(app) {
  // GET /api/admin/currencies/rates — paged EUR-based reference rates (D47).
  // Mirrors the wallets module admin endpoint shape (AdminFxRatesResponse).
  app.get("/api/admin/currencies/rates", (ctx) => {
    if (!requireAuth(ctx)) return
    const page = Math.max(1, parseInt(ctx.query.page ?? "1", 10))
    const perPage = Math.min(200, Math.max(1, parseInt(ctx.query.per_page ?? "50", 10)))
    const quote = String(ctx.query.quote_currency ?? "").toUpperCase()
    const dateFrom = ctx.query.date_from
    const dateTo = ctx.query.date_to

    const all = Object.entries(DEMO_RATES)
      .filter(([ccy]) => !quote || ccy === quote)
      .map(([quoteCurrency, rate]) => ({
        date: DEMO_FX_DATE,
        baseCurrency: "EUR",
        quoteCurrency,
        rate,
      }))
      .filter((r) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo))

    const total = all.length
    const totalPages = Math.ceil(total / perPage)
    const items = all.slice((page - 1) * perPage, page * perPage)
    ctx.res.json({ items, pagination: { total, page, per_page: perPage, total_pages: totalPages } })
  })

  // POST /api/admin/jobs/stooq-import/upload
  app.post("/api/admin/jobs/stooq-import/upload", (ctx) => {
    if (!requireAuth(ctx)) return

    // In the mock, FormData is parsed as body fields
    const dataset = ctx.body?.dataset
    if (!isValidDataset(dataset)) {
      return ctx.res.status(400).json({ error: `Invalid dataset. Must be one of: ${DATASETS.join(", ")}` })
    }

    const fileName = ctx.body?.fileName ?? "upload.zip"
    if (!String(fileName).toLowerCase().endsWith(".zip")) {
      return ctx.res.status(400).json({ error: "File must be a .zip archive" })
    }

    const uploadId = uuid()
    const sizeBytes = Number(ctx.body?.size ?? 100000)
    uploads.set(uploadId, { dataset, sizeBytes })
    ctx.res.json({ uploadId, dataset, sizeBytes })
  })

  // POST /api/admin/jobs/stooq-import/run
  app.post("/api/admin/jobs/stooq-import/run", (ctx) => {
    if (!requireAuth(ctx)) return

    const { dataset, uploadId } = ctx.body ?? {}
    if (!isValidDataset(dataset)) {
      return ctx.res.status(400).json({ error: "Invalid dataset" })
    }
    if (!uploadId || !uploads.has(uploadId)) {
      return ctx.res.status(404).json({ error: "Upload not found. Upload the file first." })
    }
    if (jobStatus.get(dataset) === "Running") {
      const jobName = `stooq-importer-${dataset.replace(/_/g, "-")}`
      return ctx.res.status(409).json({ error: `A ${jobName} job is already running` })
    }

    // Simulate: set Running, then auto-complete after 3 seconds (mock only)
    jobStatus.set(dataset, "Running")
    setTimeout(() => {
      jobStatus.set(dataset, "Succeeded")
      jobLog.set(dataset, {
        latestDate: new Date().toISOString().slice(0, 10),
        importedAt: nowIso(),
        rowsDeleted: Math.floor(Math.random() * 200),
      })
      uploads.delete(uploadId)
    }, 3000)

    const jobName = `stooq-importer-${dataset.replace(/_/g, "-")}`
    ctx.res.json({ jobName, namespace: "pfire", status: "Running" })
  })

  // GET /api/admin/jobs/stooq-import/status?dataset=...
  app.get("/api/admin/jobs/stooq-import/status", (ctx) => {
    if (!requireAuth(ctx)) return

    const dataset = ctx.query?.dataset
    if (!isValidDataset(dataset)) {
      return ctx.res.status(400).json({ error: "Invalid dataset" })
    }

    const status = jobStatus.get(dataset) ?? "NotFound"
    const jobName = `stooq-importer-${dataset.replace(/_/g, "-")}`
    const isRunning = status === "Running"
    ctx.res.json({
      dataset,
      jobName,
      status,
      details: { active: isRunning ? 1 : 0, succeeded: status === "Succeeded" ? 1 : 0, failed: status === "Failed" ? 1 : 0 },
    })
  })

  // GET /api/admin/jobs/stooq-import/log
  app.get("/api/admin/jobs/stooq-import/log", (ctx) => {
    if (!requireAuth(ctx)) return

    const log = DATASETS.map((dataset) => {
      const entry = jobLog.get(dataset)
      return {
        dataset,
        latestDate:  entry?.latestDate  ?? null,
        importedAt:  entry?.importedAt  ?? null,
        rowsDeleted: entry?.rowsDeleted ?? null,
      }
    })
    ctx.res.json(log)
  })
}
