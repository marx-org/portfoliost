# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 16. D77 — biznesradar OpenBB provider in openst (TFI funds + Catalyst bonds)

**ARCHIVED** (all 16.1–16.9 steps done 2026-09-14) → see `plan-archive.md`:
biznesradar OpenBB provider plugin in openst (scraper, EquityHistoricalFetcher
fund/bond dispatch, OHLCV last-resort fallback), cachest `OPENST_OHLCV_FUNDS`
24h route, full-compose smoke.

---

## 17. D78 — biznesradar search + quote fallback (PL fund/bond lookup end-to-end)

### Finding (2026-09-14 — post-deploy live probe for `BST0327.WA`)

`GET /equity/search/bst0327.wa` 404s and biznesradar is never called. Root cause:

- openst search only tries `SEARCH_PROVIDERS = ["sec", "nasdaq", "cboe"]`
  (`openst/src/openbb_client.py:17`); all three return "Results not found" for
  the bond → openst `_cached_or_404` → 404.
- cachest passes that through: `[not-found] 'http://openst…:8080/equity/search/bst0327.wa'
  returned HTTP 404` → instruments search yields nothing.
- biznesradar **cannot** serve search today: D77 wired it only into
  `PRICE_PROVIDERS` (OHLCV). The plugin registers exactly one fetcher under the
  `EquityHistorical` model key (`openbb_biznesradar/__init__.py`), so
  `obb.equity.search(provider="biznesradar")` has no fetcher to dispatch to.
- Downstream dead-end even with a search hit: the instruments detail fetch for
  the bond calls openst quote/profile, which run
  `QUOTE_PROVIDERS = ["fmp", "yfinance", "cboe"]` /
  `PROFILE_PROVIDERS = ["fmp", "yfinance"]` — none resolve `BST0327.WA`.
  biznesradar only backs `price.historical`.
- biznesradar.pl surface (probed 2026-09-14): the bond resolves at
  `/notowania/BST0327` (the D77 scraper hits it), but the public
  `/szukaj?wartosc=BST0327` results page does **not** index by symbol — a search
  fetcher must probe `/notowania/{symbol}` existence rather than rely on `/szukaj`.

### Decision (2026-09-14)

Build the **search + quote fallback** path (full flow), not search-only.

### Steps

- [x] **17.1** — biznesradar `EquitySearch` fetcher (`models/equity_search.py`):
  - Input `q`; normalize → symbol (uppercase; keep `.WA`/`.TFI`/`.FIZ`).
  - Probe `GET /notowania/{symbol}` (shared rate-limit helper from D77 scraper);
    200 + expected table ⇒ `[{name, symbol, cik: null}]` (name from page title /
    table header); 404/missing table ⇒ `[]`.
  - Register under OpenBB `EquitySearch` in `fetcher_dict`.
- [x] **17.2** — append `"biznesradar"` to `SEARCH_PROVIDERS` (last).
  Unit tests: mock `httpx.get` on `/notowania/{q}` 200 vs 404; openbb_client
  search-fallback test (sec/nasdaq/cboe empty → biznesradar hit).
- [x] **17.3** — biznesradar quote fetcher (`models/equity_quote.py`, OpenBB
  `EquityQuote`): scrape today/last close + change/volume from `/notowania/{symbol}`
  → `{symbol, name, price, change, change_percent, previous_close, day_high,
  day_low, volume}` (fields used by `price.quote`); stub gracefully when the row
  is missing. Register under `EquityQuote`.
- [x] **17.4** — openst wiring: append `"biznesradar"` to `QUOTE_PROVIDERS`
  (last) and, for full PL coverage, `PROFILE_PROVIDERS` (biznesradar
  `EquityProfile` minimal: `{name, symbol, currency:"PLN"}` or empty list → fall
  through to existing providers). openbb_client fallback tests for both.
- [x] **17.5** — verify: openst compose suite (all pass) + plugin suite; cachest
  unchanged (same routes, no new route needed); full compose stack smoke:
  `curl /equity/search/bst0327.wa` → 200 with a search hit, then instruments
  `/api/instruments/BST0327.WA` detail resolves via quote/profile fallback.
  Keep `npm run test:stack` green.
- [x] **17.6** — commit openst (+ plan), push `main`, wait for GHA image build,
  bump homelab helmrelease, verify in cluster (search + detail for `BST0327.WA`).