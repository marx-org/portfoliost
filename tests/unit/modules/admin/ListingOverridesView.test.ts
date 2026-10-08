import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RouteLocationNormalized } from "vue-router"
import ListingOverridesView from "@/modules/admin/ListingOverridesView.vue"
import router, { authGuard } from "@/router"
import {
  createListingOverride,
  disableListingOverride,
  fetchListingOverrideHistory,
  fetchListingOverrides,
  previewListingOverride,
  updateListingOverride,
  type ListingOverride,
} from "@/api/admin"

vi.mock("@/api/admin", () => ({
  fetchListingOverrides: vi.fn(),
  createListingOverride: vi.fn(),
  updateListingOverride: vi.fn(),
  disableListingOverride: vi.fn(),
  fetchListingOverrideHistory: vi.fn(),
  previewListingOverride: vi.fn(),
}))

const mocked = {
  fetchListingOverrides: vi.mocked(fetchListingOverrides),
  createListingOverride: vi.mocked(createListingOverride),
  updateListingOverride: vi.mocked(updateListingOverride),
  disableListingOverride: vi.mocked(disableListingOverride),
  fetchListingOverrideHistory: vi.mocked(fetchListingOverrideHistory),
  previewListingOverride: vi.mocked(previewListingOverride),
}

function makeOverride(overrides: Partial<ListingOverride> = {}): ListingOverride {
  return {
    listingKey: "NYSE::MFC",
    ticker: "MFC",
    exchange: "NYSE",
    quoteCurrency: "USD",
    assetType: "Stock",
    status: "active",
    rationale: "Quoted in USD on NYSE.",
    provenance: "pfire-docs#97",
    sourceVersion: "admin",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    upstreamPresent: false,
    tickerConflict: false,
    precedence: "curated",
    ...overrides,
  }
}

function listOf(items: ListingOverride[]) {
  return { items, pagination: { total: items.length, page: 1, per_page: 100, total_pages: 1 } }
}

function mountView() {
  return mount(ListingOverridesView)
}

async function fillForm(
  wrapper: ReturnType<typeof mountView>,
  values: { ticker?: string; exchange?: string; currency?: string; rationale?: string; provenance?: string } = {},
) {
  await wrapper.get('[data-testid="override-ticker"]').setValue(values.ticker ?? "MFC")
  await wrapper.get('[data-testid="override-exchange"]').setValue(values.exchange ?? "NYSE")
  await wrapper.get('[data-testid="override-currency"]').setValue(values.currency ?? "USD")
  await wrapper.get('[data-testid="override-rationale"]').setValue(values.rationale ?? "Quoted in USD on NYSE.")
  await wrapper.get('[data-testid="override-provenance"]').setValue(values.provenance ?? "pfire-docs#97")
}

describe("ListingOverridesView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("confirm", vi.fn(() => true))
    mocked.fetchListingOverrides.mockResolvedValue(listOf([makeOverride()]))
    mocked.fetchListingOverrideHistory.mockResolvedValue({ items: [] })
  })

  it("renders an override with its curated precedence and conflict metadata", async () => {
    mocked.fetchListingOverrides.mockResolvedValue(
      listOf([makeOverride({ upstreamPresent: true, tickerConflict: true })]),
    )
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain("NYSE::MFC")
    expect(wrapper.text()).toContain("curated")
    expect(wrapper.text()).toContain("upstream row")
    expect(wrapper.text()).toContain("ticker collision")
  })

  it("creates an override from the form and reloads the list", async () => {
    mocked.createListingOverride.mockResolvedValue(makeOverride())
    const wrapper = mountView()
    await flushPromises()

    await fillForm(wrapper, { ticker: "MFC", exchange: "NYSE" })
    await wrapper.get('[data-testid="listing-overrides-form"]').trigger("submit")
    await flushPromises()

    expect(mocked.createListingOverride).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "MFC", exchange: "NYSE", quoteCurrency: "USD" }),
    )
    expect(mocked.fetchListingOverrides).toHaveBeenCalledTimes(2)
  })

  it("surfaces a validation error from the API and keeps the form values", async () => {
    mocked.createListingOverride.mockRejectedValue(new Error("quoteCurrency must be an ISO-4217 code"))
    const wrapper = mountView()
    await flushPromises()

    await fillForm(wrapper, { currency: "US" })
    await wrapper.get('[data-testid="listing-overrides-form"]').trigger("submit")
    await flushPromises()

    expect(wrapper.text()).toContain("quoteCurrency must be an ISO-4217 code")
    expect((wrapper.get('[data-testid="override-ticker"]').element as HTMLInputElement).value).toBe("MFC")
  })

  it("edits an override and preserves rationale and provenance", async () => {
    mocked.updateListingOverride.mockResolvedValue(makeOverride({ rationale: "Updated rationale." }))
    const wrapper = mountView()
    await flushPromises()

    const editButton = wrapper.findAll("button").find((b) => b.text() === "Edit")!
    await editButton.trigger("click")
    await flushPromises()

    expect((wrapper.get('[data-testid="override-rationale"]').element as HTMLTextAreaElement).value).toBe(
      "Quoted in USD on NYSE.",
    )

    await wrapper.get('[data-testid="override-rationale"]').setValue("Updated rationale.")
    await wrapper.get('[data-testid="listing-overrides-form"]').trigger("submit")
    await flushPromises()

    expect(mocked.updateListingOverride).toHaveBeenCalledWith(
      "NYSE::MFC",
      expect.objectContaining({ rationale: "Updated rationale.", provenance: "pfire-docs#97" }),
    )
  })

  it("disables an override after confirmation", async () => {
    mocked.disableListingOverride.mockResolvedValue(makeOverride({ status: "disabled" }))
    const wrapper = mountView()
    await flushPromises()

    const disableButton = wrapper.findAll("button").find((b) => b.text() === "Disable")!
    await disableButton.trigger("click")
    await flushPromises()

    expect(window.confirm).toHaveBeenCalled()
    expect(mocked.disableListingOverride).toHaveBeenCalledWith("NYSE::MFC")
    expect(mocked.fetchListingOverrides).toHaveBeenCalledTimes(2)
  })

  it("does not disable when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false))
    const wrapper = mountView()
    await flushPromises()

    const disableButton = wrapper.findAll("button").find((b) => b.text() === "Disable")!
    await disableButton.trigger("click")
    await flushPromises()

    expect(mocked.disableListingOverride).not.toHaveBeenCalled()
  })

  it("reads the audit history for an override", async () => {
    mocked.fetchListingOverrideHistory.mockResolvedValue({
      items: [
        {
          id: 1,
          listingKey: "NYSE::MFC",
          action: "created",
          snapshot: {},
          actor: "admin-1 <admin@example.com>",
          createdAt: "2026-10-08T10:00:00.000Z",
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()

    const historyButton = wrapper.findAll("button").find((b) => b.text() === "History")!
    await historyButton.trigger("click")
    await flushPromises()

    const panel = wrapper.get('[data-testid="listing-overrides-history"]')
    expect(panel.text()).toContain("created")
    expect(panel.text()).toContain("admin-1 <admin@example.com>")
  })

  it("shows upstream conflict and precedence before saving", async () => {
    mocked.previewListingOverride.mockResolvedValue({
      listingKey: "NYSE::MFC",
      ticker: "MFC",
      exchange: "NYSE",
      upstreamPresent: true,
      tickerConflict: true,
      upstreamCurrency: "CAD",
      existingOverride: null,
      precedence: "curated",
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="override-ticker"]').setValue("MFC")
    await wrapper.get('[data-testid="override-exchange"]').setValue("NYSE")
    await wrapper.get('[data-testid="override-exchange"]').trigger("blur")
    await flushPromises()

    expect(mocked.previewListingOverride).toHaveBeenCalledWith("MFC", "NYSE")
    const panel = wrapper.get('[data-testid="listing-overrides-preview"]')
    expect(panel.text()).toContain("curated")
    expect(panel.text()).toContain("CAD")
    expect(panel.text()).toContain("ticker collision")
  })

  it("auth redirect: the route is admin-guarded and bounces anonymous users to login", async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    const resolved = router.resolve({ name: "admin-listing-overrides" })
    expect(resolved.meta.admin).toBe(true)

    // No token in storage — the guard must not let an anonymous deep link through.
    const result = await authGuard(resolved as unknown as RouteLocationNormalized)
    expect(result).toMatchObject({ name: "login" })
  })
})