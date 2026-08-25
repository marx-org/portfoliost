import { http } from "./client"

export interface LatestRate {
  rate: number
  asOf: string
}

const cache = new Map<string, LatestRate | null>()
const inflight = new Map<string, Promise<LatestRate | null>>()

/**
 * Resolved automatic rate for a pair (fees-and-custom-fx D28/D30 UI).
 * Cached per pair for the dialog lifetime — rates move daily, not per keystroke.
 */
export async function getLatestRate(from: string, to: string): Promise<LatestRate | null> {
  const key = `${from.toUpperCase()}/${to.toUpperCase()}`
  if (cache.has(key)) return cache.get(key) ?? null
  if (inflight.has(key)) return inflight.get(key)!
  const p = http
    .get<LatestRate>(`/api/fx/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`)
    .then((r) => {
      const valid = r && typeof r.rate === "number" && typeof r.asOf === "string"
      cache.set(key, valid ? r : null)
      return valid ? r : null
    })
    .catch(() => {
      cache.set(key, null)
      return null
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
