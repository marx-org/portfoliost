
# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 16. D77 — biznesradar OpenBB provider in openst (TFI funds + Catalyst bonds)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D77 extension (2026-09-14).

Adds a custom OpenBB provider package `openbb_biznesradar` inside openst that exposes
TFI/FIZ open-end fund NAV history and Catalyst corporate bond price history via standard
OpenBB provider calls.  The existing `/price/ohlcv/{ticker}` openst route and
`OPENST_OHLCV` cachest route are reused unchanged — only the provider list in
`openbb_client.py` is extended.

### Findings from live page inspection (2026-09-14)

- **Historical data URL**: `/notowania-historyczne/{SYMBOL}` (page 1); subsequent pages
  via `/notowania-historyczne/{SYMBOL},{N}` (comma-separated page number). 50 rows/page.
- **Fund table** (`NNEP25.TFI`): 2 columns — `Data | Kurs` (date + single NAV price).
  No OHLCV. Model maps `close=open=high=low=Kurs`, `volume=0`.
- **Bond/stock table** (`BST0327`): 7 columns — `Data | Otwarcie | Max | Min | Zamknięcie | Wolumen | Obrót`.
  Full OHLCV. `Zamknięcie` = close; `Obrót` (turnover) is not exposed in the output model.
- **Date format**: `DD.MM.YYYY`. **Decimal separator**: dot (not comma) — standard float parse.
- **Symbol stripping**: biznesradar URLs never carry exchange suffixes. Strip any trailing
  `.WA` (or other dot-suffixed exchange tag) before building the URL, so
  `NNEP25.TFI.WA` → `NNEP25.TFI` and `AAPL.WA` → `AAPL`. The `.TFI` / `.FIZ` part of
  the symbol is the biznesradar venue code and must be preserved.
- **Rate limiting policy**: add `BIZNESRADAR_FETCH_DELAY_S` env (default `2.0` s) inter-page
  delay. cachest `cache_ttl: 86400` (24 h) means at most one scrape per symbol per day in
  production. Never batch parallel requests to biznesradar.

### Fetcher architecture

Two OpenBB fetcher classes in one package, sharing a private page scraper:

| Fetcher | Symbols | Data source | Table shape |
|---------|---------|-------------|-------------|
| `FundHistoricalFetcher` | `*.TFI`, `*.FIZ` | `/notowania-historyczne/{symbol}` | `Data\|Kurs` (2 cols) |
| `BondHistoricalFetcher` | `BST*`, `INS*`, `KRI*` etc. | `/notowania-historyczne/{symbol}` | `Data\|Otwarcie\|Max\|Min\|Zamknięcie\|Wolumen\|Obrót` (7 cols) |

Both share a private `_scrape_pages(symbol, start_date, end_date)` generator that paginates
`/notowania-historyczne/{symbol},{N}`, stops early once `date < start_date`, and applies
the inter-page delay. Each fetcher passes a `cols` argument to tell the scraper which
columns to extract.

A third fetcher `EquityHistoricalFetcher` is **not added** in D77 — ordinary equities
on biznesradar are already covered by yfinance/fmp; biznesradar is added as a fallback
only for `.TFI`, `.FIZ`, and Catalyst bond symbols that upstream providers don't cover.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per `openst/CLAUDE.md` and `cachest/CLAUDE.md`).

---

### 16.1 — HTML fixture capture

- [x] Fetch and save HTML fixtures for both table shapes (single `requests.get` call each —
  no loops, no automation):
  - `openst/tests/fixtures/biznesradar/NNEP25.TFI.html` — fund page (2-col table)
  - `openst/tests/fixtures/biznesradar/BST0327.html` — bond page (7-col table)
  - Also save page 2 of one symbol to verify pagination HTML structure:
    `openst/tests/fixtures/biznesradar/BST0327_p2.html`
    (`https://www.biznesradar.pl/notowania-historyczne/BST0327,2`)
- [x] Confirm from fixtures: CSS class of the main data table, exact column header text,
  date column index, value column index(es), pagination link pattern.
- [x] Document exact selectors in a comment block at the top of
  `openst/plugins/openbb_biznesradar/openbb_biznesradar/scraper.py` (docstring-only file,
  committed with this step's fixtures; no logic yet).
- [x] Commit fixtures only (no code changes yet).

#### Selectors confirmed from fixtures (openst commit `16.1`)

- **Main data table CSS class**: `qTableFull` — exactly one per page.
- **Header row**: first `<tr>` inside the table; cells are `<th>`. Data rows are the
  subsequent `<tr>`s with `<td>` cells. 50 data rows per page, newest-first.
- **Fund/TFI/FIZ table (2 cols)**: header text `Data | Kurs` → indices 0=date, 1=Kurs.
- **Bond/Catalyst table (7 cols)**: header text
  `Data | Otwarcie | Max | Min | Zamknięcie | Wolumen | Obrót` → indices 0=date,
  1=open, 2=high, 3=low, 4=close, 5=volume, 6=Obrót (turnover — not used in output).
- **Date**: `DD.MM.YYYY` (verified `11.09.2026`), parsed with `%d.%m.%Y`; decimal
  separator is a dot. `Wolumen` plain integer; `Obrót` uses a space thousands
  separator (`6 078`) — irrelevant since it is not exposed.
- **Pagination**: `<div class="buttons pages">` after the table. Current page is a
  non-link `<span class="pages_pos_current">N</span>`; other pages are
  `<a class="pages_pos" href="/notowania-historyczne/{symbol},{N}">N</a>` (`{N}` = page
  number, comma-separated); next page is `<a class="pages_right" title="następna">`.
  Ellipsis `<span class="pages_pos dots">…</span>` present on long histories — ignore.
  Advance one page at a time: `{symbol}`, `{symbol},2`, `{symbol},3`, …

---

### 16.2 — `openbb_biznesradar` plugin package scaffold

- [x] Create `openst/plugins/openbb_biznesradar/` with the standard OpenBB provider
  extension layout:
  ```
  openst/plugins/openbb_biznesradar/
  ├── pyproject.toml
  ├── openbb_biznesradar/
  │   ├── __init__.py           # exposes biznesradar_provider (Provider instance)
  │   ├── scraper.py            # shared _scrape_pages() + symbol stripping
  │   └── models/
  │       ├── __init__.py
  │       ├── equity_historical.py    # EquityHistoricalFetcher (single dispatch fetcher)
  │       ├── fund_historical.py      # 2-col Data|Kurs parser
  │       └── bond_historical.py      # 7-col OHLCV parser
  └── tests/
      ├── __init__.py
      ├── test_scraper.py
      ├── test_equity_historical.py
      ├── test_fund_historical.py
      └── test_bond_historical.py
  ```
- [x] `pyproject.toml` uses **setuptools** (not Poetry — avoids lock-file clash with the
  parent `requirements.txt` approach). Note: the plan's
  `setuptools.backends.legacy:build` spelling does not exist; the correct legacy
  backend is `setuptools.build_meta:__legacy__` (verified: `pip install -e` works,
  entry point registers).
- [x] `__init__.py` instantiates `biznesradar_provider` — see *architecture change*
  below; `fetcher_dict` is keyed on the OpenBB **model name** `EquityHistorical`.
- [x] Add `beautifulsoup4==4.15.0` and `lxml==6.1.3` to `openst/requirements.txt`.
- [x] Add `-e ./plugins/openbb_biznesradar` to `openst/requirements.txt` so the editable
  install registers the entrypoint at container build time.
- [x] Dockerfile: `COPY plugins/ ./plugins/` in the builder (before pip install — the
  `-e` relative path resolves there) and `COPY plugins/ /build/plugins/` in the test +
  runtime stages (the PEP 660 editable finder bakes that absolute source path at
  install time). Test stage also gets `COPY plugins/ /app/plugins/` so
  `pytest plugins/` can be run in-container; the default CMD stays `pytest tests/`
  only.
- [x] Commit scaffold (stubs only, tests expected to fail/skip).

##### Architecture change vs original plan (fetcher wiring)

OpenBB routes `obb.equity.price.historical(...)` (model `EquityHistorical`, confirmed
in `openbb_equity/price/price_router.py`) to a provider by the model-name key in
`Provider.fetcher_dict`. The plan's keys `FundHistorical`/`BondHistorical` match no
registered model, so 16.5's provider fallback loop would never reach biznesradar;
additionally only one fetcher may be registered per `(provider, model)` key.
Approved change (per user): **one** `EquityHistoricalFetcher` under the
`EquityHistorical` key that dispatches by symbol shape to the fund (2-col) vs bond
(7-col) scraper — the two scraping code paths stay separate in `fund_historical.py`
/ `bond_historical.py`.

##### Docker suite note (pre-existing failures — since fixed)

At 16.2 time the docker suite was **already red on `main`**, unrelated to this step:
3 dividend tests failed since commit `bb00f87` (2026-08-28), which — while sanitizing
NaN/Inf floats — accidentally changed the API contract: `get_dividend_yield` moved from
2-decimal to 4-decimal rounding (`2.4568` vs the `2.46` asserted since 2026-05-24) and
`get_dividend_history` moved from fixed 4-decimal amount strings to `str(round(...))`
(`"0.25"` vs `"0.2500"`). Fixed in a dedicated commit (`fix(openst): restore dividend
contract…`): keep `_safe_float` NaN-safety, restore `ndigits=2` for yield and
`f"{amount:.4f}"` for amounts. Suite is green again (138 passed).

---

### 16.3 — shared scraper + unit tests

- [x] Implement `openbb_biznesradar/scraper.py`:
  - `strip_wa_suffix(symbol: str) -> str`: strips the literal `.WA` suffix if present,
    preserves everything else. `NNEP25.TFI.WA` → `NNEP25.TFI`; `BST0327.WA` → `BST0327`;
    `NNEP25.TFI` → `NNEP25.TFI` (unchanged); `AAPL` → `AAPL` (unchanged).
  - `_scrape_pages(symbol, start_date, end_date, fetch_delay_s, col_indices) -> Iterator[dict]`:
    - Builds URL `https://www.biznesradar.pl/notowania-historyczne/{symbol}` for page 1,
      `/{symbol},{N}` for N≥2.
    - Uses `httpx.get` with `User-Agent: Mozilla/5.0` (bot-neutral header).
    - Parses HTML with `BeautifulSoup(html, "lxml")`, finds the first `<table>`.
    - Iterates rows; parses `DD.MM.YYYY` dates with `datetime.strptime`.
    - Stops pagination early once `date < start_date` (oldest-to-newest ordering:
      verify from fixtures — page 1 is newest-first; stop when date exits range).
    - Applies `time.sleep(fetch_delay_s)` between page fetches (not on the first page).
    - On HTTP error (non-200) or missing table: raises `BiznesRadarNotFound(symbol)`.
- [x] Unit tests in `tests/test_scraper.py` using fixture HTML (mock `httpx.get`):
  - correct date + value extraction for both table shapes.
  - early stop: given `start_date=2026-01-01`, stops before fetching a page whose
    first row is `2025-12-31`.
  - `strip_wa_suffix` matrix test: `NNEP25.TFI.WA` → `NNEP25.TFI`; `BST0327.WA` →
    `BST0327`; `NNEP25.TFI` → `NNEP25.TFI`; `AAPL` → `AAPL`.
  - sleep called between pages, not before first page.
  - raises on 404.
- [x] All scraper tests pass: `pytest openst/plugins/openbb_biznesradar/tests/test_scraper.py`.
- [x] Commit.

#### Implementation notes

- `strip_wa_suffix` strips a configured suffix set (`{"WA"}`), not any last dotted
  segment — the `.TFI` / `.FIZ` venue codes and bare Catalyst codes must pass through.
- The sleep sits **before** the page-N (N≥2) fetch, i.e. strictly between fetches;
  page 1 is fetched immediately. Pagination stops when the per-page
  `a.pages_right[title="następna"]` link is absent, or early on `date < start_date`.
- Value cells parse as float except the `volume` column (int; whitespace thousands
  separators stripped — `Obrót` is not extracted at all).
- Plugin tests resolve fixtures via `Path(__file__).parents[3] / "tests/fixtures/biznesradar"`
  — works both in-container (`/app/plugins/...` → `/app/tests/...`) and on host.
- Verified: `pytest plugins/` → 8 passed (scraper), 3 skipped (16.4 stubs);
  full compose suite stays green (138 passed).

---

### 16.4 — `FundHistoricalFetcher` + `BondHistoricalFetcher` + unit tests

Note: as only a single fetcher can be registered per (provider, model) key — and the
`EquityHistorical` model is the one wired in 16.5 — the plan's `FundHistoricalFetcher`
/ `BondHistoricalFetcher` names became *parsers + column maps* in
`fund_historical.py`/`bond_historical.py`, dispatched by a single
`EquityHistoricalFetcher` in `equity_historical.py` (user-approved 16.2 change).
- [x] `models/fund_historical.py` — `FundHistoricalFetcher`:
  - Input: `symbol`, `start_date`, `end_date`.
  - Calls `_scrape_pages` with `col_indices={date: 0, close: 1}`.
  - Maps each row to OpenBB `EquityHistoricalData` shape:
    `{date, open=close, high=close, low=close, close, volume=0}`.
  - Returns `OBBject` with `results` list.
- [x] `models/bond_historical.py` — `BondHistoricalFetcher`:
  - Same signature. Calls `_scrape_pages` with
    `col_indices={date:0, open:1, high:2, low:3, close:4, volume:5}`.
  - Maps each row to the same `EquityHistoricalData` shape (OpenBB unifies on this).
- [x] Unit tests (`test_fund_historical.py`, `test_bond_historical.py`) using fixture HTML
  (mock `_scrape_pages` or mock `httpx.get`):
  - happy-path: correct `close`, `open=high=low=close`, `volume=0` for fund.
  - happy-path: distinct `open/high/low/close`, real volume for bond.
  - date range filtering: rows outside `[start_date, end_date]` excluded.
  - empty result (symbol exists but no data in range) → empty `results`, not 404.
- [x] All fetcher tests pass: `pytest openst/plugins/openbb_biznesradar/tests/`.
- [x] Commit.

#### Implementation notes

- `EquityHistoricalFetcher` dispatches by symbol shape: `.TFI` / `.FIZ` →
  `FUND_COLUMNS` + `parse_fund_row`; anything else → `BOND_COLUMNS` +
  `parse_bond_row` (`.WA` stripped by `strip_wa_suffix` first).
- The fetcher implements the **sync** `extract_data` (scraper is sync);
  `transform_data` returns `BiznesRadarEquityHistoricalData` — the `OBBject` wrapper is
  applied by the OpenBB router, not the fetcher.
- `BIZNESRADAR_FETCH_DELAY_S` (default `2.0`) is read from env at extract time (no
  extra plumbing through OpenBB credentials).
- Missing `start_date`/`end_date` default to `date.min`/`date.max` bounds → full
  available history; an in-range-empty page set yields `[]`, not 404.
- Shared test helpers moved to a plugin-local `tests/conftest.py` — a bare `conftest`
  import fails because pytest imports the plugin test dir as a `tests` package.
- Verified: `pytest plugins/` → 23 passed; full compose suite stays green
  (138 passed); fetcher imports in-container with `require_credentials=False`.

---

### 16.5 — wire into `openbb_client.py` + openst suite

- [x] In `openst/src/openbb_client.py`:
  - Add `"biznesradar"` to `PRICE_PROVIDERS` list **at the end** (yfinance/fmp/…
    tried first; biznesradar is the last-resort fallback for PL-venue symbols).
  - Read `BIZNESRADAR_FETCH_DELAY_S = float(os.getenv("BIZNESRADAR_FETCH_DELAY_S", "2.0"))`.
    The env value is picked up by the fetcher via OpenBB credentials kwargs or directly
    from env inside the fetcher — confirm the cleanest approach when wiring.
  - No route changes: the existing `get_ohlcv_history()` provider-fallback loop calls
    `obb.equity.price.historical(ticker, ..., provider="biznesradar")` automatically.
- [x] Extend `openst/tests/test_openbb_client.py` with mocked `obb.equity.price.historical`
  for the biznesradar fallback path: returns fixture-shaped rows for `NNEP25.TFI`.
- [x] Run full openst test suite via docker compose (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit. Push openst to `main`. Wait for GHA image build.

#### Implementation notes

- Confirm: the **direct-env-read** approach is cleanest — `equity_historical.py` already
  reads `BIZNESRADAR_FETCH_DELAY_S` itself via `_fetch_delay_s()`, so `openbb_client.py`
  requires zero env plumbing (a compose env var is all that's needed to tune the delay).
- Real-router smoke in-container (live HTTP): `obb.equity.price.historical(
  "NNEP25.TFI", start=, end=, provider="biznesradar")` returns fund rows with
  `open==high==low==close`, `volume=0`; `"BST0327.WA"` returns real OHLCV/volume and
  `to_df()` yields a `date`-indexed frame (index values are `datetime.date` — the
  existing `hasattr(idx, "date")` check falls through to the raw value; output is the
  same "YYYY-MM-DD" string).
- Router plumbing discovery: `fetch_data()` forwards router-level kwargs
  (`preferences`, …) into `extract_data`, so the fetcher's `extract_data` signature
  needed `**kwargs` added (post-16.4 fix) or the live call raised
  `extract_data() got an unexpected keyword argument 'preferences'`.
- The `symbol` mock assertion uses `call.args[0]`, not `kwargs["symbol"]` — the router
  hands the ticker over positionally.
- Verified: full compose suite 141 passed (138 + 3 new biznesradar fallback/order
  tests), 5 deselected; plugin suite still 23 passed.

---

### 16.6 — openst standalone compose smoke (local, real HTTP)

- [x] Start openst standalone compose: `docker compose up -d` (redis + app).
- [x] Smoke-curl — **one request per symbol** (not a loop):
  ```bash
  curl "http://localhost:8080/price/ohlcv/NNEP25.TFI?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with {date, open, high, low, close, volume} rows; close==open==high==low
  curl "http://localhost:8080/price/ohlcv/BST0327?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with real OHLCV; or 404 if no data in range
  ```
- [x] Second call to each URL: confirm Redis cache HIT (no outbound HTTP to biznesradar).
- [x] Mark step done; note results inline. `docker compose down`.

#### Implementation notes

- Live results via compose stack (local build, `impl: real`):
  - `NNEP25.TFI` → 200, **123 rows** `2026-01-02 → 2026-06-30`, every row
    `close==open==high==low`, `volume=0` (e.g. `2026-01-02: 14.32`)
    — correct fund/NAV shape.
  - `BST0327` → 200, **33 rows** `2026-01-13 → 2026-06-30`, real distinct OHLCV +
    volume (e.g. `2026-01-13: o 103.50 h 103.50 l 102.00 c 102.00 vol 64`;
    `2026-06-30: vol 176`) — correct bond/Catalyst shape.
  - Repeat calls: **0.04s** each (first call ~8s of biznesradar paging) and both
    `price_ohlcv:*` keys present in Redis → cache HIT, no outbound HTTP.
- Fix required to run the standalone stack: `app` service in `docker-compose.yml` was
  missing `REDIS_HOST: redis` (default `localhost` wouldn't reach the container);
  now set explicitly like the `test` service.

---

### 16.7 — cachest: `OPENST_OHLCV_FUNDS` route (24 h TTL)

- [ ] In `cachest/config.yaml`, add after `OPENST_OHLCV`:
  ```yaml
  - name: OPENST_OHLCV_FUNDS
    path: /ohlcv/fund/{ticker}
    url: "http://openst:8080/price/ohlcv/{ticker}?start={start}&end={end}"
    query_params: [start, end]
    cache_ttl: 86400           # 24h — NAV updates once per business day
    stale_ttl: 2592000
    fetch_interval: 60         # 60s min between upstream fetches
    fetch_max_wait: 4
  ```
  Rationale: separate route with longer TTL vs equity `OPENST_OHLCV` (6 h) because fund
  NAV and Catalyst bond prices change at most once per business day.
- [x] Add `test_real_config_has_ohlcv_funds_route` to `cachest/tests/test_config.py`.
- [x] Run cachest test suite (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [x] Commit cachest config + test. Push to `main`. Wait for GHA image build.

#### Implementation notes

- Routing conflict check passed: `/ohlcv/fund/{ticker}` (3 segments, registered via
  `add_api_route`) can never be shadowed by `/ohlcv/{ticker}` (2 segments) — Starlette
  matches `/ohlcv/fund/NNEP25.TFI` against the 3-segment route only.
- Test suite green: **69 passed** (incl. the new config test), 1 warning.

---

### 16.8 — portfoliost compose stack smoke (full chain)

- [ ] Update openst and cachest image references in portfoliost `docker-compose.yml` to
  pick up the new versions (rebuild or bump `ghcr.io` tags).
- [ ] Start: `docker compose up -d redis openst cachest instruments`.
- [ ] Smoke-curl through cachest (**single requests**):
  ```bash
  curl "http://localhost:<cachest_port>/ohlcv/fund/NNEP25.TFI?start=2026-01-01&end=2026-06-30"
  # X-Cache: MISS first call; HIT on repeat
  ```
- [ ] Run `npm run test:stack` — existing 29 contract checks must stay green (no equity
  regression).
- [ ] Commit note: `chore: verify D77 smoke through full compose stack`.

---

### 16.9 — closeout

- [ ] Update `docs/proposals/instruments-provider-module.md` D77 status to `done`.
- [ ] Update `docs/openst-coverage.md` to note biznesradar provider coverage for
  `*.TFI`, `*.FIZ`, and Catalyst bond symbols.
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

