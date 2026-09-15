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

- [ ] In the homelab repo, add PGO least-privilege user `openst` and schema `openst`
  alongside existing module schemas (follow the pattern from `portfoliost-instruments`
  or `portfoliost-wallets`).
- [ ] Add `DATABASE_URL` to `openst-secrets` (k8s Secret in `pfire` namespace).
- [ ] Add `DATABASE_URL` env var to the openst HelmRelease
  (`cluster/apps/pfire/openst/app/helmrelease.yaml`) referencing the secret.
- [ ] Commit homelab. Verify secret is present in cluster:
  ```bash
  export KUBECONFIG=$HOME/.kube/homylab
  kubectl get secret openst-secrets -n pfire -o jsonpath='{.data.DATABASE_URL}' | base64 -d
  ```

---

### 19.2 — openst: Postgres connection + schema migrationss

- [ ] Add `psycopg2-binary` (or `psycopg[binary]`) to `openst/requirements.txt`.
- [ ] Create `openst/src/db.py`: thin module that reads `DATABASE_URL` from env and
  exposes a `get_conn()` helper (plain psycopg2 connection, no ORM needed).
- [ ] Create `openst/migrations/001_openst_schema.sql`:
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
- [ ] Migration runs at openst startup (add to `src/main.py` lifespan, guarded by
  `DATABASE_URL` presence — openst still starts without DB for non-bond routes).
- [ ] Unit test: migration is idempotent (run twice, no error).
- [ ] Run full openst test suite (docker compose — must stay green).
- [ ] Commit.

---

### 19.3 — CPI importer script + one-shot k8s Job

- [ ] Create `openst/src/importers/cpi.py`:
  - Scrapes `obligacje.pl/pl/narzedzia/inflacja,data_od-{from},data_do-{to}` —
    `Data | Wartość` HTML table (BeautifulSoup/lxml, same pattern as biznesradar).
  - Parses Polish month-name dates (e.g. `31 sty 2000`) → `YYYY-MM-DD`.
  - Upserts rows into `openst.cpi_12m` (INSERT … ON CONFLICT DO NOTHING).
  - `--mode full` fetches `MAX` history (used for initial import).
  - `--mode incremental` fetches last 60 days (used for daily CronJob).
- [ ] Unit tests (`openst/tests/test_cpi_importer.py`) with captured
  `obligacje.pl` HTML fixture:
  - Correct date parsing for all 12 Polish month names.
  - Correct value parsing (comma as decimal separator).
  - Upsert: duplicate rows are silently ignored.
- [ ] Capture HTML fixture: `openst/tests/fixtures/obligacje/inflacja.html`
  (one `requests.get` call, save to file — same approach as biznesradar fixtures).
- [ ] Run full openst test suite (docker compose — must stay green).
- [ ] Commit.

---

### 19.4 — bond_series importer script + one-shot k8s Job

- [ ] Create `openst/src/importers/bond_series.py`:
  - Scrapes each series offer page on `obligacjeskarbowe.pl`:
    `/oferta-obligacji/obligacje-{type}/` (one page per series type: ots, ror, dor,
    tos, coi, edo, ros, rod).
  - Extracts per-emission fields: symbol (`{TYPE}{MMYY}`), name, issue_date,
    maturity_date, term_months, rate_rule, margin, fee_b.
  - Upserts into `openst.bond_series` (INSERT … ON CONFLICT DO NOTHING — emissions
    are immutable once published).
  - `--mode full` scrapes all series (initial import).
  - `--mode incremental` scrapes current-offer page only (~8 active emissions).
- [ ] Capture HTML fixtures for at least two series types (one fixed, one CPI-linked):
  `openst/tests/fixtures/obligacjeskarbowe/edo.html`, `ots.html`.
- [ ] Unit tests with fixtures: correct field extraction for both rate rules.
- [ ] Run full openst test suite (docker compose — must stay green).
- [ ] Commit.

---

### 19.5 — pricing engine (`openbb_obligacje` plugin scaffold + engine)

- [ ] Create `openst/plugins/openbb_obligacje/` with the same scaffold as
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
- [ ] Add `-e ./plugins/openbb_obligacje` to `openst/requirements.txt`.
- [ ] Update `openst/Dockerfile` to `COPY plugins/ ./plugins/` (already done for
  biznesradar — verify it covers the new plugin).
- [ ] `engine.py` — pure functions, no DB access, fully unit-tested:
  - `price_series(bond: BondSeries, cpi_rows: list[CpiRow], start: date, end: date) -> list[dict]`
  - Capitalized series: `W = N·∏(1+r_k)` across elapsed periods.
  - Redemption value: `WP = N + O − b` with `O = N·r·(a/D)/F` (ACT/ACT accrual).
  - 100 PLN floor in first period; `b ≤ O` cap for capitalized series.
  - Fees per series: OTS 0, ROR 0.50, DOR 0.70, TOS 1.00, COI 2.00, EDO/ROD/ROS 3.00 PLN.
- [ ] `test_engine.py` — tests against `obligacjeskarbowe.pl` published worked examples
  for at least: one fixed series (OTS), one CPI-linked series (EDO or COI).
- [ ] Commit scaffold + engine (fetcher stubs may skip/fail — engine tests must pass).

---

### 19.6 — fetchers: `FixedIncomeHistoricalFetcher`, `SearchFetcher`, `ProfileFetcher`

- [ ] `fixedincome_historical.py` — `FixedIncomeHistoricalFetcher`:
  - Registered under OpenBB `FixedIncomeHistorical` model
    (`obb.fixedincome.price.historical`).
  - Reads `bond_series` + `cpi_12m` from Postgres via `db.get_conn()`.
  - Calls `engine.price_series(...)` and returns results as
    `FixedIncomeHistoricalData` list.
  - Returns empty list (not error) if symbol not found in `bond_series`.
  - Raises informative error if `cpi_12m` is stale (latest row older than 40 days).
- [ ] `fixedincome_search.py` — queries `bond_series` by symbol prefix or name
  substring; returns `{symbol, name, series_code, maturity_date}`.
- [ ] `fixedincome_profile.py` — returns static fields from `bond_series` for a
  known symbol; 404-equivalent (empty list) if symbol unknown.
- [ ] Unit tests for all three fetchers (mock DB connection).
- [ ] `pytest openst/plugins/openbb_obligacje/tests/` — all pass.
- [ ] Run full openst test suite (docker compose — all pass).
- [ ] Commit.

---

### 19.7 — wire into `openbb_client.py` + new openst routes

- [ ] In `openst/src/openbb_client.py` add:
  - `get_bond_ohlcv(symbol: str, start_date: str, end_date: str) -> list[dict] | None`
    — calls `obb.fixedincome.price.historical(symbol, provider="obligacje")`;
    returns `None` if empty or DB unavailable.
  - `get_bond_profile(symbol: str) -> dict | None`
  - `search_bonds(query: str) -> list[dict]`
- [ ] In `openst/src/main.py` add routes:
  - `GET /fixedincome/ohlcv/{symbol}?start&end` → `get_bond_ohlcv`; 404 on None.
  - `GET /fixedincome/profile/{symbol}` → `get_bond_profile`; 404 on None.
  - `GET /fixedincome/search/{query}` → `search_bonds`; empty array on no results.
- [ ] Route-level tests (mock client functions): 200/404 for ohlcv and profile;
  200 with array for search.
- [ ] Run full openst test suite (docker compose — all pass).
- [ ] Commit. Push openst to `main`. Wait for GHA image build.

---

### 19.8 — openst standalone compose smoke (local, real DB)

- [ ] Start openst standalone compose with DB populated:
  ```bash
  # Run importers locally against a test DB first
  docker compose up -d redis app
  docker compose run --rm app python -m openst.importers.cpi --mode full
  docker compose run --rm app python -m openst.importers.bond_series --mode full
  ```
- [ ] Smoke-curl — **one request per endpoint**:
  ```bash
  curl "http://localhost:8080/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with daily {date, open, high, low, close, volume} rows
  curl "http://localhost:8080/fixedincome/profile/EDO0936"
  # expect: JSON object with name, maturity_date, rate_rule, margin, fee_b
  curl "http://localhost:8080/fixedincome/search/EDO"
  # expect: JSON array of matching emissions
  ```
- [ ] Second OHLCV call: confirm Redis cache HIT.
- [ ] `docker compose down`.
- [ ] Commit note (observations only).

---

### 19.9 — cachest: `OPENST_BOND_OHLCV` + `OPENST_BOND_PROFILE` routes

- [ ] In `cachest/config.yaml`, add after `OPENST_CRYPTO_QUOTE`:
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
- [ ] Add `test_real_config_has_bond_ohlcv_route` and
  `test_real_config_has_bond_profile_route` to `cachest/tests/test_config.py`.
- [ ] Run cachest test suite (all pass).
- [ ] Commit. Push cachest to `main`. Wait for GHA image build.

---

### 19.10 — portfoliost compose stack smoke (full chain)

- [ ] Rebuild openst + cachest in portfoliost compose:
  ```bash
  docker compose up -d --build redis openst cachest
  ```
- [ ] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:8090/fixedincome/ohlcv/EDO0936?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS then HIT
  curl "http://localhost:8090/fixedincome/profile/EDO0936"
  # X-Cache: MISS then HIT
  ```
- [ ] Run `npm run test:stack` — existing contract checks must stay green.
- [ ] Commit note: `chore: verify D79 smoke through full compose stack`.

---

### 19.11 — closeout

- [ ] Update `docs/proposals/instruments-provider-module.md` D79 status to `done`.
- [ ] Update `docs/openst-coverage.md` to note savings bond coverage via
  `openbb_obligacje` for `EDO*`, `ROD*`, `OTS*`, `ROR*`, `DOR*`, `TOS*`, `COI*`, `ROS*`.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

---

## 20. Crypto search + asset-type labels (D78 gap-fix)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
D78 gap-fix. Step 18 shipped only `/crypto/ohlcv/{pair}` + `/crypto/quote/{pair}`; the
search/profile half of D78 (`openst /crypto/search/{query}` + `/crypto/profile/{pair}`)
was skipped, so the SPA search can never surface a crypto pair.

Scope (4 repos): openst (two routes + client fn), cachest (two routes), portfoliost-instruments
(crypto search leg + `type: "CRYPTO"`), SPA — **no change needed**: the search modal already
renders the `result.type` badge (`InstrumentSearchModal.vue:102`). Bonds: `BOND` type surfaces
once D79 seeds `ticker_reference` (mapping added in step 20.5, no crypto-blocking).

Verified live in cluster (2026-09-15, openst v1.1.16):
- `obb.crypto.search("btc", provider="fmp")` works; **fmp-only** (yfinance/tiingo reject it);
  `FMP_API_KEY` already in `openst-secrets`.
- Rows are FMP-style pairs (`TBTCUSD`, `BTCBUSD`, …) — **not** the yfinance pairs
  (`BTC-USD`) the OHLCV/quote routes accept. `fmp` OHLCV rejects `BTC-USD` (402); yfinance is
  the pair authority. Search results therefore need symbol normalization in instruments.
- `ticker_reference` has only `Stock` (45,210) + `ETF` (16,601) — no crypto rows. The SPA
  placeholder already promises "crypto" (`InstrumentSearchModal.vue:74`).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md; portfoliost build + vitest).

---

### 20.1 — openst: `get_crypto_search` client function

- [x] In `openst/src/openbb_client.py` add `get_crypto_search(query: str) -> list[dict]`,
  fmp-only loop mirroring `search_equities` (rate-limit block, empty → continue → `[]`).
- [x] Unit tests in `openst/tests/test_openbb_client.py`: monkeypatched `obb.crypto.search`
  returns rows → pass-through; empty df → `[]`; rate-limited provider → blocked + next.
- [x] Tests: openst full suite via `docker compose --profile test run --rm test`.
- [x] Commit: `feat(openbb_client): crypto search client fn (fmp-only)`.

### 20.2 — openst: `/crypto/search/{query}` + `/crypto/profile/{pair}` routes

- [x] In `openst/src/main.py` add `GET /crypto/search/{query}` (mirror of `/equity/search`:
  `_cached_or_404`, lowercase-normalized query) and `GET /crypto/profile/{pair}` (quote →
  `{ symbol, name, currency }` from the two search/quote fields that exist; pair kept as-is).
- [x] Route tests in `openst/tests/test_main.py`: search returns rows / 404 on empty; profile
  maps quote fields / 404 on missing quote.
- [x] Tests: full openst suite; compose-level smoke `curl /crypto/search/btc` → rows, second
  call → `X-Cache: HIT`; `curl /crypto/profile/btc-usd` → 200.
- [x] Commit: `feat(main): crypto search + profile routes (D78 gap-fix)`.

### 20.3 — cachest: `OPENST_CRYPTO_SEARCH` + `OPENST_CRYPTO_PROFILE`

- [x] `cachest/config.yaml`: `OPENST_CRYPTO_SEARCH` `/crypto/search/{query}` (TTL 7d — universe
  changes rarely, matches `OPENST_SEARCH`) and `OPENST_CRYPTO_PROFILE` `/crypto/profile/{pair}`
  (TTL 6h, matches `OPENST_CRYPTO_QUOTE`).
- [x] Tests: `cachest/tests/test_config.py` gains an assertion per new route.
- [x] Tests: full cachest suite via compose.
- [x] Commit: `feat(config): OPENST_CRYPTO_SEARCH + OPENST_CRYPTO_PROFILE routes`.

### 20.4 — openst standalone smoke

- [x] `docker compose up -d redis openst`; single curls:
  `/crypto/search/btc`, `/crypto/search/eth`, `/crypto/profile/BTC-USD` — rows + payload shape
  recorded in the step result.
- [x] Verify Redis cache: second `curl` each → `X-Cache: HIT`.
- [x] Commit note: `chore: verify crypto search + profile smoke`.

Observed 2026-09-15 (openst local build, host `:8081` — `8080` held by portfoliost-gateway):
- `/crypto/search/btc` → 200, 30 rows, shape `{symbol, name, exchange, ico_date, circulating_supply, total_supply}`; eth/ethereum/bitcoin/sol/ada/etc. also 200.
- `/crypto/search/eth` → **404**. Upstream anomaly: FMP returns a row with `ico_date=NaN` for this query, and OpenBB `FMPCryptoSearchData` model validation rejects it → whole search errors (→ honest 404). Typing `ETH` won't suggest via raw search; step 20.5's curated base→pair map must cover `eth→ETH-USD`.
- `/crypto/profile/BTC-USD` → 200 `{"symbol":"BTC-USD","name":null,"currency":"USD"}`.
- Redis cache confirmed: `crypto_search:btc` + `crypto_profile:BTC-USD` keys present, second curls served instantly (openst itself emits no `X-Cache` header — that's cachest 20.6).

### 20.5 — instruments: crypto search leg + symbol normalization

- [x] `portfoliost-instruments/src/adapters/cachest.ts`: add `fetchCryptoSearch(query)` →
  `${BASE_URL}/crypto/search/${q}`.
- [x] `portfoliost-instruments/src/adapters/symbol.ts` (or a new `crypto.ts`): normalize an FMP
  row to a yfinance pair + display name. Curated primary map (base coin → pair, ≥ ~30 majors,
  e.g. `btc→BTC-USD`, `eth→ETH-USD`, `sol→SOL-USD`) so typing `BTC`/`ETH` suggests the exact
  pair; fallback heuristic drops FMP-wrap prefixes/`USD` and only emits `<BASE>-USD` when the
  base parses as a bare coin mnemonic (no `tBTC`, `BTC.BUSD`, leveraged/wrapped variants).
- [x] `src/routes/instruments.ts` `/search`: run crypto search alongside the existing tiers
  (not as last-only fallback — equity search "btc" already returns BTCS Inc. etc., so crypto
  must be additive), merge + de-dupe by symbol, type `"CRYPTO"` (source `"CRYPTO"`).
- [x] `src/adapters/translate.ts`: `toSearchResponse`/new `toCryptoSearchResponse` emit
  `type: "CRYPTO"`; widen `toReferenceSearchResponse` `assetType` mapping to emit `BOND`/`CRYPTO`
  when present (D79-ready; ticker_reference still has none).
- [x] Tests: unit tests for normalization (BTC → BTC-USD, wrapped `TBTCUSD` excluded, `BTCBUSD`
  excluded) + route test: q=btc returns a merged list containing `BTC-USD` type CRYPTO.
- [x] Tests: `npm run build` + `npm run test` in portfoliost-instruments.
- [x] Commit: `feat(search): crypto leg + type CRYPTO with yfinance-pair normalization`.

### 20.6 — full compose stack smoke

- [x] In portfoliost compose, rebuild + run `redis openst cachest instruments`.
- [x] Smoke through cachest: `curl "http://localhost:8090/crypto/search/btc"` MISS→HIT;
  instruments `/api/instruments/search?q=btc` (via worked-upstream) contains `BTC-USD`/CRYPTO.
- [x] Run `npm run test:stack` — existing contract checks stay green.
- [x] Commit note: `chore: verify crypto search through full compose stack`.

Verification notes (live, 2026-09-15): rebuilt `openst cachest instruments` images in portfoliost
compose (`NODE_AUTH_TOKEN` set); cachest `/crypto/search/btc` → `x-cache: MISS` then `HIT`;
instruments `/api/instruments/search?q=btc` via gateway → 50 rows with 6 `CRYPTO`, `BTC-USD`
first (`type=CRYPTO`, `source=CRYPTO`); `q=eth` → `ETH-USD` first despite the upstream FMP NaN
`ico_date` rejection (curated suggestion). `npm run test:stack` → 32/32, upstream `real`. The
smoke exposed that the 50-row cap occluded the crypto leg behind the reference DB's "btc" name
flood — fixed by leading the merge with the curated crypto exact-pair
(`portfoliost-instruments` `f3b5f5b`).

### 20.7 — closeout

- [ ] Update `docs/openst-coverage.md`: crypto **search** row (fmp-only, `/crypto/search/{query}`)
  + note crypto search symbols normalize to yfinance pairs in instruments; keep date current.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

**Open question (resolved pending user):** crypto search should surface **native pairs**
— typing `BTC`/`ETH` suggests `BTC-USD`/`ETH-USD` flagged crypto, via a curated base→pair map
in instruments (step 20.5). Not part of this section: research/profile *navigation* for the
selected pair (fetchProfile/price-bars routing for `BTC-USD`) is inherited from D81; this
section only makes the pair appear in search with the `CRYPTO` label.
