import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import JobsView from "@/modules/admin/JobsView.vue"
import { getStooqImportLog, getSheetsSyncLog } from "@/api/adminJobs"

vi.mock("@/api/adminJobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/adminJobs")>()
  return {
    ...actual,
    getStooqImportLog: vi.fn(),
    getSheetsSyncLog: vi.fn(),
  }
})

const mockedLog = vi.mocked(getStooqImportLog)
const mockedSheetsLog = vi.mocked(getSheetsSyncLog)

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
  })

  it("renders a card per stooq dataset + the Google Sheets card", async () => {
    const wrapper = mount(JobsView)
    await flushPromises()

    for (const dataset of EXPECTED_DATASETS) {
      expect(wrapper.find(`[data-testid="job-card-${dataset}"]`).exists(), `card for ${dataset}`).toBe(true)
    }
    expect(wrapper.find('[data-testid="job-card-sheets-sync"]').exists()).toBe(true)
    expect(wrapper.findAll("[data-testid^='job-card-']")).toHaveLength(EXPECTED_DATASETS.length + 1)
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