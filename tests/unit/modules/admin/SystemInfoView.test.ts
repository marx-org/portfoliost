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

describe("SystemInfoView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.mockResolvedValue({
      services: [realRow("openst", "v1.1.54", "ghcr.io/marx-org/openst:v1.1.54")],
      fetchedAt: "2026-10-19T10:00:00.000Z",
    })
  })

  // #172 — the SPA's own row is the one row it cannot read from the cluster, so
  // its repository is written into the component. It carried the pre-migration
  // `ghcr.io/marx2/` prefix after #13 repointed everything else, which made
  // Admin → System show a path nobody pulls from while the HelmRelease said
  // `ghcr.io/marx-org/`. This pins the prefix so a future move fails the build
  // instead of silently reporting a stale registry.
  it("reports its own image under the org path the HelmRelease deploys", async () => {
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    const ref = wrapper.get('[data-testid="sys-ref-portfoliost"]').text()
    expect(ref).toBe(`ghcr.io/marx-org/portfoliost:${__APP_VERSION__}`)
    expect(ref).not.toContain("marx2")
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

  it("surfaces a load failure", async () => {
    mocked.mockRejectedValue(new Error("boom"))
    const wrapper = mount(SystemInfoView)
    await flushPromises()

    expect(wrapper.text()).toContain("boom")
    expect(wrapper.find('[data-testid="sys-row-portfoliost"]').exists()).toBe(false)
  })
})
