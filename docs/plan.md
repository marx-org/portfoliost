# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 17. D78 — crypto via `openbb-crypto` extension in openst

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D78 (2026-09-14).

Installs `openbb-crypto` (compatible with OpenBB 4.7.2) into openst, adds
`get_crypto_ohlcv` / `get_crypto_quote` client functions and two new routes
(`/crypto/ohlcv/{pair}`, `/crypto/quote/{pair}`), then exposes both through cachest
(`OPENST_CRYPTO_OHLCV`, `OPENST_CRYPTO_QUOTE`).  Pair symbols follow yfinance convention
(`BTC-USD`).  No instruments-module changes in this step — routing for the new asset
class is deferred to D81.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md).

---

### 17.1 — verify `openbb-crypto` version + pin

- [ ] In the openst repo, resolve the correct `openbb-crypto` pin that is compatible with
  `openbb==4.7.2`.  The `openbb` meta-package pins `openbb-core`; `openbb-crypto` must
  require the same core version.  Strategy: run
  `pip install "openbb==4.7.2" "openbb-crypto" --dry-run` inside a clean venv (or the
  existing openst Docker build) and record the resolved version.
- [ ] Verify `obb.crypto.price.historical("BTC-USD", provider="yfinance")` and
  `obb.crypto.price.quote("BTC-USD", provider="yfinance")` are callable with the
  resolved version (smoke in a Python REPL, not a full test yet).
- [ ] Record the pinned version (e.g. `openbb-crypto==1.6.2`) as a comment in this step.
- [ ] Commit note only (no requirements change yet — that lands in 17.2).

---

### 17.2 — add `openbb-crypto` to openst requirements + Dockerfile

- [ ] Add `openbb-crypto==<pinned>` to `openst/requirements.txt` after the existing
  `openbb==4.7.2` line.
- [ ] Rebuild the openst Docker image locally:
  ```bash
  docker compose --profile test build
  ```
  Confirm the build succeeds and `obb.crypto` is importable inside the container:
  ```bash
  docker compose run --rm test python -c "from openbb import obb; print(obb.crypto)"
  ```
- [ ] Run existing openst test suite (must stay green):
  ```bash
  docker compose --profile test run --rm test
  ```
- [ ] Commit `openst/requirements.txt` change.

---

### 17.3 — `get_crypto_ohlcv` / `get_crypto_quote` in `openbb_client.py`

- [ ] In `openst/src/openbb_client.py` add two functions mirroring the equity OHLCV
  pattern:
  - `CRYPTO_PROVIDERS = ["yfinance", "fmp", "tiingo"]`  — provider fallback list
    (yfinance first; fmp and tiingo only if keys are present; same
    `_provider_is_blocked` guard as `get_ohlcv_history`).
  - `get_crypto_ohlcv(pair: str, start_date: str, end_date: str) -> list[dict] | None`
    — calls `obb.crypto.price.historical(pair, start_date=start_date,
    end_date=end_date, provider=provider).to_df()`, applies the same RangeIndex-date
    normalization as `get_ohlcv_history`, returns `None` if all providers fail or
    return empty.
  - `get_crypto_quote(pair: str) -> dict | None`
    — calls `obb.crypto.price.quote(pair, provider=provider).to_df().iloc[0].to_dict()`,
    same fallback loop; returns `None` on failure.
- [ ] Unit tests in `openst/tests/test_openbb_client.py`:
  - `get_crypto_ohlcv` happy path: mocked `obb.crypto.price.historical` returns fixture
    frame for `BTC-USD`; assert returned list shape and date normalization.
  - `get_crypto_ohlcv` all-empty: all providers return empty DataFrame → `None`.
  - `get_crypto_ohlcv` provider block: blocked provider skipped; next provider used.
  - `get_crypto_quote` happy path: mocked quote row for `ETH-USD`; assert dict shape.
  - `get_crypto_quote` failure: exception from all providers → `None`.
- [ ] Run full openst test suite (docker compose):
  ```bash
  docker compose --profile test run --rm test
  ```
- [ ] Commit.

---

### 17.4 — new openst routes `/crypto/ohlcv/{pair}` and `/crypto/quote/{pair}`

- [ ] In `openst/src/main.py` add two routes following the `/price/ohlcv` pattern:
  - `GET /crypto/ohlcv/{pair}?start&end` — calls `get_crypto_ohlcv`; returns JSON
    array of OHLCV dicts or `404` if `None`; same `start`/`end` default-window logic
    (90-day default if omitted) as the equity route.
  - `GET /crypto/quote/{pair}` — calls `get_crypto_quote`; returns single JSON object
    or `404`.
- [ ] Update `openst/tests/` with route-level tests (mock `get_crypto_ohlcv` /
  `get_crypto_quote`):
  - `200` with correct JSON body for a valid pair.
  - `404` when client returns `None`.
  - `start`/`end` query params forwarded to the client function.
- [ ] Run full openst test suite (docker compose — all tests must pass).
- [ ] Commit.

---

### 17.5 — openst standalone compose smoke (local, real HTTP)

- [ ] Start openst standalone compose: `docker compose up -d` (redis + app).
- [ ] Smoke-curl — **one request per endpoint** (not a loop):
  ```bash
  curl "http://localhost:8080/crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with {date, open, high, low, close, volume} rows
  curl "http://localhost:8080/crypto/quote/BTC-USD"
  # expect: single JSON object with price/volume fields
  ```
- [ ] Second call to each URL: confirm Redis cache HIT (no outbound HTTP).
- [ ] Note results (row count, field sample) inline below.
- [ ] `docker compose down`.
- [ ] Commit note (no code change — observations only).  Push openst to `main`.
  Wait for GHA image build.

---

### 17.6 — cachest: `OPENST_CRYPTO_OHLCV` + `OPENST_CRYPTO_QUOTE` routes

- [ ] In `cachest/config.yaml`, add after `OPENST_OHLCV_FUNDS`:
  ```yaml
  - name: OPENST_CRYPTO_OHLCV
    path: /crypto/ohlcv/{pair}
    url: "http://openst:8080/crypto/ohlcv/{pair}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 21600           # 6h — mirrors OPENST_OHLCV
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4

  - name: OPENST_CRYPTO_QUOTE
    path: /crypto/quote/{pair}
    url: "http://openst:8080/crypto/quote/{pair}"
    cache_ttl: 21600           # 6h — daily prices only
    stale_ttl: 2592000
    fetch_interval: 2
    fetch_max_wait: 4
  ```
- [ ] Add `test_real_config_has_crypto_ohlcv_route` and
  `test_real_config_has_crypto_quote_route` to `cachest/tests/test_config.py`
  (assert `name`, `url`, `query_params` for OHLCV; `name`, `url` for quote).
- [ ] Run cachest test suite (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [ ] Commit cachest config + tests.  Push cachest to `main`.  Wait for GHA image build.

---

### 17.7 — portfoliost compose stack smoke (full chain)

- [ ] Rebuild openst + cachest images in portfoliost compose to pick up the new versions:
  ```bash
  docker compose up -d --build redis openst cachest
  ```
- [ ] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:8090/crypto/ohlcv/BTC-USD?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS on first call; HIT on repeat
  curl "http://localhost:8090/crypto/quote/BTC-USD"
  # X-Cache: MISS on first call; HIT on repeat
  ```
- [ ] Run `npm run test:stack` — existing contract checks must stay green (no regression).
- [ ] Commit note: `chore: verify D78 smoke through full compose stack`.

---

### 17.8 — closeout

- [ ] Update `docs/proposals/instruments-provider-module.md` D78 status to `done`.
- [ ] Update `docs/openst-coverage.md` to note crypto provider coverage via
  `openbb-crypto` for `BTC-USD`-style pairs.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

---

## 18. D79 — retail savings bonds: `openbb_obligacje` provider in openst

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D79.

Adds the `openbb_obligacje` plugin to openst that prices Polish retail savings bonds
(ROD, EDO, OTS, ROR, DOR, TOS, COI, ROS) on demand via a pure-Python engine.
No market price exists for these instruments — value is computed from issue parameters
and CPI history.  Data (CPI + bond_series catalogue) lives in a new Postgres schema
`openst` in the shared PGO cluster.  Daily k8s CronJobs keep the data fresh.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per openst and cachest CLAUDE.md).

---

### 18.1 — homelab: Postgres `openst` schema + secret

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

### 18.2 — openst: Postgres connection + schema migrations

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

### 18.3 — CPI importer script + one-shot k8s Job

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

### 18.4 — bond_series importer script + one-shot k8s Job

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

### 18.5 — pricing engine (`openbb_obligacje` plugin scaffold + engine)

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

### 18.6 — fetchers: `FixedIncomeHistoricalFetcher`, `SearchFetcher`, `ProfileFetcher`

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

### 18.7 — wire into `openbb_client.py` + new openst routes

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

### 18.8 — openst standalone compose smoke (local, real DB)

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

### 18.9 — cachest: `OPENST_BOND_OHLCV` + `OPENST_BOND_PROFILE` routes

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

### 18.10 — portfoliost compose stack smoke (full chain)

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

### 18.11 — closeout

- [ ] Update `docs/proposals/instruments-provider-module.md` D79 status to `done`.
- [ ] Update `docs/openst-coverage.md` to note savings bond coverage via
  `openbb_obligacje` for `EDO*`, `ROD*`, `OTS*`, `ROR*`, `DOR*`, `TOS*`, `COI*`, `ROS*`.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.
