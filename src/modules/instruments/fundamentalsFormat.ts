import { formatCompact } from "@/utils/format"

/**
 * §79.1 — the statement columns whose value IS a percentage.
 *
 * `*growth*` is a substring test on purpose: four of the statement's growth
 * columns share that suffix and none of them is an amount, so one test covers
 * them. The two named keys are the ratios the statement declares.
 *
 * `freeCashFlowPerShare` used to be in this set. It is currency PER SHARE, not a
 * ratio — `$33.67` rendered as `33.7%`, a wrong unit rather than a wrong
 * precision, and nothing on the card said which currency it was even in.
 * It now falls through to the numeric ladder below.
 */
const PERCENT_KEYS = new Set(["netIncomeMargin", "debtEquityRatio"])

function isPercentKey(key: string): boolean {
  return key.toLowerCase().includes("growth") || PERCENT_KEYS.has(key)
}

/**
 * Format one statement cell.
 *
 * Percentages take one decimal; everything else takes the numeric ladder, which
 * exists because a single table mixes amounts in the millions with per-share
 * figures in single digits and both must stay readable.
 *
 * Known and NOT fixed here: `debtEquityRatio` is a MULTIPLE, not a percentage,
 * so `1.52` still renders as `1.5%`. It was in the percent branch before §79.1
 * and is out of scope for a step about one column's unit; §79.3 is what made it
 * visible by populating it for non-US names.
 */
export function formatFundamentalsCell(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") {
    if (isPercentKey(key)) return `${v.toFixed(1)}%`
    if (Math.abs(v) >= 1e6) return formatCompact(v)
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    return v.toFixed(2)
  }
  return String(v)
}