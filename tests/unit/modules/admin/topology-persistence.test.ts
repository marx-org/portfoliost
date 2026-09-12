import { beforeEach, describe, expect, it } from "vitest"
import { clearTopologyLayout, loadTopologyLayout, saveTopologyLayout, TOPOLOGY_LAYOUT_KEY } from "@/modules/admin/topology/topology-persistence"

const knownIds = new Set(["a", "b", "lane-internal", "lane-storage"])
const good = {
  a: { x: 1, y: 2 },
  b: { x: 3, y: 4 },
  "lane-internal": { x: 0, y: 0 },
  "lane-storage": { x: 50, y: 60 },
}

describe("topology persistence (D55 follow-up)", () => {
  beforeEach(() => {
    clearTopologyLayout()
  })

  it("round-trips a saved layout", () => {
    saveTopologyLayout(good)
    expect(loadTopologyLayout(knownIds)).toEqual(good)
  })

  it("returns null when nothing is stored", () => {
    expect(loadTopologyLayout(knownIds)).toBeNull()
  })

  it("rejects a layout whose id set does not match the graph (graph changed)", () => {
    localStorage.setItem(TOPOLOGY_LAYOUT_KEY, JSON.stringify({ version: 1, positions: { a: { x: 1, y: 2 } } }))
    expect(loadTopologyLayout(knownIds)).toBeNull()
  })

  it("rejects a wrong version", () => {
    localStorage.setItem(TOPOLOGY_LAYOUT_KEY, JSON.stringify({ version: 99, positions: good }))
    expect(loadTopologyLayout(knownIds)).toBeNull()
  })

  it("rejects malformed entries", () => {
    localStorage.setItem(
      TOPOLOGY_LAYOUT_KEY,
      JSON.stringify({ version: 1, positions: { ...good, b: { x: "NaN", y: 4 } } }),
    )
    expect(loadTopologyLayout(knownIds)).toBeNull()
  })

  it("clears the stored layout", () => {
    saveTopologyLayout(good)
    clearTopologyLayout()
    expect(loadTopologyLayout(knownIds)).toBeNull()
  })
})