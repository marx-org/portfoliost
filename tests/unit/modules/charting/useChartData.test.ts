import { describe, expect, it, vi } from "vitest"
import { useChartData, scopeKey } from "@/modules/charting/useChartData"

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("useChartData", () => {
  it("loads a dataset for a scope", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 })
    const { data, loading, load } = useChartData(fetcher)
    await load({ accounts: ["a"] })
    expect(data.value).toEqual({ value: 1 })
    expect(loading.value).toBe(false)
  })

  it("discards a stale response when a newer load supersedes it", async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce({ value: 2 })
    const { data, load } = useChartData(fetcher)

    const first = load({ accounts: ["a"] })
    const second = load({ accounts: ["a", "b"] })
    resolveFirst({ value: 1 }) // resolve the OLD request last
    await first
    await second
    await flush()
    expect(data.value).toEqual({ value: 2 }) // newer wins
  })

  it("captures an error for the current scope", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"))
    const { error, load } = useChartData(fetcher)
    await load({})
    expect((error.value as Error).message).toBe("boom")
  })

  it("keys a scope deterministically regardless of order", () => {
    expect(scopeKey({ accounts: ["b", "a"], labels: ["y", "x"] })).toBe(
      scopeKey({ accounts: ["a", "b"], labels: ["x", "y"] }),
    )
  })
})