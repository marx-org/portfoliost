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

export async function depositToWallet(id: string, input: { amount: number; description?: string }): Promise<CashTransaction> {
  return http.post<CashTransaction>(`/api/wallets/${id}/deposits`, input)
}

export async function withdrawFromWallet(id: string, input: { amount: number; description?: string }): Promise<CashTransaction> {
  return http.post<CashTransaction>(`/api/wallets/${id}/withdrawals`, input)
}
