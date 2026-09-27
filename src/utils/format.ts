/** §66.2 — a currency is NEVER guessed (plan §66).
 *
 * `currency` is a required parameter on purpose: making it required is what
 * makes `vue-tsc` fail every call site that does not actually know the currency,
 * so the gap surfaces at build time instead of as a wrong symbol on screen.
 *
 * The previous version had BOTH a `currency = "USD"` default and an internal
 * re-guess (`: "USD"`), so even an explicitly passed `""`, `null`, `"PL"` or
 * `"zł"` was relabelled USD. The internal re-guess was the worse half — it
 * defeated the caller's own care. An unknown currency now renders a bare
 * number: visibly incomplete rather than confidently wrong. */
export function formatCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const ccy = normalizeCurrency(currency)
  if (!ccy) return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

/** An ISO-4217 alphabetic code, upper-cased, or null when it is not one. This is
 * the single place that decides "is this actually a currency" (plan §66.2). */
function normalizeCurrency(currency: string | null | undefined): string | null {
  if (typeof currency !== "string") return null
  const trimmed = currency.trim()
  return /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : null
}

/** §47.5 — amount without a guessed currency: plain number when the currency
 * is null/unknown (never a silent "USD" label). Now a delegation, so the rule
 * lives in exactly one place (plan §66.2). */
export function formatAmount(value: number | null | undefined, currency: string | null | undefined): string {
  return formatCurrency(value, currency)
}

/** §48.6e B2 — signed variant of formatAmount (same no-silent-USD rule). */
export function formatSignedAmount(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${formatAmount(value, currency)}`
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

export function formatSignedCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${formatCurrency(value, currency)}`
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)
}

export function formatCompactCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const ccy = normalizeCurrency(currency)
  if (!ccy) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
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
