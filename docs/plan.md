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

- [ ] `src/components/PortfolioPerformanceChart.vue`: plot raw `value` (absolute) — remove the index
  normalisation and the `returnType` prop (example-service's cumulative columns are % stats, not the line).
- [ ] New props: `currency?: string` (default `"USD"`) for axis/tooltip formatting;
  `color?: string` (default `#16a34a` — example-service performance green with gradient area; the combined
  page passes `#2563eb` blue).
- [ ] yaxis `labels.formatter` = compact currency (reuse `formatCompact` + currency symbol/code,
  e.g. `$20k`); tooltip y = full `formatCurrency(v, currency)` — applies to the portfolio line AND
  the benchmark series (example-service formats the benchmark's index value as currency too).
- [ ] Benchmark overlay kept as today: raw values on the same axis, grey dashed, legend.
- [ ] Recompute button kept (emits `recompute`; parent decides the scope); `backfillPending`
  line and loading overlay kept; empty state kept.
- [ ] Tests: rewrite `tests/unit/components/PortfolioPerformanceChart.test.ts` — absolute plot of
  `value` (no normalisation); yaxis formatter carries the currency; benchmark overlay on the same
  axis; recompute still emits; pending line still conditional; `returnType` prop removed.
- [ ] Tests: `npm run test` green.
- [ ] Commit.

### 41.2 — Performance tab: display-currency conversion, drop the return-type selector

- [ ] `src/modules/portfolios/PortfolioPerformanceTab.vue`: convert
  `performance.timeSeries[].value` from portfolio currency to the display currency before passing to
  the chart (`getLatestRate` once per distinct source currency — the existing `rateByCcy`
  pattern); pass `:currency="displayCurrency"`. Same-currency → rate 1, no request.
- [ ] Customize dialog: remove the Return Type block (the line no longer depends on TWR/MWR/Simple);
  keep the benchmarks section. Store `analyticsReturnType`/`setReturnType` and the
  `benchmarkCalcType` API param stay as-is for now (dead in UI, harmless) — noted as follow-up
  cleanup.
- [ ] Tests: `tests/e2e/chart-recompute.spec.ts` asserts visibility + pending line only (no index
  values) — expect no change; `npm run test:e2e` green (docker compose).
- [ ] Commit.

### 41.3 — Contracts + API client: merged mirrors single-portfolio analytics

- [ ] `portfoliost-contracts/contracts/openapi.yaml`: add optional `timeframe` query param (string,
  default `ALL`) to `GET /portfolios/merged` (mirroring `/:id/analytics`);
  `npm run gen:types` + `npm test`/`npm run lint` in the contracts package; rebuild/publish the
  `@marx2/contracts` artifact the SPA consumes, regenerate `generated/api-types.d.ts`.
- [ ] `src/api/portfolios.ts`: `getMergedAnalytics(timeframe: PortfolioAnalyticsTimeframe = "ALL")`
  → `http.get(`/api/portfolios/merged?timeframe=${timeframe}`)`.
- [ ] Verified by `npm run build` (vue-tsc) — thin wrapper, no dedicated unit test.
- [ ] Commit.

### 41.4 — Mock:
`/api/portfolios/merged` serves the same per-timeframe fixture as a single portfolio

- [ ] `mocks/portfolios/index.js`: replace the `loadRaw("merged_portfolios.json")` (`[]`)
  passthrough — serve the same `ANALYTICS_BY_TIMEFRAME[timeframe]` fixture + benchmark merge logic
  as `/:id/analytics` (simplification per user: no cross-portfolio summation; exactly one seeded
  portfolio carries analytics data, so merged == that series).
- [ ] `mocks/tests/run.mjs`: checks — `/api/portfolios/merged` 200 with non-empty
  `performance.timeSeries` for `timeframe=1Y` and `timeframe=ALL`; last point `value` is absolute
  scale (> 10 000, i.e. not an index around 100).
- [ ] Tests: `npm run test:mock` green.
- [ ] Commit.

### 41.5 — `InvestmentsView`: combined chart block (example-service position)

- [ ] `src/modules/portfolios/InvestmentsView.vue`: `merged` ref; fetch
  `getMergedAnalytics("ALL")` in the `onMounted` `Promise.all` — on failure `merged = null`
  (chart hidden, page unaffected).
- [ ] Convert the merged series to the display currency (source =
  `store.totalMetrics?.baseCurrency`); render the shared component inside a `card` section between
  the metrics grid and the "Investment Portfolios" section: blue (`color="#2563eb"`),
  `:currency="displayCurrency"`, `:loading="loading"`,
  `v-if="merged?.performance?.timeSeries?.length"`.
- [ ] Recompute button (kept in the component) → fire `recomputePortfolio` for every
  `store.portfolios` entry; local `backfillPending` flag shown until the next merged re-fetch
  succeeds (no merged-specific recompute endpoint exists).
- [ ] `data-testid="combined-chart"` wrapper; E2E `tests/e2e/combined-chart.spec.ts` — login →
  `/en/investments` → `[data-testid="combined-chart"] .apexcharts-canvas` visible.
- [ ] Tests: `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 41.6 — Full suite + visual parity vs example-service

- [ ] `npm run build && npm run test && npm run test:mock`; `docker compose up -d --build`;
  `npm run test:e2e` — all green.
- [ ] Playwright side-by-side vs `app.example-service.ai`: (a) `/en/investments` combined chart block
  (position, blue area, absolute display-currency axis); (b) performance page chart (green area,
  benchmark dashed overlay, currency tooltip) — screenshots, note residual gaps.
- [ ] Commit.

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

- [ ] Push `main` → GHA bumps `v*` → verify tag with
  `gh release list --repo Marx2/portfoliost-instruments` → pin in
  `~/prv/homelab/homelab/cluster/apps/pfire/portfoliost-instruments/app/helmrelease.yaml`
  → commit+push → Flux applies in ~1 min →
  `kubectl get pods -n pfire -l app.kubernetes.io/name=portfoliost-instruments`.
- [ ] Verify: open portfolio "IKE Beata" (or `GET /api/portfolios/92a5927d-.../positions`
  with a Pocket-ID session) — SP20.L, ETFSP500.WA, ETFBTCPL.WA now show `current_price`
  + `price_source = quote` + non-null `price_as_of` (quotes self-heal on read; NULL
    `price_as_of` always refetches, no DB touch needed).
- [ ] Confirm the previously-blank cards render prices in the SPA (Playwright snapshot).
- [ ] Commit (helmrelease pin is its own homelab commit; mark `[x]` + archive with §43/§44 closeout
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

- [ ] `portfoliost-sheets-sync/src/instrument-resolver.ts` `NAME_VENUE_OVERRIDES`: add
  - `"ishares core msci em imi ucits etf usd acc"` → `{ ticker: "EMIM.AS", assetType:
    "Stock", yahooSymbol: "EMIM.AS", country: "IE", countryCode: null, sector: null,
    industry: null }`
  - `"ishares automation & robotics ucits etf usd a"` → `{ ticker: "RBOE.AS",
    assetType: "Stock", yahooSymbol: "RBOE.AS", country: "LU", countryCode: null, ... }`
    Keyed by `nameFold()` of the exact Transakcje names — verify the folded keys against
    `src/tests/fixtures/podsumowanie.json` / Transakcje rows before writing (the override must match
    the sheet's name column, not the catalog's).
- [ ] Tests: `src/instrument-resolver.test.ts` — both names resolve to the `.AS`
  symbols with `matched: true` even when the catalog row carries a stale/empty Yahoo symbol (i.e.
  override beats the catalog); regression: unrelated names (e.g. the §38.3 TFI overrides) still
  resolve as before.
- [ ] Tests: `portfoliost-sheets-sync` full suite green.
- [ ] Commit.

### 43.2 — Release + wipe & reimport (⚠ production, needs user approval)

- [ ] Push `main` → GHA → pin new tag in the homelab `portfoliost-sheets-sync` HelmRelease (app +
  any cronjob copy) → Flux applies.
- [ ] **Ask user for approval, then** run Admin → Jobs → "Wipe & Reimport"
  (`POST /api/admin/jobs/sheets-sync/run {wipe:true}` on
  `https://portfoliost.k.homylab.com` with an authenticated Pocket-ID session).
- [ ] Verify DB: `portfolios.positions` for IKE Beata shows `symbol = EMIM.AS` /
  `RBOE.AS` (old `EMIM` / `RBOE.DE` rows gone after wipe), `instrument_currency = EUR`.
- [ ] Verify data path end-to-end: `cachest /ohlcv/EMIM.AS` + `/ohlcv/RBOE.AS` 200 (already probed)
  and the instruments `/:symbol/price-bars` + `/:symbol/history` routes return non-empty series
  (this also re-seeds `instruments.price_bars` background upsert for the new symbols — chart on the
  SPA gets data).
- [ ] Verify SPA: IKE Beata shows prices for all positions (with §42 deployed) and the price chart
  renders for EMIM.AS / RBOE.AS.
- [ ] Commit (homelab pin; DB verification is read-only, nothing to commit).

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

- [ ] Probe openst directly in-cluster: `GET /equity/quote/NNEP65.TFI` (and
  `/equity/quote/NNEP65` for comparison) with timing; capture openst logs (stern on
  `app.kubernetes.io/name=openst`) during the request — identify which providers were walked, what
  each returned, and whether the 404 is a negative-cache hit (`[not-found]`
  in cachest / negative sentinel in openst) or a live provider failure.
- [ ] Probe the biznesradar source the plugin scrapes (`/notowania/NNEP65TFI` after
  `strip_wa_suffix`-style clean — inspect `plugins/openbb_biznesradar/openbb_biznesradar/scraper.py`
  for how `.TFI` is handled in the URL) with curl; confirm whether the page exists and whether its
  `qTableFull` table still contains the expected cells.
- [ ] Determine the cause class: (a) scraper no longer parses the page / page moved → openst plugin
  fix; (b) symbol not on biznesradar, another provider must carry .TFI → provider-order/dispatch fix
  in `openst/src/openbb_client.py`; (c) negative cache poisoning a transient failure →
  cache-invalidation runbook (no code).
- [ ] Record findings in this section (edit the diagnosis above) so the fix step is against verified
  behaviour.

### 44.2 — Fix per 44.1 findings (openst, then release)

- [ ] Implement the minimal fix in `openst` (plugin scraper or `openbb_client.py`), unit tests with
  captured fixtures in `openst/tests/fixtures/` per openst
  `CLAUDE.md`; full openst compose suite green; standalone `docker compose up -d` + curl smoke for
  `NNEP65.TFI` (and one other §38.3 fund, e.g. `INGOBL.TFI`, as regression) showing a non-null
  `last_price` and a cache HIT on second call.
- [ ] If a negative cache poisoned the key: restart/flush path (document the command used) —
  config/ops only, no code; verify the quote 200s afterwards.
- [ ] Release openst (GHA → pin in homelab helmrelease → Flux) and verify in-cluster:
  `cachest /equity/quote/NNEP65.TFI` 200 with a real price.
- [ ] Verify SPA: the NN/ING fund positions in the affected portfolios show a current price on the
  next read (self-heal, no DB change).
- [ ] Commit each step separately (openst fix / release pin / verification notes).

---



---

