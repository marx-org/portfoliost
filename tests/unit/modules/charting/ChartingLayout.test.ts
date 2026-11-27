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
      { id: "a1", name: "Account One", isVirtual: false },
      { id: "a2", name: "Account Two", isVirtual: false },
      { id: "v1", name: "Growth View", isVirtual: true },
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

  it("normal mode lists only real accounts and hides virtual portfolios", async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const text = wrapper.get('[data-testid="charting-toolbar"]').text()
    expect(text).toContain("Account One")
    expect(text).not.toContain("Growth View")
    expect(buttonByText(wrapper, "Normal").classes()).toContain("bg-blue-600")
  })

  it("switching to virtual lists only virtual portfolios and clears the account selection", async () => {
    route().query = { accounts: "a1" }
    const wrapper = mountLayout()
    await flushPromises()
    await buttonByText(wrapper, "Virtual").trigger("click")
    const toolbar = wrapper.get('[data-testid="charting-toolbar"]')
    expect(toolbar.text()).toContain("Growth View")
    expect(toolbar.text()).not.toContain("Account One")
    // Switching side is mutually exclusive: the real account selection is gone.
    expect(route().query.accounts).toBeUndefined()
    expect(route().query.kind).toBe("virtual")
    expect(hasAllAccountsChip(wrapper)).toBe(true)
  })

  it("predefined ranges set the date window, and ALL clears it", async () => {
    const wrapper = mountLayout()
    await flushPromises()

    await buttonByText(wrapper, "1M").trigger("click")
    expect(route().query.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(route().query.to).toBeUndefined()
    // The chosen range is highlighted.
    expect(buttonByText(wrapper, "1M").classes()).toContain("bg-accent-soft")

    // ALL clears the window.
    await buttonByText(wrapper, "ALL").trigger("click")
    expect(route().query.from).toBeUndefined()
    expect(route().query.to).toBeUndefined()
    expect(buttonByText(wrapper, "ALL").classes()).toContain("bg-accent-soft")
  })

  it("reset returns to normal and clears the kind", async () => {
    route().query = { kind: "virtual" }
    const wrapper = mountLayout()
    await flushPromises()
    await buttonByText(wrapper, "Reset").trigger("click")
    expect(route().query.kind).toBeUndefined()
    expect(buttonByText(wrapper, "Normal").classes()).toContain("bg-blue-600")
  })
})