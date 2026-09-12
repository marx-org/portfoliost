# D55 — System Topology / Data Flow Tab

## Status: Proposed

## Goal

Add a new **Topology** tab to the Admin area that gives administrators a
visually impressive, interactive overview of the system: what components exist,
how they are connected, where data flows, and whether everything is currently
healthy.

The page is intentionally scoped to **topology, data flow, and current state**.
It is not a Kubernetes dashboard, Prometheus dashboard, or log viewer.

---

## Context

The existing Admin → System tab lists service versions and reachability as a
flat card list. It does not convey dependencies, data flow, or provider
relationships. This proposal extends that foundation into a live topology map.

**Prerequisite:** D56 (OpenTelemetry observability) enriches the traffic data
available to this visualization. D55 is designed to degrade gracefully without
D56 (using nginx-ingress metrics alone), but D56 should be implemented first
for the richest experience.

---

## Codebase findings

Relevant files investigated before writing this proposal:

| File | Role |
|---|---|
| `portfoliost/src/modules/admin/AdminLayout.vue` | Tab shell — new tab added here |
| `portfoliost/src/modules/admin/SystemInfoView.vue` | Existing system tab (flat card list) |
| `portfoliost/src/api/admin.ts` | Admin API client, `ServiceVersion` type |
| `portfoliost-admin/src/index.ts` | `GET /api/admin/system/versions` handler |
| `portfoliost-admin/src/jobs-version.ts` | Kubernetes-backed deployment/cronjob image discovery |
| `portfoliost/src/styles/main.css` | Design tokens (Tailwind, dark/light) |
| `portfoliost/package.json` | Only charting lib: ApexCharts; no graph lib present |

---

## What data is actually available

### Service identity & reachability (existing)

`GET /api/admin/system/versions` already returns, for every component:

| Field | Source |
|---|---|
| `service` | `/__meta` response |
| `impl` | `"real"` / `"mock"` / `"unknown"` / `"job"` |
| `version` | semver string |
| `image` | full `ghcr.io/marx2/<name>:<tag>` ref (from k8s Deployment API) |

Services probed: `portfoliost` (SPA injects itself), `portfoliost-admin`,
`portfoliost-users-auth`, `portfoliost-wallets`, `portfoliost-instruments`,
`openst`, `cachest`.

CronJobs reported as `impl: "job"`: `portfoliost-wallets-fxsync`,
`portfoliost-instruments-tickersync`, `stooq-downloader`, `stooq-importer`,
`jobshot`.

The `impl: "unknown"` case means the service did not respond to `/__meta` — this
is the only health signal available today beyond k8s pod status (see below).

### Kubernetes pod/deployment status via Prometheus/kube-state-metrics

The cluster runs **kube-prometheus-stack** in the `monitoring` namespace,
scraping `kube-state-metrics` which emits per-deployment and per-pod metrics for
the `pfire` namespace. These are queryable from `portfoliost-admin` via the
in-cluster Prometheus endpoint
`http://kube-prometheus-stack-prometheus.monitoring.svc:9090`.

Useful PromQL queries:

```promql
# Is at least one replica ready?
kube_deployment_status_replicas_ready{namespace="pfire"} > 0

# Pod phase distribution per deployment
kube_pod_status_phase{namespace="pfire"}

# Restart count (indicates flapping)
kube_pod_container_status_restarts_total{namespace="pfire"}
```

This gives a reliable **green / degraded / down** signal per named deployment
without requiring any code changes to the application pods.

### Ingress request traffic via Prometheus/nginx-ingress

The nginx ingress controller exposes per-service metrics scraped by Prometheus:

```promql
nginx_ingress_controller_requests{exported_namespace="pfire", service="<name>", status="<code>"}
nginx_ingress_controller_request_duration_seconds_{bucket,count,sum}{...}
```

These provide, per service:
- Request rate over the last 5 minutes
- P50 / P99 latency
- Error rate (4xx / 5xx share)

This data can meaningfully distinguish **active** edges (traffic flowing now)
from **idle** ones in the topology, without any application-level changes.

Once D56 is live, application-level `http.server.request.duration` and
cachest's `http.client.request.duration` (per upstream provider) can replace
or supplement the ingress metrics for more precise per-route data.

### Provider topology (static, from config)

The data-provider chain is fully known from source code and config:

```
openst → OpenBB SDK → yfinance / fmp / intrinio / polygon / sec /
                       nasdaq / cboe / tiingo / tmx
cachest → openst (most routes, proxied with TTL caching)
        → dividendhistory.org (HTML scrape, direct)
        → alphavantage.co (direct, 25 req/day quota)
        → financialmodelingprep.com (direct, 250 req/day quota)
portfoliost-wallets → ECB (FX rates via fxsync CronJob → wallets.fx_rates)
portfoliost-instruments → cachest (all market data)
portfoliost-* → portfoliost-users-auth (JWT verification)
portfoliost-admin → portfoliost-{users-auth,wallets,instruments} + openst + cachest (/__meta fan-out)
nginx gateway → portfoliost-{users-auth,wallets,instruments,admin} (path-prefix routing)
SPA → nginx gateway
PocketID (OIDC) → portfoliost-users-auth (token exchange)
```

This topology is stable and well-understood. It is appropriate to represent it
as a structured static definition embedded in the frontend, with live status
overlaid on top.

---

## Architecture decisions

### D55-1 — Graph library: `@vue-flow/core`

Install `@vue-flow/core` (MIT, Vue 3 native, TypeScript-first, custom node/edge
rendering, built-in zoom/pan, animated edges, active maintenance). No other
graph library is currently in the project. `@dagrejs/dagre` is added as the
layout engine (hierarchical left-to-right layout).

`cytoscape.js` was considered and is more capable for very large graphs, but
`@vue-flow/core` is the better fit here: idiomatic Vue 3 composition API, no
imperative DOM manipulation, easier dark/light mode via CSS variables, and a
cleaner custom node rendering model. With ≤20 nodes, performance is not a
concern.

### D55-2 — New frontend route

```
/en/admin/topology  →  TopologyView.vue   name: "admin-topology"
```

Added to `AdminLayout.vue` tabs as **"Topology"**, inserted between "System"
and "Currency Rates". The existing System tab is unchanged.

### D55-3 — Static graph definition

A TypeScript module
`portfoliost/src/modules/admin/topology/graph-definition.ts` defines all nodes
and edges. Node areas:

| Area | Nodes |
|---|---|
| `internal` | SPA (portfoliost), nginx gateway, portfoliost-admin, portfoliost-users-auth, portfoliost-wallets, portfoliost-instruments |
| `storage` | postgres (shared), redis (shared) |
| `jobs` | fxsync CronJob, tickersync CronJob, stooq-downloader CronJob, stooq-importer CronJob, jobshot |
| `external-services` | PocketID (OIDC), stooq.pl, scanst, mastra-ticker |
| `data-providers` | openst (aggregator node) + individual provider leaf nodes: yfinance, FMP, Intrinio, Polygon, SEC/EDGAR, Nasdaq, CBOE, Tiingo, TMX, AlphaVantage (quota badge: 25/day), dividendhistory.org, ECB |

Each provider leaf node carries metadata: data types it supplies
(e.g. OHLCV, dividends, company profile, news, SEC filings, FX rates) and any
quota constraints.

Each edge carries: source, target, label (data type description), and whether
it is measurable via Prometheus ingress or OTel metrics (D56).

### D55-4 — Live status overlay

A Pinia store `useTopologyStore` polls two new backend endpoints every 30 s
(matching the existing System tab cadence):

**`GET /api/admin/topology/status`** — new endpoint in `portfoliost-admin`

Fans out `/__meta` to all services (reusing existing logic) and additionally
queries Prometheus for k8s deployment health:

```typescript
// Response shape (new contract schema: TopologyStatusResponse)
{
  services: Array<{
    name: string          // deployment name (matches graph node id)
    reachable: boolean    // /__meta responded within 3 s
    impl: "real" | "mock" | "unknown" | "job"
    version: string
    replicas: { desired: number; ready: number } | null  // null if Prometheus unavailable
    restarts: number | null
  }>
  fetchedAt: string       // ISO-8601
}
```

If `PROMETHEUS_URL` env var is not set (local dev), the endpoint returns
reachability-only data — no replicas/restarts fields. The frontend handles this
gracefully (no status dot, grey node).

**`GET /api/admin/topology/traffic`** — new endpoint in `portfoliost-admin`

Queries Prometheus for 5-minute traffic windows per service. When D56 is live,
prefers application-level `http_server_request_duration_seconds` metrics (all 6
services emit this after D56); falls back to nginx-ingress
`nginx_ingress_controller_requests` metrics when D56 metrics are absent:

```typescript
// Response shape (new contract schema: TopologyTrafficResponse)
{
  services: Array<{
    name: string            // service name (matches graph node id)
    requestsPerMin: number
    errorRate: number       // fraction 0–1
    p99LatencyMs: number
    source: "otel" | "ingress" | "none"  // which metric source was used
  }>
  // Per-provider outbound latency from cachest (populated when D56 is live)
  cachestProviders: Array<{
    provider: string        // server_address label, e.g. "openst", "alphavantage.co"
    p99LatencyMs: number
  }>
  fetchedAt: string
}
```

**PromQL used when D56 (`source: "otel"`) is available:**
```promql
# request rate per service (all 6 after D56)
sum by (service_name) (rate(http_server_request_duration_seconds_count[5m]))

# P99 latency per service
histogram_quantile(0.99,
  sum by (le, service_name) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)

# cachest per-provider outbound P99 (D56-3)
histogram_quantile(0.99,
  sum by (le, server_address) (
    rate(http_client_request_duration_seconds_bucket{service_name="cachest"}[5m])
  )
)
```

**PromQL used when falling back (`source: "ingress"`):**
```promql
nginx_ingress_controller_requests{exported_namespace="pfire"}
nginx_ingress_controller_request_duration_seconds_bucket{exported_namespace="pfire"}
```

Falls back to an empty `services` array (and empty `cachestProviders`) if
Prometheus is unavailable.

Both new endpoints are guarded by the existing `requireGroup("portfoliost_admin")`
middleware.

### D55-5 — Node visual design

Custom Vue Flow node components, one per area:

| Area | Visual style |
|---|---|
| `internal` | Rounded rect, `card` class background, service icon (inline SVG) |
| `storage` | Rounded rect with a subtle cylinder-hint header, blue-slate tint |
| `jobs` | Dashed border, green tint, clock icon |
| `external-services` | Rounded rect, indigo tint |
| `data-providers` | Compact pill/chip, amber tint; quota badge where applicable |

Status indicator overlaid on every live-service node (bottom-right corner dot):

| State | Colour | Condition |
|---|---|---|
| Healthy | Green | reachable + all replicas ready + restarts < 5 |
| Degraded | Amber | reachable but partial replicas, or restarts ≥ 5 |
| Down | Red | unreachable / `impl: "unknown"` |
| Unknown | Grey | no Prometheus data available (CronJob / external provider) |

The dot pulses (CSS `@keyframes` scale animation) when the service has active
ingress traffic (`requestsPerMin > 0`).

### D55-6 — Edge animation

`@vue-flow/core` supports custom SVG edge paths and CSS animation.

| Edge type | Style |
|---|---|
| Active (traffic > 0) | Animated moving-dot along a dashed SVG path; dot speed proportional to request rate |
| Idle (traffic = 0 or unmeasured) | Static thin line with arrow |
| Job-trigger (CronJob → service) | Dashed static line, green tint |
| External-provider edge | Static thin line, no animation |

The animated dot uses the vue-flow built-in edge animation pattern
(`stroke-dashoffset` CSS keyframe on the SVG path).

### D55-7 — Click-to-inspect panel

Clicking a node opens a right-side slide-in details panel (320 px wide):

- Service name, area badge, status pill
- Current version and image ref (for internal services)
- Upstream / downstream neighbours (derived from graph edges)
- For `data-provider` nodes: data types supplied, quota limits
- For `internal` services: replica count, restart count, request rate, P99
  latency, error rate (from `/topology/traffic`)
- For the **cachest** node specifically: per-upstream-provider P99 latency table
  (`cachestProviders` from `/topology/traffic`), showing response times for
  `openst`, `alphavantage.co`, `financialmodelingprep.com`, `dividendhistory.org`
  — populated when D56 is live; section hidden otherwise
- Quick-link to the relevant Admin tab where one exists:
  e.g. "Currency Rates" for fxsync, "Jobs" for stooq-importer, "System" for
  all backend services

Clicking a node also:
1. Highlights that node with a coloured ring
2. Highlights directly connected edges and their endpoints (full opacity)
3. Dims all unrelated nodes and edges (opacity: 0.2)

Clicking the canvas background resets the selection to show all nodes at full
opacity.

### D55-8 — Graph controls

A floating toolbar anchored to the top-right of the canvas:
- Zoom in / zoom out
- Fit to screen
- Reset view (restore default zoom and pan position)
- Search input (case-insensitive substring match against node label; matching
  nodes are highlighted, non-matching nodes dimmed)
- Filter pills: **All** | **Internal** | **Storage** | **Jobs** |
  **External** | **Providers**

### D55-9 — Layout

`dagre` hierarchical layout (LR direction). The static graph definition
provides a recommended rank/group hint per node so dagre produces a stable
left-to-right flow: `Providers → openst/cachest → Instruments/Wallets →
Gateway → SPA`, with storage and jobs arranged in their own ranks below.

Area swim lanes are drawn as faint translucent rounded rectangles behind each
group, providing visual grouping without heavy borders.

### D55-10 — Dark/light mode

All custom node and panel colours use Tailwind's `dark:` variant classes.
The Vue Flow canvas background is set to `bg-slate-50 dark:bg-slate-950`
(matching the app body). Edge stroke colours reference CSS variables
(`--color-slate-300` / `--color-slate-600`) so they adapt automatically.

### D55-11 — Backend contract additions

Two new schemas added to `portfoliost-contracts/contracts/openapi.yaml`:

- `TopologyStatusResponse` (described in D55-4 above)
- `TopologyTrafficResponse` (described in D55-4 above)

After adding schemas: bump contracts patch version via CI, run
`NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` in
`portfoliost` and `portfoliost-admin`, run `npm run gen:types` in both
consumers, commit updated lockfiles and `api-types.d.ts`.

---

## What is NOT in scope

- No CPU/memory/disk charts per service.
- No log viewer integration.
- No historical traffic graphs or time-series dashboards.
- No Kubernetes deployment controls (restart, scale, rollout).
- No changes to the existing System tab.
- No replacement of Grafana or any existing monitoring tooling.

---

## Implementation plan

Each step ships as one commit, passing its specified test(s) before the step
is marked complete.

- [x] **Step 1** — Add `TopologyStatusResponse` + `TopologyTrafficResponse` to `openapi.yaml`; bump contracts; regenerate `api-types.d.ts` in admin + portfoliost
  - _Test:_ Contract compile passes in both repos
- [x] **Step 2** — Implement `GET /api/admin/topology/status` in `portfoliost-admin` (fan-out `/__meta` + Prometheus k8s queries with graceful fallback)
  - _Test:_ Unit: mock Prometheus, verify fallback path
- [x] **Step 3** — Implement `GET /api/admin/topology/traffic` in `portfoliost-admin` (prefer D56 OTel `http_server_request_duration_seconds` when available; fall back to nginx-ingress metrics; include `cachestProviders` from cachest's `http_client_request_duration_seconds`)
  - _Test:_ Unit: mock Prometheus OTel metrics path + ingress fallback path; verify `cachestProviders` populated from cachest per-`server_address` histogram
- [x] **Step 4** — Install `@vue-flow/core` + `@dagrejs/dagre` in `portfoliost`
  - _Test:_ Build passes, no TS errors
- [x] **Step 5** — Write `graph-definition.ts` (all nodes, edges, provider metadata)
  - _Test:_ Snapshot: all expected node IDs and edge source/target pairs present
- [x] **Step 6** — Implement custom node components (one per area) with status dot logic
  - _Test:_ Visual review
- [x] **Step 7** — Implement `useTopologyStore` (Pinia, polls both endpoints, maps to node status)
  - _Test:_ Unit: correct status mapping for all `impl` values and Prometheus states
- [x] **Step 8** — Implement `TopologyView.vue`: Vue Flow canvas + dagre layout + swim-lane backgrounds
- [x] **Step 9** — Implement edge animation (active vs. idle, CSS animated dash with moving dot)
  - _Test:_ Visual review
- [x] **Step 10** — Implement click-to-inspect details panel + selection highlighting/dimming
  - _Test:_ Playwright: click node → panel visible; click background → panel closed
- [x] **Step 11** — Implement toolbar (zoom/fit/reset/search/filter pills)
  - _Test:_ Playwright: search filters nodes; filter pill toggles area visibility
- [x] **Step 12** — Add route + tab entry in `AdminLayout.vue` + `router/index.ts`
  - _Test:_ Playwright: admin user can navigate to `/en/admin/topology`
- [x] **Step 13** — Dark/light mode QA pass
  - _Test:_ Visual review in both modes
- [ ] **Step 14** — Add `PROMETHEUS_URL` env var to homelab HelmRelease for `portfoliost-admin`; verify live status dots appear in cluster
  - _Test:_ Manual smoke test in cluster

---

## Open questions resolved

**Q: Should the existing System tab be replaced?**
No. The Topology tab is additive. The System tab retains its flat-list view for
quick version lookup.

**Q: Static graph definition vs. auto-discovered topology?**
Static definition for nodes/edges/provider metadata; live overlay for status
and traffic. The topology is stable and well-understood. Full dynamic discovery
would add significant backend complexity for negligible benefit at this scale.

**Q: Where does Prometheus access live?**
Inside `portfoliost-admin` as a thin proxy. The admin pod already queries the
Kubernetes API in-cluster (`@kubernetes/client-node`); adding Prometheus HTTP
queries is the same pattern. Prometheus is not exposed to the browser.

**Q: Graph library choice?**
`@vue-flow/core`. Vue 3 native, TypeScript-first, custom node/edge rendering,
built-in zoom/pan, animated edges, active maintenance. Optimal for this graph
size and visual quality bar.
