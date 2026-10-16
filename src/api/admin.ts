import { http } from "./client"
import type { components } from "../../generated/api-types"

export interface ServiceVersion {
  service: string
  version: string
  impl: "real" | "mock" | "unknown" | "job"
  image?: string
  /** cron expression, for `impl: "job"` rows backed by a CronJob (§80.1) */
  schedule?: string
  /** true when the CronJob is suspended — it must not read as "running" */
  suspended?: boolean
}

// Contract-typed admin user (from @marx-org/contracts /api/admin/users).
export type AdminUser = components["schemas"]["AdminUser"]
export type UsersResponse = components["schemas"]["AdminUserListResponse"]
export type SplitCandidate = components["schemas"]["SplitCandidate"]
export type OverflowSummary = components["schemas"]["OverflowSummary"]

// Contract-typed curated listing overrides (#97). The shapes are generated
// components, so a backend change that drops or renames a field fails here.
export type ListingOverride = components["schemas"]["AdminListingOverride"]
export type ListingOverrideInput = components["schemas"]["AdminListingOverrideInput"]
export type ListingOverridePreview = components["schemas"]["AdminListingOverridePreview"]
export type ListingOverridesResponse = components["schemas"]["AdminListingOverridesResponse"]
export type ListingOverrideHistoryEntry = components["schemas"]["AdminListingOverrideHistoryEntry"]

export interface SystemVersionsResponse {
  services: ServiceVersion[]
  fetchedAt: string
}

// Contract-typed admin FX rate listing (from @marx-org/contracts /admin/currencies/rates).
export type FxRateItem = components["schemas"]["AdminFxRate"]
export type FxRatesResponse = components["schemas"]["AdminFxRatesResponse"]

// D55-4 — topology live overlay (from @marx-org/contracts /admin/topology/*).
export type TopologyStatusResponse = components["schemas"]["TopologyStatusResponse"]
export type TopologyTrafficResponse = components["schemas"]["TopologyTrafficResponse"]

export function fetchSystemVersions(): Promise<SystemVersionsResponse> {
  return http.get<SystemVersionsResponse>("/api/admin/system/versions")
}

export function fetchTopologyStatus(): Promise<TopologyStatusResponse> {
  return http.get<TopologyStatusResponse>("/api/admin/topology/status")
}

export function fetchTopologyTraffic(): Promise<TopologyTrafficResponse> {
  return http.get<TopologyTrafficResponse>("/api/admin/topology/traffic")
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

export function applySplitCandidate(symbol: string, factor: number, effectiveDate: string): Promise<{ ok: boolean }> {
  return http.post<{ ok: boolean }>(`/api/admin/market-data/split-candidates/${encodeURIComponent(symbol)}/apply`, { factor, effectiveDate })
}

export function dismissSplitCandidate(symbol: string): Promise<{ ok: boolean }> {
  return http.post<{ ok: boolean }>(`/api/admin/market-data/split-candidates/${encodeURIComponent(symbol)}/dismiss`, {})
}

export function fetchOverflowSummary(): Promise<OverflowSummary> {
  return http.get<OverflowSummary>("/api/admin/market-data/overflow-summary")
}

export function fetchListingOverrides(params?: Record<string, string>): Promise<ListingOverridesResponse> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return http.get<ListingOverridesResponse>(`/api/admin/listing-overrides${qs}`)
}

export function createListingOverride(input: ListingOverrideInput): Promise<ListingOverride> {
  return http.post<ListingOverride>("/api/admin/listing-overrides", input)
}

export function updateListingOverride(listingKey: string, input: ListingOverrideInput): Promise<ListingOverride> {
  return http.put<ListingOverride>(`/api/admin/listing-overrides/${encodeURIComponent(listingKey)}`, input)
}

export function disableListingOverride(listingKey: string): Promise<ListingOverride> {
  return http.post<ListingOverride>(`/api/admin/listing-overrides/${encodeURIComponent(listingKey)}/disable`, {})
}

export function fetchListingOverrideHistory(listingKey: string): Promise<{ items: ListingOverrideHistoryEntry[] }> {
  return http.get<{ items: ListingOverrideHistoryEntry[] }>(`/api/admin/listing-overrides/${encodeURIComponent(listingKey)}/history`)
}

export function previewListingOverride(ticker: string, exchange: string): Promise<ListingOverridePreview> {
  const qs = new URLSearchParams({ ticker, exchange }).toString()
  return http.get<ListingOverridePreview>(`/api/admin/listing-overrides/preview?${qs}`)
}

export function fetchStooqImportLog(): Promise<Array<components["schemas"]["StooqImportLogEntry"]>> {
  return http.get("/api/admin/jobs/stooq-import/log")
}

// D82 — openst bond catalogue + CPI series (admin-internal read-only; these
// tables live in the `openst` Postgres schema, not the SPA-facing contract).
export interface BondCatalogueRow {
  symbol: string
  name: string
  issueDate: string | null
  maturityDate: string | null
  rateRule: string | null
  margin: string | null
}

export interface BondCatalogueResponse {
  count: number
  rows: BondCatalogueRow[]
}

export interface CpiRow {
  date: string
  value: string
}

export interface CpiSummary {
  rowCount: number
  stale: boolean
  lastDate: string | null
  ageDays: number | null
  rows: CpiRow[]
}

export function fetchBondCatalogue(): Promise<BondCatalogueResponse> {
  return http.get<BondCatalogueResponse>("/api/admin/bond-catalogue/bond-series")
}

export function fetchCpiSeries(): Promise<CpiSummary> {
  return http.get<CpiSummary>("/api/admin/bond-catalogue/cpi")
}
