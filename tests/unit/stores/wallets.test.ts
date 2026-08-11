import { createPinia, setActivePinia, type Pinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useWalletsStore } from "@/stores/wallets"
import * as walletsApi from "@/api/wallets"

vi.mock("@/api/wallets", async (importOriginal) => {
  const actual = await importOriginal<typeof walletsApi>()
  return {
    ...actual,
    getWallets: vi.fn(),
    getWalletTotalBalance: vi.fn(),
    createWallet: vi.fn(),
    getWalletTransactions: vi.fn(),
    depositToWallet: vi.fn(),
    withdrawFromWallet: vi.fn(),
  }
})

const mocked = vi.mocked(walletsApi)

function wallet() {
  return {
    id: "w1",
    userId: "u1",
    name: "Portfel USD 1",
    currency: "USD",
    balance: 1916.6,
    availableBalance: 1916.6,
    isDefault: false,
    createdAt: "2026-08-01T10:20:34.925Z",
    updatedAt: "2026-08-01T10:20:34.925Z",
  }
}

describe("wallets store", () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mocked.getWallets.mockResolvedValue([wallet()])
    mocked.getWalletTotalBalance.mockResolvedValue({
      totalBalance: 1916.6,
      totalAvailableBalance: 1916.6,
      baseCurrency: "USD",
      walletBreakdown: [],
    } as never)
  })

  it("starts empty", () => {
    const store = useWalletsStore()
    expect(store.wallets).toEqual([])
    expect(store.totalBalance).toBeNull()
  })

  it("loads wallets and total balance", async () => {
    const store = useWalletsStore()
    await store.fetchAll()

    expect(store.wallets).toHaveLength(1)
    expect(store.totalBalance?.totalBalance).toBe(1916.6)
  })

  it("creates a wallet and refetches", async () => {
    mocked.createWallet.mockResolvedValue(wallet())
    const store = useWalletsStore()
    await store.create({ name: "New" })

    expect(mocked.createWallet).toHaveBeenCalledWith({ name: "New" })
    expect(mocked.getWallets).toHaveBeenCalled()
  })

  it("deposits and refreshes balances and transactions", async () => {
    mocked.depositToWallet.mockResolvedValue({
      id: "tx1",
      walletId: "w1",
      type: "DEPOSIT",
      amount: 100,
      currency: "USD",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      description: null,
    })
    mocked.getWalletTransactions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 1, hasNext: false, hasPrevious: false })

    const store = useWalletsStore()
    await store.fetchAll()
    const tx = await store.deposit("w1", { amount: 100 })

    expect(tx.type).toBe("DEPOSIT")
    expect(mocked.depositToWallet).toHaveBeenCalledWith("w1", { amount: 100 })
    expect(mocked.getWalletTotalBalance).toHaveBeenCalled()
  })

  it("withdraws from a wallet", async () => {
    mocked.withdrawFromWallet.mockResolvedValue({
      id: "tx2",
      walletId: "w1",
      type: "WITHDRAWAL",
      amount: 50,
      currency: "USD",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      description: null,
    })

    const store = useWalletsStore()
    const tx = await store.withdraw("w1", { amount: 50 })

    expect(tx.type).toBe("WITHDRAWAL")
    expect(mocked.withdrawFromWallet).toHaveBeenCalledWith("w1", { amount: 50 })
  })
})
