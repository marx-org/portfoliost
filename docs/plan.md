# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## Topology — cinematic observability experience

<!-- §27 moved to plan-archive.md (closeout 2026-09-19) -->

- [x] **One implementation step:** create an original, motion-rich Portfoliost topology experience (atmospheric canvas, luminous directional traffic, polished controls/nodes/inspector, focus mode, and accessible motion controls). Preserve graph interaction, filtering, layouts, and API contracts.
  - First gate: browser tests prove animated effects run, pause/reduced-motion stops them, and node inspection still works before expanding the visual treatment.
  - Final gate: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build`, `npm run test:e2e`; desktop/mobile browser review. Mark complete and commit only on passing full validation.
  - This is original Portfoliost functionality, not a Example service parity page.
  - Result (2026-09-17): implemented — `mission-control.css` atmosphere (drifting aurora layers, grid, scan, grain, particles), luminous dual-layer flow edges (trail + particle) with corrected source→target direction, per-area accent styling across toolbar/nodes/lanes, redesigned dark explorer stage, focus mode (Esc exits), Pause effects + reduced-motion hard stop, telemetry status strip, empty-state recovery. Validation: `npm run build`, 272 unit, 186 mock, topology e2e 13/13 (3 new tests), dockerized stack rebuilt, mobile/focus/dark browser review, zero console errors. Known pre-existing failure outside this step: `auth.spec.ts` "login page hides form" — compose deliberately sets `VITE_PASSWORD_LOGIN_ENABLED=true` (introduced for D73–D79 mock login) while the test still expects the OIDC-only UI from c9a0a81; fails identically with this work stashed (baseline verified). Needs a product/test-strategy decision, tracked separately.

### Topology follow-up — themes, glow, deployed jobs

- [x] Restore a complete light palette and global light/dark/system controls; add icon glow and state-colored dot pulses. Validation: build, 279 unit (incl. new StatusDot pulse tests), 186 mock, motion gate, 15/15 topology E2E incl. real canvas/node/inspector colors, system-theme reactivity, glow pause/reduced-motion, mobile inspection. Fixed `theme.ts` system-listener bug. Fixed `auth.spec.ts` OIDC-only test to override `passwordLoginEnabled` before boot (compose keeps password login for other flows) — that blocker is resolved.
- [x] Add verified missing OpenST jobs and providers to the graph: Bond Import `30 4 * * *`, Bond Archive `0 6 3 * *`, CPI Import `30 4 * * *`, CPI Seed `0 5 1 1 *` (suspended) as job nodes with edges into openst and schedule metadata in the inspector; OpenBB plugins `biznesradar` (Polish TFI funds / Catalyst bonds, quotes/history/profile/search) and `obligacje` (retail savings-bond pricing from issue parameters + CPI) as provider leaves. Enabling the expansion surfaced two real defects, both fixed with tests: dagre could emit negative lane origins which the drag clamp treated as out of bounds (layout now normalizes into LANE_BOUNDS; unit test added), and resizing the canvas kept a stale viewport transform on small screens (ResizeObserver refit; min-zoom lowered). Draggable-lane, re-layout, persistence, mobile-inspection tests all pass.
- [x] Traffic metrics hidden for cachest/openst: the inspector rendered the Traffic section only for `area === "internal"`, but both are probed live services in `data-providers`. Verified live via `kubectl` port-forward to Prometheus (series exist for all six services under `job`/`service_name`) and the admin `/topology/traffic` mapping (every `serviceTargets()` entry is serialized). Gate removed; new `TopologyDetailsPanel` unit test locks Traffic + cachest per-upstream P99 visibility for data-provider nodes.
- [x] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" failed because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picked the unadjusted one. Fixed read-only in `portfoliost-instruments@0c03214`: the price-bars query orders `stooq` rows ahead of `openst` overflow rows on equal dates (deterministic stooq-first; unit test added), so the split-adjusted value wins. The duplicate rows themselves remain in the view (the importer needs them) — data-level dedup stays an optional product/data decision in that repo. Verified 2026-09-20: `tests/e2e/price-bars.spec.ts` 3/3 against the compose stack.
  - Sources: homelab-deploy skill, `~/prv/homelab/homelab`, live read-only Kubernetes queries using `~/.kube/homylab` (2026-09-17). Wallets FX Sync and Instruments Ticker Sync confirmed; OpenST bond-import, bond-archive, cpi-import, and suspended cpi-seed were missing from the map.
  - Read-only cluster result: wallets fxsync `10 17 * * *`; instruments tickersync `30 4 * * 1`; OpenST bond-import and cpi-import `30 4 * * *`, bond-archive `0 6 3 * *`, cpi-seed `0 5 1 1 *` (suspended). All use controller timezone. No deployments were modified.
  - Baseline blockers: auth expected hidden password form although compose enables it; its OIDC-only test now explicitly overrides runtime configuration before application boot (no production change). Combined auth/topology E2E passes 16/16. AAPL price-bars remains failing: read-only SQL confirms both `openst` and split-adjusted `stooq` rows for July 29/30 in `price_bars_all`; expectations and seeds unchanged. Tracked as the remaining item above.




<!-- §34 moved to plan-archive.md (closeout 2026-09-20) -->

## 36. Currency correctness — dividends, top performers, price charts

Reported: (a) the Dividends tab shows USD for SNT.WA (a PLN instrument), (b) Top
Performers renders unrealized P/L with a USD sign for VRC.WA, (c) price charts
always display USD, and cross-currency comparisons (PLN stock vs USD benchmark)
are misleading.

Root causes (verified in code):

- **Instruments `toPriceHistory` hardcodes `currency: "USD"`** (`src/adapters/translate.ts`),
  so `GET /instruments/:symbol/history` lies about the series currency for every
  non-US instrument. `PriceChart.vue` then calls `formatCurrency(value)` with the
  default USD (line ~420) and never reads `h.currency` at all.
- **`/price-bars` returns `currency: null`** (`src/services/price-bars.ts` line ~326)
  even though `ticker_reference.country_code` is available; any consumer falls
  back to USD.
- **Instruments `/dividends` calls `toDividends(rows)` with the "USD" fallback**
  (route line ~791); the same handler already fetches the profile (which carries
  the real `currency`, resolved via tickerref `country_code` in the no-price
  path) but discards it → SNT.WA dividends show USD.
- **Top/Bottom Performers** (`PortfolioPerformanceTab.vue`) calls
  `formatSignedCurrency(p.unrealizedGainLoss)` with no currency — always USD —
  while the value is denominated in the position's `instrumentCurrency`
  (`(price - avg) * qty` in the instrument's native currency; the Holdings tab
  already renders this with `DualCurrencyPnlCell`).
- **Cross-currency chart comparison**: `PriceChart` overlays raw benchmark close
  prices on the instrument's native-currency axis in Price mode, so a PLN stock
  vs SPY is a meaningless juxtaposition. There is no FX recalculation involved —
  the only correct generic overlay across currencies is percent-normalized.

Repos touched: `portfoliost-instruments`, `portfoliost-contracts` (price-bars
`currency` field), `portfoliost` (SPA + mocks). No provider-tier (openst/cachest)
work: the currency facts (profile currency, tickerref country) already exist
upstream. FX conversion math must go through `@marx2/contracts/fx` (D27) if we
add converted values.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level).

---

### 36.1 — Instruments: correct `currency` on `/history` and `/price-bars`

- [ ] `portfoliost-contracts`: `contracts/openapi.yaml` — `PriceBarSeries.currency`
  `z.string().nullable()` → `type: string` (it becomes authoritative, resolved
  server-side). Push to `main`, wait for the CI patch bump, install
  `@marx2/contracts@<new>` in `portfoliost-instruments` and `portfoliost`
  (`NODE_AUTH_TOKEN=$(gh auth token) npm install ...`), run `npm run gen:types` in
  `portfoliost`, commit the lockfile + `generated/api-types.d.ts`.
- [ ] `portfoliost-instruments`: resolve the instrument currency once
  (profile `currency`, degrading to `ticker_reference.country_code` → ISO-4217
  map, then `"USD"`) and pass it through:
  - `toPriceHistory` takes a `currency` parameter (drop the hardcoded `"USD"`);
  - `GET /:symbol/history` passes it; bond/crypto fallback paths keep working
    (crypto → quote-pair currency, bonds → PLN);
  - `price-bars.ts` fills `currency` instead of `null` (tickerref lookup).
- [ ] Mocks (`portfoliost`): `mocks/instruments/index.js` `historyFor` serves one
  shared `history_daily.json` fixture (hardcoded `currency: "USD"`) for every
  symbol — set `h.currency` from `research.basics.currency` when the symbol has
  a research file (default `"USD"`). Same for the compare overlay (currency is
  the instrument's, per the real endpoint shape). Regenerate seeds if touched.
- [ ] Tests: `translate.test.ts` / `price-bars.test.ts` unit tests — non-USD
  symbol (e.g. SNT.WA → PLN, BTC-USD → USD) yields the right currency on both
  routes. Instruments repo suite green. Compose stack smoke: `curl` through
  cachest-gateway `/api/instruments/SNT.WA/history?resolution=daily` and
  `/price-bars?from=&to=` show `"currency":"PLN"`. `npm run test:stack` green.
- [ ] Commit.

### 36.2 — Instruments: dividends in the instrument's real currency

- [ ] `portfoliost-instruments` `GET /:symbol/dividends` route: pass the
  profile-resolved currency into `toDividends(rows, currency)` instead of the
  default `"USD"` (the route already fetches the profile for the calendar
  sibling; reuse it). Row-level `currency` from upstream still wins when
  present.
- [ ] Mocks: `mocks/portfolios/index.js` portfolio-dividends fallback is already
  `d.currency || p.instrumentCurrency` — keep. Ensure at least one research
  fixture carries non-USD dividend rows (add PLN rows to a `*.WA`-style
  research JSON or point a WSE test symbol at one) so the mock path is covered.
- [ ] Tests: instruments unit test — `toDividends` fallback currency flows into
  rows lacking `currency`; route test asserts SNT.WA-style symbol returns PLN.
  Mock suite (`mocks/tests/run.mjs`) dividend checks still pass.
- [ ] Compose smoke: `/api/instruments/SNT.WA/dividends` history rows carry
  `"currency":"PLN"`.
- [ ] Commit.

### 36.3 — PriceChart: real currency + honest cross-currency comparison

- [ ] `PriceChart.vue`: track `chartCurrency` from `h.currency` (fallback
  instrument `instrumentCurrency` when the chart is embedded in a holdings
  context, else `USD`) and use it in the Price-mode tooltip/axis
  (`formatCurrency(value, chartCurrency)`). No conversion — the axis shows the
  series' native currency.
- [ ] Cross-currency compare: when the benchmark currency (SPY/QQQ/IWM → USD;
  resolve once via quote/profile, cache per session) differs from `chartCurrency`
  and mode is `Price`, auto-switch the overlay to percent-normalized data (both
  series re-based to 100/0%) with a small caption "Percent — currencies differ
  (PLN vs USD)"; keep raw-price overlay only when currencies match.
  No FX amounts are shown, so `@marx2/contracts/fx` is not invoked.
- [ ] Tests: unit test the percent-normalization + currency-mismatch decision
  (new pure helper `compareSeries.ts` in `src/utils/` or colocated);
  `vue-tsc`/build green; Playwright e2e: open the chart for a PLN-seeded
  position, assert the tooltip currency is PLN and the benchmark overlay is
  percent-normalized with the caption.
- [ ] Commit.

### 36.4 — Top/Bottom Performers: P/L in the instrument's currency

- [ ] `PortfolioPerformanceTab.vue`: render P/L with the position's
  `instrumentCurrency` — `formatSignedCurrency(p.unrealizedGainLoss,
  p.instrumentCurrency)` — matching the Holdings tab's primary line (native
  currency, no silent FX). Optionally add the converted sub-line via
  `getLatestRate(instrumentCurrency → displayCurrency)` +
  `@marx2/contracts/fx convert` behind `v-if` when the pair resolves.
- [ ] Mocks: seed one non-USD position in the demo portfolio
  (`mocks/shared/data/raw/portfolio_positions.json` + matching transactions,
  e.g. VRC.WA, instrumentCurrency PLN, current price in PLN) so the mock path
  is verifiable; `npm run mock:seed` if seeds derive from raw.
- [ ] Tests: unit test for the currency argument; e2e `portfolios.spec.ts`
  asserts the Top Performers P/L cell for the PLN position shows `PLN` (and the
  converted sub-line when present). `npm run build`, `npm run test`,
  `npm run test:mock` green; docker compose rebuild + `npm run test:e2e` green.
- [ ] Commit.

### 36.5 — Closeout

- [ ] Playwright side-by-side sanity on all three surfaces (dividends tab, top
  performers, charts incl. compare) vs seeded PLN/USD positions.
- [ ] Archive §36 to `plan-archive.md`.

---

Open questions (answer during 36.1, do not block the plan):

- Q1: Does the deployed cluster show the *instruments* dividends or the mock
  ones? Both fixed here; if `wallets` ever implements
  `GET /:id/dividends` (currently a stub returning empty) it must use the same
  profile-currency rule.
- Q2: Cross-currency comparison — percent-normalization is the example-service-style
  behavior and needs no FX data; if a true FX-converted overlay is wanted it is
  separate work (requires daily historical rates, not just latest) and would be
  a new proposal.
