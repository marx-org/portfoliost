import { http } from "./client"
import type { components } from "../../generated/api-types"

export interface ServiceVersion {
  service: string
  version: string
  impl: "real" | "mock" | "unknown"
}

export interface SystemVersionsResponse {
  services: ServiceVersion[]
  fetchedAt: string
}

export interface FxRateItem {
  date: string
  baseCurrency: string
  quoteCurrency: string
  rate: number
}

export interface Pagination {
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface FxRatesResponse {
  items: FxRateItem[]
  pagination: Pagination
}

// Contract-typed admin user (from @marx2/contracts /api/admin/users).
export type AdminUser = components["schemas"]["AdminUser"]
export type UsersResponse = components["schemas"]["AdminUserListResponse"]
export type SplitCandidate = components["schemas"]["SplitCandidate"]
export type OverflowSummary = components["schemas"]["OverflowSummary"]

export function fetchSystemVersions(): Promise<SystemVersionsResponse> {
  return http.get<SystemVersionsResponse>("/api/admin/system/versions")
}

export function fetchFxRates(params?: Record<string, string>): Promise<FxRatesResponse> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return http.get<FxRatesResponse>(`/api/admin/currencies/rates${qs}`)
}

export function fetchAdminUsers(params?: Record<string, string>): Promise<UsersResponse> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return http.get<UsersResponse>(`/api/admin/users${qs}`)
}

export function fetchSplitCandidates(): Promise<SplitCandidate[]> {
  return http.get<SplitCandidate[]>("/api/admin/market-data/split-candidates")
}

export function applySplitCandidate(symbol: string, factor: number): Promise<{ ok: boolean }> {
  return http.post<{ ok: boolean }>(`/api/admin/market-data/split-candidates/${encodeURIComponent(symbol)}/apply`, { factor })
}

export function dismissSplitCandidate(symbol: string): Promise<{ ok: boolean }> {
  return http.post<{ ok: boolean }>(`/api/admin/market-data/split-candidates/${encodeURIComponent(symbol)}/dismiss`, {})
}

export function fetchOverflowSummary(): Promise<OverflowSummary> {
  return http.get<OverflowSummary>("/api/admin/market-data/overflow-summary")
}

export function fetchStooqImportLog(): Promise<Array<components["schemas"]["StooqImportLogEntry"]>> {
  return http.get("/api/admin/jobs/stooq-import/log")
}
