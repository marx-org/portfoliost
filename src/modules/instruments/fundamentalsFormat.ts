import { formatCompact } from "@/utils/format"
import { i18n, type Locale } from "@/i18n"

/** The Intl BCP-47 tag for the active UI locale (en-US / pl-PL). */
function intlLocale(): string {
  return i18n.global.locale.value === ("pl" as Locale) ? "pl-PL" : "en-US"
}

/**
 * §79.1 — the statement columns whose value IS a percentage.
 *
 * `*growth*` is a substring test on purpose: four of the statement's growth
 * columns share that suffix and none of them is an amount, so one test covers
 * them. The one named key is the only true ratio the statement carries.
 *
 * `freeCashFlowPerShare` used to be in this set. It is currency PER SHARE, not a
 * ratio — `$33.67` rendered as `33.7%`, a wrong unit rather than a wrong
 * precision, and nothing on the card said which currency it was even in.
 *
 * `debtEquityRatio` was here too, and cost more than a unit disagreement: at
 * one decimal, SAP.DE's 0.17 / 0.23 / 0.20 / 0.33 rendered as
 * `0.2% / 0.2% / 0.2% / 0.3%` — three distinct years collapsed into one
 * identical cell. Expressing D/E as a percentage is defensible in finance;
 * rounding a small multiple to one decimal is not, whatever the unit.
 */
const PERCENT_KEYS = new Set(["netIncomeMargin"])

function isPercentKey(key: string): boolean {
  return key.toLowerCase().includes("growth") || PERCENT_KEYS.has(key)
}

/**
 * Format one statement cell.
 *
 * Percentages take one decimal; everything else takes the numeric ladder, which
 * exists because a single table mixes amounts in the millions with per-share
 * figures in single digits and both must stay readable.
 */
export function formatFundamentalsCell(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") {
    if (isPercentKey(key)) return `${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`
    if (Math.abs(v) >= 1e6) return formatCompact(v)
    if (Math.abs(v) >= 1000) return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(v)
    return new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  }
  return String(v)
}