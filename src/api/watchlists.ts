import { http } from "./client"

export interface WatchlistItem {
  symbol: string
  name: string
  type: string
  addedAt: string
}

export interface Watchlist {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  items: WatchlistItem[]
}

export async function getWatchlists(): Promise<Watchlist[]> {
  return http.get<Watchlist[]>("/api/watchlists")
}

export async function getWatchlist(id: string): Promise<Watchlist> {
  return http.get<Watchlist>(`/api/watchlists/${id}`)
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  return http.post<Watchlist>("/api/watchlists", { name })
}

export async function deleteWatchlist(id: string): Promise<void> {
  return http.delete<void>(`/api/watchlists/${id}`)
}

export async function addWatchlistItem(id: string, symbol: string): Promise<Watchlist> {
  return http.post<Watchlist>(`/api/watchlists/${id}/items`, { symbol })
}

export async function removeWatchlistItem(id: string, symbol: string): Promise<Watchlist> {
  return http.delete<Watchlist>(`/api/watchlists/${id}/items/${encodeURIComponent(symbol)}`)
}
