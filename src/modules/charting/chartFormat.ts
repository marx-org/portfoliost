/**
 * Formatting for chart axes and data labels (Charting readability pass, #145).
 *
 * Raw ApexCharts ticks print the full float (`80.00000000`, `69.72577697`) —
 * a wall of trailing zeroes with no unit. These helpers give every chart the
 * same compact, unit-qualified labels so axes stay readable.
 *
 * Data-label formatters are called with `null` for missing points (e.g. a YoY
 * line with no prior-year comparison), so every helper is null-safe and returns
 * an empty string rather than throwing on `null.toFixed`.
 */

export { axisTitle, chartTitle, withSharedChart } from "@/utils/chartOptions"

/** Compact currency, keeping at most one decimal and trimming a trailing `.0`. */
function compactCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) return ""
  const ccy = /^[A-Za-z]{3}$/.test(currency ?? "") ? currency.toUpperCase() : null
  const formatted = ccy
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: ccy,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
  // `80.0` / `1.0M` → `80` / `1M`; keep a meaningful decimal (`1.2M`).
  return formatted.replace(/\.0+(?=[^\d]|$)/g, "")
}

/** Axis tick for a currency amount: compact (`$80`, `$1.2M`), no float noise. */
export function axisCurrency(value: number | null | undefined, currency: string): string {
  return compactCurrency(value, currency)
}

/** Bar/line data label for a currency amount: compact and rounded. */
export function labelCurrency(value: number | null | undefined, currency: string): string {
  return compactCurrency(value, currency)
}

/** Axis tick for a percent value already expressed in percent units. */
export function axisPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ""
  return `${Number(value.toFixed(1))}%`
}

/** Data label for a percent value, rounded to one decimal, with an explicit sign. */
export function labelPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ""
  const rounded = Number(value.toFixed(1))
  return `${rounded > 0 ? "+" : ""}${rounded}%`
}