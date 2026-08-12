import { http } from "./client"
import type { WalletBalanceHistory, Wallets, WalletsTotalBalance } from "./types"

export interface CashTransaction {
  id: string
  walletId: string
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER"
  amount: number
  currency: string
  status: string
  createdAt: string
  description: string | null
  transaction_date?: string | null
  payment_method?: string | null
  fees?: number
  fees_type?: string | null
  to_wallet_id?: string | null
  new_balance?: number
  remaining_balance?: number
  walletName?: string
}

export interface DepositInput {
  amount: number
  currency?: string
  description?: string
  transaction_date?: string
}

export interface WithdrawInput extends DepositInput {
  payment_method?: string
}

export interface TransferInput extends DepositInput {
  to_wallet_id: string
  fees?: number
  fees_type?: "fixed" | "pct"
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

export interface RecentCashTransaction {
  id: string
  walletId: string
  walletName: string | null
  type: string
  displayLabel: string
  amount: string
  currency: string
  exchangeRate: number | null
  reference: string | null
  date: string
  description: string | null
  createdAt: string
  portfolioId: string | null
  fees: number | null
  taxes: number | null
  isInternalTransfer: boolean
}

export interface RecentCashTransactionsPage {
  data: RecentCashTransaction[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
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
