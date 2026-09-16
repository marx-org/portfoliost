# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 19. D79 — retail savings bonds: `openbb_obligacje` provider in openst

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D79.

Adds the `openbb_obligacje` plugin to openst that prices Polish retail savings bonds
(ROD, EDO, OTS, ROR, DOR, TOS, COI, ROS) on demand via a pure-Python engine.
No market price exists for these instruments — value is computed from issue parameters
and CPI history.  Data (CPI + bond_series catalogue) lives in a new Postgres schema
`openst` in the shared PGO cluster.  Daily k8s CronJobs keep the data fresh.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md).

---

### 19.1 — homelab: Postgres `openst` schema + secret

- [x] In the homelab repo, add PGO least-privilege user `openst` and schema `openst`
  alongside existing module schemas (follow the pattern from `portfoliost-instruments`
  or `portfoliost-wallets`).
- [x] Add `DATABASE_URL` to `openst-secrets` (k8s Secret in `pfire` namespace).
- [x] Add `DATABASE_URL` env var to the openst HelmRelease
  (`cluster/apps/pfire/openst/app/helmrelease.yaml`) referencing the secret.
- [x] Commit homelab. Verify secret is present in cluster:
  ```bash
  export KUBECONFIG=$HOME/.kube/homylab
  kubectl get secret openst-secrets -n pfire -o jsonpath='{.data.DATABASE_URL}' | base64 -d
  ```

---

### 19.2 — openst: Postgres connection + schema migrationss

- [x] Add `psycopg2-binary` (or `psycopg[binary]`) to `openst/requirements.txt`.
- [x] Create `openst/src/db.py`: thin module that reads `DATABASE_URL` from env and
  exposes a `get_conn()` helper (plain psycopg2 connection, no ORM needed).
- [x] Create `openst/migrations/001_openst_schema.sql`:
  ```sql
  CREATE SCHEMA IF NOT EXISTS openst;

  CREATE TABLE IF NOT EXISTS openst.cpi_12m (
      date    DATE PRIMARY KEY,
      value   NUMERIC(8,4) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS openst.bond_series (
      symbol          TEXT PRIMARY KEY,   -- e.g. EDO0936
      name            TEXT NOT NULL,
      series_code     TEXT NOT NULL,      -- EDO, ROD, OTS, …
      issue_date      DATE NOT NULL,
      maturity_date   DATE NOT NULL,
      term_months     INT NOT NULL,
      rate_rule       TEXT NOT NULL,      -- 'fixed' | 'cpi_12m+margin'
      margin          NUMERIC(6,4) NOT NULL,
      fee_b           NUMERIC(6,2) NOT NULL,
      nominal         NUMERIC(8,2) NOT NULL DEFAULT 100.00
  );
  ```
- [x] Migration runs at openst startup (add to `src/main.py` lifespan, guarded by
  `DATABASE_URL` presence — openst still starts without DB for non-bond routes).
- [x] Unit test: migration is idempotent (run twice, no error).
- [x] Run full openst test suite (docker compose — must stay green).
- [x] Commit.

---

### 19.3 — CPI importer script + one-shot k8s Job

Requirement vs reality: the live `obligacje.pl/pl/narzedzia/inflacja` page has **no
`Data | Wartość` HTML table** — the CPI series (320 rows, Jan 2000 → now, incl.
negative deflation values for 2014-15) is embedded in a
`google.visualization.arrayToDataTable([...])` JS block as `[new Date(YYYY,M,D), value]`
with a 0-based month and dot-decimal values. Range filtering is server-side via
`…inflacja,data_od-YYYY_MM_DD,data_do-YYYY_MM_DD` (parse, don't paint). The
importer therefore parses the JS array, not a table. The k8s Job/CronJob reuses
the openst image (`ghcr.io/marx2/openst:<tag>`) with a command override —
`python -m src.importers.cpi --mode …` (same pattern as `scanst-job.yaml`).

- [x] Create `openst/src/importers/cpi.py`:
  - Parses the `arrayToDataTable` JS block (regex over `new Date(y,m,d), value]`),
    dates to `YYYY-MM-DD`, values as `Decimal` (dot-decimal, integer, or negative).
  - Upserts rows into `openst.cpi_12m` (INSERT … ON CONFLICT DO NOTHING).
  - `--mode full` fetches `MAX` history (no range params — initial import).
  - `--mode incremental` fetches last 60 days (daily CronJob).
- [x] Unit tests (`openst/tests/test_cpi_importer.py`) with captured
  `obligacje.pl` HTML fixture:
  - Correct date parsing for all 12 (0-based JS) months.
  - Correct value parsing (dot-decimal, plain int, negative).
  - Upsert: duplicate rows are silently ignored.
- [x] Capture HTML fixture: `openst/tests/fixtures/obligacje/inflacja.html`
  (one fetch to the MAX page, saved to file — same approach as biznesradar fixtures).
- [x] Run full openst test suite (docker compose — must stay green).
- [x] Commit.

---

### 19.4 — bond_series importer script + one-shot k8s Job

Requirement vs reality: the live `obligacjeskarbowe.pl` offer pages carry **no HTML
`Data | Wartość`-style table** — each emission's parameters are a
`<ul class="product-details__list">` of `label`/`value` rows, and the redemption
fee is prose in the "Opłaty dodatkowe" section. Two further realities reshape the
scrape:
1. **The site always renders the *currently-active* emission per series** (the
   per-emission detail URL `…/obligacje-{slug}/{symbol}/` is cosmetic — it serves
   the same live parameters). Per-emission scraping therefore accumulates the
   catalog over time (each monthly emission is captured once, then its row is
   immutable via `ON CONFLICT DO NOTHING`); it does **not** recover historical
   parameters (those live in the official `listy-emisyjne` PDFs, out of scope).
2. **Three rate rules, not two**: `fixed` (OTS, TOS), `cpi_12m+margin` (COI, ROS,
   EDO, ROD) and `nbp_ref+margin` (ROR, DOR — indexed to the NBP reference rate +
   margin, not CPI). `rate_rule` is a free `TEXT` column, so the third value is
   valid; D79's pricing engine (19.5) prices `fixed` + `cpi_12m+margin`, and
   `nbp_ref+margin` series are priced once D83 lands NBP reference rates.

- [x] Create `openst/src/importers/bond_series.py`:
  - `--mode full` fetches the eight per-series offer pages
    (`/oferta-obligacji/obligacje-{slug}/`; the slug carries the term, e.g.
    `obligacje-10-letnie-edo`) and parses the active emission from each.
  - `--mode incremental` fetches the current-offer page (`/oferta-obligacji/`),
    follows its per-emission detail links and parses each (~8 active emissions).
  - Parses the `product-details__list` rows (Seria → symbol `{TYPE}{MMYY}`,
    Sprzedaż → issue_date, Oprocentowanie → rate_rule + margin) and the
    "Opłata wynosi X,XX zł" prose (last occurrence) → fee_b; `term_months` from a
    per-series map; `maturity_date` = issue_date + term_months (day-clamped).
  - Upserts into `openst.bond_series` (INSERT … ON CONFLICT DO NOTHING — emissions
    are immutable once published).
- [x] Capture HTML fixtures for all eight series types plus the current-offer page:
  `openst/tests/fixtures/obligacjeskarbowe/{ots,ror,dor,tos,coi,ros,edo,rod,oferta}.html`
  (one fetch each — covers all three rate rules and both modes).
- [x] Unit tests (`openst/tests/test_bond_series_importer.py`) with fixtures:
  - Field extraction (symbol, issue/maturity dates, term, rate_rule, margin, fee_b,
    nominal) for all eight series / all three rate rules.
  - `add_months` day-clamping; margin/fee extraction; fee last-occurrence +
    per-series default fallback; offer-page link parsing; `run` mode plumbing;
    upsert idempotency (duplicate symbols ignored).
- [x] Run full openst test suite (docker compose — must stay green): 212 passed.
- [x] Commit.

---

### 19.5 — pricing engine (`openbb_obligacje` plugin scaffold + engine)

- [x] Create `openst/plugins/openbb_obligacje/` with the same scaffold as
  `openbb_biznesradar`:
  ```
  openst/plugins/openbb_obligacje/
  ├── pyproject.toml
  ├── openbb_obligacje/
  │   ├── __init__.py           # exposes obligacje_provider (Provider instance)
  │   ├── engine.py             # pure pricing functions
  │   └── models/
  │       ├── __init__.py
  │       ├── fixedincome_historical.py
  │       ├── fixedincome_search.py
  │       └── fixedincome_profile.py
  └── tests/
      ├── __init__.py
      ├── test_engine.py
      ├── test_fixedincome_historical.py
      ├── test_fixedincome_search.py
      └── test_fixedincome_profile.py
  ```
- [x] Add `-e ./plugins/openbb_obligacje` to `openst/requirements.txt`.
- [x] Update `openst/Dockerfile` to `COPY plugins/ ./plugins/` (already done for
  biznesradar — verify it covers the new plugin).
- [x] `engine.py` — pure functions, no DB access, fully unit-tested:
  - `price_series(bond: BondSeries, cpi_rows: list[CpiRow], start: date, end: date) -> list[dict]`
  - Capitalized series: `W = N·∏(1+r_k)` across elapsed periods.
  - Redemption value: `WP = N + O − b` with `O = N·r·(a/D)/F` (ACT/ACT accrual).
  - 100 PLN floor in first period; `b ≤ O` cap for capitalized series.
  - Fees per series: OTS 0, ROR 0.50, DOR 0.70, TOS 1.00, COI 2.00, EDO/ROD/ROS 3.00 PLN.
- [x] `test_engine.py` — tests against `obligacjeskarbowe.pl` published worked examples
  for at least: one fixed series (OTS), one CPI-linked series (EDO or COI).
- [x] Commit scaffold + engine (fetcher stubs may skip/fail — engine tests must pass).

---

### 19.6 — fetchers: `FixedIncomeHistoricalFetcher`, `SearchFetcher`, `ProfileFetcher`

**Verified wiring (openbb 4.7.2 / openbb-fixedincome 1.6.2 / openbb-core 1.6.13):** there is
**no** `FixedIncomeHistorical` standard model and **no** `fixedincome.price` router. The
fixed-income suite only exposes `rate`, `spreads`, `government` (yield_curve, treasury_rates,
treasury_auctions, treasury_prices, tips_yields) and `corporate` (bond_prices, spot_rates, …).
Neither fits the redemption OHLCV series: `TreasuryPrices` is a date-only snapshot with no symbol
selector (single `date` param, bid/offer/eod_price), `BondPrices` is a screener (no history).
A provider registered under `FixedIncomeHistorical` is **not callable through any `obb.*` command**
— verified live: `obb.fixedincome.government.treasury_prices(provider="obligacje")` fails
validation (`Input should be 'government_us' or 'tmx'`). Follow the repo precedent — the biznesradar
plugin already overloads the equity models for Catalyst bonds. **Register the obligacje fetchers
under the `EquityHistorical`, `EquitySearch` and `EquityInfo` model keys**, making them reachable
as `obb.equity.price.historical(..., provider="obligacje")`, `obb.equity.search(..., provider="obligacje")`,
`obb.equity.profile(..., provider="obligacje")`.

- [x] Re-point the 19.5 stubs at the equity standard models (and change the model keys in
  `openbb_obligacje/__init__.py` from `FixedIncomeHistorical/Search/Profile` to
  `EquityHistorical/EquitySearch/EquityInfo`):
  - `fixedincome_historical.py` — subclass `EquityHistoricalQueryParams`/`EquityHistoricalData`
    (date/open/high/low/close/volume — exact fit for `engine.price_series` rows).
  - `fixedincome_search.py` — subclass `EquitySearchQueryParams`/`EquitySearchData`
    (`{symbol, name, maturity_date}` mapped onto the optional fields).
  - `fixedincome_profile.py` — subclass `EquityInfoQueryParams`/`EquityInfoData`
    (only `symbol` required; carry `name` and the emission fields where the schema allows).
- [x] `fixedincome_historical.py` — `FixedIncomeHistoricalFetcher`:
  - Reached via `obb.equity.price.historical(symbol, start_date, end_date, provider="obligacje")`.
  - Reads `bond_series` + `cpi_12m` from Postgres via `db.get_conn()`.
  - Calls `engine.price_series(...)` and returns results as an `EquityHistoricalData` list.
  - Returns empty list (not error) if symbol not found in `bond_series`.
  - Raises informative error if `cpi_12m` is stale (latest row older than 40 days).
- [x] `fixedincome_search.py` — queries `bond_series` by symbol prefix or name
  substring; returns `{symbol, name, maturity_date}`.
- [x] `fixedincome_profile.py` — returns static fields from `bond_series` for a
  known symbol; 404-equivalent (empty list) if symbol unknown.
- [x] Unit tests for all three fetchers (mock DB connection).
- [x] `pytest openst/plugins/openbb_obligacje/tests/` — all pass.
- [x] Wire-check in the test image that `provider="obligacje"` now appears in the
  `obb.equity.price.historical` / `obb.equity.search` / `obb.equity.profile` provider Literals.
- [x] Run full openst test suite (docker compose — all pass).
- [x] Commit.

---

### 19.7 — wire into `openbb_client.py` + new openst routes

- [x] In `openst/src/openbb_client.py` add:
  - `get_bond_ohlcv(symbol: str, start_date: str, end_date: str) -> list[dict] | None`
    — calls `obb.equity.price.historical(symbol, start_date=start_date, end_date=end_date,
    provider="obligacje")`; returns `None` if empty or DB unavailable.
  - `get_bond_profile(symbol: str) -> dict | None`
    — calls `obb.equity.profile(symbol, provider="obligacje")`.
  - `search_bonds(query: str) -> list[dict]`
    — calls `obb.equity.search(query, provider="obligacje")`.
- [x] In `openst/src/main.py` add routes:
  - `GET /fixedincome/ohlcv/{symbol}?start&end` → `get_bond_ohlcv`; 404 on None.
  - `GET /fixedincome/profile/{symbol}` → `get_bond_profile`; 404 on None.
  - `GET /fixedincome/search/{query}` → `search_bonds`; empty array on no results.
- [x] Route-level tests (mock client functions): 200/404 for ohlcv and profile;
  200 with array for search.
- [x] Run full openst test suite (docker compose — all pass).
- [ ] Commit. Push openst to `main`. Wait for GHA image build.

---

### 19.8 — openst standalone compose smoke (local, real DB)

- [x] Start openst standalone compose with DB populated:
  ```bash
  # Run importers locally against a test DB first
  docker compose up -d redis app
  docker compose run --rm app python -m src.importers.cpi --mode full
  docker compose run --rm app python -m src.importers.bond_series --mode full
  ```
- [x] Smoke-curl — **one request per endpoint**:
  ```bash
  curl "http://localhost:8080/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with daily {date, open, high, low, close, volume} rows
  curl "http://localhost:8080/fixedincome/profile/EDO0936"
  # expect: JSON object with name, maturity_date, rate_rule, margin, fee_b
  curl "http://localhost:8080/fixedincome/search/EDO"
  # expect: JSON array of matching emissions
  ```
- [x] Second OHLCV call: confirm Redis cache HIT.
- [x] `docker compose down`.
- [x] Commit note (observations only).

**Smoke observations (2026-09-16):** to run, `DATABASE_URL` must be added to
`openst/.env` (gitignored — the compose `app` service has no DB wiring otherwise);
point it at the compose postgres (`postgresql://openst:openst@postgres:5432/openst`,
same as the `test` profile). Importers: CPI 320 rows / 317 inserted, bond_series 8
emissions (`OTS1226 ROR0927 DOR0928 TOS0929 COI0930 ROS0932 EDO0936 ROD0938`).
`/fixedincome/profile/EDO0936` and `/fixedincome/search/EDO` return 200 with issue
params / match arrays. The plan's documented OHLCV window (`2026-01-01..2026-06-30`)
returns **404** because the currently-active `EDO0936` only issues **2026-09-01** —
the window predates issuance, so the engine prices zero rows. With a window
overlapping issuance (`2026-09-01..2026-09-30`) the endpoint returns the expected
daily `{date, open, high, low, close, volume}` rows (100.00 floor). Second call:
identical 2910-byte payload + `fixedincome_ohlcv:*` key with ~24h TTL → cache HIT.

---

### 19.9 — cachest: `OPENST_BOND_OHLCV` + `OPENST_BOND_PROFILE` routes

- [x] In `cachest/config.yaml`, add after `OPENST_CRYPTO_QUOTE`:
  ```yaml
  - name: OPENST_BOND_OHLCV
    path: /fixedincome/ohlcv/{symbol}
    url: "http://openst:8080/fixedincome/ohlcv/{symbol}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 21600           # 6h — computed daily prices
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4

  - name: OPENST_BOND_PROFILE
    path: /fixedincome/profile/{symbol}
    url: "http://openst:8080/fixedincome/profile/{symbol}"
    cache_ttl: 86400           # 24h — static bond metadata
    stale_ttl: 2592000
    fetch_interval: 60
    fetch_max_wait: 4
  ```
- [x] Add `test_real_config_has_bond_ohlcv_route` and
  `test_real_config_has_bond_profile_route` to `cachest/tests/test_config.py`.
- [x] Run cachest test suite (all pass).
- [x] Commit. Push cachest to `main`. Wait for GHA image build.

**Deploy (homelab) — done 2026-09-16:** added both routes to the cluster ConfigMap
`cluster/apps/pfire/cachest/app/config/config.yaml` (k8s URLs
`http://openst.pfire.svc.cluster.local:8080/fixedincome/...`); no nginx ingress
route change was needed — the cachest `path: /` ingress (and openst's) already
route `/fixedincome/*`. Bumped images: openst `v1.1.21` (19.7 build — both `app`
and `cpi-import` refs) and cachest `v1.0.32`. ConfigMap reloader restarts cachest
on config change; Flux synced both commits.

---

### 19.10 — portfoliost compose stack smoke (full chain)

- [x] Rebuild openst + cachest in portfoliost compose:
  ```bash
  docker compose up -d --build redis openst cachest
  ```
- [x] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:8090/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS then HIT
  curl "http://localhost:8090/fixedincome/profile/EDO0936"
  # X-Cache: MISS then HIT
  ```
- [x] Run `npm run test:stack` — existing contract checks must stay green.
- [x] Commit note: `chore: verify D79 smoke through full compose stack`.

**Done 2026-09-16.** Two compose-prep notes:
- `portfoliost/docker-compose.yml` `openst` service gained an explicit
  `DATABASE_URL: postgres://portfoliost:portfoliost@postgres:5432/portfoliost`
  (plus `depends_on postgres: service_healthy`). The env_file `../openst/.env`
  carries the *standalone* compose DB URL (`openst/openst` db) added in 19.8,
  which does not exist in the portfoliost compose postgres — without the pin,
  openst crash-loops at boot (migration connect fails). openst reuses the shared
  compose DB with its own `openst` schema (same pattern as the cluster).
- After rebuild: openst boot applied `001_openst_schema` into the shared DB;
  seeded via `docker compose run --rm openst python -m src.importers.cpi
  --mode full` (320 rows) and `... bond_series --mode full` (8 emissions).

Smoke results through cachest :8090:
- Plan's documented OHLCV window (`EDO0936` `2026-01-01..2026-06-30`) → **404**
  (same pre-issuance behaviour as 19.8: EDO0936 issues 2026-09-01). Valid window
  `2026-09-01..2026-09-30` → 200, 30 daily rows, `X-Cache: MISS` then `HIT`.
- `profile/EDO0936` → 200 (10y EDO, issue 2026-09-01, margin 2.0, cpi_12m+margin),
  `X-Cache: MISS` then `HIT`.

`npm run test:stack` against the full compose stack (gateway :8080 → instruments
→ cachest → openst): **32/32 checks passed**, upstream detected `real`.

---

### 19.11 — closeout

- [ ] Update `docs/proposals/instruments-provider-module.md` D79 status to `done`.
- [ ] Update `docs/openst-coverage.md` to note savings bond coverage via
  `openbb_obligacje` for `EDO*`, `ROD*`, `OTS*`, `ROR*`, `DOR*`, `TOS*`, `COI*`, `ROS*`.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

---

