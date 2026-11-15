import { flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ChartingLayout from "@/modules/charting/ChartingLayout.vue"

// The layout owns the shared chart scope, which lives in the route query. A
// reactive in-memory route + a router that writes back into it exercises the
// real round trip (toggle → URL → deep link) without a history stack.
vi.mock("vue-router", async () => {
  const { reactive } = await import("vue")
  const { vi } = await import("vitest")
  const route = reactive({ path: "/en/charting/performance", query: {} as Record<string, string> })
  const replace = vi.fn((to: { query?: Record<string, string> }) => {
    // Keep the fields the route still carries (path is implicit); drop only the
    // scope keys the composable owns, exactly as the real router replace does.
    const next: Record<string, string> = { ...(to.query ?? {}) }
    route.query = next
    return Promise.resolve()
  })
  ;(globalThis as Record<string, unknown>).__chartRoute = route
  ;(globalThis as Record<string, unknown>).__chartReplace = replace
  return { useRoute: () => route, useRouter: () => ({ replace }) }
})

vi.mock("@/api/portfolios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/portfolios")>()
  return {
    ...actual,
    getPortfolios: vi.fn(async () => [
      { id: "a1", name: "Account One" },
      { id: "a2", name: "Account Two" },
    ] as never),
    getPortfolioTotalMetrics: vi.fn(async () => ({}) as never),
  }
})

vi.mock("@/api/labels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/labels")>()
  return { ...actual, getLabels: vi.fn(async () => []) }
})

const route = () =>
  (globalThis as unknown as Record<string, { query: Record<string, string>; path: string }>).__chartRoute
const replaceMock = () =>
  (globalThis as unknown as Record<string, ReturnType<typeof vi.fn>>).__chartReplace

function mountLayout() {
  return mount(ChartingLayout, {
    global: {
      plugins: [createPinia()],
      stubs: {
        "router-link": { props: ["to"], template: '<a><slot /></a>' },
        "router-view": true,
        LabelFilterBar: { template: '<div data-testid="label-filter-bar-stub" />' },
      },
    },
  })
}

/** VTU has no getByText; match a button by its rendered text. */
function buttonByText(wrapper: ReturnType<typeof mountLayout>, text: string) {
  const btn = wrapper.findAll("button").find((b) => b.text() === text)
  if (!btn) throw new Error(`button not found: ${text}`)
  return btn
}

/** The toolbar's "All" account chip is the span whose text is exactly "All". */
function hasAllAccountsChip(wrapper: ReturnType<typeof mountLayout>): boolean {
  return wrapper.get('[data-testid="charting-toolbar"]').findAll("span").some((s) => s.text() === "All")
}

describe("ChartingLayout", () => {
  beforeEach(() => {
    route().path = "/en/charting/performance"
    route().query = {}
    replaceMock().mockClear()
  })

  it("shows the five sections and defaults to All accounts/labels", async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const nav = wrapper.findAll('[data-testid="charting-nav"]').map((n) => n.text()).join(" ")
    expect(nav).toContain("Performance")
    expect(nav).toContain("Stock categories")
    // All is the default: no account is selected and the All chip is shown.
    expect(hasAllAccountsChip(wrapper)).toBe(true)
  })

  it("selecting an account persists it to the route query (deep-linkable)", async () => {
    const wrapper = mountLayout()
    await flushPromises()
    await buttonByText(wrapper, "Account One").trigger("click")
    expect(replaceMock()).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ accounts: "a1" }) }))
    expect(route().query.accounts).toBe("a1")
    // The chip now reads as selected; the All chip is gone.
    expect(hasAllAccountsChip(wrapper)).toBe(false)
  })

  it("reset returns to All and clears the query", async () => {
    route().query = { accounts: "a1" }
    const wrapper = mountLayout()
    await flushPromises()
    await buttonByText(wrapper, "Reset").trigger("click")
    expect(route().query.accounts).toBeUndefined()
    expect(hasAllAccountsChip(wrapper)).toBe(true)
  })

  it("a deep link with accounts reads them back into the selection", async () => {
    route().query = { accounts: "a2" }
    const wrapper = mountLayout()
    await flushPromises()
    expect(buttonByText(wrapper, "Account Two").classes()).toContain("border-blue-500")
    expect(hasAllAccountsChip(wrapper)).toBe(false)
  })
})