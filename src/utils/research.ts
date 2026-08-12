export function researchSymbol(symbol: string): string {
  return `${String(symbol).toUpperCase()}.US`
}

export function baseSymbol(symbol: string): string {
  return String(symbol).split(".")[0].toUpperCase()
}
