import { http } from "./client"
import type { components } from "../../generated/api-types"

type Wallets = components["schemas"]["CashWallet"][]
type WalletBalanceHistory = components["schemas"]["BalanceHistory"]
type WalletsTotalBalance = components["schemas"]["WalletsTotalBalance"]
export type CashTransaction = components["schemas"]["CashTransaction"]
export type RecentCashTransaction = components["schemas"]["RecentCashTransaction"]
type RecentCashTransactionsPage = components["schemas"]["RecentCashTransactionsPage"]

export interface DepositInput {
  amount: number
  currency?: string
  description?: string
  transaction_date?: string
  /** fees-and-custom-fx D28/D29 */
  fees?: number
  fees_type?: "fixed" | "pct"
  feeCurrency?: string
  rateSource?: "automatic" | "manual"
  exchangeRate?: number
  feeRateSource?: "automatic" | "manual"
  feeExchangeRate?: number
}

export interface WithdrawInput extends DepositInput {
  payment_method?: string
}

export interface TransferInput extends DepositInput {
  to_wallet_id: string
  /** elastic cross-currency transfer (wallets D22): explicit target leg */
  targetAmount?: number
  targetFxRate?: number
}

export interface PaginatedCashTransactions {
  items: CashTransaction[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export async function getWallets(): Promise<Wallets> {
  return http.get<Wallets>("/api/wallets")
}

export async function getWalletTotalBalance(): Promise<WalletsTotalBalance> {
  return http.get<WalletsTotalBalance>("/api/wallets/total-balance")
}

export async function createWallet(input: { name: string; currency?: string }): Promise<Wallets[number]> {
  return http.post<Wallets[number]>("/api/wallets", input)
}

export async function getWalletBalanceHistory(id: string): Promise<WalletBalanceHistory> {
  return http.get<WalletBalanceHistory>(`/api/wallets/${id}/balance-history`)
}

export async function getWalletTransactions(id: string): Promise<PaginatedCashTransactions> {
  return http.get<PaginatedCashTransactions>(`/api/wallets/${id}/transactions`)
}

export async function getAllWalletTransactions(
  page = 1,
  limit = 10,
  sortBy = "date",
  sortOrder: "asc" | "desc" = "desc",
): Promise<RecentCashTransactionsPage> {
  return http.get<RecentCashTransactionsPage>(
    `/api/wallets/recent-transactions?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
  )
}

export interface UpdateRecentCashTransaction {
  type?: string
  amount?: number
  description?: string
  date?: string
  /** fees-and-custom-fx edit parity (plan §13 follow-up 2/6) */
  fees?: number
  fees_type?: "fixed" | "pct"
  feeCurrency?: string
  feeRateSource?: "automatic" | "manual"
  feeExchangeRate?: number
}

export async function updateWalletTransaction(
  id: string,
  input: UpdateRecentCashTransaction,
): Promise<RecentCashTransaction> {
  return http.patch<RecentCashTransaction>(`/api/wallets/transactions/${id}`, input)
}

export async function deleteWalletTransaction(id: string): Promise<void> {
  return http.delete<void>(`/api/wallets/transactions/${id}`)
}

export async function depositToWallet(id: string, input: DepositInput): Promise<CashTransaction> {
  return http.post<CashTransaction>(`/api/wallets/${id}/deposits`, input)
}

export async function withdrawFromWallet(id: string, input: WithdrawInput): Promise<CashTransaction> {
  return http.post<CashTransaction>(`/api/wallets/${id}/withdrawals`, input)
}

export async function transferBetweenWallets(id: string, input: TransferInput): Promise<CashTransaction> {
  return http.post<CashTransaction>(`/api/wallets/${id}/transfers`, input)
}

export async function renameWallet(id: string, input: { name: string }): Promise<Wallets[number]> {
  return http.patch<Wallets[number]>(`/api/wallets/${id}`, input)
}

export async function deleteWallet(id: string): Promise<void> {
  return http.delete<void>(`/api/wallets/${id}`)
}
