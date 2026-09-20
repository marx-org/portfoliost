# openst provider coverage (verified 2026-09-16)

Ground truth from probing **OpenBB 4.7.2** (with `openbb-sec==1.6.7` pinned) inside
the openst image with the current keys (`FMP_API_KEY` starter tier, yfinance, sec;
intrinio key present but broken). sec is keyless (SEC EDGAR).

## Covered by openst today

| Instruments need | openst route | OpenBB command | Providers that worked | Notes |
| --- | --- | --- | --- | --- |
| profile | `/equity/profile/{t}` | `equity.profile` | fmp, yfinance | fmp richer (cik/cusip/ceo/employees); intrinio errors |
| quote | `/equity/quote/{t}` | `price.quote` | fmp, yfinance | change/change_percent/market_cap/year_high… |
| history (OHLCV) | `/price/ohlcv/{t}?start&end` | `price.historical` | yfinance, fmp, intrinio | daily bars; legacy close-only `/price/history` kept |
| history (OHLCV) — PL funds/bonds (D77) | `/price/ohlcv/{t}?start&end` | `equity.price.historical` provider `biznesradar` | biznesradar (keyless) | last-resort fallback in `PRICE_PROVIDERS`; `*.TFI`/`*.FIZ` open-end funds (2-col NAV → `open==high==low==close`, `volume=0`) and Catalyst bonds (`BST*`/`INS*`/`KRI*`, `.WA` suffix stripped; real OHLCV+volume); cached 24h at cachest `/ohlcv/fund/{ticker}` (NAV moves once/business day). `BIZNESRADAR_FETCH_DELAY_S` (default 2s) = inter-page politeness |
| profile — Catalyst corporate bonds (D80) | `/equity/profile/{t}` | `equity.profile` provider `biznesradar` | obligacje.pl (keyless) | `CorporateBondProfileFetcher` in `openbb_biznesradar` (same scraper infra, new target site): `EquityProfileFetcher.fetch_data` dispatches `[A-Z]{3}\d{4}` Catalyst codes to `obligacje.pl/pl/obligacja/{symbol}` (emitent, ISIN, market GPW RR/ASO, nominal 100 PLN, coupon type `zmienne WIBOR 3M + {margin}%`/`stałe`, current coupon, maturity; `asset_type="corp_bond"`, `country=PL`, `currency=PLN`), with 404-fallback to biznesradar so savings-bond-shaped codes (e.g. `ROD1033`) are safe. Unit-tested against captured `obligacje.pl` fixtures (`tests/fixtures/obligacje_*.html`). **Catalogue (D80)**: `src/importers/corp_bond_catalogue.py` scrapes the single server-rendered search page (937 unique bonds); exposed as `GET /corp-bond/catalogue` (tickerref CSV, Redis 24h), proxied at cachest `OPENST_CORP_BOND_CATALOGUE` (12h); consumed by the daily instruments CronJob `corpbondsync` (04:45 UTC, plan §35) which upserts `ticker_reference` `asset_type='corp_bond'` — deployed 2026-09-19. Cached at cachest `OPENST_CORP_BOND_PROFILE` (24h) |
| fundamentals | `/equity/fundamentals/{t}?statement=income\|balance\|cash&period=annual\|quarter` | `fundamental.income/balance/cash` | fmp, yfinance | full statements, fiscal metadata incl. |
| metrics (+overview subset) | `/equity/metrics/{t}` | `fundamental.metrics` | yfinance, fmp | market_cap, pe_ratio, margins, ratios… |
| projections | `/equity/projections/{t}` | `estimates.consensus` | fmp, yfinance | target_consensus/high/low/median; yfinance adds recommendation + analyst count |
| calendar (earnings) | `/equity/calendar/earnings?start&end` | `calendar.earnings` | fmp only | **unfiltered window** (all symbols); per-symbol filter = premium (402) |
| calendar (dividends) | `/equity/calendar/dividend?start&end` | `calendar.dividend` | fmp only | declaration/ex-div/record/payment dates |
| dividends (existing) | `/dividend/yield/{t}`, `/dividend/history/{t}` | `fundamental.metrics`, `fundamental.dividends` | yfinance, fmp, … | unchanged |
| search | `/equity/search/{q}` | `equity.search` | sec | returns `{cik,name,symbol}` |
| insider trading | `/equity/ownership/{t}` | `ownership.insider_trading` | sec | Form 4 (director/officer buys & sells); keyless |
| institutional ownership | `/equity/ownership/institutional/{t}` | `ownership.form_13f` | sec | Form 13F quarterly holdings; SEC-only, keyless |
| filings | `/equity/filings/{t}` | `fundamental.filings` | sec | EDGAR filing index (10-K, 10-Q, 8-K) + report URLs |
| management discussion | `/equity/fundamentals/{t}/mda` | `fundamental.management_discussion_analysis` | sec | MD&A text from latest 10-K/10-Q; SEC-only |
| crypto OHLCV | `/crypto/ohlcv/{p}?start&end` | `crypto.price.historical` | yfinance, fmp, tiingo | daily bars via `openbb-crypto==1.6.2`; `CRYPTO_PROVIDERS` fallback; fmp/tiingo skipped when `FMP_API_KEY`/`TIINGO_TOKEN` unset; cached 6h at cachest `OPENST_CRYPTO_OHLCV` |
| crypto quote | `/crypto/quote/{p}` | `crypto.price.historical` (derived latest row) | yfinance, fmp, tiingo | snapshot from latest `historical` row (no `crypto.price.quote` in openbb-crypto 1.6.2); change/change_percent from ≥2 rows; cached 6h at cachest `OPENST_CRYPTO_QUOTE` |
| crypto search | `/crypto/search/{query}` | `crypto.search` | fmp | **fmp-only** (`CRYPTO_SEARCH_PROVIDERS`). Rows are coin-venue pairs (`BTCUSD`, `TBTCUSD`, `BTC.BUSD`, …) — **not** yfinance pairs; instruments normalise them to `BASE-USD` via a curated 38-major base→pair map (`btc→BTC-USD`, `eth→ETH-USD`, `matic→POL-USD` …) + bare-mnemonic fallback, and lead results with the curated exact-pair suggestion so `BTC-USD` survives the 50-row cap. Upstream FMP validation anomalies (e.g. `ico_date=NaN` → OpenBB model rejection) make a whole query 404 at openst; instruments swallows the failed leg additively. Cached 7d at cachest `OPENST_CRYPTO_SEARCH` |
| fixed income — retail savings bonds OHLCV/profile/search (D79) | `/fixedincome/ohlcv/{t}?start&end`, `/fixedincome/profile/{t}`, `/fixedincome/search/{q}` | `equity.price.historical` / `equity.profile` / `equity.search` provider `obligacje` | obligacje (keyless) | pure-Python engine (`openbb_obligacje` plugin) prices savings bonds `EDO*`, `ROD*`, `OTS*`, `ROR*`, `DOR*`, `TOS*`, `COI*`, `ROS*` from issue params + CPI 12m — no market price exists for retail savings bonds. No fixed-income router in OpenBB 4.7.x, so fetchers register under the **equity** model keys. Data in Postgres `openst` schema: `bond_series` (catalogue, `obligacjeskarbowe.pl`, 449 historical emissions backfilled via `--mode archive` — URL id typos in archived EDO codes handled by fetching the raw selector `url_id`; DB-first `search_bonds`/`get_bond_profile` read the table directly with OpenBB fallback) + `cpi_12m` (`obligacje.pl`). **Recurrence (D79 22)** — CronJobs in the openst HelmRelease: `openst-bond-import` daily 04:30 UTC `--mode incremental` (new emissions go on sale on the 1st, so a daily pass catches each one inside its sale window) plus `openst-bond-archive` on the 3rd at 06:00 UTC `--mode archive` re-enumerating the full catalogue as the self-heal backstop; idempotent (`ON CONFLICT DO NOTHING`), one log line per emission parsed and per symbol inserted. OHLCV window must include the emission's issue date (pre-issuance window → 404). Cached at cachest `OPENST_BOND_OHLCV` (6h) / `OPENST_BOND_PROFILE` (24h) |
| fixed income — retail savings bond quote (plan 34.2) | `/fixedincome/quote/{t}` | deterministic `openbb_obligacje` close (no OpenBB quote command) | Postgres `bond_series` + `cpi_12m` | “quote” = today’s computed close/open/high/low/prev-close from the savings-bond engine, not a market quote; returns the standard quote shape with `currency=PLN` and cached 6h at cachest `OPENST_BOND_QUOTE` |

All four SEC surfaces are keyless (SEC EDGAR). cachest proxies them at
`/ownership/{t}`, `/ownership/institutional/{t}`, `/filings/{t}`,
`/fundamentals/{t}/mda`.

## Missing — needs research

Status after SEC wiring (2026-09-07): the ownership gap is closed via SEC 13F;
investor-relations transcripts can now be partially sourced from SEC filings +
MD&A, but a true Q&A audio transcript is still out of tier.

1. **eps-surprises** (`/:symbol/eps-surprises`) — RESOLVED by derivation
   (I8b): quarterly income statements give actual EPS/revenue; estimates use
   the prior-year quarter as a baseline. True analyst estimates still need an
   FMP upgrade or Finnhub.
2. **institutional ownership** (`/:symbol/ownership`) — RESOLVED via SEC 13F
   (`ownership.form_13f`) exposed at openst `/equity/ownership/institutional/{t}` /
   cachest `/ownership/institutional/{t}`. Insider trading (Form 4) also covered.
3. **peers** (`/:symbol/peers`) — RESOLVED by composition (I8b): same-sector
   compare rows over a curated large-cap candidate pool with live sector
   profiles. FMP `stock_peers` remains the research path for true broker peers.
4. **seasonality** (`/:symbol/seasonality`) — RESOLVED in module (I8b):
   monthly last-closes from multi-year OHLCV → avg/median/min/max.
5. **investor-relations events / transcripts** — PARTIALLY RESOLVED (2026-09-07):
   events derived from real reported quarters; SEC filings now give the
   underlying documents (10-K/10-Q/8-K + report URLs) and MD&A supplies the
   management discussion text. A true earnings-call Q&A **audio transcript**
   (`fundamental.transcript`) is still FMP-only/premium — no audio in tier.

## Asset-class quote dispatch (portfoliost-instruments, plan §34)

`GET /api/instruments/:symbol/quote` resolves the asset class from
`instruments.ticker_reference` and then routes as follows:

| Asset class | Quote source | Notes |
| --- | --- | --- |
| `savings_bond` | cachest `OPENST_BOND_QUOTE` → openst `/fixedincome/quote/{symbol}` | deterministic computed close; 404 falls back to the equity path |
| `crypto` | cachest `OPENST_CRYPTO_QUOTE` → openst `/crypto/quote/{pair}` | pair-aware lookup (`BTC-USD`, then bare `BTC`) |
| `corp_bond` / `fund` / default | cachest `OPENST_QUOTE` → openst `/equity/quote/{symbol}` | existing biznesradar/yfinance/FMP path |

The curated bootstrap rows for crypto/fund references are upserted by
`tickerref-sync --curated-only` (run once after the §34 deploy; the weekly
sync keeps them refreshed).

## Provider quirks worth remembering

- **intrinio**: nearly all probes fail with "Results not found" despite valid key —
  research key entitlements before adding it to any fallback chain beyond dividends.
- **nasdaq**: provider arg-shape mismatch for calendars in 4.7.1 (validation error).
- **calendar windows**: unfiltered calls are free; anything symbol-scoped is premium.
- **biznesradar LSE pricing unit = pence** (plan §39): quotes AND profiles for `.L`
  symbols return prices in **pence** with the non-ISO currency code `GBp`
  (`CSN.L → last_price 357.5, currency "GBp"`). Never consume provider prices
  without normalizing: `portfoliost-instruments` `toQuote`/`toInstrumentProfile`
  divide by 100 and emit `GBP`; `portfoliost-wallets` `isIsoCurrency` rejects
  `GBp` so it can't overwrite `positions.instrument_currency`.

---

## Next steps

See [docs/plan.md](plan.md) section **SEC investor-relations wiring** for the
full description of what to build on top of this coverage (backend wiring of
filings/MD&A into `portfoliost-instruments` + SPA UI surface).
