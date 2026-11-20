// Unit test — StatusDot pulse behaviour (theme-refresh step).
// The dot pulses for every live node with a derived health state (healthy /
// degraded / down), faster when traffic is active, and stays static for
// "unknown" (no Prometheus data) so the pulse itself carries meaning.
import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"

import StatusDot from "@/modules/admin/topology/nodes/StatusDot.vue"
import type { TopologyNodeData } from "@/modules/admin/topology/nodes/types"

function makeData(overrides: Partial<TopologyNodeData> = {}): TopologyNodeData {
  return {
    id: "portfoliost-wallets",
    label: "portfoliost-wallets",
    area: "internal",
    live: true,
    status: { name: "portfoliost-wallets", reachable: true, impl: "real", version: "1.0.0", replicas: { desired: 1, ready: 1 }, restarts: 0 },
    ...overrides,
  }
}

describe("TopologyStatusDot", () => {
  it("applies the calm pulse to the root status indicator", () => {
    const wrapper = mount(StatusDot, { props: { data: makeData() } })
    expect(wrapper.element.tagName).toBe("SPAN")
    expect(wrapper.classes()).toContain("status-dot--pulse")
    expect(wrapper.classes()).not.toContain("status-dot--pulse--fast")
    wrapper.unmount()
  })

  it("pulses fast when the node reports active traffic", () => {
    const wrapper = mount(StatusDot, {
      props: { data: makeData({ traffic: { name: "portfoliost-wallets", requestsPerMin: 12, errorRate: 0, p99LatencyMs: 40, source: "otel" } }) },
    })
    const dot = wrapper.find(".status-dot")
    expect(dot.classes()).toContain("status-dot--pulse")
    expect(dot.classes()).toContain("status-dot--pulse--fast")
  })

  it("stays static and neutral for an unknown node (no status data)", () => {
    const wrapper = mount(StatusDot, { props: { data: makeData({ status: undefined }) } })
    const dot = wrapper.find(".status-dot")
    expect(dot.classes()).not.toContain("status-dot--pulse")
    expect(dot.classes()).toContain("bg-slate-400")
  })

  it("preserves traffic-driven pulsing even without replica health", () => {
    const wrapper = mount(StatusDot, { props: { data: makeData({
      status: undefined,
      traffic: { name: "portfoliost-wallets", requestsPerMin: 12, errorRate: 0, p99LatencyMs: 40, source: "otel" },
    }) } })
    expect(wrapper.classes()).toContain("bg-slate-400")
    expect(wrapper.classes()).toContain("status-dot--pulse--fast")
    wrapper.unmount()
  })

  it("describes the health state via title and aria-label", () => {
    const wrapper = mount(StatusDot, { props: { data: makeData() } })
    expect(wrapper.attributes("title")).toBe("portfoliost-wallets — Healthy")
    expect(wrapper.attributes("aria-label")).toBe("portfoliost-wallets — Healthy")
  })
})
