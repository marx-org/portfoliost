import { describe, expect, it } from "vitest"
import {
  NODE_AREAS,
  areaNodes,
  downstreamOf,
  edgesForNode,
  nodeById,
  topologyEdges,
  topologyNodes,
  upstreamOf,
} from "@/modules/admin/topology/graph-definition"

const nodeIds = topologyNodes.map((n) => n.id).sort()
const edgePairs = topologyEdges.map((e) => [e.source, e.target] as const).sort() as [string, string][]

const EXPECTED_NODE_IDS = [
  // internal
  "nginx-gateway",
  "portfoliost",
  "portfoliost-admin",
  "portfoliost-instruments",
  "portfoliost-users-auth",
  "portfoliost-wallets",
  // storage
  "postgres",
  "redis",
  // jobs
  "jobshot",
  "portfoliost-instruments-tickersync",
  "portfoliost-wallets-fxsync",
  "stooq-downloader",
  "stooq-importer",
  // external-services
  "mastra-ticker",
  "pocketid",
  "scanst",
  "stooq-pl",
  // data-providers
  "alphavantage",
  "cachest",
  "cboe",
  "dividendhistory",
  "ecb",
  "fmp",
  "intrinio",
  "nasdaq",
  "openst",
  "polygon",
  "sec",
  "tmx",
  "tiingo",
  "yfinance",
].sort()

const EXPECTED_EDGE_PAIRS = [
  ["cachest", "alphavantage"],
  ["cachest", "dividendhistory"],
  ["cachest", "fmp"],
  ["cachest", "openst"],
  ["cachest", "redis"],
  ["nginx-gateway", "portfoliost-admin"],
  ["nginx-gateway", "portfoliost-instruments"],
  ["nginx-gateway", "portfoliost-users-auth"],
  ["nginx-gateway", "portfoliost-wallets"],
  ["openst", "cboe"],
  ["openst", "fmp"],
  ["openst", "intrinio"],
  ["openst", "nasdaq"],
  ["openst", "polygon"],
  ["openst", "sec"],
  ["openst", "tiingo"],
  ["openst", "tmx"],
  ["openst", "yfinance"],
  ["portfoliost", "nginx-gateway"],
  ["portfoliost-admin", "cachest"],
  ["portfoliost-admin", "jobshot"],
  ["portfoliost-admin", "openst"],
  ["portfoliost-admin", "portfoliost-instruments"],
  ["portfoliost-admin", "portfoliost-users-auth"],
  ["portfoliost-admin", "portfoliost-wallets"],
  ["portfoliost-admin", "postgres"],
  ["portfoliost-instruments", "cachest"],
  ["portfoliost-instruments", "portfoliost-users-auth"],
  ["portfoliost-instruments", "postgres"],
  ["portfoliost-instruments-tickersync", "portfoliost-instruments"],
  ["portfoliost-users-auth", "postgres"],
  ["portfoliost-wallets", "ecb"],
  ["portfoliost-wallets", "portfoliost-users-auth"],
  ["portfoliost-wallets", "postgres"],
  ["portfoliost-wallets-fxsync", "portfoliost-wallets"],
  ["pocketid", "portfoliost-users-auth"],
  ["stooq-downloader", "stooq-importer"],
  ["stooq-downloader", "stooq-pl"],
  ["stooq-importer", "portfoliost-instruments"],
].sort() as [string, string][]

function sortedPairs(pairs: [string, string][]): [string, string][] {
  return [...pairs].sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
}

describe("topology graph definition (D55-3)", () => {
  it("defines exactly the expected node IDs", () => {
    expect(nodeIds).toEqual(EXPECTED_NODE_IDS)
  })

  it("defines exactly the expected edge source/target pairs", () => {
    expect(sortedPairs(edgePairs)).toEqual(sortedPairs(EXPECTED_EDGE_PAIRS))
  })

  it("snapshots node IDs and edge pairs", () => {
    expect({ nodeIds, edgePairs: sortedPairs(edgePairs) }).toMatchSnapshot()
  })

  it("has unique node IDs and every edge references defined nodes", () => {
    expect(new Set(topologyNodes.map((n) => n.id)).size).toBe(topologyNodes.length)
    for (const e of topologyEdges) {
      expect(nodeById.has(e.source), `edge ${e.source}→${e.target}: unknown source`).toBe(true)
      expect(nodeById.has(e.target), `edge ${e.source}→${e.target}: unknown target`).toBe(true)
    }
  })

  it("covers every declared area with the expected node counts", () => {
    expect(NODE_AREAS).toHaveLength(5)
    expect(areaNodes("internal")).toHaveLength(6)
    expect(areaNodes("storage")).toHaveLength(2)
    expect(areaNodes("jobs")).toHaveLength(5)
    expect(areaNodes("external-services")).toHaveLength(4)
    expect(areaNodes("data-providers")).toHaveLength(14)
  })

  it("marks the six probed deployments as live and nothing else", () => {
    const live = topologyNodes.filter((n) => n.live).map((n) => n.id).sort()
    expect(live).toEqual(["cachest", "openst", "portfoliost-admin", "portfoliost-instruments", "portfoliost-users-auth", "portfoliost-wallets"])
  })

  it("carries provider metadata with data types (and quotas where applicable)", () => {
    for (const n of areaNodes("data-providers")) {
      expect(n.provider?.dataTypes.length, `${n.id}: data types`).toBeGreaterThan(0)
    }
    expect(nodeById.get("alphavantage")?.provider?.quota).toBe("25 req/day")
    expect(nodeById.get("fmp")?.provider?.quota).toBe("250 req/day (direct)")
    expect(nodeById.get("yfinance")?.provider?.quota).toBeUndefined()
  })

  it("computes upstream/downstream neighbours correctly", () => {
    expect(downstreamOf("nginx-gateway").sort()).toEqual(["portfoliost-admin", "portfoliost-instruments", "portfoliost-users-auth", "portfoliost-wallets"])
    expect(upstreamOf("portfoliost-users-auth").sort()).toEqual(["nginx-gateway", "pocketid", "portfoliost-admin", "portfoliost-instruments", "portfoliost-wallets"])
    expect(upstreamOf("jobshot").sort()).toEqual(["portfoliost-admin"])
    expect(edgesForNode("cachest")).toHaveLength(7)
    expect(edgesForNode("scanst")).toHaveLength(0)
  })
})
