import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SystemInfoView from "@/modules/admin/SystemInfoView.vue"
import { fetchSystemVersions } from "@/api/admin"

vi.mock("@/api/admin", () => ({
  fetchSystemVersions: vi.fn(),
}))

const mocked = vi.mocked(fetchSystemVersions)

function realRow(service: string, version: string, image: string) {
  return { service, version, impl: "real" as const, image }
}

function jobRow(service: string, version: string, image: string, schedule?: string, suspended = false) {
  return { service, version, impl: "job" as const, image, schedule, suspended }
}

describe("SystemInfoView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.mockResolvedValue({
      services: [realRow("openst", "v1.1.54", "ghcr.io/marx-org/openst:v1.1.54")],
      fetchedAt: "2026-10-19T10:00:00.000Z",
    })
  })

  // The SPA's own row is the one row it cannot read from the cluster, so its
  // repository is written into the component. This pins it, so a registry move
  // fails the build instead of silently reporting a stale path.
  it("reports its own image under the org path the HelmRelease deploys", async () => {
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    const ref = wrapper.get('[data-testid="sys-ref-portfoliost"]').text()
    expect(ref).toBe(`ghcr.io/marx-org/portfoliost:${__APP_VERSION__}`)
  })

  // The version and the image tag both come from `__APP_VERSION__`; if they ever
  // diverge the row would claim a build it is not running.
  it("keeps the SPA row's image tag in step with its version", async () => {
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    const row = wrapper.get('[data-testid="sys-row-portfoliost"]')
    expect(row.text()).toContain("portfoliost")
    expect(row.text()).toContain(`portfoliost:${__APP_VERSION__}`)
  })

  it("renders the backend-reported rows after its own", async () => {
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    expect(wrapper.get('[data-testid="sys-ref-openst"]').text()).toBe("ghcr.io/marx-org/openst:v1.1.54")
    const services = wrapper.findAll('[data-testid^="sys-row-"]')
    expect(services.map((r) => r.attributes("data-testid"))).toEqual(["sys-row-portfoliost", "sys-row-openst"])
  })

  it("renders jobshot as a deployment without a schedule row", async () => {
    mocked.mockResolvedValue({
      services: [realRow("jobshot", "v1.6.1", "ghcr.io/marx-org/jobshot:v1.6.1")],
      fetchedAt: "2026-10-19T10:00:00.000Z",
    })
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    const row = wrapper.get('[data-testid="sys-row-jobshot"]')
    expect(row.text()).toContain("Deployment")
    expect(row.find('[data-testid="sys-schedule-jobshot"]').exists()).toBe(false)
  })

  it("humanizes cron schedules while retaining the deployed version and raw expression", async () => {
    mocked.mockResolvedValue({
      services: [
        jobRow("weekly-job", "v1.2.3", "ghcr.io/marx-org/weekly-job:v1.2.3", "0 3 * * 0"),
        jobRow("annual-job", "v1.2.4", "ghcr.io/marx-org/annual-job:v1.2.4", "@yearly"),
      ],
      fetchedAt: "2026-10-19T10:00:00.000Z",
    })
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    expect(wrapper.get('[data-testid="sys-schedule-weekly-job"]').text()).toContain("Every Sunday at 03:00")
    expect(wrapper.get('[data-testid="sys-schedule-weekly-job"]').text()).toContain("0 3 * * 0")
    expect(wrapper.get('[data-testid="sys-schedule-annual-job"]').text()).toContain("Once a year")
    expect(wrapper.get('[data-testid="sys-ref-weekly-job"]').text()).toBe("ghcr.io/marx-org/weekly-job:v1.2.3")
  })

  it("identifies suspended and unscheduled jobs and falls back to an unknown schedule", async () => {
    mocked.mockResolvedValue({
      services: [
        jobRow("suspended-job", "v1.2.3", "ghcr.io/marx-org/suspended-job:v1.2.3", "0 3 * * 0", true),
        jobRow("on-demand-job", "v1.2.4", "ghcr.io/marx-org/on-demand-job:v1.2.4"),
        jobRow("unknown-job", "v1.2.5", "ghcr.io/marx-org/unknown-job:v1.2.5", "every-other-sunday"),
      ],
      fetchedAt: "2026-10-19T10:00:00.000Z",
    })
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    expect(wrapper.get('[data-testid="sys-schedule-suspended-job"]').text()).toContain("Suspended")
    expect(wrapper.get('[data-testid="sys-schedule-on-demand-job"]').text()).toContain("Not scheduled")
    expect(wrapper.get('[data-testid="sys-schedule-unknown-job"]').text()).toContain("every-other-sunday")
  })

  it("surfaces a load failure", async () => {
    mocked.mockRejectedValue(new Error("boom"))
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    expect(wrapper.text()).toContain("boom")
    expect(wrapper.find('[data-testid="sys-row-portfoliost"]').exists()).toBe(false)
  })
})
