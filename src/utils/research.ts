import type { RouteLocationRaw } from "vue-router"

export const RESEARCH_FALLBACK_PATH = "/en/investments"

export function researchSymbol(symbol: string): string {
  return String(symbol).toUpperCase()
}

/**
 * The single place that builds a link into research. Every contextual entry
 * point passes the current page's `route.fullPath` as `from` so the research
 * header's "Go back" link can return to the page the user came from.
 */
export function researchRoute(symbol: string, from?: string | null): RouteLocationRaw {
  const location: RouteLocationRaw = {
    name: "research-overview",
    params: { symbol: researchSymbol(symbol) },
  }
  if (from) location.query = { from }
  return location
}

/**
 * Resolve the research page's back target from its `from` query param.
 * Only internal `/en/` paths are honoured — an absolute URL, a protocol
 * relative URL or a relative path falls back to the investments page.
 */
export function researchBackTarget(query: Record<string, unknown>): string {
  const from = query?.from
  if (typeof from === "string" && from.startsWith("/en/")) return from
  return RESEARCH_FALLBACK_PATH
}
