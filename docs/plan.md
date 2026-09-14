
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

- [ ] Create `openst/plugins/openbb_biznesradar/` with the standard OpenBB provider
  extension layout:
  ```
  openst/plugins/openbb_biznesradar/
  ├── pyproject.toml
  ├── openbb_biznesradar/
  │   ├── __init__.py           # exposes biznesradar_provider (Provider instance)
  │   ├── scraper.py            # shared _scrape_pages() + symbol stripping
  │   └── models/
  │       ├── __init__.py
  │       ├── fund_historical.py      # FundHistoricalFetcher
  │       └── bond_historical.py      # BondHistoricalFetcher
  └── tests/
      ├── __init__.py
      ├── test_scraper.py
      ├── test_fund_historical.py
      └── test_bond_historical.py
  ```
- [ ] `pyproject.toml` uses **setuptools** (not Poetry — avoids lock-file clash with the
  parent `requirements.txt` approach):
  ```toml
  [build-system]
  requires = ["setuptools>=68"]
  build-backend = "setuptools.backends.legacy:build"

  [project]
  name = "openbb-biznesradar"
  version = "0.1.0"
  dependencies = ["openbb-core", "beautifulsoup4", "lxml", "httpx"]

  [project.entry-points."openbb_provider_extension"]
  biznesradar = "openbb_biznesradar:biznesradar_provider"
  ```
- [ ] `__init__.py` instantiates:
  ```python
  biznesradar_provider = Provider(
      name="biznesradar",
      description="BiznesRadar.pl scraper — Polish TFI funds and Catalyst bonds",
      fetcher_dict={
          "FundHistorical": FundHistoricalFetcher,
          "BondHistorical": BondHistoricalFetcher,
      },
  )
  ```
- [ ] Add `beautifulsoup4` and `lxml` to `openst/requirements.txt` (they are new
  transitive deps not pulled in by current packages).
- [ ] Add `-e ./plugins/openbb_biznesradar` to `openst/requirements.txt` so the editable
  install registers the entrypoint at container build time.
- [ ] Commit scaffold (stubs only, tests expected to fail/skip).

---

### 16.3 — shared scraper + unit tests

- [ ] Implement `openbb_biznesradar/scraper.py`:
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
- [ ] Unit tests in `tests/test_scraper.py` using fixture HTML (mock `httpx.get`):
  - correct date + value extraction for both table shapes.
  - early stop: given `start_date=2026-01-01`, stops before fetching a page whose
    first row is `2025-12-31`.
  - `strip_wa_suffix` matrix test: `NNEP25.TFI.WA` → `NNEP25.TFI`; `BST0327.WA` →
    `BST0327`; `NNEP25.TFI` → `NNEP25.TFI`; `AAPL` → `AAPL`.
  - sleep called between pages, not before first page.
  - raises on 404.
- [ ] All scraper tests pass: `pytest openst/plugins/openbb_biznesradar/tests/test_scraper.py`.
- [ ] Commit.

---

### 16.4 — `FundHistoricalFetcher` + `BondHistoricalFetcher` + unit tests

- [ ] `models/fund_historical.py` — `FundHistoricalFetcher`:
  - Input: `symbol`, `start_date`, `end_date`.
  - Calls `_scrape_pages` with `col_indices={date: 0, close: 1}`.
  - Maps each row to OpenBB `EquityHistoricalData` shape:
    `{date, open=close, high=close, low=close, close, volume=0}`.
  - Returns `OBBject` with `results` list.
- [ ] `models/bond_historical.py` — `BondHistoricalFetcher`:
  - Same signature. Calls `_scrape_pages` with
    `col_indices={date:0, open:1, high:2, low:3, close:4, volume:5}`.
  - Maps each row to the same `EquityHistoricalData` shape (OpenBB unifies on this).
- [ ] Unit tests (`test_fund_historical.py`, `test_bond_historical.py`) using fixture HTML
  (mock `_scrape_pages` or mock `httpx.get`):
  - happy-path: correct `close`, `open=high=low=close`, `volume=0` for fund.
  - happy-path: distinct `open/high/low/close`, real volume for bond.
  - date range filtering: rows outside `[start_date, end_date]` excluded.
  - empty result (symbol exists but no data in range) → empty `results`, not 404.
- [ ] All fetcher tests pass: `pytest openst/plugins/openbb_biznesradar/tests/`.
- [ ] Commit.

---

### 16.5 — wire into `openbb_client.py` + openst suite

- [ ] In `openst/src/openbb_client.py`:
  - Add `"biznesradar"` to `PRICE_PROVIDERS` list **at the end** (yfinance/fmp/…
    tried first; biznesradar is the last-resort fallback for PL-venue symbols).
  - Read `BIZNESRADAR_FETCH_DELAY_S = float(os.getenv("BIZNESRADAR_FETCH_DELAY_S", "2.0"))`.
    The env value is picked up by the fetcher via OpenBB credentials kwargs or directly
    from env inside the fetcher — confirm the cleanest approach when wiring.
  - No route changes: the existing `get_ohlcv_history()` provider-fallback loop calls
    `obb.equity.price.historical(ticker, ..., provider="biznesradar")` automatically.
- [ ] Extend `openst/tests/test_openbb_client.py` with mocked `obb.equity.price.historical`
  for the biznesradar fallback path: returns fixture-shaped rows for `NNEP25.TFI`.
- [ ] Run full openst test suite via docker compose (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [ ] Commit. Push openst to `main`. Wait for GHA image build.

---

### 16.6 — openst standalone compose smoke (local, real HTTP)

- [ ] Start openst standalone compose: `docker compose up -d` (redis + app).
- [ ] Smoke-curl — **one request per symbol** (not a loop):
  ```bash
  curl "http://localhost:8080/price/ohlcv/NNEP25.TFI?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with {date, open, high, low, close, volume} rows; close==open==high==low
  curl "http://localhost:8080/price/ohlcv/BST0327?start=2026-01-01&end=2026-06-30"
  # expect: JSON array with real OHLCV; or 404 if no data in range
  ```
- [ ] Second call to each URL: confirm Redis cache HIT (no outbound HTTP to biznesradar).
- [ ] Mark step done; note results inline. `docker compose down`.

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
- [ ] Add `test_real_config_has_ohlcv_funds_route` to `cachest/tests/test_config.py`.
- [ ] Run cachest test suite (all tests must pass):
  ```bash
  docker compose --profile test run --rm test
  ```
- [ ] Commit cachest config + test. Push to `main`. Wait for GHA image build.

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

