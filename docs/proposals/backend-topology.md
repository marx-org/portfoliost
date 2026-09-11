# Backend Topology — Coarse Modules, nginx Edge, Service Switching

Status: **accepted** (2026-08-22). Supersedes the KrakenD-based gateway assumptions in earlier proposals.

## Context

The backend (`../portfoliost-users-auth`, Hono + Drizzle + Postgres) is currently a single deployable behind KrakenD, which routes `/api/*` to per-domain upstreams that all point at the example-service mock. The goal is to split it into coarse modules while keeping:

- **example-service contract parity** — every module speaks the same `/api/...` shapes as the mock (types from `@marx2/contracts`).
- **Coordinated switching** — flipping one module from mock to real must switch it *everywhere*: browser-facing routing and any backend module calling it internally.
- **Simplicity** — no infrastructure the system does not actually use.

## Target topology

```
                       ┌──────────────────────────── docker compose / k8s ────────────────────────────┐
 Browser ──► nginx edge │  users-auth   portfolio-domain   watchlists   market-data   misc   backtest* │
 (SPA :3000)  (:8080)   │     │              │               │             │          │        │      │
                        │     └──────────────┴───────┬───────┴─────────────┴──────────┴────────┘      │
                        │                     shared Postgres (schema-per-module)                     │
                        │                     provider tier: openst · cachest                         │
                        └──────────────────────────────────────────────────────────────────────────────┘
                                                                                  * future module
```

Module cut:

| Module | Owns |
|---|---|
| `users-auth` | auth endpoints, users, profile, preferences, onboarding |
| `portfolio-domain` | portfolios, positions, transactions, dividends, **wallets**, analytics/metrics |
| `watchlists` | standalone CRUD over its own tables; enriches symbols via market-data like everyone else |
| `market-data` | instruments, history/quotes, logos, FX rates — exposes example-service contract, wraps providers |
| `misc` | public portfolio shares, snaptrade stubs, misc endpoints |
| `backtest` *(future)* | job management + Python engine runs |

`openst` (OpenBB wrapper) and `cachest` (caching/scraping proxy) form a shared **provider tier**: raw financial data with their own APIs. They are consumed directly by whoever needs raw data — `market-data` translates them to the example-service contract; `backtest` jobs consume them for bulk history.

## Decision records

### D1 — nginx replaces KrakenD
The current KrakenD config is ~1500 lines of pure `no-op` pass-through: no aggregation, no transformations, no edge JWT validation. That is plain reverse-proxy work. nginx does it in ~60 lines and preserves query strings (KrakenD CE silently stripped them — the root cause of the long-standing charting e2e failure). In-cluster later, the existing ingress controller absorbs the edge role entirely.

### D2 — Provider adaptation lives inside owning modules
Translating openst/cachest shapes to the example-service contract happens in code inside `market-data` (adapter), not in gateway config. Gateways stay dumb; providers are swappable without infra changes; adapters are unit-testable.

### D3 — One URL source of truth for service switching
`deploy/services.env` holds one key per module (`API_USERS_AUTH_URL`, …), consumed by:
- nginx gateway upstreams (`env_file` → envsubst into the template),
- any backend module calling another module internally (plain env reads).

Flipping a module = changing **one value** in this file and recreating consumers. In Kubernetes the same file maps 1:1 to a ConfigMap applied via `envFrom`. Mixed states (some modules real, some mock) are just different values per key.

### D4 — `/__meta` verification convention
Every deployable (mock included) serves `GET /__meta` returning `{ "service": "...", "impl": "mock" | "real", "version": "..." }`. A status script prints resolved targets so a flip can be verified end-to-end.

### D5 — JWT validated per-module, identity in the token only
Each module validates the OIDC JWT locally (jose, JWKS from the issuer). No introspection calls against the auth service; identity claims travel in the token.

### D6 — Shared Postgres, schema-per-module
All modules share one Postgres instance for now. Each module owns its schema(s); **cross-module SQL access is banned** (enforced by scoping each module's Drizzle config to its own schemas). Intra-module multi-schema use is allowed — e.g. `portfolio-domain` owns both the portfolio and wallet schemas, so "buy stock" stays a single local DB transaction across them. If wallets ever split out, adopt outbox+saga then (trigger documented, not before).

### D7 — Inter-module communication: sync REST now, events later
Cross-module reads/writes go through direct HTTP calls using thin typed clients built on `@marx2/contracts` (single swap point if anything changes). No broker yet: no fact has >1 consumer today, and sync REST is testable with existing vitest/e2e suites.

Documented event candidates + adoption triggers:
- `transaction.recorded` (wallet debit choreography) — when wallet becomes standalone or >1 consumer needs the fact.
- `user.deleted` (data purge fan-out) — when ≥2 modules need cleanup.
- Instrument/quote refresh broadcasts — when server-side caching arrives.

Trigger rule: introduce async when a fact has ≥2 consumers or a cross-module write needs choreography — not before.

### D8 — UI ↔ backend stays synchronous
Request/response over the generated OpenAPI contract. SSE/WebSocket postponed; nginx proxies both fine whenever needed, so deferring costs nothing.

### D9 — Edge preflight auth via `auth_request`
nginx performs a subrequest to `users-auth GET /internal/verify` (cached JWKS, returns 204/401) so unauthenticated requests never reach modules. Exemptions: `/api/public/*`, `/.well-known/*`, `GET /__meta`, and all `OPTIONS` (CORS preflight). Module-level validation remains mandatory — defense in depth; modules are reachable directly via internal DNS and internal calls carry tokens too.

> Not implemented in compose until the real `users-auth` module exists; with everything routed to the mock, the edge check would be a no-op round-trip.

### D10 — Public portfolio shares
`/api/public/portfolios/{shareId}` is served without authentication: exempt from edge auth, per-IP rate-limited at nginx (`limit_req`), payloads sanitized by the serving module (no owner PII), short cache TTL acceptable at the edge.

### D11 — Jobs / backtest pattern
Long-running backtests run out-of-process:

```
UI ─ POST /api/backtests (config) ─► backtest module ─ insert jobs row (queued)
UI ─ GET /api/backtests/{id} (poll status/progress/results)          [D8]
worker/job pod ─ pulls row, runs engine, writes progress+results back
```

- States: `queued → running(pct) → succeeded | failed | cancelled`; results live in module-owned tables; UI polls (fits D8).
- Executor per environment, identical contract: compose = worker container (same repo, separate entrypoint); cluster = backend spawns a **k8s Job** per submission (scheduler component; job pod self-reports to DB).
- Job pod isolation: ServiceAccount without k8s RBAC, no mounted secrets, CPU/mem limits, `activeDeadlineSeconds`, `ttlSecondsAfterFinished`, NetworkPolicy allowing egress only to provider tier + Postgres.
- Strategies v1: **curated registry** (named, versioned, parameterized). User-uploaded strategy code is deferred — the isolation above makes it possible later without re-architecture, but the trust decision is not made now.
- Data access: jobs consume the provider tier (openst/cachest) directly, matching the current engine's provider/cache design.

## Flip procedure

1. Edit the module's value in `deploy/services.env` (or the ConfigMap).
2. Recreate consumers of that key: `docker compose up -d gateway <consuming-modules>`.
3. Verify with `GET /__meta` on the gateway route and the module itself.

## Migration sequence

1. **Gateway swap** — replace KrakenD with nginx in docker compose (this repo). Fixes the query-string blocker; unblocks endpoint migration (testing-strategy Phase 2).
2. **Extract modules one by one** — start with `market-data` (most independent; proves the provider-tier adapter pattern), then `users-auth`, `portfolio-domain`, `watchlists`, `misc`.
3. **Cluster rollout** — drop the KrakenD deployment; ingress + per-module deployments + `service-urls` ConfigMap; add D9 edge auth once `users-auth` is real.
4. **Backtest module** — queue + worker in compose first; k8s Jobs in cluster.

## D56 — OpenTelemetry as data source for topology traffic metrics

**D56 (OpenTelemetry Observability) is a prerequisite for richer live traffic data
in the topology view.**

Once D56 is deployed all six backend services expose Prometheus-compatible
`/metrics` endpoints with:

- `http_server_request_duration_seconds` — per-route request latency histograms
  (P50/P99) for admin, wallets, instruments, users-auth, openst, and cachest.
- `http_client_request_duration_seconds` on **cachest** — outbound call latency
  labelled by `server_address` (hostname), making it possible to see response
  times for `openst`, `alphavantage.co`, `financialmodelingprep.com`, and
  `dividendhistory.org` separately in the topology details panel.

The `GET /api/admin/topology/traffic` endpoint (D55) should be enriched to query
these application-level metrics via the Prometheus API alongside the existing
nginx-ingress metrics, giving more precise per-route throughput and latency data.

The topology view is designed to **degrade gracefully** when D56 metrics are
absent — it falls back to nginx-ingress metrics alone without any user-visible
error. D56 enrichment is additive.

**PromQL references (unified across all 6 services after D56-3 addendum):**
```promql
# request rate per service
sum by (service_name) (rate(http_server_request_duration_seconds_count[5m]))

# cachest per-provider latency (p99)
histogram_quantile(0.99,
  sum by (le, server_address) (
    rate(http_client_request_duration_seconds_bucket{service_name="cachest"}[5m])
  )
)
```

---

## Open questions

- Trust model for user-uploaded strategy code (deferred; see D11).
- KEDA/queue-depth scaling trigger for backtest workers.
- Final home of FX rates / logos if extraction order surfaces friction (currently `market-data`).
