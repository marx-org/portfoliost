/**
 * §86 — the per-asset-class Key Facts row table.
 *
 * Lives beside the card rather than inside it so the labels are one importable
 * map instead of `<script setup>`-local: a new asset class is one schema plus one
 * array entry here, and the component needs no edit at all.
 *
 * Provider text renders verbatim. `secured` is "NIE", `status` is "Notowane",
 * `couponType` is "zmienne WIBOR 3M + 4%": translating them would mean inventing
 * an English vocabulary the rest of the app does not have. Only numbers and dates
 * are formatted.
 */
import { formatAmount, formatDate, formatNumber, formatPercent } from "@/utils/format"
import type { InstrumentsProfile } from "@/api/types"

export type KeyFacts = NonNullable<InstrumentsProfile["keyFacts"]>
export type KeyFactsKind = KeyFacts["kind"]
type FactsFor<K extends KeyFactsKind> = Extract<KeyFacts, { kind: K }>

export const DASH = "—"

export interface RowContext {
  facts: KeyFacts | null
  profile: InstrumentsProfile
}

export interface KeyFactRow {
  /** Field on the key-facts object, or on the profile when there is no keyFacts. */
  field: string
  /** Static label, or one derived from the row's own facts (see `marginLabel`). */
  label: string | ((ctx: RowContext) => string)
  format: (value: unknown, ctx: RowContext) => string
}

/** Raw provider text, or a dash. */
export function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? DASH : String(value)
}

export function amount(value: unknown, ctx: RowContext): string {
  if (value === null || value === undefined) return DASH
  const currency = (ctx.facts as { nominalCurrency?: string | null } | null)?.nominalCurrency
  return formatAmount(value as number, currency ?? null)
}

export function integer(value: unknown): string {
  return value === null || value === undefined ? DASH : formatNumber(value as number, 0)
}

export function decimal(value: unknown): string {
  return value === null || value === undefined ? DASH : formatNumber(value as number)
}

export function percent(value: unknown): string {
  return value === null || value === undefined ? DASH : formatPercent(value as number)
}

export function day(value: unknown): string {
  return value ? formatDate(value as string) : DASH
}

export function months(value: unknown): string {
  return value === null || value === undefined ? DASH : `${decimal(value)} months`
}

/**
 * §86 — the single most important label in this table.
 *
 * The savings-bond `margin` column is overloaded: under `rateRule: "fixed"` the
 * stored number *is* the flat annual rate, under `cpi_12m+margin` it is the
 * inflation add-on, under `nbp_ref+margin` the NBP add-on. A card that always
 * says "Margin" states something false for two of the three savings-bond
 * families, so the label switches on the field that decides which it is — and
 * defaults to "Rate", which is the honest reading of an absent rule.
 */
export function marginLabel(ctx: RowContext): string {
  const rateRule = (ctx.facts as FactsFor<"bond"> | null)?.rateRule
  switch (rateRule) {
    case "cpi_12m+margin":
      return "Inflation margin"
    case "nbp_ref+margin":
      return "NBP margin"
    default:
      return "Rate"
  }
}

/** §86 — one array per class. */
export const KEY_FACT_ROWS: Record<KeyFactsKind, ReadonlyArray<KeyFactRow>> = {
  stock: [
    { field: "sector", label: "Sector", format: text },
    { field: "industry", label: "Industry", format: text },
    { field: "employees", label: "Employees", format: integer },
    { field: "ceo", label: "CEO", format: text },
  ],
  etf: [{ field: "category", label: "Category", format: text }],
  fund: [{ field: "categoryCode", label: "Category code", format: text }],
  crypto: [
    { field: "name", label: "Name", format: text },
    { field: "exchange", label: "Exchange", format: text },
    { field: "icoDate", label: "ICO", format: day },
    { field: "circulatingSupply", label: "Circulating supply", format: decimal },
    { field: "totalSupply", label: "Total supply", format: decimal },
  ],
  bond: [
    { field: "seriesCode", label: "Series", format: text },
    { field: "issueDate", label: "Issue date", format: day },
    { field: "termMonths", label: "Term", format: months },
    { field: "rateRule", label: "Rate rule", format: text },
    { field: "margin", label: marginLabel, format: percent },
    { field: "maturityDate", label: "Maturity", format: day },
    { field: "nominal", label: "Nominal", format: amount },
    { field: "redemptionFee", label: "Redemption fee", format: percent },
  ],
  corp_bond: [
    { field: "issuer", label: "Issuer", format: text },
    { field: "series", label: "Series", format: text },
    { field: "market", label: "Market", format: text },
    { field: "status", label: "Status", format: text },
    { field: "nominalValue", label: "Nominal", format: amount },
    { field: "nominalCurrency", label: "Nominal currency", format: text },
    { field: "secured", label: "Secured", format: text },
    { field: "couponType", label: "Coupon type", format: text },
    { field: "currentRate", label: "Current rate", format: percent },
    { field: "maturityDate", label: "Maturity", format: day },
  ],
}

/**
 * Where an equity row's value lives when the backend sent no `keyFacts` — an
 * older instruments build, or a symbol the route could not classify. These four
 * are exactly the rows the hard-coded card always showed, so the fallback is
 * what keeps a stock's card identical rather than a second, emptier layout.
 */
export const PROFILE_FIELD: Record<string, keyof InstrumentsProfile> = {
  sector: "gicsSector",
  industry: "gicsIndustry",
  employees: "employeeTotal",
  ceo: "ceo",
}