import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import JobsView from "@/modules/admin/JobsView.vue"
import { getStooqImportLog, getSheetsSyncLog, runPriceAudit, getPriceAuditStatus } from "@/api/adminJobs"

vi.mock("@/api/adminJobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/adminJobs")>()
  return {
    ...actual,
    getStooqImportLog: vi.fn(),
    getSheetsSyncLog: vi.fn(),
    runPriceAudit: vi.fn(),
    getPriceAuditStatus: vi.fn(),
  }
})

const mockedLog = vi.mocked(getStooqImportLog)
const mockedSheetsLog = vi.mocked(getSheetsSyncLog)
const mocks = { runPriceAudit: vi.mocked(runPriceAudit), status: vi.mocked(getPriceAuditStatus) }

const EXPECTED_DATASETS = [
  "daily_world",
  "daily_us",
  "daily_uk",
  "daily_jp",
  "daily_hk",
  "daily_pl",
  "daily_hu",
  "daily_macro",
]

describe("JobsView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLog.mockResolvedValue([])
    mockedSheetsLog.mockResolvedValue({ startedAt: null, status: null, mode: null })
    mocks.runPriceAudit.mockResolvedValue({ jobName: "portfoliost-price-audit", namespace: "pfire", status: "Running" })
    mocks.status.mockResolvedValue({ jobName: "portfoliost-price-audit", status: "NotFound", details: null })
  })

  it("renders a card per stooq dataset + the Google Sheets and price-audit cards", async () => {
    const wrapper = mount(JobsView)
    await flushPromises()

    for (const dataset of EXPECTED_DATASETS) {
      expect(wrapper.find(`[data-testid="job-card-${dataset}"]`).exists(), `card for ${dataset}`).toBe(true)
    }
    expect(wrapper.find('[data-testid="job-card-sheets-sync"]').exists()).toBe(true)
    // §72 — the audit is a Job like any other, so it belongs on this panel. Its
    // absence was the reason the backend route alone was not enough.
    expect(wrapper.find('[data-testid="job-card-price-audit"]').exists()).toBe(true)
    expect(wrapper.findAll("[data-testid^='job-card-']")).toHaveLength(EXPECTED_DATASETS.length + 2)
    wrapper.unmount()
  })

  it("price audit: the run button posts the tolerance as a fraction", async () => {
    // The API takes 0.1, not 10. A panel that sent "10" would flag every trade.
    const wrapper = mount(JobsView)
    await flushPromises()

    await wrapper.find('[data-testid="price-audit-tolerance"]').setValue(15)
    await wrapper.find('[data-testid="price-audit-run-btn"]').trigger("click")
    await flushPromises()

    expect(mocks.runPriceAudit).toHaveBeenCalledWith(0.15)
    wrapper.unmount()
  })

  it("price audit: never claims Succeeded before it has run", async () => {
    // A badge that reads green by default teaches people to ignore it.
    const wrapper = mount(JobsView)
    await flushPromises()
    expect(wrapper.find('[data-testid="job-card-price-audit"]').text()).toContain("Never run")
    expect(wrapper.find('[data-testid="job-card-price-audit"]').text()).not.toContain("Succeeded")
    wrapper.unmount()
  })

  it("excludes hourly and 5-min datasets", async () => {
    const wrapper = mount(JobsView)
    await flushPromises()

    expect(wrapper.find('[data-testid^="job-card-hourly-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="job-card-5min_"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Hourly")
    expect(wrapper.text()).not.toContain("5-min")
    wrapper.unmount()
  })
})