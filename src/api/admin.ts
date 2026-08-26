import { http } from "./client"

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

export interface AdminUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  groups: string[]
  lastLogin: string | null
  createdAt: string
}

export interface UsersResponse {
  items: AdminUser[]
  pagination: Pagination
}

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
