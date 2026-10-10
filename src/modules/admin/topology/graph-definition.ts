// D55-3 — static topology graph definition for the Admin → Topology tab.
// Node IDs for live services match the deployment names reported by
// GET /api/admin/topology/status and /topology/traffic (D55-4). Live status
// and traffic are overlaid at runtime; this module only carries the static
// shape: nodes, edges, and provider metadata.

export type NodeArea = "internal" | "storage" | "jobs" | "external-services" | "data-providers"

export type MeasurableSource = "ingress" | "otel" | "none"

export interface ProviderMeta {
  dataTypes: string[]
  quota?: string
}

export interface TopologyNodeDef {
  id: string
  label: string
  area: NodeArea
  /** Advisory dagre rank hint (D55-9): lower = more left in the LR flow. */
  rank: number
  /** True when the node maps to a live probed deployment (status overlay). */
  live: boolean
  provider?: ProviderMeta
  /** Deployment snapshot, not live job execution telemetry. */
  job?: { schedule: string; suspended: boolean; purpose: string }
}

export type EdgeKind = "api" | "gateway" | "auth" | "job" | "provider" | "storage"

export interface TopologyEdgeDef {
  source: string
  target: string
  label: string
  kind: EdgeKind
  /** Which metric source can measure this edge (D56 / nginx ingress). */
  measurable: MeasurableSource
}

export const NODE_AREAS: NodeArea[] = ["internal", "storage", "jobs", "external-services", "data-providers"]

export const AREA_LABELS: Record<NodeArea, string> = {
  internal: "Internal",
  storage: "Storage",
  jobs: "Jobs",
  "external-services": "External",
  "data-providers": "Providers",
}

// ── Nodes ────────────────────────────────────────────────────────────────────

const R = { providers: 0, aggregators: 1, services: 2, gateway: 3, spa: 4, back: 5 }

export const topologyNodes: TopologyNodeDef[] = [
  // internal
  { id: "portfoliost", label: "Portfoliost (SPA)", area: "internal", rank: R.spa, live: false },
  { id: "nginx-gateway", label: "nginx Gateway", area: "internal", rank: R.gateway, live: false },
  { id: "portfoliost-admin", label: "portfoliost-admin", area: "internal", rank: R.services, live: true },
  { id: "portfoliost-users-auth", label: "portfoliost-users-auth", area: "internal", rank: R.services, live: true },
  { id: "portfoliost-wallets", label: "portfoliost-wallets", area: "internal", rank: R.services, live: true },
  { id: "portfoliost-instruments", label: "portfoliost-instruments", area: "internal", rank: R.services, live: true },
  // storage
  { id: "postgres", label: "PostgreSQL", area: "storage", rank: R.back, live: true },
  { id: "redis", label: "Redis", area: "storage", rank: R.back, live: true },
  // jobs
  // Static data by design: kube-state-metrics exposes no "last run succeeded"
  // signal for a CronJob, so `job` metadata below is what the manifest
  // declares, not what the cluster observed. Resynced against the pfire
  // CronJobs on 2026-10-02 (§80.3).
  { id: "portfoliost-instruments-fxsync", label: "FX Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "10 17 * * *", suspended: false, purpose: "Upserts FX rates into instruments' fx_rates table; wallets reads them through /api/internal/fx-rates (§48.6a)." } },
  { id: "portfoliost-instruments-tickersync", label: "Ticker Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "30 4 * * 1", suspended: false, purpose: "Syncs the ticker reference from adanos plus the curated crypto rows (§40)." } },
  { id: "portfoliost-instruments-corpbondsync", label: "Corp Bond Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "45 4 * * *", suspended: false, purpose: "Upserts the D80 Catalyst corporate-bond catalogue into instruments." } },
  { id: "portfoliost-instruments-fundcategorysync", label: "Fund Category Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "15 5 * * *", suspended: false, purpose: "Upserts analizy.pl fund categories; without an ANALIZY:: row a fund routes as a stock and silently returns zero bars (§72.39)." } },
  { id: "portfoliost-instruments-splitsync", label: "Split Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "0 6 * * *", suspended: false, purpose: "Scans open stock positions for provider-backed splits; confirmed events are applied idempotently, unsupported symbols remain manual candidates." } },
  { id: "portfoliost-wallets-snapshotsync", label: "Snapshot Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "0 13 * * *", suspended: false, purpose: "The only writer of positions.market_value in the scheduled pipeline (§76.1) — the most consequential job in the namespace." } },
  { id: "portfoliost-sheets-sync", label: "Sheets Sync", area: "jobs", rank: R.back, live: false, job: { schedule: "", suspended: false, purpose: "On-demand jobshot Job (no CronJob): imports the Transakcje sheet into transactions." } },
  { id: "portfoliost-cash-audit", label: "Cash Audit", area: "jobs", rank: R.back, live: false, job: { schedule: "", suspended: false, purpose: "On-demand read-only jobshot Job: compares every dated Gotówka snapshot with wallets-derived cash, including Equate+ cashless coverage." } },
  { id: "stooq-downloader", label: "Stooq Downloader", area: "jobs", rank: R.back, live: false, job: { schedule: "0 3 * * 0", suspended: true, purpose: "Downloads stooq.pl CSV volumes; suspended in the cluster." } },
  { id: "stooq-importer", label: "Stooq Importer", area: "jobs", rank: R.back, live: false, job: { schedule: "@yearly", suspended: true, purpose: "Loads stooq CSV volumes with pgloader; suspended in the cluster." } },
  { id: "jobshot", label: "Jobshot", area: "jobs", rank: R.back, live: false, job: { schedule: "", suspended: false, purpose: "Job runner as a Deployment, not a schedule: admin triggers Jobs through it." } },
  // Verified against pfire CronJobs, 2026-09-17 (§80.3 resync 2026-10-02). These
  // populate the provider tier consumed by instruments; they are not
  // instruments API deployments.
  { id: "openst-bond-import", label: "Bond Import", area: "jobs", rank: R.back, live: false, job: { schedule: "30 4 * * *", suspended: false, purpose: "Incrementally imports Treasury bond series into OpenST." } },
  { id: "openst-bond-archive", label: "Bond Archive", area: "jobs", rank: R.back, live: false, job: { schedule: "0 6 3 * *", suspended: false, purpose: "Archives Treasury bond series in OpenST." } },
  { id: "openst-cpi-import", label: "CPI Import", area: "jobs", rank: R.back, live: false, job: { schedule: "30 4 * * *", suspended: false, purpose: "Incrementally imports CPI data into OpenST." } },
  { id: "openst-cpi-seed", label: "CPI Seed", area: "jobs", rank: R.back, live: false, job: { schedule: "0 5 1 1 *", suspended: true, purpose: "Full CPI seed; scheduled execution is suspended." } },
  // external-services
  { id: "pocketid", label: "PocketID (OIDC)", area: "external-services", rank: R.providers, live: false },
  { id: "google-sheets", label: "Google Sheets", area: "external-services", rank: R.providers, live: false },
  { id: "stooq-pl", label: "stooq.pl", area: "external-services", rank: R.providers, live: false },
  { id: "scanst", label: "scanst", area: "external-services", rank: R.providers, live: false },
  { id: "mastra-ticker", label: "mastra-ticker", area: "external-services", rank: R.providers, live: false },
  // data-providers — aggregators
  {
    id: "openst",
    label: "openst",
    area: "data-providers",
    rank: R.aggregators,
    live: true,
    provider: { dataTypes: ["Market data aggregator (OpenBB SDK)"] },
  },
  {
    id: "cachest",
    label: "cachest",
    area: "data-providers",
    rank: R.aggregators,
    live: true,
    provider: { dataTypes: ["Market data cache (TTL proxy)"] },
  },
  // data-providers — leaf providers
  { id: "biznesradar", label: "BiznesRadar", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Polish TFI funds / Catalyst bonds", "History, quotes, profiles, search"] } },
  { id: "obligacje", label: "Obligacje", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Polish retail savings bonds", "Redemption values computed from issue parameters + CPI", "History, profiles, search"] } },
  { id: "yfinance", label: "yfinance", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["OHLCV", "Dividends", "Company profile"] } },
  { id: "fmp", label: "FMP", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Dividends", "Company profile"], quota: "250 req/day (direct)" } },
  { id: "intrinio", label: "Intrinio", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["OHLCV", "Fundamentals"] } },
  { id: "polygon", label: "Polygon", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["OHLCV", "Dividends"] } },
  { id: "sec", label: "SEC / EDGAR", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["SEC filings"] } },
  { id: "nasdaq", label: "Nasdaq", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Quotes"] } },
  { id: "cboe", label: "CBOE", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Options chains"] } },
  { id: "tiingo", label: "Tiingo", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["OHLCV", "Dividends"] } },
  { id: "tmx", label: "TMX", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["OHLCV (TSX)"] } },
  { id: "alphavantage", label: "AlphaVantage", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Company profile", "Dividends"], quota: "25 req/day" } },
  { id: "dividendhistory", label: "dividendhistory.org", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["Dividend history (HTML scrape)"] } },
  { id: "ecb", label: "ECB", area: "data-providers", rank: R.providers, live: false, provider: { dataTypes: ["FX rates (EUR-based)"] } },
]

// ── Edges ────────────────────────────────────────────────────────────────────

export const topologyEdges: TopologyEdgeDef[] = [
  // SPA → gateway
  { source: "portfoliost", target: "nginx-gateway", label: "Browser traffic", kind: "gateway", measurable: "ingress" },
  // gateway → services (path-prefix routing)
  { source: "nginx-gateway", target: "portfoliost-users-auth", label: "Path-prefix routing", kind: "gateway", measurable: "ingress" },
  { source: "nginx-gateway", target: "portfoliost-wallets", label: "Path-prefix routing", kind: "gateway", measurable: "ingress" },
  { source: "nginx-gateway", target: "portfoliost-instruments", label: "Path-prefix routing", kind: "gateway", measurable: "ingress" },
  { source: "nginx-gateway", target: "portfoliost-admin", label: "Path-prefix routing", kind: "gateway", measurable: "ingress" },
  // admin fan-out
  { source: "portfoliost-admin", target: "portfoliost-users-auth", label: "/__meta fan-out", kind: "api", measurable: "otel" },
  { source: "portfoliost-admin", target: "portfoliost-wallets", label: "/__meta fan-out", kind: "api", measurable: "otel" },
  { source: "portfoliost-admin", target: "portfoliost-instruments", label: "/__meta fan-out", kind: "api", measurable: "otel" },
  { source: "portfoliost-admin", target: "openst", label: "/__meta fan-out", kind: "api", measurable: "otel" },
  { source: "portfoliost-admin", target: "cachest", label: "/__meta fan-out", kind: "api", measurable: "otel" },
  // JWT verification
  { source: "portfoliost-wallets", target: "portfoliost-users-auth", label: "JWT verification", kind: "auth", measurable: "otel" },
  { source: "portfoliost-instruments", target: "portfoliost-users-auth", label: "JWT verification", kind: "auth", measurable: "otel" },
  // market data chain
  { source: "portfoliost-instruments", target: "cachest", label: "Market data", kind: "api", measurable: "otel" },
  { source: "cachest", target: "openst", label: "TTL-cached proxy", kind: "api", measurable: "otel" },
  { source: "cachest", target: "dividendhistory", label: "HTML scrape (direct)", kind: "provider", measurable: "otel" },
  { source: "cachest", target: "alphavantage", label: "Direct (25 req/day)", kind: "provider", measurable: "otel" },
  { source: "cachest", target: "fmp", label: "Direct (250 req/day)", kind: "provider", measurable: "otel" },
  { source: "openst", target: "yfinance", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "fmp", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "intrinio", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "polygon", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "sec", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "nasdaq", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "cboe", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "tiingo", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "tmx", label: "OpenBB SDK", kind: "provider", measurable: "otel" },
  { source: "openst", target: "biznesradar", label: "OpenBB plugin (scraper)", kind: "provider", measurable: "none" },
  { source: "openst", target: "obligacje", label: "OpenBB plugin (local pricing)", kind: "provider", measurable: "none" },
  // FX — fx_rates lives in instruments since §48.6a; wallets reads it over the
  // internal API and no longer talks to the ECB or owns the importer (§80.3).
  { source: "portfoliost-instruments", target: "ecb", label: "FX rates (via fxsync CronJob)", kind: "provider", measurable: "none" },
  // jobs
  { source: "openst-bond-import", target: "openst", label: "Imports bond series", kind: "job", measurable: "none" },
  { source: "openst-bond-archive", target: "openst", label: "Archives bond series", kind: "job", measurable: "none" },
  { source: "openst-cpi-import", target: "openst", label: "Imports CPI", kind: "job", measurable: "none" },
  { source: "openst-cpi-seed", target: "openst", label: "Full CPI seed (suspended)", kind: "job", measurable: "none" },
  { source: "portfoliost-admin", target: "jobshot", label: "On-demand job trigger", kind: "job", measurable: "none" },
  { source: "portfoliost-sheets-sync", target: "google-sheets", label: "Fetches Transakcje sheet", kind: "provider", measurable: "none" },
  { source: "portfoliost-sheets-sync", target: "portfoliost-wallets", label: "Imports transactions", kind: "job", measurable: "none" },
  { source: "portfoliost-cash-audit", target: "google-sheets", label: "Reads Gotówka snapshots", kind: "provider", measurable: "none" },
  { source: "portfoliost-cash-audit", target: "portfoliost-wallets", label: "Reads derived cash", kind: "job", measurable: "none" },
  { source: "portfoliost-cash-audit", target: "jobshot", label: "Runs on demand", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-fxsync", target: "portfoliost-instruments", label: "Updates FX rates", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-tickersync", target: "portfoliost-instruments", label: "Syncs tickers", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-corpbondsync", target: "portfoliost-instruments", label: "Upserts corp-bond catalogue", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-fundcategorysync", target: "portfoliost-instruments", label: "Upserts fund categories", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-splitsync", target: "cachest", label: "Reads cached split events", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-splitsync", target: "portfoliost-instruments", label: "Stages split candidates", kind: "job", measurable: "none" },
  { source: "portfoliost-instruments-splitsync", target: "portfoliost-wallets", label: "Applies confirmed splits", kind: "job", measurable: "none" },
  { source: "portfoliost-wallets-snapshotsync", target: "portfoliost-wallets", label: "Writes positions.market_value", kind: "job", measurable: "none" },
  { source: "stooq-downloader", target: "stooq-pl", label: "CSV download", kind: "provider", measurable: "none" },
  { source: "stooq-downloader", target: "stooq-importer", label: "CSV volume", kind: "job", measurable: "none" },
  { source: "stooq-importer", target: "portfoliost-instruments", label: "Imports price history", kind: "job", measurable: "none" },
  // OIDC
  { source: "pocketid", target: "portfoliost-users-auth", label: "OIDC token exchange", kind: "auth", measurable: "none" },
  // storage
  { source: "portfoliost-users-auth", target: "postgres", label: "Auth DB", kind: "storage", measurable: "none" },
  { source: "portfoliost-wallets", target: "postgres", label: "Wallets DB", kind: "storage", measurable: "none" },
  { source: "portfoliost-instruments", target: "postgres", label: "Instruments DB", kind: "storage", measurable: "none" },
  { source: "portfoliost-admin", target: "postgres", label: "Admin DB", kind: "storage", measurable: "none" },
  { source: "cachest", target: "redis", label: "TTL cache", kind: "storage", measurable: "none" },
]

// ── Lookups ──────────────────────────────────────────────────────────────────

export const nodeById: ReadonlyMap<string, TopologyNodeDef> = new Map(topologyNodes.map((n) => [n.id, n]))

export function areaNodes(area: NodeArea): TopologyNodeDef[] {
  return topologyNodes.filter((n) => n.area === area)
}

export function edgesForNode(id: string): TopologyEdgeDef[] {
  return topologyEdges.filter((e) => e.source === id || e.target === id)
}

/** IDs of nodes with an edge INTO `id`. */
export function upstreamOf(id: string): string[] {
  return topologyEdges.filter((e) => e.target === id).map((e) => e.source)
}

/** IDs of nodes with an edge OUT OF `id`. */
export function downstreamOf(id: string): string[] {
  return topologyEdges.filter((e) => e.source === id).map((e) => e.target)
}
