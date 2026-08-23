# Proposal: instruments module backed by the provider tier

**Status**: accepted (2026-08-23)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: second extracted module `portfoliost-instruments`; local verification only (cluster rollout deferred to a later phase).

## Context

`users-auth` proved the module pattern (separate repo, own container, schema-per-module,
ingress/env-key switching). The next module is `instruments`: the `/api/instruments/*`
surface (~20 read endpoints behind auth) plus its translation layer onto the provider
tier — `openst` (OpenBB wrapper) fronted by `cachest` (config-driven caching proxy).
This phase also makes both providers first-class citizens of docker compose so every
layer is testable locally without cluster access.

### D12 — instruments is the reference provider-backed module

Full `/api/instruments` surface per `docs/api/example-service-real-api.yaml`, all routes
JWT-protected (D5) via the shared auth middleware pattern from users-auth
(`POCKETID_ISSUER_URL` JWKS validation; `X-User-*` compose fallback). Module ships
`/health`, `/__meta` (`impl: "real"`), `/internal/verify` per playbook. Repo
`Marx2/portfoliost-instruments` (private), stack identical to users-auth
(Hono + Drizzle + Postgres + PGlite + jose), naming per MODULARISATION.md:
compose service `instruments`, k8s name `portfoliost-instruments`, env key
`API_INSTRUMENTS_URL` (already reserved in `deploy/services.env`), Postgres schema
`instruments`.

### D13 — per-endpoint source map (providers first, DB only where providers can't go)

Adapters live inside the instruments module and translate provider payloads into example-service
contract shapes (`generated/api-types`). Provider access goes through **cachest only**
(single cached edge); openst is reachable directly by cachest, not by modules.

| Endpoint | Source v1 | Notes |
| --- | --- | --- |
| `/search?q=` | openst→cachest (`equity.search`, sec provider) | returns `{cik,name,symbol}`; module enriches via detail adapters |
| `/:symbol` (detail) | composite: quote + profile adapters, research fallback | aggregation is module logic (D2) |
| `/:symbol/profile` | openst→cachest | verified: `equity.profile` fmp + yfinance |
| `/:symbol/metrics`, `/overview-metrics` | openst→cachest | verified: `fundamental.metrics` yfinance/fmp (+ `ratios` fmp) |
| `/:symbol/quote`, `/price` | openst→cachest | verified: `price.quote` yfinance/fmp |
| `/:symbol/history?resolution=` | openst→cachest | verified: `price.historical`; extend openst route with `start`/`end` + OHLCV |
| `/:symbol/fundamentals` | openst→cachest | verified: `fundamental.income/balance/cash` fmp/yfinance |
| `/:symbol/eps-surprises` | **derived in module** (I8b) | original plan: keep mock call (estimates all 402). Shipped: quarterly income statements → actual EPS/revenue; estimates = prior-year quarter baseline. Live. |
| `/:symbol/ownership` | **empty-content stub** (I8b) | `ownership.institutional` fmp → 402 Restricted; intrinio v2 key unauthorized. Real module serves valid empty structure; revisit on provider upgrade. |
| `/:symbol/dividends` | openst→cachest (exists today: yield + history) | `{date,amount}` → `{date, year, amount, currency, type}` — live since I8a (incl. openst RangeIndex date fix) |
| `/:symbol/calendar` | openst→cachest calendar windows | verified free: unfiltered `calendar.earnings` + `calendar.dividend` (fmp); module filters per symbol from a daily-cached window; empty window degrades to `{earnings:[],exDividend:[]}` (cachest 404 pass-through, I8a) |
| `/:symbol/projections` | openst→cachest | verified: `estimates.consensus` fmp (`target_consensus/high/low/median`) + yfinance (recommendation, analyst count) |
| `/:symbol/peers` | **module composition** (I8b) | no OSS peers command; shipped same-sector compare rows from a curated large-cap candidate universe with live sector profiles |
| `/:symbol/seasonality` | **computed in module** (I8b) | monthly last-closes from multi-year OHLCV → avg/median/min/max per calendar month |
| `/:symbol/compare?symbols=` | single-symbol compare snapshot (frontend calls it per symbol) | profile+quote+metrics composition — live since I8a |
| `/:symbol/investor-relations` (+transcript) | **derived in module** (I8b) | events generated from real reported quarters; transcript = structured stub (`fundamental.transcript` is FMP-only/premium). No audio URLs. |
| news endpoints | out of scope | AGENTS.md skip-list |

Where the provider tier truly can't go (ownership today), the endpoint still
exists with valid-but-empty content so the UI degrades gracefully instead of
splitting traffic between mock and real backends.

Implementation findings worth keeping:
- cachest passes upstream 404 through as 404 ("no data") while 429/5xx serve
  stale-then-503 — modules can distinguish outage from empty.
- FMP rate-limits block whole windows (openst blocks until reset); the
  instruments calendar route treats upstream 404 as empty lists.
- openst dividend history must normalize non-datetime indexes to ISO dates.
Canonical verification matrix incl. research pointers for the gaps:
[openst-coverage.md](../docs/openst-coverage.md).

### D14 — no direct gateway routing to providers

Contract endpoints stay behind the module. Rationale: provider payloads don't match the
example-service contract (translation required), providers don't validate JWTs (auth bypass),
and contract logic must live in typed, unit-testable code (D2), not gateway YAML.
Provider URLs are plain env on consumers (`OPENST_URL`, `CACHEST_URL`) — they are not
example-service modules and have no mock↔real switch, hence not in `services.env`.

### D15 — compose carries the provider tier

docker-compose gains `redis`, `openst` (build `../openst`, env from `../openst/.env`),
and `cachest` (build `../cachest`, mounted `config.yaml`). openst tokens stay in that
repo's `.env` (never committed). `API_INSTRUMENTS_URL` defaults to the mock; flipping
instruments real exercises the full chain gateway → instruments → cachest → openst.
Both provider repos get standalone compose smoke tests too (their own
`docker-compose.yml`), so each repo proves itself before integration.

## Testing strategy

- **I3/I4 (providers)**: pytest suites + standalone compose smoke (curl every new route;
  cachest cache-hit/stale behavior checked via headers/timing or stats endpoint).
- **I6–I8 (module)**: PGlite migration/seed tests; handler tests against contract
  shapes; adapter tests with mocked fetch (assert URL mapping + payload translation).
- **I9**: dedicated compose stack test — instruments + redis + cachest + openst, curl
  contract checks through the nginx template; flip test distinguishes real vs mock.
- **I10**: portfoliost full suite (build · unit · mock · e2e) unchanged-green.

## Risks

1. **OpenBB coverage gaps** — mitigated by D13 policy: verified gaps keep their existing
   mock-backed gateway calls; upgrades land when provider keys unlock (documented per endpoint).
2. **Provider rate limits** — cachest TTLs absorb them locally; openst keeps its Redis
   cache; alphavantage/FMP keys already present in `.env`.
3. **History volume** — monthly resolution preferred for compare fan-outs; cachest
   stale-fallback keeps UI responsive when upstream throttles.
