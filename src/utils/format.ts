export function formatCurrency(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const ccy = currency && /^[A-Za-z]{3}$/.test(currency) ? currency : "USD"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

/** §47.5 — amount without a guessed currency: plain number when the currency
 * is null/unknown (never a silent "USD" label). */
export function formatAmount(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const ccy = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null
  if (!ccy) return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
  return formatCurrency(value, ccy)
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 2, withSign = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = withSign && value > 0 ? "+" : ""
  return `${sign}${new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}%`
}

export function formatSignedCurrency(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${formatCurrency(value, currency)}`
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)
}

export function formatCompactCurrency(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const ccy = currency && /^[A-Za-z]{3}$/.test(currency) ? currency : "USD"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "number" ? new Date(value) : new Date(value)
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(d)
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "number" ? new Date(value) : new Date(value)
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d)
}
