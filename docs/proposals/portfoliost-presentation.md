# D55 — System Topology / Data Flow Tab

## Status: Implemented

Shipped 2026-09-20 (closeout recorded in `plan-archive.md`, "Topology — cinematic
observability experience"); storage-workload metrics added afterwards by §26.
**This document was renovated 2026-10-02 to describe what actually exists**; the
sections that had drifted from the code are marked *as-built correction* and say
what shipped instead of what was planned. Open work on the tab lives in
`plan.md` §80 (cronjob drift, node readability, lane orientation).

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
available to this visualization. The tab degrades gracefully without D56 (using
nginx-ingress metrics alone), but D56 ships first for the richest experience.

---

## Codebase map (as-built)

| File | Role |
|---|---|
| `src/modules/admin/AdminLayout.vue` | Tab shell — "Topology" sits between "System" and "Currency Rates" |
| `src/modules/admin/TopologyView.vue` | The tab: Vue Flow canvas, toolbar, stats header, mission-control visuals |
| `src/modules/admin/topology/graph-definition.ts` | Static graph: 39 nodes, 47 edges, provider + job metadata |
| `src/modules/admin/topology/topology-layout.ts` | dagre layout, area lanes, `NODE_SIZES` |
| `src/modules/admin/topology/topology-store.ts` | Pinia store, polls both endpoints every 30 s |
| `src/modules/admin/topology/TopologyDetailsPanel.vue` | Click-to-inspect slide-in |
| `src/modules/admin/topology/nodes/*.vue` | One node component per area + `StatusDot` + `NodeHandles` |
| `src/modules/admin/topology/LaneNode.vue` | Swim-lane parent node (drag, clamp, persistence) |
| `src/modules/admin/topology/mission-control.css` | The visual layer (aurora, grain, stats, legend, focus mode) |
| `src/api/admin.ts` | `fetchTopologyStatus` / `fetchTopologyTraffic` |
| `portfoliost-admin/src/topology.ts` | `GET /api/admin/topology/status` |
| `portfoliost-admin/src/topology-traffic.ts` | `GET /api/admin/topology/traffic` |
| `portfoliost-admin/src/service-probe.ts` | `/__meta` fan-out target table |
| `portfoliost-admin/src/workload-probe.ts` | postgres/redis k8s-only target table |
| `portfoliost-admin/src/jobs-version.ts` | `GET /api/admin/system/versions` image discovery (System tab) |

Dependencies: `@vue-flow/core ^1.48.2`, `@dagrejs/dagre ^3.1.1` (app-template
v3 API: `new Graph()`, `layout(g)`, no `setGraph({ rankdir })` on a name).

---

## What data is actually available

### Service identity & reachability

`GET /api/admin/topology/status` fans `/__meta` out to six services
(`serviceTargets()` in `service-probe.ts`): `portfoliost-admin`,
`portfoliost-users-auth`, `portfoliost-wallets`, `portfoliost-instruments`,
`openst`, `cachest`. A service that does not answer within 3 s is reported with
`impl: "unknown"` and `reachable: false` — that is the only signal available
without Prometheus.

### Kubernetes health via Prometheus / kube-state-metrics

kube-prometheus-stack runs in the `monitoring` namespace and scrapes
kube-state-metrics for `pfire`. `portfoliost-admin` reaches it in-cluster at
`PROMETHEUS_URL` (`kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090`,
set in the admin HelmRelease), so Prometheus is never exposed to the browser.

Deployment health uses `kube_deployment_status_replicas{ready}` plus a
pod → ReplicaSet → Deployment owner chain for restarts. When `PROMETHEUS_URL` is
unset (local dev) the endpoint returns reachability-only rows and the frontend
greys the status dots.

### k8s-only storage workloads

`postgres` and `redis` have no `/__meta`, so `workloadTargets()` addresses them
directly: postgres as the Crunchy StatefulSet
`postgres-pfire-postgres-pfire-k8db` (`kube_statefulset_*` + created_by_name
restart attribution), redis as the `redis` Deployment (container `main`, pod
regex `redis-.*` — anchored PromQL `=~` so `ib-redis` cannot match). Each row
degrades field-by-field; a failed query nulls that field, never 500s. This was
added by §26, after the original proposal.

### Traffic

`GET /api/admin/topology/traffic` prefers D56 OTel metrics and falls back to
nginx-ingress. Per service: request rate, 4xx/5xx share, P99 latency.

> **as-built correction.** The proposal assumed the OTel series carry
> `service_name`. They do not. Verified against the live Prometheus on
> 2026-10-02: `http_server_request_duration_seconds_count` is exported with
> `job` (and `service`) only — `count by (service_name)` returns no series.
> `topology-traffic.ts` therefore probes labels in the order
> `service_name → job → service` (`LABEL_PREF`) and takes the first that yields
> series, which is what makes `source: "otel"` actually resolve in this cluster.

`INGRESS_APP_HOST` (`portfoliost.k.homylab.com`) adds an aggregate row for the
`nginx-gateway` node, since the ingress controller exports per-host series for
it. Without that env var the gateway has no traffic box.

`cachestProviders` carries cachest's per-upstream P99 keyed by `server_address`
— the details panel shows it as a latency table when the node is inspected.

### CronJobs

CronJobs are **not** part of the live status overlay. They are static nodes with
hand-written schedule/suspend metadata, because a CronJob has no steady state to
probe: `kube-state-metrics` exposes no "last run succeeded" signal, and the
honest wording is "this is what the manifest declares", not "this is healthy".
`TopologyServiceStatus.reachable` is defined on deployment readiness, which a
CronJob does not have.

> **Known defect (2026-10-02).** `CACHEST_P99_Q` filters on
> `service_name="cachest"`, but no exported series carries `service_name`, so
> `count(http_client_request_duration_seconds_bucket{service_name="cachest"})`
> is empty and `cachestProviders` is always `[]` in this cluster. The panel's
> cachest latency table is therefore permanently hidden. It needs the same
> `LABEL_PREF` treatment as the service rows. Tracked in `plan.md` §80.6.

### Provider topology (static, from config)

The data-provider chain is known from source and is represented as a structured
static definition with live status overlaid:

```
openst → OpenBB SDK → yfinance / fmp / intrinio / polygon / sec / nasdaq /
                       cboe / tiingo / tmx / biznesradar / obligacje
cachest → openst (most routes, TTL-cached)
        → alphavantage.co, financialmodelingprep.com, dividendhistory.org
portfoliost-instruments → ECB (fx_rates, own fxsync CronJob)
portfoliost-* → portfoliost-users-auth (JWT verification)
portfoliost-admin → {users-auth, wallets, instruments, openst, cachest} (/__meta)
nginx gateway → {users-auth, wallets, instruments, admin} (path-prefix routing)
SPA → nginx gateway
PocketID → portfoliost-users-auth
```

---

## Architecture decisions

### D55-1 — Graph library: `@vue-flow/core`

Vue 3 native, TypeScript-first, custom node/edge rendering, built-in zoom/pan,
animated edges. `@dagrejs/dagre` is the layout engine. `cytoscape.js` was
considered and rejected for imperative DOM handling at this graph size (39
nodes).

### D55-2 — Route and tab

`/en/admin/topology` → `TopologyView.vue`, route name `admin-topology`, declared
in `src/router/index.ts` under the `admin` parent with `meta: { admin: true }`.
The tab list in `AdminLayout.vue` now reads System, **Topology**, Currency
Rates, Users, Jobs, Market Data, Bond Catalogue — Topology kept its slot; the
area grew tabs after this proposal. The System tab itself is unchanged.

### D55-3 — Static graph definition

`topology/graph-definition.ts` defines 39 nodes and 47 edges:

| Area | Count | Nodes |
|---|---|---|
| `internal` | 6 | SPA, nginx gateway, admin, users-auth, wallets, instruments |
| `storage` | 2 | postgres, redis |
| `jobs` | 10 | fxsync, tickersync, sheets-sync, stooq-downloader, stooq-importer, jobshot, openst-bond-import, openst-bond-archive, openst-cpi-import, openst-cpi-seed |
| `external-services` | 5 | PocketID, Google Sheets, stooq.pl, scanst, mastra-ticker |
| `data-providers` | 16 | openst + cachest aggregators, and leaf providers yfinance, FMP, Intrinio, Polygon, SEC/EDGAR, Nasdaq, CBOE, Tiingo, TMX, AlphaVantage (25/day), dividendhistory.org, ECB, BiznesRadar, Obligacje |

Each provider leaf carries `dataTypes` and, where real, a `quota` badge. Each
job node carries `job: { schedule, suspended, purpose }`. Each edge carries
`kind` (`api` / `gateway` / `auth` / `job` / `provider` / `storage`) and
`measurable` (`ingress` / `otel` / `none`).

### D55-4 — Live status overlay

`useTopologyStore` polls `GET /api/admin/topology/status` and
`GET /api/admin/topology/traffic` every 30 s (the System tab cadence), fetching
both in parallel. Either may fail independently: a failed call keeps its
previous data and records the message, the other still applies, and polling never
rejects.

Both endpoints sit behind `requireGroup("portfoliost_admin")`.

> **as-built correction.** `TopologyServiceTraffic`'s HTTP fields are
> **nullable** (`requestsPerMin`, `errorRate`, `p99LatencyMs`), and it carries
> `cpuCores`, `memoryBytes` and `connections` for the storage workloads. §26.1
> made them nullable precisely so a missing exporter scrape reads as "unknown"
> rather than a flatlined 0.

### D55-5 — Node visual design

One component per area: `card`-backed rounded rect (internal), cylinder-tinted
(storage), dashed green (jobs), indigo (external), amber pill with quota badge
(providers). Live nodes carry a `StatusDot` in the corner:

| State | Condition |
|---|---|
| Healthy | reachable + all replicas ready + restarts < 5 |
| Degraded | reachable but partial replicas, or restarts ≥ 5 |
| Down | unreachable / `impl: "unknown"` |
| Unknown | no Prometheus data (CronJobs, external providers) |

The dot pulses when the node has live traffic.

### D55-6 — Edge animation

`FlowEdge.vue` draws the moving-dot overlay on top of the standard path.
Active (measured traffic) animates with duration and intensity derived from the
request rate; idle, job-trigger and provider edges render no overlay.

### D55-7 — Click-to-inspect panel

A right-side slide-in inspector (`width: min(360px, calc(100% - 20px))`): name,
area badge, status pill, image ref, upstream / downstream neighbours, provider
data types + quota, replica / restart / request rate / P99 / error rate, and for
jobs the schedule block (`purpose`, cron expression, "Scheduled · Controller
timezone" or "Suspended"). Traffic renders for every live area, **not** only
`internal` — cachest and openst are probed services in `data-providers` and their
traffic was invisible until a gate was removed. The cachest per-upstream latency
table renders only when `cachestProviders` is non-empty (see the known defect
above).

Clicking highlights the node with a ring, keeps connected edges at full opacity
and dims the rest to 0.25; clicking the pane resets. `Escape` closes the panel.

### D55-8 — Graph controls

Toolbar: search (case-insensitive substring, dims non-matches), per-area filter
pills, Re-layout, zoom in / out, Fit view. Theme switch (Light / Auto / Dark),
Pause effects and Focus mode sit in the header; Focus mode hides the stats row
and gives the canvas `calc(100dvh - 285px)`.

### D55-9 — Layout

> **as-built correction, twice.**
>
> **Direction.** The plan said left-to-right ranks. What shipped is
> `rankdir: "RL"`: every request edge points upstream (SPA → gateway → services →
> providers), so right-to-left rank assignment puts the data flow left-to-right on
> screen — the intended reading — without inverting the edge list.
>
> **Lanes.** The plan described "faint translucent rounded rectangles". What
> shipped is stronger: each area is a **vue-flow parent node** (`LaneNode.vue`),
> its members are children with `extent: "parent"` so a box is physically
> bounded and can never overlap a sibling, and dragging a lane header moves the
> whole group with `clampLaneMotion` binary-searching the largest collision-free
> displacement against `LANE_BOUNDS`. Positions persist to localStorage under
> `pfire.topology-layout.v1` and are applied **only when the stored id set
> matches the graph exactly**, so any node add/remove invalidates a saved layout
> and falls back to a fresh dagre pass. The Re-layout button is the manual
> escape hatch.

`packAreas` runs a deterministic greedy pass that pushes each lane down until it
clears every already-placed lane, guaranteeing pairwise-disjoint lanes while
leaving the horizontal column reading intact. `ISOLATED_ANCHORS` pins edge-less
nodes (`scanst`, `mastra-ticker`) next to their logical column, because dagre
v3 ignores `minRank`/`maxRank` and would otherwise fling them to the far rank
and stretch their lane across the canvas.

> **Known limitation.** Packing downward is what makes the canvas tall and
> narrow, which forces `fitView` to zoom out and is the direct cause of the
> unreadable-node complaint. Changing the pack axis to horizontal is §80.5.

### D55-10 — Dark/light mode

Node and panel colours use Tailwind `dark:` variants; edge strokes reference
CSS variables. The stage is a fixed dark "mission control" surface in both
themes — the header switch drives the app theme store, and the tab follows.

### D55-11 — Backend contract additions

`portfoliost-contracts/contracts/openapi.yaml` carries
`TopologyStatusResponse`, `TopologyServiceStatus`, `TopologyTrafficResponse`,
`TopologyServiceTraffic`. Consumers regenerate with `npm run gen:types` from
`../portfoliost-contracts/contracts`.

---

## What is NOT in scope

- No CPU/memory/disk charts per service beyond the storage rows' scalar readouts.
- No log viewer integration.
- No historical traffic graphs or time-series dashboards.
- No Kubernetes deployment controls (restart, scale, rollout).
- No replacement of Grafana or any existing monitoring tooling.
- No live execution health for CronJobs — declared schedule only, by design.

---

## Delivery record

All fourteen original steps shipped; the closeout is in `plan-archive.md`.
Test coverage that locks the behaviour:

| Layer | File | Locks |
|---|---|---|
| unit | `tests/unit/modules/admin/topology-graph-definition.test.ts` | 39 node ids, 47 edge pairs, area counts, `live` set, job metadata, snapshot |
| unit | `topology-layout.test.ts` | determinism, chain direction, lane ordering, no overlap, members inside lanes, `packAreas`/`nearOverlap` |
| unit | `topology-store.test.ts` | polling, per-endpoint failure isolation, `nodeData` merge |
| unit | `topology-filters`, `topology-selection`, `topology-edge-state`, `topology-lane-motion`, `topology-persistence`, `topology-node-status` (one `.test.ts` each) | search/area filters, selection dimming, edge state, lane clamping, layout cache validity, dot grading |
| e2e | `tests/e2e/topology.spec.ts` | tab reachable, canvas renders, filters, panel open/close, keyboard |
| backend | `portfoliost-admin/src/topology.test.ts`, `index.test.ts` | endpoint shapes, Prometheus degradation paths |

---

## Design decisions (resolved)

**System tab replaced?** No. Additive; System keeps its flat list for quick
version lookup.

**Static graph or auto-discovery?** Static definition for nodes, edges and
provider metadata; live overlay for status and traffic. The topology is stable
and well-understood; full dynamic discovery would add backend complexity for no
benefit at this scale.

**Where does Prometheus access live?** Inside `portfoliost-admin` as a thin
proxy. The admin pod already queries the Kubernetes API in-cluster; Prometheus
HTTP queries are the same pattern and keep Prometheus off the browser.

**Graph library?** `@vue-flow/core` — see D55-1.

---

## Known drift, 2026-10-02

Two things in this document were true when written and are not now. Both are
scheduled in `plan.md` §80.

1. **The cronjob list in both tabs is stale.** The System tab's hardcoded
   `CRONJOBS` array (`jobs-version.ts`) and the graph's job nodes have drifted
   from the cluster: `portfoliost-wallets-fxsync` no longer exists (FX ownership
   moved to instruments in §48.6a), and `corpbondsync`, `fundcategorysync` and
   `snapshotsync` are missing from both tabs. §80.1–80.3.
2. **Nodes are too small to read, and the lane axis is wrong for a wide
   screen.** `NODE_SIZES` (28–40 px tall) drives dagre spacing, the rendered box
   is 12 px text on a 28 px provider pill, and `fitView` then shrinks a tall
   canvas further. §80.4–80.5.
