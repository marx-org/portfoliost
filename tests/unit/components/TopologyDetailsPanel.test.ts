// Unit test — traffic metrics visibility in the inspector (theme-refresh fix).
// cachest/openst live in the `data-providers` area but are probed live services;
// the Traffic section used to be gated on `area === "internal"`, hiding real
// otel/ingress metrics for them (found by inspecting the live Prometheus: series
// exist for all six services). The panel must render the Traffic section and the
// cachest per-upstream P99 table for any node that HAS traffic data.
import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"

import TopologyDetailsPanel from "@/modules/admin/topology/TopologyDetailsPanel.vue"
import { useTopologyStore } from "@/modules/admin/topology/topology-store"

function mountPanel(nodeId: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTopologyStore()
  store.statusById = {
    cachest: { name: "cachest", reachable: true, impl: "real", version: "0.9.2", replicas: { desired: 1, ready: 1 }, restarts: 0 },
  }
  store.trafficById = {
    cachest: { name: "cachest", requestsPerMin: 12.5, errorRate: 0.01, p99LatencyMs: 87, source: "otel" },
  }
  store.cachestProviders = [{ provider: "openst", p99LatencyMs: 42 }]
  return mount(TopologyDetailsPanel, {
    props: { nodeId },
    global: { stubs: { RouterLink: true, Transition: false } },
  })
}

describe("TopologyDetailsPanel traffic visibility", () => {
  it("shows traffic metrics for cachest (data-providers area), not only internal services", () => {
    const wrapper = mountPanel("cachest")
    const traffic = wrapper.get('[aria-label="Traffic"]')
    expect(traffic.text()).toContain("Req/min")
    expect(traffic.text()).toContain("12.5")
    expect(traffic.text()).toContain("87ms")
    expect(traffic.text()).toContain("otel")
  })

  it("shows the cachest per-upstream P99 latency table", () => {
    const wrapper = mountPanel("cachest")
    const upstream = wrapper.get('[aria-label="Upstream latency"]')
    expect(upstream.text()).toContain("openst")
    expect(upstream.text()).toContain("42ms")
  })

  it("renders no traffic section when the service has no traffic data", () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTopologyStore()
    store.statusById = {
      openst: { name: "openst", reachable: true, impl: "real", version: "1.0.0" },
    }
    const wrapper = mount(TopologyDetailsPanel, {
      props: { nodeId: "openst" },
      global: { stubs: { RouterLink: true, Transition: false } },
    })
    expect(wrapper.find('[aria-label="Traffic"]').exists()).toBe(false)
  })
})
