export function researchSymbol(symbol: string, exchange?: string | null): string {
  const sym = String(symbol).toUpperCase()
  // Already venue-qualified (SNT.WA, AAPL.US) — never double-suffix.
  if (sym.includes(".")) return sym
  // Venue-qualified route symbol keeps cross-exchange ticker collisions apart
  // (SNT trades as Synektik on WSE and Senstar in North America). US stays
  // the legacy ".US" default.
  if (exchange && exchange.toUpperCase() !== "US") {
    return `${sym}.${exchange.toUpperCase()}`
  }
  return `${sym}.US`
}

export function baseSymbol(symbol: string): string {
  return String(symbol).split(".")[0].toUpperCase()
}

export function symbolExchange(symbol: string): string | null {
  const parts = String(symbol).split(".")
  return parts.length > 1 ? (parts[1].toUpperCase() ?? null) : null
}
