import { requireAuth } from "./lib/auth.js"
import { uuid } from "./lib/http.js"

const labels = new Map()
const transactionLabels = new Map()
const cashTransactionLabels = new Map()

function ownedLabels(ids) {
  return ids.map((id) => labels.get(id)).filter(Boolean)
}

function setLabels(map, entityId, ids) {
  map.set(entityId, [...ids])
  return ownedLabels(ids)
}

export function labelsForTransaction(id) {
  return ownedLabels(transactionLabels.get(id) ?? [])
}

export function labelsForCashTransaction(id) {
  return ownedLabels(cashTransactionLabels.get(id) ?? [])
}

export function matchesLabelFilter(id, raw) {
  const wanted = String(raw ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  if (!wanted.length) return true
  const assigned = new Set(transactionLabels.get(id) ?? [])
  return wanted.every((labelId) => assigned.has(labelId))
}

export function matchesCashLabelFilter(id, raw) {
  const wanted = String(raw ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  if (!wanted.length) return true
  const assigned = new Set(cashTransactionLabels.get(id) ?? [])
  return wanted.every((labelId) => assigned.has(labelId))
}

export function setTransactionLabels(id, ids) {
  return setLabels(transactionLabels, id, ids)
}

export function setCashTransactionLabels(id, ids) {
  return setLabels(cashTransactionLabels, id, ids)
}

export function register(app) {
  app.get("/api/labels", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json([...labels.values()].sort((a, b) => a.name.localeCompare(b.name)))
  })

  app.post("/api/labels", (ctx) => {
    if (!requireAuth(ctx)) return
    const name = String(ctx.body?.name ?? "").trim()
    if (!name) return ctx.res.status(422).json({ error: "ValidationError", message: "name is required" })
    const label = { id: uuid(), name, color: ctx.body?.color ?? null }
    labels.set(label.id, label)
    ctx.res.status(201).json(label)
  })

  app.patch("/api/labels/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const current = labels.get(ctx.params.id)
    if (!current) return ctx.res.status(404).json({ error: "NotFound", message: "Label not found" })
    const updated = { ...current, ...(ctx.body || {}) }
    labels.set(current.id, updated)
    ctx.res.json(updated)
  })

  app.delete("/api/labels/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    if (!labels.delete(ctx.params.id)) return ctx.res.status(404).json({ error: "NotFound", message: "Label not found" })
    for (const map of [transactionLabels, cashTransactionLabels]) {
      for (const [entityId, ids] of map) map.set(entityId, ids.filter((id) => id !== ctx.params.id))
    }
    ctx.res.status(204).end()
  })

  app.post("/api/portfolios/:id/transactions/:transactionId/labels", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(setTransactionLabels(ctx.params.transactionId, ctx.body?.labelIds ?? []))
  })

  app.post("/api/portfolios/cash/transactions/:transactionId/labels", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(setCashTransactionLabels(ctx.params.transactionId, ctx.body?.labelIds ?? []))
  })
}
