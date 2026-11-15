import { describe, expect, it, vi } from "vitest"
import { useChartScope } from "@/modules/charting/useChartScope"

function makeScope(query: Record<string, unknown>) {
  const route = { query } as never
  const router = { replace: vi.fn() }
  const scope = useChartScope({ route, router: router as never })
  return { scope, router: router as unknown as { replace: ReturnType<typeof vi.fn> } }
}

describe("useChartScope", () => {
  it("defaults to All when the query is empty", () => {
    const { scope } = makeScope({})
    expect(scope.allAccounts.value).toBe(true)
    expect(scope.allLabels.value).toBe(true)
    expect(scope.selectedAccountIds.value).toEqual([])
  })

  it("parses accounts/labels from the route query", () => {
    const { scope } = makeScope({ accounts: "a,b", labels: "l1" })
    expect(scope.selectedAccountIds.value).toEqual(["a", "b"])
    expect(scope.selectedLabelIds.value).toEqual(["l1"])
    expect(scope.allAccounts.value).toBe(false)
  })

  it("sets accounts and persists them to the route (comma-separated)", () => {
    const { scope, router } = makeScope({})
    scope.setAccounts(["a", "b"])
    expect(scope.selectedAccountIds.value).toEqual(["a", "b"])
    expect(scope.allAccounts.value).toBe(false)
    expect(router.replace).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ accounts: "a,b" }) }))
  })

  it("toggles a label on and off", () => {
    const { scope } = makeScope({})
    scope.toggleLabel("l1")
    expect(scope.selectedLabelIds.value).toEqual(["l1"])
    scope.toggleLabel("l1")
    expect(scope.selectedLabelIds.value).toEqual([])
    expect(scope.allLabels.value).toBe(true)
  })

  it("reset clears the selection and returns to All", () => {
    const { scope, router } = makeScope({ accounts: "a", labels: "l1" })
    scope.reset()
    expect(scope.allAccounts.value).toBe(true)
    expect(scope.allLabels.value).toBe(true)
    expect(router.replace).toHaveBeenCalled()
  })

  it("exposes a comma-serialised scope query for the API adapter", () => {
    const { scope } = makeScope({ accounts: "a,b" })
    expect(scope.scopeQuery.value.accounts).toEqual(["a", "b"])
  })
})