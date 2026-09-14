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

---

# Extension: funds, sub-funds, bonds and crypto (2026-09-14)

New instrument families from the portfolio data: (a) **funds & sub-funds** —
Goldman Sachs Emerytura 2065/2060, NN Emerytura 2025/2030, NN Obligacji, `Beta ETF * FIZ`;
(b) **bonds** — retail savings series ROD/EDO plus Catalyst series BST/INS/KRI/ARH/VOX/NVA
and their `YMM` (maturity-month-year) variants; (c) **crypto**.

Verified against `openst-coverage.md` (2026-09-07, OpenBB 4.7.2) and the live openst
surface (cachest `config.yaml`). Bond math follows obligacjeskarbowe.pl
(`tabela-odsetkowa/`, `listy-emisyjne/`); fund NAV source is biznesradar
(`/notowania-historyczne/NNEP25.TFI`).

## Coverage verdict for the new families

| Family | Installed OpenBB (4.7.2) | openst today | Verdict |
| --- | --- | --- | --- |
| TFI sub-funds (`NNEP25.TFI`, `GSEM25.TFI`…) | none — `equity.search is_fund`/`etf.search` cover US ETFs only | none | custom OpenBB provider `biznesradar` in openst (D77) |
| GPW-listed FIZ (`Beta ETF * FIZ`) | yfinance WSE coverage | equity path alive | seed symbol map (`.WA`) + verify per fund (D77) |
| Crypto | `openbb-crypto` not installed; providers fmp/tiingo/yfinance | none | install `openbb-crypto` + `/crypto/*` routes (D78) |
| Retail savings bonds (ROD, EDO) | no market price, no provider data | none | on-the-fly valuation engine in instruments (D79) |
| Catalyst bonds (BST, INS, KRI, ARH, VOX, NVA + `YMM`) | no PL fixed-income coverage | none | market price via biznesradar "obligacje" provider path (D80) |

### D77 — `biznesradar` as an OpenBB provider extension inside openst

- New package `openst/plugins/openbb_biznesradar/`, installed via requirements
  (`-e ./plugins/openbb_biznesradar`), wired with the standard OpenBB plugin
  entrypoint so `obb.equity.price.historical("NNEP25.TFI", provider="biznesradar")`
  resolves like any other provider. openst then needs no new equity routes — the funds
  flow through the existing `/price/ohlcv` → cachest `OPENST_OHLCV` → instruments path.
- Fetchers: `EquityHistorical` (Data/Kurs table from `/notowania-historyczne/{symbol}`,
  NAV as settlement price; pages of ~50 rows), `EquityQuote` (last row), `EquitySearch`
  (fund-name lookup). Symbols keep biznesradar venue suffix `.TFI` (open-end
  sub-funds) / `.FIZ` (listed closed-end). GPW-listed FIZ sub-funds map to yfinance
  `.WA` WSE quotes — exact symbol per fund is a seed/verification task, not code.
- NAV moves once per business day → cache hard (cachest `cache_ttl` 6h→24h fine).
- HTML scraping risk is isolated inside one provider; parser keeps fixtures in openst
  tests so structure changes fail loudly, not silently.

### D78 — crypto through the `openbb-crypto` extension

- openst `requirements.txt` += `openbb-crypto` (pin compatible with OpenBB 4.7.2,
  verified `crypto.price.historical` / `crypto.price.quote` / `crypto.search`;
  providers fmp, tiingo, yfinance). Pair symbols pass through yfinance-style
  (`BTC-USD`).
- openbb_client additions `get_crypto_ohlcv` / `get_crypto_quote` → new openst routes
  `/crypto/ohlcv/{pair}?start&end` and `/crypto/quote/{pair}` (same default-window and
  RangeIndex-date normalization as the equity routes).
- cachest: `OPENST_CRYPTO_OHLCV` `/crypto/ohlcv/{pair}` (TTL 6h, mirroring
  `OPENST_OHLCV`) + quote route. instruments adapter adds `fetchCryptoOhlcv`.

### D79 — retail savings bonds: on-the-fly valuation engine in instruments

Savings bonds (ROD, EDO) have **no market price** — value is a deterministic function
of the issue parameters, elapsed periods and announced rates. openst has nothing useful:
OpenBB `fixedincome` is US treasury-only. So the module computes prices itself.

- New reference: `bond_series` (series code, issue date, term, capitalization flag,
  nominal 100 PLN, early-redemption fee `b`, rate-rule `fixed | nbp_ref+margin |
  cpi_12m+margin`, margin) and `bond_rate_history` (per series/period: effective-from,
  rate `r_k`). Floating-rate history is *derived*, not scraped: `nbp_reference_rate`
  (per-period reference, WIRON-based on current listings) and `cpi_12m` (GUS) joined per
  period set the rate for the whole period. Fixed series take `r` from the issue list.
- `src/services/bondpricing.ts` — pure, unit-tested per obligacjeskarbowe.pl:
  - maturity/capitalization value `W = N·∏(1+r_k)` (capitalized series);
  - current redemption value `WP = N + O − b` with `O = N·r·(a/D)/F` (ACT/ACT accrual);
  - **100 PLN floor** in the first period; `b ≤ O` cap for capitalized series so the
    bond never prices below redemption;
  - fees per series: OTS 0, ROR 0.50, DOR 0.70, TOS 1.00, COI 2.00, EDO/ROD 3.00.
- Wired like a price bar: the valuation service produces the as-of series, stored into
  `price_bars` with `source='bond'` — the caller (admin/scheduler) refreshes daily;
  reads keep using the `price_bars_all` view unchanged. No cachest/openst call.
- Input freshness is a data job (not a provider): import issue lists + monthly rate
  table from obligacjeskarbowe.pl "Tabele odsetkowe", NBP reference rate, GUS CPI 12m;
  acceptance test compares engine output against the official per-bond table for a
  random series/date.

### D80 — Catalyst bonds: market price via biznesradar, engine as fallback

Catalyst-listed corporate bonds (BST confirmed = BEST S.A.; INS/KRI/ARH/VOX/NVA + `YMM`
maturity suffix) trade at a market price that diverges from calculated value. Same
`biznesradar` provider gains an "obligacje" fetcher (bond section of biznesradar) served
through the existing equity price path. Where no quote exists or quotes are stale,
degrade to the D79 engine's calculated clean price via the series registry
(`valuation: 'market' | 'calculated'`).

### D81 — asset-class routing in price-bars

- `ticker_reference.asset_type` widens beyond today's stock/etf: `fund`, `crypto`,
  `bond`, `corp_bond`. Routing in `fetchPriceBars` branches per class before touching
  cachest or stooq: fund → `/ohlcv` (reused equity path); crypto → `/crypto/ohlcv`;
  bond/corp_bond → D79 engine; equity keeps the existing stooq-overflow path.
  `providerSymbol()` is already a passthrough for any non-`.US` suffix, so `.TFI`,
  `.FIZ`, `.WA`, `BTC-USD` pass through untouched; funds/crypto/bonds never enter stooq
  (overflow-only) and skip `checkSplitBoundary`.

### D82 — contract & admin surface

- Reused contract shapes: bar/quote series need no changes. `InstrumentType`/detail
  `type` gains `fund | bond | corp_bond | crypto` so the SPA can label and route rows —
  one `@marx2/contracts` patch bump (edit `openapi.yaml`, CI bump, reinstall, `gen:types`).
- Admin: `bond_series` CRUD + rate-import endpoint in portfoliost-admin (module
  `instruments` schema owns the tables).

## Testing strategy (additions)

- openst: plugin unit tests with captured biznesradar HTML fixtures; compose smoke
  curls `/price/ohlcv/NNEP25.TFI` and `/crypto/ohlcv/BTC-USD`.
- instruments: `bondpricing` tests against obligacjeskarbowe.pl worked examples (W,
  WP, accrual, fees, floor); price-bars routing tests per asset class with mocked
  cachest; adapter URL-mapping tests for the new crypto path.
- stack (I9 pattern): fund symbol + bond series + crypto pair through
  instruments → cachest → openst in compose, contract-shape checks.

## Risks (additions)

4. **Scraper fragility (biznesradar)** — no public API; parser pinned to captured
   fixtures, isolated in one provider, cachest swallows volatility; revisit provider
   if structure drifts.
5. **Savings-bond inputs are a data job** — monthly import can drift from official
   tables; acceptance test against official values per random series/date gates the job.
6. **Series semantics (BST/INS/KRI/ARH/VOX/NVA)** — BST is definitively a Catalyst
   corporate series; treating short codes as savings-bond series would misprice them.
   D80 covers both by registration, but the registry must encode the correct
   `valuation` per series before first use.
