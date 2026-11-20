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

  it("renders resource cards (CPU/Memory/Tx-min) for a prometheus-source workload (postgres)", () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTopologyStore()
    store.statusById = {
      postgres: { name: "postgres", reachable: true, impl: "real", version: "16.4-debian-12", replicas: { desired: 1, ready: 1 }, restarts: 0 },
    }
    store.trafficById = {
      postgres: {
        name: "postgres",
        requestsPerMin: 36,
        errorRate: null,
        p99LatencyMs: null,
        cpuCores: 0.1234,
        memoryBytes: 104857600,
        connections: 42,
        source: "prometheus",
      },
    }
    const wrapper = mount(TopologyDetailsPanel, {
      props: { nodeId: "postgres" },
      global: { stubs: { RouterLink: true, Transition: false } },
    })
    const section = wrapper.get('[aria-label="Traffic"]')
    expect(section.text()).toContain("Resources")
    expect(section.text()).toContain("CPU")
    expect(section.text()).toContain("0.12")
    expect(section.text()).toContain("Memory")
    expect(section.text()).toContain("100 MiB")
    expect(section.text()).toContain("Tx/min")
    expect(section.text()).toContain("36.0")
    expect(section.text()).toContain("Conns")
    expect(section.text()).toContain("42")
    expect(section.text()).toContain("prometheus")
    // HTTP-only cards must not render for a resource workload
    expect(section.text()).not.toContain("Req/min")
    expect(section.text()).not.toContain("P99")
  })

  it("renders CPU/Memory cards for redis without Tx/min or Conns cards", () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTopologyStore()
    store.statusById = {
      redis: { name: "redis", reachable: true, impl: "real", version: "7.4", replicas: { desired: 1, ready: 1 }, restarts: 0 },
    }
    store.trafficById = {
      redis: {
        name: "redis",
        requestsPerMin: null,
        errorRate: null,
        p99LatencyMs: null,
        cpuCores: 0.01,
        memoryBytes: 20971520,
        connections: null,
        source: "prometheus",
      },
    }
    const wrapper = mount(TopologyDetailsPanel, {
      props: { nodeId: "redis" },
      global: { stubs: { RouterLink: true, Transition: false } },
    })
    const section = wrapper.get('[aria-label="Traffic"]')
    expect(section.text()).toContain("CPU")
    expect(section.text()).toContain("0.01")
    expect(section.text()).toContain("Memory")
    expect(section.text()).toContain("20 MiB")
    expect(section.text()).not.toContain("Tx/min")
    expect(section.text()).not.toContain("Conns")
  })

  it("renders only the present HTTP cards when traffic fields are null", () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTopologyStore()
    store.statusById = {
      openst: { name: "openst", reachable: true, impl: "real", version: "1.0.0" },
    }
    store.trafficById = {
      openst: { name: "openst", requestsPerMin: 60, errorRate: null, p99LatencyMs: null, source: "ingress" },
    }
    const wrapper = mount(TopologyDetailsPanel, {
      props: { nodeId: "openst" },
      global: { stubs: { RouterLink: true, Transition: false } },
    })
    const section = wrapper.get('[aria-label="Traffic"]')
    expect(section.text()).toContain("Req/min")
    expect(section.text()).toContain("60.0")
    expect(section.text()).not.toContain("P99")
    expect(section.text()).not.toContain("Errors")
  })
})
