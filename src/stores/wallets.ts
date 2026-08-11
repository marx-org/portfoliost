import { defineStore } from "pinia"
import { ref } from "vue"
import * as walletsApi from "@/api/wallets"
import type { Wallets, WalletsTotalBalance } from "@/api/types"
import type { CashTransaction, PaginatedCashTransactions } from "@/api/wallets"

export const useWalletsStore = defineStore("wallets", () => {
  const wallets = ref<Wallets>([])
  const totalBalance = ref<WalletsTotalBalance | null>(null)
  const transactions = ref<PaginatedCashTransactions | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [list, balance] = await Promise.all([walletsApi.getWallets(), walletsApi.getWalletTotalBalance()])
      wallets.value = list
      totalBalance.value = balance
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load wallets"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function create(input: { name: string; currency?: string }): Promise<void> {
    const created = await walletsApi.createWallet(input)
    wallets.value.push(created)
    await fetchAll()
  }

  async function fetchTransactions(id: string): Promise<void> {
    try {
      transactions.value = await walletsApi.getWalletTransactions(id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load wallet transactions"
    }
  }

  async function deposit(id: string, input: { amount: number; description?: string }): Promise<CashTransaction> {
    const tx = await walletsApi.depositToWallet(id, input)
    await fetchAll()
    await fetchTransactions(id)
    return tx
  }

  async function withdraw(id: string, input: { amount: number; description?: string }): Promise<CashTransaction> {
    const tx = await walletsApi.withdrawFromWallet(id, input)
    await fetchAll()
    await fetchTransactions(id)
    return tx
  }

  return { wallets, totalBalance, transactions, loading, error, fetchAll, create, fetchTransactions, deposit, withdraw }
})
