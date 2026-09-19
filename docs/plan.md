# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 25. D80 / D81 / D82 — Catalyst bond profiles, asset-class routing, contract patch

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
closes remaining open D-items: Catalyst corporate-bond profile metadata (D80), asset-class
routing in `price-bars` for `fund/crypto/bond/corp_bond` (D81), `InstrumentType` contract
widening + admin surface (D82).

D77 wired Catalyst OHLCV; D79 wired retail-savings-bond OHLCV. Independent of §23/§24.

Repos touched: `openst`, `cachest`, `portfoliost-instruments`, `portfoliost-admin`,
`@marx2/contracts`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 25.1 — HTML fixture capture: `obligacje.pl` bond detail + search pages

- [ ] `curl` `obligacje.pl/pl/obligacja/BST0327` → save to
      `openst/tests/fixtures/obligacje_bond_profile_BST0327.html`.
- [ ] `curl` `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych` (page 1) →
      save to `openst/tests/fixtures/obligacje_bond_catalogue_page1.html`.
- [ ] Record: CSS selectors for emitent, ISIN, market, nominal, coupon type, margin,
      maturity; pagination URL pattern; total bond count (≈936).
- [ ] Commit: `test(openst): fixture HTML for obligacje.pl bond profile + catalogue (D80)`.

### 25.2 — `CorporateBondProfileFetcher` in `openbb_biznesradar`

- [ ] `openst/plugins/openbb_biznesradar/fetchers/corp_bond_profile.py`: scrapes
      `obligacje.pl/pl/obligacja/{symbol}`; returns emitent, ISIN, market, nominal,
      coupon type, margin, maturity, `asset_type="corp_bond"`, `country="PL"`,
      `currency="PLN"`.
- [ ] `EquityInfoFetcher.__call__` dispatches on Catalyst pattern `[A-Z]{3}\d{4}(\.WA)?$`
      → new fetcher; all other symbols keep existing path.
- [ ] Unit tests against fixture; regression: existing profile tests unchanged.
- [ ] Full openst compose suite passes.
- [ ] Commit: `feat(openbb_biznesradar): CorporateBondProfileFetcher (D80)`.

### 25.3 — openst smoke + cachest route + corp-bond catalogue

- [ ] `docker compose up -d` openst; verify `/equity/profile/BST0327` →
      `asset_type=corp_bond`; regression `/equity/profile/NNEP25.TFI` unchanged.
- [ ] Add `OPENST_CORP_BOND_PROFILE` to `cachest/config.yaml` (TTL 24h);
      `test_real_config_has_corp_bond_profile_route`; full cachest suite passes.
- [ ] `openst/src/importers/corp_bond_catalogue.py`: scrapes all pages of
      `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych`; emits
      `tickerref-sync.ts` CSV format with `asset_type=corp_bond`. One-shot k8s Job;
      unit tests with `obligacje_bond_catalogue_page1.html` fixture.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(openst+cachest+instruments): D80 corp-bond profile + catalogue`.

### 25.4 — D81: asset-class routing in `price-bars`

- [ ] `portfoliost-instruments/src/services/price-bars.ts`: `getPriceBarSeries` accepts
      `assetType`; branches: `crypto` → `fetchCryptoOhlcv`; `bond` →
      `fetchBondOhlcv` (new, hits `OPENST_BOND_OHLCV`); `corp_bond`/`fund` → existing
      equity `fetchOhlcv`; `stock`/`etf` → unchanged stooq-overflow path.
- [ ] Add `fetchBondOhlcv` to `src/adapters/cachest.ts`.
- [ ] Route handler looks up `ticker_reference.asset_type`; falls back to `stock`.
- [ ] Unit tests: correct adapter per `assetType`; stooq skipped for crypto/bond/corp_bond.
- [ ] Compose stack smoke: ROD1033, BST0327.WA, BTC-USD price-bars end-to-end.
- [ ] `npm run test` + `npm run test:stack` pass.
- [ ] Commit: `feat(instruments): asset-class routing in price-bars — D81`.

### 25.5 — D82: contracts patch + admin surface

- [ ] `@marx2/contracts` `openapi.yaml`: add `fund | bond | corp_bond | crypto` to
      `InstrumentType`; patch bump; reinstall; `gen:types`.
- [ ] `src/adapters/translate.ts`: add `corp_bond → CORP_BOND`, `fund → FUND`
      (BOND and CRYPTO already at `translate.ts:289`).
- [ ] portfoliost-admin: read-only table for `openst.bond_series` (symbol, name,
      issue/maturity, rate_rule, margin; row count) and `openst.cpi_12m` (24 rows;
      staleness warning > 40 days).
- [ ] `npm run build` + `npm run test` + `npm run test:mock` pass.
- [ ] Commit: `feat(contracts+admin): InstrumentType widening + bond/CPI admin (D82)`.

## Topology — cinematic observability experience

- [x] **One implementation step:** create an original, motion-rich Portfoliost topology experience (atmospheric canvas, luminous directional traffic, polished controls/nodes/inspector, focus mode, and accessible motion controls). Preserve graph interaction, filtering, layouts, and API contracts.
  - First gate: browser tests prove animated effects run, pause/reduced-motion stops them, and node inspection still works before expanding the visual treatment.
  - Final gate: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build`, `npm run test:e2e`; desktop/mobile browser review. Mark complete and commit only on passing full validation.
  - This is original Portfoliost functionality, not a Example service parity page.
  - Result (2026-09-17): implemented — `mission-control.css` atmosphere (drifting aurora layers, grid, scan, grain, particles), luminous dual-layer flow edges (trail + particle) with corrected source→target direction, per-area accent styling across toolbar/nodes/lanes, redesigned dark explorer stage, focus mode (Esc exits), Pause effects + reduced-motion hard stop, telemetry status strip, empty-state recovery. Validation: `npm run build`, 272 unit, 186 mock, topology e2e 13/13 (3 new tests), dockerized stack rebuilt, mobile/focus/dark browser review, zero console errors. Known pre-existing failure outside this step: `auth.spec.ts` "login page hides form" — compose deliberately sets `VITE_PASSWORD_LOGIN_ENABLED=true` (introduced for D73–D79 mock login) while the test still expects the OIDC-only UI from c9a0a81; fails identically with this work stashed (baseline verified). Needs a product/test-strategy decision, tracked separately.

### Topology follow-up — themes, glow, deployed jobs

- [x] Restore a complete light palette and global light/dark/system controls; add icon glow and state-colored dot pulses. Validation: build, 279 unit (incl. new StatusDot pulse tests), 186 mock, motion gate, 15/15 topology E2E incl. real canvas/node/inspector colors, system-theme reactivity, glow pause/reduced-motion, mobile inspection. Fixed `theme.ts` system-listener bug. Fixed `auth.spec.ts` OIDC-only test to override `passwordLoginEnabled` before boot (compose keeps password login for other flows) — that blocker is resolved.
- [x] Add verified missing OpenST jobs and providers to the graph: Bond Import `30 4 * * *`, Bond Archive `0 6 3 * *`, CPI Import `30 4 * * *`, CPI Seed `0 5 1 1 *` (suspended) as job nodes with edges into openst and schedule metadata in the inspector; OpenBB plugins `biznesradar` (Polish TFI funds / Catalyst bonds, quotes/history/profile/search) and `obligacje` (retail savings-bond pricing from issue parameters + CPI) as provider leaves. Enabling the expansion surfaced two real defects, both fixed with tests: dagre could emit negative lane origins which the drag clamp treated as out of bounds (layout now normalizes into LANE_BOUNDS; unit test added), and resizing the canvas kept a stale viewport transform on small screens (ResizeObserver refit; min-zoom lowered). Draggable-lane, re-layout, persistence, mobile-inspection tests all pass.
- [x] Traffic metrics hidden for cachest/openst: the inspector rendered the Traffic section only for `area === "internal"`, but both are probed live services in `data-providers`. Verified live via `kubectl` port-forward to Prometheus (series exist for all six services under `job`/`service_name`) and the admin `/topology/traffic` mapping (every `serviceTargets()` entry is serialized). Gate removed; new `TopologyDetailsPanel` unit test locks Traffic + cachest per-upstream P99 visibility for data-provider nodes.
- [ ] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" fails because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picks the unadjusted one. Verified read-only via SQL. The view's source-priority/cleanup rules (price-data-architecture, "overflow kept free of rows covered by stooq") are not enforced for this overlap; needs a product/data decision in that repo. Not masked here.
  - Sources: homelab-deploy skill, `~/prv/homelab/homelab`, live read-only Kubernetes queries using `~/.kube/homylab` (2026-09-17). Wallets FX Sync and Instruments Ticker Sync confirmed; OpenST bond-import, bond-archive, cpi-import, and suspended cpi-seed were missing from the map.
  - Read-only cluster result: wallets fxsync `10 17 * * *`; instruments tickersync `30 4 * * 1`; OpenST bond-import and cpi-import `30 4 * * *`, bond-archive `0 6 3 * *`, cpi-seed `0 5 1 1 *` (suspended). All use controller timezone. No deployments were modified.
  - Baseline blockers: auth expected hidden password form although compose enables it; its OIDC-only test now explicitly overrides runtime configuration before application boot (no production change). Combined auth/topology E2E passes 16/16. AAPL price-bars remains failing: read-only SQL confirms both `openst` and split-adjusted `stooq` rows for July 29/30 in `price_bars_all`; expectations and seeds unchanged. Tracked as the remaining item above.

### 25.6 — Closeout D80/D81/D82

- [ ] Update `instruments-provider-module.md`: D80, D81, D82 done with date.
- [ ] Update `openst-coverage.md`: `CorporateBondProfileFetcher`; D81 routing table.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: D80/D81/D82 closeout`.

---
---

## 27. Force-recompute buttons on charts + reusable chart components

Investigation (2026-09-19) — after a full sheets re-import, some portfolios/wallets
show empty charts. Root causes: portfolio analytics (`value_snapshots`) are only
built by the lazy backfill triggered from `GET /api/portfolios/:id/analytics` when
the portfolio has fewer than 2 snapshot rows, and a portfolio whose recompute yields
an empty/small batch stays on `backfillStatus: complete` with `n < 2` — so every
visit re-enqueues a full recompute yet the chart never appears. The serialized
runner + 5-minute frontend poll window make the rest look empty for a while. Wallet
balance charts reconstruct from the ledger on every GET, so they only look empty
when the ledger nets to ≤0.

This section adds an explicit, user-triggered recompute: a **"Recompute" button on
every chart** that force-rebuilds the series, plus makes the two chart kinds
**reusable components** (`PortfolioPerformanceChart`, `WalletBalanceChart`) instead
of inline apexchart configs. No proposal file — derived from the investigation and
decided 2026-09-19.

Design:

- **Portfolios recompute via full replace.** A forced recompute runs
  `recalcPortfolioHistory` (delete + rebuild from BUY/SELL × price bars, backfill.ts:611)
  enqueued through the serialized `backfill-runner` — NOT `runBackfill` (upsert-only,
  leaves stale rows for days that no longer carry value). After the POST the backfill
  status is `pending`, which also stops the analytics endpoint's n<2 auto-trigger loop
  while it runs.
- **Wallets recompute = refetch.** `GET /api/wallets/:id/balance-history` already
  reconstructs the daily series from the ledger on every call; the wallet button just
  re-fetches (no new backend surface).
- **Endpoint:** `POST /api/portfolios/:id/recompute` → 404 if not owned,
  `200 { backfillStatus: "pending" }` after enqueue. Registered in the OpenAPI spec
  (`@marx2/contracts`) + mock, typed via `npm run gen:types`.

Repos touched: `portfoliost-contracts`, `portfoliost-wallets`, `portfoliost` (SPA +
mocks).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + mock per `AGENTS.md`; e2e against docker compose).

---

### 27.1 — Contract bump: `POST /portfolios/{id}/recompute`

Contract-first (MODULARISATION.md): the route in 27.2 and the SPA call in 27.3 both
build against `@marx2/contracts`.

- [ ] In `portfoliost-contracts/contracts/openapi.yaml`, under `/portfolios/{id}`:
      add `post` operation `portfolioRecompute` (tags `Portfolios`,
      `security: bearerAuth`) with `204`/`200`-free shape:
      `200` → `BackfillRecomputeResponse { backfillStatus: enum[pending,complete,failed] }`,
      `404` → existing NotFound error shape. Reuse the `portfolioId` path parameter.
      Add the `BackfillRecomputeResponse` schema next to `PortfolioAnalytics`.
- [ ] `portfoliost-contracts/contracts`: `npm run lint` (yaml parses) + `npm test`.
- [ ] Bump `@marx2/contracts` version in `portfoliost-contracts`, publish, then
      bump the dependency in `portfoliost/package.json` + `portfoliost-wallets/package.json`
      and `npm install`.
- [ ] Regenerate: `npm run gen:types` in `portfoliost` (→ `generated/api-types.d.ts`)
      and `portfoliost-wallets` (→ `src/generated/api-types.d.ts`); confirm
      `operations["portfolioRecompute"]` and `BackfillRecomputeResponse` exist.
- [ ] Commit: `feat(contracts): portfolio recompute operation`.

### 27.2 — Backend: `POST /api/portfolios/:id/recompute`

- [ ] In `portfoliost-wallets/src/services/backfill.ts` export
      `forcePortfolioRecalc(db, portfolioId, authToken)`: delegates to
      `enqueueBackfill(portfolioId, (signal) => recalcPortfolioHistory(db, portfolioId, authToken, new Date(), signal))`
      (backfill-runner.ts, backfill.ts:611) — full delete+rebuild, returns the
      enqueue promise (resolved when the slot is consumed).
- [ ] In `portfoliost-wallets/src/routes/portfolios.ts`, inside the existing
      `/portfolios` Hono app (before `/:id/analytics`): `routes.post("/:id/recompute", …)`
      — ownership check (404 like analytics), then
      `void forcePortfolioRecalc(database, id, c.req.header("Authorization") ?? "").catch(() => undefined)`
      and return `{ backfillStatus: "pending" } satisfies BackfillRecomputeResponse`.
      Import the schema type from `../generated/api-types.js`.
- [ ] Tests (`portfoliost-wallets/src/routes/portfolios.test.ts` or a new
      `recompute.test.ts` next to `analytics.test.ts`):
      - 404 for a portfolio not owned by the user;
      - returns `{ backfillStatus: "pending" }` and, with mocked
        `getPriceBarSeries`/fetch, a seeded BUY portfolio ends with rebuilt
        `value_snapshots` and `portfolio_backfill_metadata = complete` after the
        enqueued pass drains (await the returned promise);
      - replace-semantics: seed a stale snapshot row (a day with value after the
        position was fully sold), force recompute, assert the stale row is gone;
      - BUY/SELL-less portfolio: recompute marks complete with 0 rows (no crash).
- [ ] Gate: `npm test` + `npm run lint` in `portfoliost-wallets` pass.
- [ ] Commit: `feat(wallets): force portfolio recompute endpoint`.

### 27.3 — Mock + SPA API client

- [ ] `portfoliost/mocks/portfolios/index.js`: handle `POST /api/portfolios/:id/recompute` —
      verify the id exists (else 404), set an in-memory `recomputed` flag and return
      `{ backfillStatus: "pending" }`; make the subsequent
      `GET /api/portfolios/:id/analytics` serve data (default `portfolio_analytics_1Y.json`)
      regardless of empty-state list so the e2e in 27.5 can assert the chart fills.
      Add a dedicated empty-analytics fixture portfolio whose analytics starts empty
      and fills after recompute.
- [ ] `portfoliost/src/api/portfolios.ts`: add
      `recomputePortfolio(id: string): Promise<{ backfillStatus: string }>` via
      `http.post` typed from `components["schemas"]["BackfillRecomputeResponse"]`.
- [ ] Gate: `npm run test:mock` in `portfoliost` passes (mock tests asserting the
      recompute flag toggles the analytics body).
- [ ] Commit: `feat(portfoliost): recompute API client + mock`.

### 27.4 — Reusable chart components with Recompute button

- [ ] Create `portfoliost/src/components/WalletBalanceChart.vue`: props
      `points: Array<{ date: string; balance: number }>`, `busy?: boolean`, emits
      `recompute`. Renders the existing green area apexchart (stroke 2, gradient
      fill, height via prop default 200, x-labels via `formatDate`), a
      `data-testid="wallet-chart-recompute"` button (`btn-secondary text-xs`,
      disabled while busy, label `Recompute`), and the existing
      `No balance history available.` empty state. Keeps per-view point shaping
      (e.g. `balance > 0` filter) in the parent — the component renders what it
      gets.
- [ ] Create `portfoliost/src/components/PortfolioPerformanceChart.vue`: props
      `timeSeries`, `benchmarks`, `returnType`, `backfillPending?: boolean`, emits
      `recompute`. Moves the current `equityOptions` computed (index-normalized,
      TWR/MWR/simple selection, benchmark overlay) from `PortfolioPerformanceTab.vue`
      into the component; renders the chart, the `Historical data is loading…`
      pending line, and `data-testid="portfolio-chart-recompute"` button.
- [ ] Unit tests (`portfoliost/tests/unit/components/`):
      `WalletBalanceChart.test.ts` (renders points, emits recompute) and
      `PortfolioPerformanceChart.test.ts` (indexed series start = 100 for
      TWR/MWR/simple fallback, emits recompute, pending line only when pending).
- [ ] Gate: `npm run build` + `npm run test` in `portfoliost` pass.
- [ ] Commit: `feat(portfoliost): reusable chart components with recompute`.

### 27.5 — Wire the four views to the new components

- [ ] `PortfolioPerformanceTab.vue`: replace the inline `equityOptions`/apexchart
      block in the Performance Chart card with `<PortfolioPerformanceChart>` passing
      `store.analytics` series + `store.analyticsBenchmarks` + `store.analyticsReturnType`
      + `backfillPending`; on `@recompute` call `recomputePortfolio(id)`, set
      `store.analytics.backfillStatus = "pending"`, `backfillPending = true` and
      restart the existing 5-minute poll loop (`startPolling`). Keep the Customize
      modal + timeframe buttons untouched.
- [ ] `WalletsView.vue`, `WalletDetailView.vue`, `CashWalletCard.vue`: replace the
      inline `historyChart` apexchart with `<WalletBalanceChart>` passing the existing
      `points` mapping (`balance > 0` filter preserved in the wallet list/card,
      unfiltered in the detail view); `@recompute` re-runs the view's own
      `loadHistory`/`toggleHistory` with a busy state while in flight. Delete the
      now-unused inline `historyChart` computeds.
- [ ] Mock E2E (`portfoliost/tests/e2e/`): new spec — open a portfolio whose
      analytics mock starts empty, click `portfolio-chart-recompute`, assert the
      pending line then the populated chart; open a wallet, click
      `wallet-chart-recompute`, assert no error and refreshed history.
- [ ] Gate: `npm run build` + `npm run test` + `npm run test:mock` + (docker compose
      rebuild) `npm run test:e2e` in `portfoliost` pass.
- [ ] Commit: `feat(portfoliost): wire views to chart components + recompute`.

### 27.6 — Closeout

- [ ] KB: save the root-cause facts (charts populate via lazy analytics backfill;
      empty-batch portfolios re-trigger forever; recompute = recalcPortfolioHistory)
      under `pfire/investigations`.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: charts recompute closeout`.

---

