import { http } from "./client"

export interface LatestRate {
  rate: number
  asOf: string
}

const cache = new Map<string, LatestRate | null>()
const inflight = new Map<string, Promise<LatestRate | null>>()

/**
 * Resolved automatic rate for a pair (fees-and-custom-fx D28/D30 UI).
 * `date` (YYYY-MM-DD) asks for the market rate on that day (D39 suggestion);
 * cached per from/to/date for the dialog lifetime — rates move daily, not per keystroke.
 */
export async function getLatestRate(from: string, to: string, date?: string): Promise<LatestRate | null> {
  const key = `${from.toUpperCase()}/${to.toUpperCase()}${date ? `@${date}` : ""}`
  if (cache.has(key)) return cache.get(key) ?? null
  if (inflight.has(key)) return inflight.get(key)!
  const q = new URLSearchParams({ from: from.toUpperCase(), to: to.toUpperCase() })
  if (date) q.set("date", date)
  const p = http
    .get<LatestRate>(`/api/fx/latest?${q}`)
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
