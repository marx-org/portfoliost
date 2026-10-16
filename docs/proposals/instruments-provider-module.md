# Proposal: instruments module backed by the provider tier

**Status**: accepted (2026-08-23)
**D77 (PL fund/bond OHLCV)**: **done** (2026-09-14) — biznesradar provider wiring
**D79 (retail savings bonds)**: **done** (2026-09-16) — openbb_obligacje provider wiring
**Plan §34 (asset-class quote dispatch)**: **done** (2026-09-20) — `/:symbol/quote` routes savings bonds to openst `/fixedincome/quote`, crypto to `/crypto/quote`, and corp bonds/funds/default instruments to the existing equity quote path.
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
`marx-org/portfoliost-instruments` (private), stack identical to users-auth
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
| `/:symbol/quote`, `/price` | openst→cachest | verified: `price.quote` yfinance/fmp; plan §34 adds asset-class dispatch (savings bond → fixedincome quote, crypto → crypto quote, other → equity quote) |
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
[openst-coverage.md](../openst-coverage.md).

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

| Family | Price/OHLCV | Search | Profile | Verdict |
| --- | --- | --- | --- | --- |
| TFI sub-funds (`NNEP25.TFI`, `GSEM25.TFI`…) | `biznesradar` provider (D77) ✅ | `biznesradar` EquitySearch (D77) ✅ | `biznesradar` EquityProfile (D77) ✅ | done |
| GPW-listed FIZ (`Beta ETF * FIZ`) | yfinance `.WA` (equity path) ✅ | `biznesradar` symbol probe ✅ | `biznesradar` EquityProfile ✅ | done |
| Crypto | `openbb-crypto` extension (D78) ✅ | `openbb-crypto` `crypto.search` (D78) ✅ | via quote fields (D78) ✅ | done |
| Retail savings bonds (ROD/EDO/OTS/ROR/DOR/TOS/COI/ROS) | `openbb_obligacje` pricing engine (D79) ✅ | `bond_series` catalogue in Postgres `openst` schema (D79) ✅ | `bond_series` from `obligacjeskarbowe.pl` (D79) ✅ | D79 ✅ |
| Catalyst corp bonds (BST, INS, KRI, ARH, VOX, NVA + `YMM`) | `biznesradar` OHLCV (D77) ✅ | `biznesradar` EquitySearch ✅ | `obligacje.pl /pl/obligacja/{symbol}` (D80) | D80 |

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
- **Search + profile**: `openbb-crypto` exposes `obb.crypto.search` and quote fields
  (`name`, `currency`) which serve as a minimal profile. `openst /crypto/search/{query}`
  and `/crypto/profile/{pair}` routes added alongside OHLCV/quote (same pattern as
  equity routes).
- cachest: `OPENST_CRYPTO_OHLCV` `/crypto/ohlcv/{pair}` (TTL 6h) + `OPENST_CRYPTO_QUOTE`
  (TTL 6h). instruments adapter adds `fetchCryptoOhlcv`; search falls back to
  `ticker_reference` as for equities (crypto pairs seeded with `asset_type='crypto'`).

### D79 — retail savings bonds: `openbb_obligacje` provider in openst

Retail savings bonds (ROD, EDO, OTS, ROR, DOR, TOS, COI, ROS) have **no market
price** — their value is a deterministic function of issue parameters, elapsed periods,
and announced rates.  The original plan placed the pricing engine in
`portfoliost-instruments` (TypeScript).  **Revised**: the engine moves into openst as
a custom OpenBB provider `openbb_obligacje`, following the same plugin pattern as
`openbb_biznesradar`.  instruments calls it through cachest like every other provider;
no bond math lives in instruments.

#### Postgres schema `openst`

All persistent data for openst lives in a dedicated **`openst` schema** in the
shared PGO Postgres cluster (same instance used by `instruments`, `wallets`, etc.).
openst gains a `DATABASE_URL` env var (PGO least-privilege user, schema `openst`);
the k8s CronJobs use the same connection string — no PVC, no SQLite, no concurrency
concerns.

Tables in schema `openst`:

| Table | Contents |
| --- | --- |
| `cpi_12m` | `(date DATE PK, value NUMERIC)` — monthly CPI 12m from `obligacje.pl` |
| `bond_series` | one row per savings-bond emission: symbol, name, issue_date, maturity_date, term_months, rate_rule, margin, fee_b, nominal |

CPI is the **only rate required for D79** — savings bonds (ROD, EDO, COI, ROS) are
CPI-linked or fixed; their rates are derived directly from issue parameters + CPI,
no WIBOR/WIRON needed.  WIBOR 3M, WIBOR 6M, WIRON are deferred to D83 (separate
extension for Catalyst bond coupon data).

**Homelab wiring**: PGO `PostgresCluster` already manages user/schema creation per
module via least-privilege users.  Add `openst` user + schema alongside existing
module schemas; add `DATABASE_URL` to `openst-secrets` in the homelab repo.

#### CPI import

Source: `obligacje.pl/pl/narzedzia/inflacja,data_od-{from},data_do-{to}` —
`Data | Wartość` HTML table, monthly rows, back to 2000.  Same scraper pattern as
biznesradar (BeautifulSoup, `lxml`).

- **Initial import**: one-shot k8s Job using the openst image, scrapes full `MAX`
  history into `openst.cpi_12m`.
- **Daily CronJob** (`concurrencyPolicy: Forbid`): fetches last 60 days, upserts
  by date.  CPI is published monthly — most runs are no-ops.

#### Savings-bond emissions catalogue

`obligacjeskarbowe.pl` lists every emission per series (symbol `{TYPE}{MMYY}`, e.g.
`EDO0936`, `ROD0938`).  Fields: series code, issue date, maturity date, term (months),
nominal 100 PLN, rate rule (`fixed | cpi_12m+margin`), margin, early-redemption fee `b`.
Savings bond profiles come from this site.

- **Initial import**: one-shot k8s Job scrapes all offer pages
  (`/oferta-obligacji/obligacje-{type}/`) into `openst.bond_series`.
- **Daily CronJob**: checks current-offer page (~8 active series at any time);
  inserts new emissions only.  Same job as the CPI importer (single script, two
  targets).

#### `openbb_obligacje` plugin

New package `openst/plugins/openbb_obligacje/`, same scaffold as `openbb_biznesradar`.
Reads from Postgres `openst` schema via `psycopg2` (already available in the openst
image via the PGO stack) using `DATABASE_URL` from env.

- **`FixedIncomeHistoricalFetcher`** — registered under OpenBB `FixedIncomeHistorical`
  model (`obb.fixedincome.price.historical`).
  - Reads `bond_series` + `cpi_12m` from Postgres.
  - Pricing engine (pure Python, unit-tested per `obligacjeskarbowe.pl` worked examples):
    - Capitalized series: `W = N·∏(1+r_k)` across elapsed periods.
    - Redemption value: `WP = N + O − b` with `O = N·r·(a/D)/F` (ACT/ACT accrual).
    - 100 PLN floor in first period; `b ≤ O` cap for capitalized series.
    - Early-redemption fees per series: OTS 0, ROR 0.50, DOR 0.70, TOS 1.00, COI 2.00,
      EDO/ROD/ROS 3.00 PLN.
  - Produces a daily price series for the requested `[start_date, end_date]` range.
  - Rate lookup: CPI from `openst.cpi_12m`; fixed series take `r` directly from
    `bond_series.margin`.
- **`FixedIncomeSearchFetcher`** — queries `bond_series` by symbol prefix or name
  substring; returns `{symbol, name, series_type, maturity_date}`.
- **`FixedIncomeProfileFetcher`** — returns static fields from `bond_series` for a
  known symbol: name, series code, nominal, rate rule, margin, maturity, fee `b`,
  `asset_type: "bond"`, `country: "PL"`, `currency: "PLN"`.
  Profile source: `obligacjeskarbowe.pl` (data imported into `bond_series` — no
  live scrape at request time).

New openst routes (mirroring the crypto pattern):
- `GET /fixedincome/ohlcv/{symbol}?start&end` → calls `FixedIncomeHistoricalFetcher`
- `GET /fixedincome/search/{query}` → calls `FixedIncomeSearchFetcher`
- `GET /fixedincome/profile/{symbol}` → calls `FixedIncomeProfileFetcher`

cachest adds `OPENST_BOND_OHLCV` `/fixedincome/ohlcv/{symbol}` (TTL 6h), mirroring
`OPENST_CRYPTO_OHLCV`.  Profile and search are also cacheable (TTL 24h — data changes
only when a new emission is imported).

`portfoliost-instruments`: D81 routing for `bond` asset class calls
`/fixedincome/ohlcv/{symbol}` through cachest; search falls back to the `bond_series`
catalogue (seeded into `ticker_reference` with `asset_type='bond'`).

**Gap-fix 2026-09-16 (D79 history + DB-first):** `bond_series` now backfills 449 historical
emissions via `--mode archive` (scrapes `/listy-emisyjne/`; resolves 4 archived EDO URL id
typos by fetching at the raw selector `url_id`). `search_bonds` and `get_bond_profile` in
`openbb_client.py` read the DB first (OpenBB fallback for DB-less / empty DB).
Instruments normalizes a trailing `.WA`/`.US` venue suffix off bond search queries so
`ROD1033.WA` ≡ `ROD1033` (`venueFreeSymbol()` in `src/adapters/symbol.ts`, applied only in
`bondSearchLeg`). Cluster one-shot Job `openst-bond-archive` (`openst@v1.1.22`, Flux)
populated `openst.bond_series` — 449 rows, `ROD1033` margin 1.50.

**Verified 2026-09-21 — first-year fee floor makes young capitalized bonds quote flat
at nominal (not a bug, per MF rules):** the `openbb_obligacje` engine (engine.py
`redemption_value`, lines 271 + 274–275) yields the *net-of-fee cash-out value* with a
100 PLN floor in the first annual period, so an EDO emission inside its first year shows
quote ≈ 100 until accrued interest exceeds the 3.00 PLN early-redemption fee.  Observed
live on portfolio "Obligacje PKO SA Beata": `EDO0735` (issued 2025-07-01, in year 2;
rate y1 6.1% = CPI Jun-2025 + 2.0, fully capitalized to K₁ = 106.10) quotes 104.17 (P/L
+4170), while `EDO0636` (issued 2026-06-01, ~3.5 months old; rate y1 5.1% = CPI May-2026
3.1% + 2.0) quotes exactly 100.00 — accrued interest ≈ 1.56 PLN < fee 3.00 → value
clamped to nominal → P/L 0.  Both symbols travel the identical `/fixedincome/quote` path;
there is no per-series branch.  Quotes/gains self-correct once year-1 accrual passes the
fee (~day 215, ≈ 7 months in), then grow and jump ~5% at the year boundary when interest
capitalizes into the nominal.  If a future plan wants portfolios to display accrued value
**gross** of the early-redemption fee (the fee is only realized if the bond is actually
redeemed early), that is a deliberate deviation from the MF-published redemption tables,
not a defect.

### D80 — Catalyst corporate bonds: profile metadata + catalogue — **DONE 2026-09-19** (plan §25.2/§25.3)

Catalyst-listed corporate bonds (BST, INS, KRI, ARH, VOX, NVA + `YMM` maturity
suffix) already have working OHLCV via `openbb_biznesradar` (D77) — `BST0327.WA`
returns real market prices today.  D80 closes the remaining gap: **profile metadata**
and **search catalogue**.  No coupon calculation engine is needed for corp bonds.

#### Profile metadata source

`obligacje.pl/pl/obligacja/{symbol}` provides full bond metadata scraped as profile:
emitent name, ISIN, market (`GPW RR` / `ASO`), nominal (100 PLN), coupon type
(`zmienne WIBOR 3M + {margin}%` or `stałe`), current coupon %, maturity date,
`asset_type: "corp_bond"`, `country: "PL"`, `currency: "PLN"`.

A new **`CorporateBondProfileFetcher`** is added to `openbb_biznesradar` (extending
the existing plugin — same scraper infrastructure, new target site):
- Registered under `EquityInfo` model (same as `EquityProfileFetcher`) but dispatches
  on Catalyst bond symbol patterns (`BST*`, `INS*`, `KRI*`, `ARH*`, `VOX*`, `NVA*` +
  any `{3-letters}{4-digits}` Catalyst shape) to scrape `obligacje.pl` instead of
  biznesradar's `/notowania` page.
- Falls back to the existing `EquityProfileFetcher` for non-bond symbols.

#### Catalyst bond catalogue

The `obligacje.pl` bond search page (`/pl/narzedzia/wyszukiwarka-obligacji-notowanych`)
lists **936 bonds** with symbol, emitent, maturity, coupon type, margin, current
coupon.  `openst` `src/importers/corp_bond_catalogue.py` scrapes the single
server-rendered listing and emits a `tickerref-sync` CSV (`asset_type='corp_bond'`,
`WSE::` keys); exposed as `GET /corp-bond/catalogue` (Redis-cached 24h) and proxied
at cachest `OPENST_CORP_BOND_CATALOGUE` (12h). **Deployed (plan §35, 2026-09-19)**:
daily CronJob `portfoliost-instruments-corpbondsync` (04:45 UTC) runs
`corp-bond-catalogue-sync.js` in instruments — fetches the CSV through cachest,
row-count-gates (refuses a truncated scrape), upserts into `ticker_reference`
(`WSE::` keys only — never deletes, never touches stock/ETF rows), enabling search
and the D81 price-bars dispatch without an openst roundtrip. Delisted bonds linger
(harmless — their OHLCV 404s upstream).

### D81 — asset-class routing in price-bars — **DONE 2026-09-19** (plan §25.4; routing table implemented as-is: `getPriceBarSeries` dispatches on `ticker_reference.asset_type`, crypto→`/crypto/ohlcv`, bond→`/fixedincome/ohlcv`, corp_bond/fund→equity `/ohlcv`, stock/etf unchanged stooq-overflow path)

- `ticker_reference.asset_type` widens beyond today's stock/etf: `fund`, `crypto`,
  `bond`, `corp_bond`. Routing in `fetchPriceBars` branches per class before touching
  cachest or stooq:
  - `fund` → existing `/ohlcv` equity path (biznesradar or yfinance `.WA`)
  - `crypto` → `/crypto/ohlcv/{pair}` (D78)
  - `bond` → `/fixedincome/ohlcv/{symbol}` (D79 engine via cachest)
  - `corp_bond` → `/ohlcv/{symbol}` equity path (biznesradar OHLCV, D77) — no engine fallback needed; biznesradar serves market prices reliably
  - `equity` keeps the existing stooq-overflow path unchanged
  `providerSymbol()` is already a passthrough for any non-`.US` suffix, so `.TFI`,
  `.FIZ`, `.WA`, `BTC-USD`, `EDO0936` pass through untouched; bonds/crypto never
  enter stooq (overflow-only) and skip `checkSplitBoundary`.

### D82 — contract & admin surface — **DONE 2026-09-19** (plan §25.5; `@marx-org/contracts@1.6.26` with `InstrumentType` enum STOCK/ETF/BOND/CRYPTO/FUND/CORP_BOND wired to `InstrumentDetail.type` + `SearchResult.type`; admin `GET /api/admin/bond-catalogue/bond-series` + `/cpi` + SPA Bond Catalogue tab)

- Reused contract shapes: bar/quote series need no changes. `InstrumentType`/detail
  `type` gains `fund | bond | corp_bond | crypto` so the SPA can label and route rows —
  one `@marx-org/contracts` patch bump (edit `openapi.yaml`, CI bump, reinstall, `gen:types`).
- Admin: bond catalogue and CPI import status visible in portfoliost-admin; `bond_series`
  and `cpi_12m` live in `openst` Postgres schema, not in instruments.
- Homelab: PGO least-privilege user `openst` + schema `openst` created alongside
  existing module schemas; `DATABASE_URL` added to `openst-secrets`.

### D83 — WIBOR/WIRON rate import (optional extension)

Deferred from D79. Required if Catalyst bond coupon calculation is ever added.

- Tables `openst.wibor_3m`, `openst.wibor_6m`, `openst.wiron_on` — same schema as
  `cpi_12m`: `(date DATE PK, value NUMERIC)`.
- Source: `obligacje.pl` `/pl/narzedzia/wibor-3m`, `/wibor-6m`, `/wiron` — same
  `Data | Wartość` scraper. WIRON URL must be verified before implementing
  (`wiron.pl` domain is for sale; fallback is `gpwbenchmark.pl/dane_historyczne` CSV).
- Same CronJob pattern as CPI: one-shot historical import + daily append.
- No openst routes exposed — rate tables are engine inputs only.

### D84 — FX rates: `fx_rates` store, importer, currency registry (plan §48, 2026-09-26)

FX moved into instruments (plan §48.1) — daily market data belongs in the same
module as the price series. Recorded here as an instruments responsibility:

- **Store:** `instruments.fx_rates` (`rate_date`, `currency`, `rate`, `source`,
  `fetched_at`; PK `(rate_date, currency)`, EUR-based daily closes) +
  `instruments.fx_sync_state`. Deep import to 1999-01-04 (208,947 rows, 30
  currencies in prod); the daily incremental `fxsync` CronJob mirrors the old
  wallets spec (landed with the §48.6 deploy).
- **Importer:** `src/services/fx-import.ts` (ported from wallets) —
  frankfurter/ECB primary, `@marx-org/contracts/fx` conventions (D27);
  `syncDaily`/`importHistory`/`backfillCurrency`.
- **Endpoints (endpoints follow the data):** `GET /api/internal/fx-rates?from&to[&date]`
  (service-to-service, 10-day walk-back), `GET /api/currencies` (availability SoT
  = distinct currencies in `fx_rates` + the contracts display-metadata catalog,
  D26), `GET /api/fx/latest?from&to` (SPA display/fee conversions),
  `GET /api/admin/fx-rates` (D47 listing). Gateway routes `/api/currencies` +
  `/api/fx` → `API_INSTRUMENTS_URL`.
- **Read-path conversion:** `?currency=` on the price endpoints (plan §48.2 —
  parameterized join, `fxFrom` floor; see
  [price-data-architecture.md](price-data-architecture.md)).

Wallets keeps settlement only and reads instruments' FX (plan §48.3b); its local
`fx_rates` was dropped in prod 2026-09-22 (plan §48.6c).

## Testing strategy (additions)

- openst `openbb_obligacje`: unit tests with Postgres fixtures (in-memory PGlite or
  test DB); engine tests against `obligacjeskarbowe.pl` worked examples (W, WP,
  accrual, fees, floor) for at least one fixed and one CPI-linked series; compose
  smoke curl `/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30`.
- openst `openbb_biznesradar`: new `CorporateBondProfileFetcher` unit tests with
  captured `obligacje.pl` HTML fixture for `BST0327`; compose smoke curls
  `/equity/profile/BST0327` and `/price/ohlcv/BST0327.WA` (regression check).
- openst `openbb-crypto`: compose smoke curls `/crypto/ohlcv/BTC-USD` and
  `/crypto/search/bitcoin`.
- instruments: price-bars routing tests per asset class with mocked cachest; adapter
  URL-mapping tests for crypto and fixedincome paths.
- stack (I9 pattern): savings bond + Catalyst bond + crypto pair through
  instruments → cachest → openst in compose, contract-shape checks.

## Risks (additions)

4. **Scraper fragility (biznesradar / obligacje.pl / obligacjeskarbowe.pl)** — no
   public APIs; parsers pinned to captured HTML fixtures; cachest swallows upstream
   volatility. `obligacje.pl` is used for Catalyst bond profiles and (optionally D83)
   rate data — single-site dependency worth monitoring.
5. **CPI data freshness** — published monthly; daily CronJob is mostly a no-op but
   if it fails across a month boundary the engine silently prices against stale CPI.
   Add a staleness check: if the latest `cpi_12m` row is older than 40 days, the
   fetcher returns an error rather than a silently wrong price.
6. **openst Postgres dependency** — openst currently has no DB. Adding `DATABASE_URL`
   is a new operational dependency. The engine gracefully returns 503 if the DB is
   unreachable (savings bond pricing fails closed, not silently wrong).
