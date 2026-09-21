# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---
## 41. Combined (all-portfolios) chart + absolute-value performance chart (example-service parity, 2026-09-21)

User request (no proposal file): the example-service dashboard main page shows a large combined
(all-portfolios) value chart above the portfolio cards — portfoliost's main page
(`InvestmentsView`, `/en/investments`) is missing it. **One shared `PortfolioPerformanceChart`
component, no variant prop** — the charts differ only in the data delivered (combined vs single
portfolio). Per user: "switch to absolute values everywhere; the current portfolio charts are
broken anyway" (the component currently renders index start=100 driven by TWR/MWR/simple
columns).

Example service verified live 2026-09-21 (performance page of Top10 + observed API):
- Chart line = `performance.timeSeries[].value`, **absolute currency amounts** (0 → ~109k USD);
  y-axis compact currency (`$20k`…), tooltip full currency (`$94,508.33`); green gradient area.
- Benchmark overlay KEPT: raw **indexed** values (start=100) drawn on the same absolute axis —
  grey dashed, flat near 0 (example-service quirk, mirrored); tooltip currency-formatted (`$100.31`).
- `cumulativeTwr`/`cumulativeMwr` are **percentages** in example-service's payload — they do NOT drive
  the line; the line is always `value`.
- Analytics call shape: `GET /portfolios/{id}/analytics?timeframe=3M&benchmarks=SPY&displayCurrency=USD`
  (example-service converts server-side; portfoliost converts client-side instead — see below).
- Main-page combined chart: blue gradient area, full available history (no timeframe control).

Currency rule (user): the chart must render in the **display currency** now; full
app-wide display-currency switching (example-service-style backend `displayCurrency`) is a future point.
Client-side conversion via `getLatestRate` (the §36 `PortfolioPerformanceTab` rateByCcy pattern).

Endpoint state: `openapi.yaml` defines `GET /portfolios/merged` (operationId
`getMergedPortfolios`, returns `PortfolioAnalytics`); mock answers `[]` (empty example-service capture);
the real `portfoliost-wallets` route is **not** implemented (follow-up, separate repo — SPA
degrades gracefully: chart hidden on fetch failure).

Scope: portfoliost SPA + mocks + contracts spec param only.

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit + mock suite per
AGENTS.md; E2E against docker compose).

---

### 41.1 — `PortfolioPerformanceChart` → absolute values in currency (shared by both charts)

- [x] `src/components/PortfolioPerformanceChart.vue`: plot raw `value` (absolute) — remove the index
  normalisation and the `returnType` prop (example-service's cumulative columns are % stats, not the line).
- [x] New props: `currency?: string` (default `"USD"`) for axis/tooltip formatting;
  `color?: string` (default `#16a34a` — example-service performance green with gradient area; the combined
  page passes `#2563eb` blue).
- [x] yaxis `labels.formatter` = compact currency (reuse `formatCompact` + currency symbol/code,
  e.g. `$20k`); tooltip y = full `formatCurrency(v, currency)` — applies to the portfolio line AND
  the benchmark series (example-service formats the benchmark's index value as currency too).
- [x] Benchmark overlay kept as today: raw values on the same axis, grey dashed, legend.
- [x] Recompute button kept (emits `recompute`; parent decides the scope); `backfillPending`
  line and loading overlay kept; empty state kept.
- [x] Tests: rewrite `tests/unit/components/PortfolioPerformanceChart.test.ts` — absolute plot of
  `value` (no normalisation); yaxis formatter carries the currency; benchmark overlay on the same
  axis; recompute still emits; pending line still conditional; `returnType` prop removed.
- [x] Tests: `npm run test` green.
- [x] Commit.

### 41.2 — Performance tab: display-currency conversion, drop the return-type selector

- [x] `src/modules/portfolios/PortfolioPerformanceTab.vue`: convert
  `performance.timeSeries[].value` from portfolio currency to the display currency before passing to
  the chart (`getLatestRate` once per distinct source currency — the existing `rateByCcy`
  pattern); pass `:currency="displayCurrency"`. Same-currency → rate 1, no request.
- [x] Customize dialog: remove the Return Type block (the line no longer depends on TWR/MWR/Simple);
  keep the benchmarks section. Store `analyticsReturnType`/`setReturnType` and the
  `benchmarkCalcType` API param stay as-is for now (dead in UI, harmless) — noted as follow-up
  cleanup.
- [x] Tests: `tests/e2e/chart-recompute.spec.ts` asserts visibility + pending line only (no index
  values) — expect no change; `npm run test:e2e` green (docker compose).
- [x] Commit.

### 41.3 — Contracts + API client: merged mirrors single-portfolio analytics

- [x] `portfoliost-contracts/contracts/openapi.yaml`: add optional `timeframe` query param (string,
  default `ALL`) to `GET /portfolios/merged` (mirroring `/:id/analytics`);
  `npm run gen:types` + `npm test`/`npm run lint` in the contracts package; rebuild/publish the
  `@marx2/contracts` artifact the SPA consumes, regenerate `generated/api-types.d.ts`.
- [x] `src/api/portfolios.ts`: `getMergedAnalytics(timeframe: PortfolioAnalyticsTimeframe = "ALL")`
  → `http.get(`/api/portfolios/merged?timeframe=${timeframe}`)`.
- [x] Verified by `npm run build` (vue-tsc) — thin wrapper, no dedicated unit test.
- [x] Commit.

### 41.4 — Mock:
`/api/portfolios/merged` serves the same per-timeframe fixture as a single portfolio

- [x] `mocks/portfolios/index.js`: replace the `loadRaw("merged_portfolios.json")` (`[]`)
  passthrough — serve the same `ANALYTICS_BY_TIMEFRAME[timeframe]` fixture + benchmark merge logic
  as `/:id/analytics` (simplification per user: no cross-portfolio summation; exactly one seeded
  portfolio carries analytics data, so merged == that series).
- [x] `mocks/tests/run.mjs`: checks — `/api/portfolios/merged` 200 with non-empty
  `performance.timeSeries` for `timeframe=1Y` and `timeframe=ALL`; last point `value` is absolute
  scale (> 10 000, i.e. not an index around 100).
- [x] Tests: `npm run test:mock` green.
- [x] Commit.

### 41.5 — `InvestmentsView`: combined chart block (example-service position)

- [x] `src/modules/portfolios/InvestmentsView.vue`: `merged` ref; fetch
  `getMergedAnalytics("ALL")` in the `onMounted` `Promise.all` — on failure `merged = null`
  (chart hidden, page unaffected).
- [x] Convert the merged series to the display currency (source =
  `store.totalMetrics?.baseCurrency`); render the shared component inside a `card` section between
  the metrics grid and the "Investment Portfolios" section: blue (`color="#2563eb"`),
  `:currency="displayCurrency"`, `:loading="loading"`,
  `v-if="merged?.performance?.timeSeries?.length"`.
- [x] Recompute button (kept in the component) → fire `recomputePortfolio` for every
  `store.portfolios` entry; local `backfillPending` flag shown until the next merged re-fetch
  succeeds (no merged-specific recompute endpoint exists).
- [x] `data-testid="combined-chart"` wrapper; E2E `tests/e2e/combined-chart.spec.ts` — login →
  `/en/investments` → `[data-testid="combined-chart"] .apexcharts-canvas` visible.
- [x] Tests: `docker compose up -d --build` + `npm run test:e2e` green.
- [x] Commit.

### 41.6 — Full suite + visual parity vs example-service

- [x] `npm run build && npm run test && npm run test:mock`; `docker compose up -d --build`;
  `npm run test:e2e` — all green.
- [x] Playwright side-by-side vs `app.example-service.ai`: (a) `/en/investments` combined chart block
  (position, blue area, absolute display-currency axis); (b) performance page chart (green area,
  benchmark dashed overlay, currency tooltip) — screenshots, note residual gaps.
- [x] Commit.

**§41.6 parity notes (verified 2026-09-21):**

- Combined block position matches example-service (`app.example-service.ai/pl/investments`): metrics grid → "Wartość
  łączna" chart block → portfolio cards. Ours renders blue (`#2563eb`) area, compact `$` axis
  (`$120K/$100K/…`), `data-testid="combined-chart"`.
- Performance page: green `#16a34a` area, grey dashed `SPY` overlay, absolute `$` axis; the
  Return-Type selector is gone (matches example-service's single absolute line).
- Residual gaps (out of scope): example-service's combined block also has a period combobox ("Okres: 1 rok")
  and a currency selector inline; ours fixes `timeframe=ALL` and relies on the page-level display
  currency menu. Dev/e2e gateway routes `/api/portfolios/merged` to the mock
  (`gateway/default.conf.template`) because the real `portfoliost-wallets` route is follow-up #1 —
  in production the SPA hides the block until wallets implements it.
- Backend caveat for deploy: production SPA will call the real wallets `/api/portfolios/merged`
  (500 → block hidden). The combined chart appears in production only after wallets implements the
  merged analytics route.

---

Open follow-ups (out of scope here):

1. Real `GET /api/portfolios/merged` in `portfoliost-wallets` (sum value snapshots across all
   portfolios → base currency, `PortfolioAnalytics` shape) — until then production hides the chart.
2. Backend display-currency conversion (example-service-style `?displayCurrency=` on analytics endpoints) —
   future point; client-side conversion covers the charts now.
3. Dead UI state cleanup: `analyticsReturnType`/`setReturnType` store fields + `benchmarkCalcType`
   param once nothing consumes them.

---

## 42. Quote rows without `last_price` →
`currentPrice: 0` → ETF prices blank in portfolios (incident 2026-09-21)

User report: no current prices for EMIM, ETFSP500.WA, RBOE.DE, ETFBTCPL.WA, SP20.L in portfolio "IKE
Beata", plus `upstream 404 for .../ohlcv/EMIM...` logs in production.

Diagnosis (probed live via `cachest.k.homylab.com`/in-cluster curl, 2026-09-21):
the wallets quotes pass calls `portfoliost-instruments /:symbol/quote` → cachest
`/equity/quote/{symbol}`. For 4 of the 5 symbols the upstream returns **HTTP 200 with a CBOE-shaped
row that has no `last_price`/`close`** — only `bid`/`ask` (and sometimes
`open`/`prev_close`):

| symbol      | quote | last_price | bid/ask                        | ohlcv(30d)                 |
|-------------|-------|------------|--------------------------------|----------------------------|
| SP20.L      | 200   | —          | 5.142/5.148 GBP                | 200                        |
| ETFSP500.WA | 200   | —          | 300.1/301.25 PLN               | 200                        |
| ETFBTCPL.WA | 200   | —          | 61.55/61.87 PLN                | 200                        |
| EMIM        | 200   | —          | none (name only)               | 404 (wrong venue, see §43) |
| RBOE.DE     | 200   | —          | none (`asset_type: NONE` stub) | 404 (wrong venue, see §43) |

`toQuote` (`portfoliost-instruments/src/adapters/translate.ts:179`) computes
`lastPrice = fromPence(num(pick(q, "last_price"))) ?? 0` → `currentPrice: 0` on a 200 response.
Wallets `fetchQuote` (`portfoliost-wallets/src/services/quotes.ts`) drops price `0`
(`if (!price) return null`) → position keeps `priceSource: manual`,
`current_price: NULL`. No error is ever logged — the failure is silent. Scope:
`portfoliost-instruments` only (adapter + tests); wallets needs no change and self-heals on the next
read after deploy (positions with NULL `price_as_of`
always refetch).

Rules: one step = one commit; a step is `[x]` only after its tests pass.

---

### 42.1 — `toQuote`: last-price fallback chain + change derivation

- [x] `portfoliost-instruments/src/adapters/translate.ts` `toQuote`: derive `lastPrice`
  as: `last_price` → `close` → midpoint `(bid+ask)/2` (only when **both** > 0; a bid=0/ask=0 or
  zero-on-one-side row must NOT produce a fake midpoint) → `open`
  (open/high/low as last resort, in that order). Keep the pence handling applied to every source
  field (reuse `fromPence(..., pence)`) and the existing `?? 0` terminal so the return type is
  unchanged. Document the chain in a comment referencing this incident (CBOE rows carry no
  `last_price` for EU-listed ETFs).
- [x] Same function: when `change` is absent, keep the existing `lastPrice - prevClose`
  fallback; ensure `prevClose` also falls back `prev_close` → (midpoint of bid/ask not available →)
  keep current behaviour. No behaviour change for rows that DO carry
  `last_price` (fmp/biznesradar shapes).
- [x] Tests: `src/adapters/translate.test.ts` — new cases: (a) CBOE row with only bid/ask →
  `currentPrice` = midpoint, `currency` preserved, `change`/`percentChange`
  derived from `prev_close` when present; (b) row with `bid: 0, ask: 0` → midpoint skipped, falls to
  `open`/`high`/`low`; (c) row with only `close` (no `last_price`)
  → uses `close`; (d) pence row without `last_price` but with bid/ask in GBp → ÷100 applied; (e)
  existing fmp/biznesradar/§39 cases stay green.
- [x] Tests: full `portfoliost-instruments` suite (`npm test` / vitest) green.
- [x] Commit.

### 42.2 — Release + production self-heal verification

- [x] Push `main` → GHA bumps `v*` → verify tag with
  `gh release list --repo Marx2/portfoliost-instruments` → pin in
  `~/prv/homelab/homelab/cluster/apps/pfire/portfoliost-instruments/app/helmrelease.yaml`
  → commit+push → Flux applies in ~1 min →
  `kubectl get pods -n pfire -l app.kubernetes.io/name=portfoliost-instruments`.
- [x] Verify: open portfolio "IKE Beata" (or `GET /api/portfolios/92a5927d-.../positions`
  with a Pocket-ID session) — SP20.L, ETFSP500.WA, ETFBTCPL.WA now show `current_price`
  + `price_source = quote` + non-null `price_as_of` (quotes self-heal on read; NULL
    `price_as_of` always refetches, no DB touch needed).
- [x] Confirm the previously-blank cards render prices in the SPA (Playwright snapshot).
- [x] Commit (helmrelease pin is its own homelab commit; mark `[x]` + archive with §43/§44 closeout
  only when all three sections are done).

---

## 43. Sheet import lands wrong venue symbols (EMIM, RBOE.DE) — OHLCV 404 + unpriceable quotes (2026-09-21)

Diagnosis: the `upstream 404 for .../ohlcv/EMIM?...` / `RBOE.DE` logs are the
`UpstreamError` message from `portfoliost-instruments/src/adapters/cachest.ts` — the instruments
service (and the SPA price chart) query cachest OHLCV with the **stored position symbols**, which
the Google Sheets import got wrong (0 unmatched rows, so the resolver never warned):

- `iShares Core MSCI EM IMI UCITS ETF USD Acc` — Podsumowanie row: venue col `AMS:EMIM`,
  Yahoo-symbol col **empty** → resolved to bare `EMIM` (openst `PRICE_PROVIDERS` cannot price a bare
  AMS listing: ohlcv 404, quote returns a name-only stub, no bid/ask). Probed working form: **
  `EMIM.AS`** → quote 200 (`open 48.585 / prev_close 47.68 / EUR`, bid=0 → midpoint skipped) and
  ohlcv 200.
- `iShares Automation & Robotics UCITS ETF USD A` — Podsumowanie row: venue col
  `AMS:RBOE`, but Yahoo-symbol col says **`RBOE.DE`** (stale/wrong venue; the ETF is not listed on
  XETRA) → stored as `RBOE.DE`: ohlcv 404, quote is an `asset_type: NONE`
  stub. Probed working form: **`RBOE.AS`** → quote 200 (`open 18.634 / prev_close
  18.352 / EUR`) and ohlcv 200. `RBOE.L`/`RBOE.XETRA`/bare `RBOE` all 404 (verified).

Fix location per the §38.3/§34.7 precedent (sheet edits are not allowed; live Podsumowanie rows stay
stale): `NAME_VENUE_OVERRIDES` in
`portfoliost-sheets-sync/src/instrument-resolver.ts` — folded-name keyed, takes precedence over the
catalog. Then wipe & reimport (`POST /api/admin/jobs/sheets-sync/run
{wipe:true}` from Admin → Jobs) — **touches production, requires explicit user approval** (§28
precedent). Currency note: both `.AS` listings trade in EUR while the stored positions say USD; the
quotes pass will overwrite `instrument_currency` from the live profile (EUR) and FX converts to the
portfolio base — that is the correct semantics (price at the trading venue), accept it.

Rules: one step = one commit; step-test-commit per AGENTS.md; the reimport step is gated on user
approval.

---

### 43.1 — Resolver overrides: `EMIM.AS` + `RBOE.AS`

- [x] `portfoliost-sheets-sync/src/instrument-resolver.ts` `NAME_VENUE_OVERRIDES`: add
  - `"ishares core msci em imi ucits etf usd acc"` → `{ ticker: "EMIM.AS", assetType:
    "Stock", yahooSymbol: "EMIM.AS", country: "IE", countryCode: null, sector: null,
    industry: null }`
  - `"ishares automation & robotics ucits etf usd a"` → `{ ticker: "RBOE.AS",
    assetType: "Stock", yahooSymbol: "RBOE.AS", country: "LU", countryCode: null, ... }`
    Keyed by `nameFold()` of the exact Transakcje names — verify the folded keys against
    `src/tests/fixtures/podsumowanie.json` / Transakcje rows before writing (the override must match
    the sheet's name column, not the catalog's).
- [x] Tests: `src/instrument-resolver.test.ts` — both names resolve to the `.AS`
  symbols with `matched: true` even when the catalog row carries a stale/empty Yahoo symbol (i.e.
  override beats the catalog); regression: unrelated names (e.g. the §38.3 TFI overrides) still
  resolve as before.
- [x] Tests: `portfoliost-sheets-sync` full suite green.
- [x] Commit.

### 43.2 — Release + wipe & reimport (⚠ production, needs user approval)

- [x] Push `main` → GHA → pin new tag in the homelab `portfoliost-sheets-sync` HelmRelease (app +
  any cronjob copy) → Flux applies.
- [x] **Ask user for approval, then** run Admin → Jobs → "Wipe & Reimport"
  (`POST /api/admin/jobs/sheets-sync/run {wipe:true}` on
  `https://portfoliost.k.homylab.com` with an authenticated Pocket-ID session).
- [x] Verify DB: `portfolios.positions` for IKE Beata shows `symbol = EMIM.AS` /
  `RBOE.AS` (old `EMIM` / `RBOE.DE` rows gone after wipe), `instrument_currency = EUR`.
- [x] Verify data path end-to-end: `cachest /ohlcv/EMIM.AS` + `/ohlcv/RBOE.AS` 200 (already probed)
  and the instruments `/:symbol/price-bars` + `/:symbol/history` routes return non-empty series
  (this also re-seeds `instruments.price_bars` background upsert for the new symbols — chart on the
  SPA gets data).
- [x] Verify SPA: IKE Beata shows prices for all positions (with §42 deployed) and the price chart
  renders for EMIM.AS / RBOE.AS.
- [x] Commit (homelab pin; DB verification is read-only, nothing to commit).

---

## 44. TFI fund quote 502 (NNEP65.TFI) — biznesradar/.TFI equity-quote leg failing upstream (2026-09-21)

Diagnosis (instruments access logs, 2026-09-21): `GET /api/instruments/NNEP65.TFI/quote`
→ **502, ~15 s** (client timeout), while `cachest /equity/quote/NNEP65.TFI` → 404 and
`cachest /ohlcv/NNEP65.TFI` → 404 (fast, negative path). The §38.3 override that renamed NN fund
positions to the ING `.TFI` tickers was "verified 2026-09-20" — the .TFI leg therefore stopped
working afterwards (openst pods are 15 h old; either the biznesradar scraper no longer resolves
`.TFI` symbols, or an openst negative-cache is poisoning the key). `NNEP65.TFI/price-bars` still
returns 200 (stooq leg works), so only the current-price leg is broken. Same user-visible symptom as
§42 (blank price) but a different failure mode, hence a separate section.

Rules: diagnose first — do not write a fix step against an unverified provider behaviour (honesty
rule). One step = one commit.

---

### 44.1 — Diagnose the .TFI quote leg

- [x] Probe openst directly in-cluster: `GET /equity/quote/NNEP65.TFI` (and
  `/equity/quote/NNEP65` for comparison) with timing; capture openst logs (stern on
  `app.kubernetes.io/name=openst`) during the request — identify which providers were walked, what
  each returned, and whether the 404 is a negative-cache hit (`[not-found]`
  in cachest / negative sentinel in openst) or a live provider failure.
- [x] Probe the biznesradar source the plugin scrapes (`/notowania/NNEP65TFI` after
  `strip_wa_suffix`-style clean — inspect `plugins/openbb_biznesradar/openbb_biznesradar/scraper.py`
  for how `.TFI` is handled in the URL) with curl; confirm whether the page exists and whether its
  `qTableFull` table still contains the expected cells.
- [x] Determine the cause class: (a) scraper no longer parses the page / page moved → openst plugin
  fix; (b) symbol not on biznesradar, another provider must carry .TFI → provider-order/dispatch fix
  in `openst/src/openbb_client.py`; (c) negative cache poisoning a transient failure →
  cache-invalidation runbook (no code).
- [x] Record findings in this section (edit the diagnosis above) so the fix step is against verified
  behaviour.

### 44.2 — Fix per 44.1 findings (openst, then release)

- [x] Implement the minimal fix in `openst` (plugin scraper or `openbb_client.py`), unit tests with
  captured fixtures in `openst/tests/fixtures/` per openst
  `CLAUDE.md`; full openst compose suite green; standalone `docker compose up -d` + curl smoke for
  `NNEP65.TFI` (and one other §38.3 fund, e.g. `INGOBL.TFI`, as regression) showing a non-null
  `last_price` and a cache HIT on second call.
- [x] If a negative cache poisoned the key: restart/flush path (document the command used) —
  config/ops only, no code; verify the quote 200s afterwards.
- [x] Release openst (GHA → pin in homelab helmrelease → Flux) and verify in-cluster:
  `cachest /equity/quote/NNEP65.TFI` 200 with a real price.
- [x] Verify SPA: the NN/ING fund positions in the affected portfolios show a current price on the
  next read (self-heal, no DB change).
- [x] Commit each step separately (openst fix / release pin / verification notes).


Result (2026-09-21): 44.1 findings — the biznesradar page IS live with a real
`pr_t_close` (19.75) and `scrape_quote("NNEP65.TFI")` returns it correctly in
isolation; the 502/404 was openst Redis **negative-cache poisoning**
(`equity_quote:NNEP65.TFI = __openst_null__`, 6 h TTL, db 2) from a transient
first-scrape failure before the 2026-09-20 openst deploy. Fix applied: flushed
the 8 poisoned NNEP65 keys from the cachest pod — quote now 200s with
`last_price: 19.75`. No code change (§44.2 step 1 skipped by design decision).
Runbook: `redis-cli` (via any pfire pod with redis-py, db 2,
`REDIS_PASSWORD` from the openst deployment) `DEL equity_quote:<SYM> ...`.
Residual hardening (out of scope, open question): openst should not
negative-cache a symbol the biznesradar search tier still resolves — consider
skipping the negative sentinel when `get_search` finds the symbol.
---

## 45. TFI fund overview page: wrong quote currency (USD) + 11-year OHLCV 502 (INGAKC.TFI, 2026-09-21)

User report: `/en/research/INGAKC.TFI/overview` — `upstream 502 for
cachest:8080/ohlcv/INGAKC.TFI?start=2015-09-21&end=2026-09-21` and the current price shown in USD.
Follow-up to §42–44 (same portfolios, the §38.3
`.TFI` fund renames are now live).

Diagnosis (probed in-cluster via the cachest pod, 2026-09-21):

**Problem A — currency USD.** `.TFI` fund prices come from the biznesradar plugin, whose
quote/profile rows carry **no `currency` field** (the model omits it; `scrape_quote` returns only
symbol/name/prices — verified locally and via `cachest /equity/quote/INGAKC.TFI`:
`last_price 812.36`, no currency).
`toQuote` (`portfoliost-instruments/src/adapters/translate.ts:208`) and
`toInstrumentProfile` (`:150`, `:144`) then default to `"USD"`. The wallets quotes pass
unconditionally overwrites `instrument_currency`
(`quotes.ts` profile block: `if (profile.instrumentCurrency !== null)
profileUpdate.instrumentCurrency = ...`) — so a reimport (with PLN from the sheet) gets clobbered to
USD on the first quotes pass. DB confirms: 2 of 6
`.TFI` positions show `USD` (INGAKC.TFI, NNEP65.TFI); the other 4 are PLN only because their quote
never landed yet. The biznesradar page itself declares
`<meta itemprop="priceCurrency" content="PLN">` (verified in the HTML) — PLN is the true price
currency for every Polish fund page.

**Problem B — 11-year OHLCV 502.** The overview history request spans
`start=2015-09-21`. For `.TFI` symbols openst serves the history via the biznesradar **multi-page
scraper**
(`plugins/openbb_biznesradar/.../equity_historical.py`): ~253 monthly pages for 11 years ×
`BIZNESRADAR_FETCH_DELAY_S=2.0` s/page → measured **76.9 s**
for 2020→2026 (2015→2026 ≈ 110 s). The 502 is the **nginx ingress**
(`proxy-read-timeout` unset → 60 s default) cutting the connection, not the SPA — so "make the UI
wait patiently" alone cannot work (the hop in front of the SPA dies first), and it is **not a
one-time cost**: cachest only caches after a successful fetch, so the first request after every
6 h TTL expiry pays the full scrape and 502s. The `2015` start also pre-dates the fund's first NAV
for many `.TFI` tickers — pure wasted pages.

Extra fact (probed 2026-09-21): `instruments.price_bars` already holds `.TFI` overflow bars from
the passive write-through — 1399 rows, 2021-02-17 → 2026-09-17, source `openst` — so the SPA
chart path (`/price-bars`) already serves funds instantly; only the research overview's `/history`
leg hits the slow scrape.

Decisions (2026-09-21, user): A — do the **nullable-contract follow-up**
(unknown currency must never be silently guessed); B — first load must be **fast**
(openst clamp to first NAV) plus a **graceful UI** (render price_bars immediately, full history in
the background — never a blank 110 s spinner).

Step order: 45.1 (openst scraper, standalone) → 45.2 (contracts cycle, per AGENTS.md
workflow: spec → publish → consumer bumps) → 45.3 (instruments null-default, needs 45.2 types)
→ 45.4 (releases A) → 45.5/45.6 (Problem B, independent) → 45.7 (release B).

---

### 45.1 — Problem A (openst): biznesradar quote+profile carry the page's currency

- [ ] `openst/plugins/openbb_biznesradar/openbb_biznesradar/scraper.py`: read
  `<meta itemprop="priceCurrency" content="...">` from the `/notowania/{symbol}`
  page (one shared parse helper; the profile probe already fetches the same page — `probe_notowania`
  should return the currency too, or add
  `scrape_currency(symbol)`); `scrape_quote` adds `currency` to its dict when the meta tag is
  present (missing tag → key omitted, not `None`, so the model stays backwards-compatible).
- [ ] `models/equity_quote.py`: document the new optional key. `models/equity_profile.py`:
  `EquityInfoData` has no `currency` field — verify how the corp_bond profile already emits
  `currency: "PLN"` (test_corp_bond_profile.py:169) and mirror that mechanism for funds.
- [ ] Capture fixture: save the INGAKC.TFI `/notowania` HTML to
  `openst/plugins/openbb_biznesradar/tests/fixtures/` (single request, manual); unit tests: currency
  parsed from the meta tag; quote dict includes `PLN`; missing tag → no key. Full openst compose
  suite green.
- [ ] Standalone smoke: `docker compose up -d`, `curl /equity/quote/INGAKC.TFI`
  → `"currency": "PLN"`; second call is a cache HIT.
- [ ] Commit.

### 45.2 — Problem A: nullable `currency` in the shared contract (user decision: do the follow-up)

The contract `Quote.currency` (and the profile/instrument currency fields — enumerate all
affected schemas in `openapi.yaml` before editing, incl. `InstrumentProfile`, `Quote`, and the
position/price schemas that carry a price currency) is a required `string`, which forces the
`?? "USD"` guess. User decision (2026-09-21): make them nullable so an unknown currency can never
be silently guessed (100× off semantics, the §39 pence precedent).

- [ ] `portfoliost-contracts/contracts/openapi.yaml`: `currency` → nullable
  (`nullable: true` / `oneOf [string, null]` per the file's existing conventions) for the quote /
  profile currency fields (keep `PriceHistory.currency` and FX/registry currencies as-is unless
  they hit the same guess path — decide per schema and note why). Update the §`currency` doc
  comments ("USD when unknown" at line ~842 becomes "null when unknown").
- [ ] Push `main` → CI auto-bumps the patch version + publishes `@marx2/contracts@<new>`
  (never hand-edit package.json).
- [ ] Consumers: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` +
  `npm run gen:types` in `portfoliost-instruments` (has gen:types) and `portfoliost` (SPA has
  gen:types per AGENTS.md; check `portfoliost-wallets` too) — commit `package-lock.json` +
  `generated/api-types.d.ts` per repo (code changes that adapt to the nullable type are 45.3 /
  the release step, not this one).
- [ ] Tests: `npm test` in `portfoliost-contracts/contracts` green.
- [ ] Commit per repo (contracts push is its own CI cycle).

### 45.3 — Problem A (instruments): drop the `USD` guess now that the contract is nullable

Precondition: 45.2's regenerated types are installed in `portfoliost-instruments`.

- [ ] `portfoliost-instruments/src/adapters/translate.ts`: `toQuote` — `currency` →
  `toIsoCurrency(str(q.currency)) ?? null` (no `"USD"` guess); `toInstrumentProfile` —
  `currency ?? (isBond ? "PLN" : null)`. Verify every other `toXxx` that copies a currency field
  compiles against the nullable contract type.
- [ ] Tests: `translate.test.ts` — currency-less row → `currency: null` (quote + profile
  non-bond), bond → `PLN`, PLN row (the 45.1 shape) passes through, GBp/USD regressions unchanged.
  Full instruments suite green.
- [ ] Wallets: `fetchProfile` already skips null (`isIsoCurrency`) → no code change expected;
  verify it compiles against the regenerated types and that a null-currency profile keeps the
  stored `instrument_currency` (add a `quotes.test.ts` case if the path is contract-typed).
- [ ] SPA: any component reading `quote.currency`/profile currency must tolerate null (display
  fallback); vue-tsc catches the rest; `npm run build && npm run test && npm run test:mock` green.
- [ ] Commit.

### 45.4 — Release A (openst → instruments) + verify currency end-to-end

- [ ] Release openst (GHA → pin homelab helmrelease → Flux), verify in-cluster:
  `cachest /equity/quote/INGAKC.TFI` carries `currency: PLN`.
- [ ] Release portfoliost-instruments (GHA → pin → Flux).
- [ ] Verify: the INGAKC.TFI overview shows PLN; after one SPA read the DB shows
  `instrument_currency = PLN` for all 6 `.TFI` positions (the quotes pass overwrites from the
  now-PLN profile); FX to the portfolio base currency then values them correctly (812.36 PLN, not
  USD).
- [ ] Commit (homelab pins).

---

### 45.5 — Problem B: fast first-load (openst clamp to first NAV)

Why not "just wait patiently": the nginx ingress (60 s `proxy-read-timeout`, unset → default)
kills the request at 60 s regardless of the UI, and the slow path recurs on every 6 h cachest TTL
expiry (first request after each expiry), not once. So make the request short:

- [ ] `openst/plugins/openbb_biznesradar/openbb_biznesradar/`: add a
  `first_nav_month(symbol)` probe — fetch the **oldest** page of
  `/notowania-historyczne/{symbol}` (pagination is newest-first: the last page, or a binary search
  over the page index with the `exhausted` row check) → the fund's oldest NAV date. Cache it in
  openst's Redis (long TTL — fund inception never changes; key
  `fund_first_nav:<symbol>`). One extra page per fund lifetime, not per request.
- [ ] `openst/src/main.py` `/price/ohlcv/{ticker}` handler: for `_is_fund(ticker)` symbols,
  clamp `start = max(start, first_nav)` when the probe resolves (probe failure → keep the
  requested start, never block the request); log the clamp.
- [ ] Optionally pair with a lower politeness delay for funds in
  `equity_historical.py` (e.g. 0.2 s) so 11 y of real NAVs (INGAKC ~2016: ≈ 66 months ≈ 13 s) sits
  comfortably under the 60 s ingress cap with margin.
- [ ] Unit tests with a captured oldest-page fixture (openst): clamp applied, probe-miss keeps
  original start, non-fund tickers untouched; full openst compose suite green.
- [ ] Standalone smoke: `docker compose up -d`, `curl /price/ohlcv/INGAKC.TFI?start=2015-09-21&end=
  2026-09-21` → 200 in <30 s (previously ~110 s / 502); repeat = cache HIT.
- [ ] Commit.

### 45.6 — Problem B: graceful UI (price-bars now, full history in background)

- [ ] `portfoliost` research overview (the view calling `getHistory`, `src/api/instruments.ts:76`):
  on load, render the price chart from the **existing** `/price-bars` series immediately (already
  fetched/cached for TFI — 2021→2026 in `price_bars`), mark it as "partial, full history loading…"
  when the overview requests a wider range; the `/history` result replaces it in place on success.
- [ ] On `/history` failure (502/timeout): keep the price-bars chart, show a dismissible
  "full history unavailable — retry" notice (no blank canvas, no blocking spinner).
- [ ] E2E: research overview for a `.TFI` symbol renders a chart before the `/history` response
  resolves (assert canvas + loading flag, then final state); `npm run test:e2e` green.
- [ ] Commit.

### 45.7 — Release B + closeout

- [ ] Release openst (pin homelab) + portfoliost (normal SPA deploy), verify in-cluster:
  `cachest /ohlcv/INGAKC.TFI?start=2015-09-21…` → 200 < 30 s, and the SPA overview chart renders
  immediately with no 502 in the instruments logs.
- [ ] Re-check the 6 h-expiry case conceptually (first request after TTL pays the clamped, now
  short, scrape) — note in closeout.
- [ ] Commit (homelab pins).

---

Decisions (2026-09-21, user): A → do the nullable-contract follow-up (45.2); B → fast first-load
(45.5) + graceful UI (45.6), because "make the UI wait patiently" alone is impossible (nginx 60 s
cap in front of the SPA) and the slow path recurs every 6 h cachest TTL expiry, not once.



---

## 46. Real `GET /api/portfolios/merged` in `portfoliost-wallets` (§41 follow-up 1, 2026-09-21)

User request: make the §41.5 combined (all-portfolios) chart appear in production. Today the SPA
calls `GET /api/portfolios/merged` (`src/api/portfolios.ts:137`), but `portfoliost-wallets` has no
such route → 500 → the block is hidden (graceful). Contract + mock already define the path; the
wallet route is the missing piece.

Design (decided 2026-09-21): **client-side currency conversion, unified with the single-portfolio
chart.** Both analytics endpoints return their series in a single source currency and the SPA
converts source → display with `getLatestRate`, so the two charts behave identically and differ only
in scope:
- `/:id/analytics` → series in the portfolio's `baseCurrency` (already so; SPA source
  `store.detail.currency`, `PortfolioPerformanceTab.vue:241`).
- `/merged` → series summed into **USD** (each portfolio converted via `@marx2/contracts/fx`), the
  currency the SPA already assumes as source (`store.totalMetrics.baseCurrency` in
  `InvestmentsView.vue`; `total-metrics` hardcodes `"USD"`, `portfolios.ts:303`). No contracts
  change, no SPA change — §41.5's client-side convert stays.

Client-side conversion is fast enough: one cached `getLatestRate` call + a map over the series (same
as the single-portfolio tab); the rate is a latest-rate approximation either way (neither client nor
server uses per-date historical rates here). The server-side conversion merged *does* need is the
cross-portfolio one (summing USD+PLN portfolios requires a common currency) — that is unavoidable
and stays in the service.

Scope decisions: `benchmarks: []` for v1; `cumulativeTwr/Mwr` and the scalar return fields left
`undefined`/`null` (the chart plots `value` only). Repos touched: portfoliost-wallets,
portfoliost (dev gateway + mock), homelab (deploy). **No contracts release.**

Key facts: `value_snapshots` (`src/db/schema.ts:391`) holds `value`/`invested` per portfolio in that
portfolio's `base_currency`; `convert(amount, from, to, rates)` + `latestRates(db)` are the existing
FX path (`@marx2/contracts/fx`, `src/services/valuation.ts`); per-portfolio shape built in
`routes/:id/analytics` (`src/routes/portfolios.ts:827`); `timeframeCutoff` at `portfolios.ts:134`;
backfill at `src/services/backfill.ts` (`getBackfillStatus:288`, `runBackfill`).

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit + docker-compose per
AGENTS.md).

---

### 46.1 — `portfoliost-wallets`: merged aggregation service (pure, unit-tested)

- [ ] New `src/services/mergedAnalytics.ts`: `sumSnapshotsByDate(rows, rates, target)` where `rows`
  = `{ baseCurrency, snapshotDate, value, invested }[]` — group by date, convert each row
  `baseCurrency → target` via `convert`, sum `value`/`invested`; **skip a row whose rate is
  unavailable** (never fabricate a 1:1 rate). Return `{ date, value, invested }[]` ascending.
- [ ] `buildMergedPerformance(series)` → `totalValue`/`totalInvested`/`totalReturn`/
  `totalReturnPercent` from the last point (mirror `/:id/analytics:892-895`); `monthlyReturns: []`,
  `timeWeightedReturn`/`moneyWeightedReturn`/`simpleReturnPercent` = `null`.
- [ ] Tests `src/services/mergedAnalytics.test.ts`: single portfolio == its own series (target = its
  own currency, no FX); USD+PLN sum at known rates; missing-rate row skipped; empty input → empty
  series / zeros.
- [ ] Tests: `npm run test` + `npm run lint` green.
- [ ] Commit.

### 46.2 — `portfoliost-wallets`: `GET /portfolios/merged` route

- [ ] `src/routes/portfolios.ts`: register `routes.get("/merged", …)` **above `routes.get("/:id")`
  (line 553)** (otherwise `merged` is parsed as a portfolio id), modelled on `/:id/analytics`.
- [ ] Resolve `timeframe` (`c.req.query("timeframe") || "ALL"`); `latestRates(db)`; select the user's
  portfolios + their `value_snapshots` filtered by `timeframeCutoff(timeframe)`; call 46.1 with
  `target = "USD"` (must stay equal to `total-metrics.baseCurrency`).
- [ ] `backfillStatus`: if **any** of the user's portfolios has `< 2` snapshots → fire `runBackfill`
  per incomplete portfolio (fire-and-forget, mirroring `/:id/analytics:852-863`) and return the
  pending shape; else `complete` with the summed series. `benchmarks: []`.
- [ ] Tests `src/routes/portfolios.test.ts`: two seeded portfolios (USD + PLN) → last point equals
  the FX-converted sum in USD; `GET /portfolios/merged` is not captured by `/:id`; pending path
  returns `backfillStatus:"pending"` and triggers backfill.
- [ ] Tests: `npm run test` green; compose smoke — `curl` through the gateway
  `/api/portfolios/merged?timeframe=ALL` returns the domain-shaped body (200).
- [ ] Commit.

### 46.3 — SPA: keep §41.5 client-side conversion (no code change expected)

- [ ] Confirm `InvestmentsView.vue` (`mergedSourceCcy` = `store.totalMetrics.baseCurrency`) matches
  the 46.2 response currency; add a unit assertion in
  `tests/unit/modules/portfolios/InvestmentsView.test.ts` that the merged series is converted from
  `totalMetrics.baseCurrency` → display currency (guards future drift).
- [ ] Tests: `npm run build` + `npm run test` green.
- [ ] Commit (test only; if nothing changes, fold the verification note into 46.6).

### 46.4 — portfoliost dev stack: route merged back to wallets + mock parity

- [ ] `gateway/default.conf.template`: drop the §41.5 `location /api/portfolios/merged →
  ${API_BACKEND_URL}` special-case so merged flows to `${API_PORTFOLIOS_URL}` (wallets, now real).
- [ ] `mocks/portfolios/index.js`: keep `/portfolios/merged` returning the fixture **in USD** (the
  single seeded portfolio is USD, so `merged == its series` stays valid); keep the `/merged/light`
  passthrough.
- [ ] Tests: `npm run test:mock` green; `docker compose up -d --build wallets portfoliost gateway` +
  `npm run test:e2e` green (combined-chart + chart-recompute + chart-currency) against real wallets.
- [ ] Commit.

### 46.5 — Release + deploy `portfoliost-wallets` (homelab)

- [ ] Push wallets `main` → GHA tags `vX.Y.Z` and pushes `ghcr.io/marx2/portfoliost-wallets:vX.Y.Z`;
  verify with `gh run list` / `gh release list`.
- [ ] Bump the pinned tag in `homelab` `cluster/apps/pfire/portfoliost-wallets/app/helmrelease.yaml`
  (**both** occurrences — app Deployment and the `fxsync` CronJob), rebase on `origin/main`, push.
- [ ] Verify: `kubectl -n pfire rollout status deploy/portfoliost-wallets`; production
  `GET /api/portfolios/merged?timeframe=ALL` returns 200 (authed Pocket-ID session) and the SPA
  `/en/investments` shows the combined chart.
- [ ] Commit (homelab repo, separate).

### 46.6 — Closeout

- [ ] `docs/plan.md`: mark §41 follow-up 1 done; record the base-currency coupling and `/merged/light`
  as open items (below); archive §41 + §46 to `plan-archive.md`/`plan-archive2.md`; update the §41.6
  residual-gap note (block now renders in production).
- [ ] Commit.

---

Open items (from the 2026-09-21 design review):

1. **Base currency is hardcoded USD** on both `/merged` (46.2) and `/total-metrics`
   (`portfolios.ts:303`). If the base moves to a user preference (`preferredBaseCurrency`), the two
   must change in the same commit **and** `/total-metrics` must gain per-portfolio FX conversion for
   its `totalValue` (it currently sums raw values) — otherwise the SPA's assumed source currency and
   the header total both drift. Deferred; do them together.
2. **`/merged/light`**: defined in the contract (`openapi.yaml:3034`) but has no consumer (no SPA
   call, no wallets route; mock passthrough only). Left as-is until a consumer appears; a real
   implementation would be speculative.
3. **Server-side `displayCurrency`** (example-service-style, §41 follow-up 2) was **not** adopted — both
   analytics endpoints stay client-side converted (fast enough: one cached rate call + a series map).
   Revisit only if per-date historical FX is needed, which would require server-side conversion.

