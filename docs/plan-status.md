<!-- generated from docs/plan.md: 417 items, 191 checked, 226 unchecked (45.8%) -->

| # | § | ✓ | item |
|--:|:--|:--:|---|
| 1 | 57.1 |  | New `src/utils/popoverPosition.ts`: pure `computePopoverPosition(trigger: {top, right, bottom, left}, panel: {width, height}, viewport: {width, height}): {top, left}` — default below the trigger, panel's… |
| 2 | 57.1 |  | `LabelPickerPopover.vue`: - New prop `trigger: {top, right, bottom, left} \| null` (rect numbers captured at click time — the trigger may unmount after a kebab menu closes, so store numbers, not the… |
| 3 | 57.1 |  | Rewire the call sites — delete the detached anchor div, pass the clicked button's rect: - `TransactionsTable.vue`: `openLabelPicker(tx, e: MouseEvent)` stores `pickerTrigger` from… |
| 4 | 57.1 |  | Unit tests: - New `tests/unit/utils/popoverPosition.test.ts`: fits-below → below, right-aligned; no room below → flip above; narrow viewport → left clamped ≥ 8; no negative top. - Extend existing… |
| 5 | 57.1 |  | E2E: new `tests/e2e/transactions-labels.spec.ts` (serial, reuse the `login` helper from `labels.spec.ts`): on the portfolio transactions tab — click a row's "Labels" → `dialog[name="Set labels"]` visible… |
| 6 | 57.1 |  | Tests: `npm run test`, `npm run build`, `npm run test:mock`, `npm run test:e2e` (docker compose) green. |
| 7 | 57.1 |  | Commit. |
| 8 | 57.2 |  | `TransactionsTable.vue`: - Actions `th` (:343) and actions `td` (:456): add `sticky right-0 z-10 bg-white dark:bg-slate-900` plus the left separator `shadow-[-1px_0_0_0_#e2e8f0]… |
| 9 | 57.2 |  | `CashTransactionsView.vue`: same treatment on its actions `th`/`td` (:239–266) — no overflow today at 1280 (6 columns), but parity + narrow-viewport safety. |
| 10 | 57.2 |  | E2E (extend `transactions-labels.spec.ts`): at the default 1280×720 viewport on the global transactions page — assert each row's Edit/Labels/ Delete `boundingBox()` right edges are ≤ the table wrap's client… |
| 11 | 57.2 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock`, `npm run test:e2e` green. |
| 12 | 57.2 |  | Commit. |
| 13 | 57.5 |  | Push `portfoliost` → GHA patch-bump → pin the **real** tag from `gh release list` in the homelab portfoliost helmrelease; 57.4 ships a wallets release + pin bump the same way… |
| 14 | 57.5 |  | Flux + kubectl verify both deployments rolled. |
| 15 | 57.5 |  | Playwright PROD (user's passkey session): - Consolidated transactions at 1280–1440px: Edit/Labels/Delete visible with no horizontal scroll; after scrolling the table right they stay pinned (sticky). -… |
| 16 | 57.5 |  | Commit (plan closeout) + archive §57 to `plan-archive.md`. **Out of scope (noted):** labels control inside edit/create forms (`EditTransactionModal`, wallet edit dialogs) — not part of the reported bugs;… |
| 17 | 59.1 |  | `package.json`: `"apexcharts": "^7.5.1"`; `npm install` → commit the `package-lock.json` change; assert the tree resolves `apexcharts@7.5.1` and `vue3-apexcharts@1.11.1` (unchanged) — `npm ls apexcharts… |
| 18 | 59.1 |  | No source changes expected (config compatibility verified in the section intro). If `vue-tsc` surfaces type fallout from the types v6+ ships in-package (e.g. `chart.type` literal narrowing in the `as const`… |
| 19 | 59.1 |  | Tests: `npm run build` (includes `vue-tsc --noEmit`), `npm run test`, `npm run test:mock`, `docker compose up -d --build` + `npm run test:e2e` (the chart specs — `chart-currency`, `chart-title-stability`,… |
| 20 | 59.1 |  | Commit. |
| 21 | 59.2 |  | Against the rebuilt compose stack (`:8080`), Playwright pass at 1280px over every chart surface: main page (portfolio-card sparklines + "Portfolio Value" line), research overview (PriceChart: render, custom… |
| 22 | 59.2 |  | Per surface assert: chart visible (`.apexcharts-canvas`), console has **zero** errors/warnings mentioning apexcharts — in particular no v7 "feature … configured but … not loaded" warning and no watermark… |
| 23 | 59.2 |  | If a surface drifted (label animation unwanted on the static bar charts, tooltip placement, sizing): adjust that component's options (e.g. `dataLabels: { animate: { enabled: false } }`) — re-run the sweep… |
| 24 | 59.2 |  | Commit (the fixes, if any; a verification-only step otherwise — note that in the commit of 59.3's plan closeout). |
| 25 | 59.3 |  | Push `portfoliost` → GHA patch-bump → pin the **real** tag from `gh release list` in the homelab portfoliost helmrelease (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify the rollout. |
| 26 | 59.3 |  | Playwright PROD (user's passkey session): main page cards + one research PriceChart render, custom tooltip works on hover, console clean, no watermark, no v7 feature warnings. |
| 27 | 59.3 |  | Commit (plan closeout) + archive §59 to `plan-archive.md`. |
| 28 | 60.1 |  | `src/utils/research.ts`: - `researchRoute(symbol: string, from?: string \| null): RouteLocationRaw` → `{ name: "research-overview", params: { symbol: researchSymbol(symbol) }, query: from ? { from } :… |
| 29 | 60.1 |  | `src/modules/instruments/ResearchView.vue`: - `const backTarget = computed(() => researchBackTarget(route.query))`; replace `to="/en/investments"` (:89) with `:to="backTarget"`. - Preserve `from` on… |
| 30 | 60.1 |  | Unit tests: new `tests/unit/utils/research.test.ts` — `researchRoute`: with `from` (query present, symbol normalized), without (`query` absent, not an empty object); `researchBackTarget`: a valid… |
| 31 | 60.1 |  | Tests: `npm run test`, `npm run build`, `npm run test:mock` green. |
| 32 | 60.1 |  | Commit. |
| 33 | 60.2 |  | `src/components/TransactionsTable.vue:373` — shared by the global `/en/investments/transactions` view and the per-portfolio transactions tab (the reported bug site). |
| 34 | 60.2 |  | `src/modules/portfolios/PortfolioHoldingsTab.vue` — `goResearch()` (:328, kebab "Research") and the symbol router-link (:426). |
| 35 | 60.2 |  | `src/modules/portfolios/PortfolioCalendarTab.vue:221` (event chips). |
| 36 | 60.2 |  | `src/modules/portfolios/PortfolioCompareTab.vue:60` (rows). |
| 37 | 60.2 |  | `src/modules/portfolios/EditTransactionModal.vue:173` (`goResearch` — `from` = the page the modal was opened over, since the route is unchanged while a modal is open). |
| 38 | 60.2 |  | `src/modules/portfolios/AddPositionDialog.vue:470` (`goResearch` — keep the existing `.US` suffix handling, then call the helper). |
| 39 | 60.2 |  | `src/modules/instruments/InstrumentSearchModal.vue:47` (`openResult`, default mode only — the `mode="add"` mounts in ChartingView / AddPositionDialog / PortfolioPerformanceTab emit instead of navigating and… |
| 40 | 60.2 |  | `src/modules/watchlists/WatchlistsView.vue:124` (watchlist items → back returns to the watchlist). |
| 41 | 60.2 |  | Explicitly unchanged: `src/layout/SidebarNav.vue:60` (top-level nav entry, no context — falls back to `/en/investments`). |
| 42 | 60.2 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock` green. This step is behaviour-neutral on its own (no entry point passed `from` before 60.1, and the back target only changes when the param is… |
| 43 | 60.2 |  | Commit. |
| 44 | 60.3 |  | Portfolio origin: main page → open the seeded portfolio → Holdings tab → click a position's symbol link → research overview for that symbol; assert the "Go back" link's `href` equals… |
| 45 | 60.3 |  | Global transactions origin: `/en/investments/transactions` → click a row's symbol → research; back link `href` = `/en/investments/transactions`; click → the transactions table is visible. |
| 46 | 60.3 |  | Per-portfolio transactions origin: open the seeded portfolio's Transactions tab → click a row's symbol → research; back link `href` = `/en/portfolios/<id>/transactions`; click → that tab is shown. |
| 47 | 60.3 |  | Origin survives tab switch: arriving at research from Holdings, click the "Dividends" research tab → the back link `href` still equals the holdings path. |
| 48 | 60.3 |  | Deep-link fallback: navigate directly to `/en/research/<seeded symbol>/overview` (no `from`) → back link `href` = `/en/investments`. |
| 49 | 60.3 |  | Tests: `npm run test:e2e` (docker compose) green. |
| 50 | 60.3 |  | Commit. |
| 51 | 60.4 |  | Push `portfoliost` → GHA patch-bump → pin the **real** tag from `gh release list` in the homelab portfoliost helmrelease (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify the rollout. |
| 52 | 60.4 |  | Playwright PROD (user's passkey session): - Open a portfolio → Holdings → click a holding's symbol → research; "Go back" → back on that portfolio's holdings tab. - Global transactions list → click a row's… |
| 53 | 60.4 |  | Commit (plan closeout) + archive §60 to `plan-archive.md`. |
| 54 | 61.1 |  | New `src/components/TickerBadge.vue`: - Props (`<script setup lang="ts">`, typed `defineProps`): `symbol: string` (required); `name?: string \| null`; `countryCode?: string \| null` (2-letter code, uppercased… |
| 55 | 61.1 |  | Unit tests, new `tests/unit/components/TickerBadge.test.ts`: - full props → logo `img[src*="/api/logos/SAP"]`, ticker `SAP`, name line, details `(PL) Stock` (and `${tid}-details` testid); - no `name` → no… |
| 56 | 61.1 |  | Tests: `npm run test`, `npm run build` green. |
| 57 | 61.1 |  | Commit. |
| 58 | 61.2 |  | `portfoliost-contracts/contracts/openapi.yaml`: - `DividendsData.items` item: add `assetType: { type: string, nullable: true }` and `country: { type: string, nullable: true }` (nullable — the… |
| 59 | 61.2 |  | Push contracts main → GHA patch bump; `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` + `npm run gen:types` in `portfoliost`, `portfoliost-wallets`, `portfoliost-instruments` (all… |
| 60 | 61.2 |  | Tests: contracts `npm test` (spec validity) green. |
| 61 | 61.2 |  | Commit (portfoliost-contracts) + consumer install commits. |
| 62 | 61.3 |  | `portfoliost-wallets src/routes/portfolios.ts` `/:id/dividends` (:1105): the item map adds `assetType: r.assetType ?? null` and `country: r.country ?? null` — both columns are already selected (`select()`… |
| 63 | 61.3 |  | Unit test (`portfolios.test.ts` dividends describe): a DIVIDEND tx seeded with `assetType: "ETF"`, `country: "PL"` → response `items[0].assetType === "ETF"`, `items[0].country === "PL"`; a tx without them →… |
| 64 | 61.3 |  | Full wallets suite green (`npm run test`) + `npm run build`. |
| 65 | 61.3 |  | Commit (portfoliost-wallets). |
| 66 | 61.4 |  | `portfoliost-instruments src/routes/instruments.ts` `/:symbol/peers` (:1346): after each `toCompare(...)` item is built, enrich from the local reference table — same pattern as the profile route (:1602):… |
| 67 | 61.4 |  | Unit test (`instruments.test.ts` peers describe): a ref row for the primary symbol (e.g. AAPL → `US` / `STOCK`) → `items[0].countryCode === "US"`, `items[0].assetType === "STOCK"`; a symbol with no ref row… |
| 68 | 61.4 |  | Full instruments suite green (`npm run test`) + `npm run build`. |
| 69 | 61.4 |  | Commit (portfoliost-instruments). |
| 70 | 61.4 |  | SPA mock (e2e runs against the compose mock backend): `mocks/instruments/ index.js` — the `/compare` and `/peers` mappers add `countryCode`/`assetType` to each compare row, derived from the seeded research… |
| 71 | 61.4 |  | Tests: `npm run test:mock` green (portfoliost). |
| 72 | 61.4 |  | Commit (portfoliost). |
| 73 | 61.5 |  | `PortfolioHoldingsTab.vue` symbol cell (:420–433): replace the logo `img` + symbol `router-link` + `assetLabel(pos)` line with the existing `router-link` wrapping `<TickerBadge :symbol="pos.symbol"… |
| 74 | 61.5 |  | `PortfolioPerformanceTab.vue` Top/Bottom performers lists (:350, :370): replace the `symbol` + `companyName` div with `<TickerBadge size="sm" :symbol="p.symbol" :name="p.companyName"… |
| 75 | 61.5 |  | Update the affected unit tests (holdings/performance specs that assert the old markup) to select on `ticker-badge` / `ticker-badge-details`. |
| 76 | 61.5 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock` green; `docker compose up -d --build` + `npm run test:e2e` (holdings + `top-performers-currency.spec.ts`) green. |
| 77 | 61.5 |  | Commit. |
| 78 | 61.6 |  | `TransactionsTable.vue` symbol cell (:370–392): replace the global-mode logo `img` + `symbol` + `assetLabel(tx)` + `instrumentName` lines with `<TickerBadge :symbol="tx.instrumentSymbol"… |
| 79 | 61.6 |  | `PortfolioDividendsTab.vue` symbol cell (:96): replace the plain `{{ d.symbol }}` with `<TickerBadge size="sm" :symbol="d.symbol" :name="d.instrumentName" :country-code="d.country" :asset-type="d.assetType"… |
| 80 | 61.6 |  | SPA mock: `mocks/portfolios/index.js` dividends mapper (:731) adds `assetType: t.assetType ?? null, country: t.country ?? null` (tx rows already carry both via `enrichTx`). |
| 81 | 61.6 |  | Update affected unit tests; e2e: `dividends.spec.ts` + the transactions specs. |
| 82 | 61.6 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build` + `npm run test:e2e` green. |
| 83 | 61.6 |  | Commit. |
| 84 | 61.7 |  | `PortfolioNewsTab.vue` (:43): replace the uppercase `a.ticker` chip with `<TickerBadge size="sm" :symbol="a.ticker" :name="..." :country-code="..." :asset-type="...">` enriched from a `symbol → position`… |
| 85 | 61.7 |  | E2E: portfolio News tab — a card for a held ticker shows the badge with the position's name and details; the sentiment chip is still present. |
| 86 | 61.7 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build` + `npm run test:e2e` green. |
| 87 | 61.7 |  | Commit. |
| 88 | 61.8 |  | `ResearchView.vue` header (:88–105): replace the logo `img` + `h1` ticker + name line + the duplicate ticker pill with `<TickerBadge size="lg" title-as="h1" :symbol="routeSymbol" :name="profile?.name"… |
| 89 | 61.8 |  | `ResearchOverview.vue` header block (:229–232): replace the logo `img` + `h2` symbol + name with `<TickerBadge title-as="h2" :symbol="symbol" :name="profile?.name" :country-code="profile?.countryCode"… |
| 90 | 61.8 |  | `ResearchCompare.vue` column headers (:46–49): replace the symbol + name divs with `<TickerBadge size="sm" align="right" :symbol="r.symbol" :name="r.name" :country-code="r.countryCode"… |
| 91 | 61.8 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock` green; `docker compose up -d --build` + `npm run test:e2e` (`research.spec.ts`, `logos.spec.ts`) green. |
| 92 | 61.8 |  | Playwright visual pass (1280px, compose stack): research header shows logo + ticker + `(US) Stock` + name at 32px; compare table column headers show the badge with details, right-aligned. |
| 93 | 61.8 |  | Commit. |
| 94 | 61.9 |  | `InstrumentSearchModal.vue` result row: replace the logo `img` + symbol/name/ exchange block + type pill with `<TickerBadge :symbol="result.symbol" :name="result.name" :country-code="result.countryCode"… |
| 95 | 61.9 |  | `WatchlistsView.vue` items (:122–131): replace the plain symbol `router-link` + name span with the link wrapping `<TickerBadge :symbol="item.symbol" :name="item.name" />` (no country/type stored — details… |
| 96 | 61.9 |  | Form symbol previews — `AddPositionDialog.vue`, `EditTransactionModal.vue`, `RecordDividendDialog.vue`, `TransactionFormFields.vue`: replace each logo-`img`+symbol pair with `<TickerBadge :symbol="..."… |
| 97 | 61.9 |  | `RecentSearchesBar.vue` unchanged (decision — dense symbol-only chips). |
| 98 | 61.9 |  | Tests: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build` + `npm run test:e2e` (watchlists + add-position specs) green. |
| 99 | 61.9 |  | Commit. |
| 100 | 61.10 |  | Sweep: `grep -rn "/api/logos/" src` returns hits **only** in `src/components/TickerBadge.vue` — fix any leftover ad-hoc logo renders surfaced by the grep (the form previews of 61.9 are the expected tail). |
| 101 | 61.10 |  | `docs/COMPONENTS.md`: update the instrument-logo line (the rounded-square `object-contain` plate, not the circle) and add `TickerBadge` to the reference table (presentational identity block; `ticker-badge`… |
| 102 | 61.10 |  | Playwright parity pass (AGENTS.md): side-by-side a11y snapshots + screenshots at 1280px vs `app.example-service.ai` for the holdings table, the performance tab, the research header, and the compare tab; fix visual… |
| 103 | 61.10 |  | Tests: full suite green — `npm run build`, `npm run test`, `npm run test:mock`, `npm run test:e2e`. |
| 104 | 61.10 |  | Commit. |
| 105 | 61.11 |  | Push `portfoliost-wallets`, `portfoliost-instruments`, `portfoliost` → GHA patch bumps → pin the **real** tags from `gh release list` in the homelab helmreleases (`KUBECONFIG=$HOME/.kube/homylab`, ns… |
| 106 | 61.11 |  | Flux + kubectl verify all three rollouts (if the RWO logos PVC multi-attach stalls the instruments rollout, scale to 0, wait, scale back to 1 — known gotcha). |
| 107 | 61.11 |  | Playwright PROD (user's passkey session): - Holdings table row: rounded-square logo + ticker + `(US) Stock`-style details + company name. - Top/Bottom performers: badge with details on each row. - Portfolio… |
| 108 | 61.11 |  | Commit (plan closeout) + archive §61 to `plan-archive.md`. |
| 109 | 63.2 |  | `portfoliost-wallets`: headline total-metrics `totalValue` and `value_snapshots` both derive position value from the **same** live price source (quote service / cached live price), not `price_bars` for one… |
| 110 | 63.2 |  | `portfolios.current_value` is refreshed from the live value (positions + cash) on the quotes pass and on recompute — so headline = chart last point (± cash timing) after a recompute. |
| 111 | 63.2 |  | Tests: a portfolio's headline totalValue equals the latest snapshot value (positions + cash) when quotes are fresh; fallback-to-close (not cost) is asserted when no quote. |
| 112 | 63.2 |  | Tests: `npm run build`, full `vitest` green. |
| 113 | 63.2 |  | Commit. |
| 114 | 63.3 |  | **Verified broken 2026-09-27 — three headline numbers that do not reconcile.** The per-portfolio *cards* include cash; the page *headline* does not, and the API's `total-metrics` reports a third figure in a… |
| 115 | 63.3 |  | Pick one definition for "total value" (positions + cash) and make the headline, the cards, and `total-metrics` all read it from the same place. |
| 116 | 63.3 |  | `total-metrics` is **not deterministic** — two calls a minute apart disagreed by 73,513. Find which input is not cached/stable; a headline that flickers is worse than a wrong one, because it cannot be… |
| 117 | 63.3 |  | Investigate why `total-metrics` reports `Crypto` as `0 / −100%` when the snapshot holds 887.74 PLN and the card is positive. A portfolio with cash and a position must not floor at zero. |
| 118 | 63.3 |  | Verify/fix the consolidated (all-portfolio) performance chart and each portfolio chart show **Σ positions + cash** per day (cash per §62 base- currency balance already added in backfill — confirm it is in… |
| 119 | 63.3 |  | Tests: consolidated series = Σ per-portfolio (positions + cash); a deposit moves the consolidated line up on that day; `total-metrics` is byte-identical across two consecutive calls; headline total == Σ cards. |
| 120 | 63.3 |  | Tests: `npm run build`, full `vitest` green. |
| 121 | 63.3 |  | Playwright: re-check `/en/investments` headline vs the card sum. |
| 122 | 63.3 |  | Commit. |
| 123 | 63.4 |  | Model "uninvested/free cash" per account as the §62 per-currency cash ledger (external flows + derived trade effects) — this already nets a funded buy (inflow + immediate buy) to ~0 net cash and is… |
| 124 | 63.4 |  | Tests: derived free-cash for a funded-buy round-trip (inflow + buy) ≈ 0 net; Gotówka recon warn-line compares derived vs snapshot within tolerance. |
| 125 | 63.4 |  | Tests: `npm run build`, full `vitest` green. |
| 126 | 63.4 |  | Commit. |
| 127 | 63.5 | x | Reproduce the provider response: fetch raw yfinance OHLCV for CSN.L / BYG.L / RIO.L and confirm the close is in pence (vs the GBP quote). (GATE — blocked here: can't reach yfinance from this environment; do… |
| 128 | 63.5 | x | Fix at the owning tier: in `openst/src/openbb_client.py` `get_ohlcv_history` (and `get_price_history`) normalize yfinance LSE/GBX closes ÷100 to GBP — or route LSE history off yfinance. Add a unit test with… |
| 129 | 63.5 | x | Backfill/correct the existing bad `price_bars` overflow rows (delete `source='openst'` rows for the affected `.L` symbols so they re-fetch, or divide by 100), then recompute affected portfolios. - **Done… |
| 130 | 63.5 |  | Add a sanity guard: an extreme quote-vs-last-close jump (≳10×) on the overflow write flags/logs instead of silently valuing 70×. |
| 131 | 63.5 | x | Tests: openst suite green; fixed symbols' price_bars match the GBP quote. |
| 132 | 63.5 | x | GATE: this step fixes the *data*; §63.1–63.4 fix the *pipeline*. "Chart == true value" is not achievable until this ships. - **Lifted 2026-09-26** (openst v1.1.35 + data backfill + recomputes; only the ≳10×… |
| 133 | 63.5 | x | Commit. |
| 134 | 63.6 | x | Deploy the two-modes recompute + snapshotsync cron (wallets v1.1.63, pinned in helmrelease as `snapshotsync` 13:00 UTC + `snapshotsync-postfx` 17:20 UTC, after instruments fxsync). 2/2 cronjobs live. |
| 135 | 63.6 | x | Root-cause the "sudden growth" / fake-inflow spike (RECALC_DEBUG + PROD DB, 2026-09-27, IKE Beata `ab64f782…`). **It is NOT the price/FX valuation path and NOT a race** — it is **missing price-bar… |
| 136 | 63.6 |  | §63.2 — unify the two valuation paths (live-quote snapshot vs price-bars backfill) so they agree; **root cause pinned in §63.8** — the disagreement is upstream missing price history, not FX. - **Still open… |
| 137 | 63.8 | x | **Backfill must not silently drop a held symbol with no price bar.** (wallets `09f48c2` + `bcdf8e3`, 348 green; contracts v1.6.44.) `computeSnapshotBatch` now returns `{ rows, gapSymbols }` — the held… |
| 138 | 63.8 | x | ~~**Instruments: fill/repair missing history — GATED on the provider tier (§63.5).**~~ **RESOLVED (wrong premise — see §63.9).** The diagnosis recorded here was wrong: `providerSymbol()` is not the problem,… |
| 139 | 63.8 | x | **UI: gray out + block every recomputing chart until done** (user request). (SPA `296343e` + `fe4c0e5`, 397 green.) `PortfolioPerformanceChart` gained a `recomputing` prop: the chart is dimmed (opacity-50)… |
| 140 | 63.8 |  | **Item #2 — the actual price history** (GATED, provider tier / §63.5). Until the `.WA`/`.AS` symbols get bars, the value is *flagged* partial, not *corrected*. The 5 missing IKE Beata symbols (≈ 50k):… |
| 141 | 63.8 |  | **Confirm in UI** (needs a fresh PROD login — Playwright session closed mid-verification): on IKE Beata → Performance, verify (a) the amber "Value excludes 5 positions without price history" banner shows… |
| 142 | 63.8 | x | ~~**Turn RECALC_DEBUG off**~~ — done in §63.10.5 (now `RECALC_DEBUG: "0"`). |
| 143 | 63.9 | x | **Deployed 2026-09-27** (cachest v1.0.44 + instruments v1.0.70 pinned in `cluster/apps/pfire/{cachest,portfoliost-instruments}/app/helmrelease.yaml`, homelab `b9c2a9eff`; migration 0003 applied). The… |
| 144 | 63.9 | x | All 23 IKE Beata positions now have a price bar; the amber partial-sum signal is no longer needed for the missing-history case. The next sweep pass then exposed a **much larger, unrelated** problem — see… |
| 145 | 63.9 |  | `logo` route: the 21 rejections came from the same depth-3 wall and are fixed by §63.9.1's config (depth 600), but the SPA still fans out ~80 logos per page, so re-check its rejection count after the next… |
| 146 | 63.11 |  | Decide and implement: enable nginx `global-auth-url` in `cluster/apps/networking/ingress-nginx/helm-release.yaml:51`, or record a decision not to. Either way, close this section with the reasoning. |
| 147 | 63.11 |  | Tests: with it enabled, an unauthenticated browser request to any `pfire` ingress is redirected, while the scheduled sweep (service token) is unaffected. Verify both in PROD. |
| 148 | 63.11 |  | Commit. Still open. Recorded as a deliberate non-fix during the sweep work: the cluster has a working global nginx auth subrequest that is switched off… |
| 149 | 63.14 | x | **Already done, by later work — verified 2026-09-29.** `PortfolioCard.vue` now reads `formatCurrency(convert(portfolio.currentValue), displayCurrencyOr())` (and the same for `totalInvested`): it passes the… |
| 150 | 63.14 |  | Decide whether `formatCurrency`'s `"USD"` default should exist at all — `formatAmount` (`:9`) already refuses to guess a currency; the currency formatter silently does. Aligning them would have caught this… |
| 151 | 63.14 |  | Tests: unit — a PLN portfolio renders `zł`, not `$`; a null-currency portfolio renders without a symbol. `npm run build` + `npm run test` green. |
| 152 | 63.14 | x | Playwright: re-check the cards on `/en/investments`. |
| 153 | 63.14 | x | Commit. |
| 154 | 63.15 |  | Decide the retention rule: delete `price_bar_metadata` + `price_bars_all` rows whose symbol no transaction references, or keep them as a warm cache. Deleting is cheaper to reason about; keeping needs a… |
| 155 | 63.15 |  | If deleting: the sweep must never remove a symbol a *held* position needs, so gate on "no referencing transaction **and** not in the live fetch set". |
| 156 | 63.15 |  | Add the resolver's unmatched-name fallback to the plan's radar: when it fires, the sheet row's symbol is a company name, which no provider will ever serve. Consider making that case loud at import time… |
| 157 | 63.15 |  | Tests: after the prune, every remaining `failed` row is referenced by a transaction and 404s upstream; a symbol with a live position is never removed. |
| 158 | 63.15 |  | Commit. |
| 159 | 64.1 | x | Convert each to the shape that actually renders `httpGet` — add `type: HTTP`, move `path: /health` from `spec` to the probe level, keep the timing keys in `spec`. Use the openst v1.1.36 block as the… |
| 160 | 64.1 | x | Bump `portfoliost-admin` and `portfoliost-wallets` from chart 5.0.1 to 5.1.0 in the same commit, so all four pfire TS services share one chart version and one probe dialect. |
| 161 | 64.1 | x | Add a **startupProbe** to each. These four have no schema migration on boot, but a slow first provider/db connect currently counts against `liveness` and can restart-loop a cold pod. |
| 162 | 64.1 | x | Validate locally before pushing (this is the step that would have prevented the openst rollout failure — the first v1.1.36 push put `livenessProbe:` directly on the container, the Helm upgrade failed schema… |
| 163 | 64.1 | x | Tests: schema validation passes for all four; after Flux applies, `kubectl get deploy -n pfire <app> -o json` shows `httpGet` with `path: /health` (not `tcpSocket`) for both probes, and pods reach 1/1 with… |
| 164 | 64.1 | x | Commit. |
| 165 | 64.2 |  | `cachest`: add `GET /ready` mirroring openst's — `503` + `{"status":"degraded","redis":"unreachable"}` when the cache is down, `200` otherwise; keep `/health` as pure liveness that never touches Redis (a… |
| 166 | 64.2 |  | Add liveness (`/health`), readiness (`/ready`) and startup probes to `cluster/apps/pfire/cachest/app/helmrelease.yaml`. |
| 167 | 64.2 |  | `cachest`: add `test_ready_reports_503_when_redis_is_unreachable` and `test_health_stays_ok_while_redis_is_down`; full suite green (`docker build --target test -t cachest-test . && docker run --rm… |
| 168 | 64.2 |  | Tests: pod 1/1 with 0 restarts; probes render `httpGet`; `/ready` returns 200 in-cluster; and a deliberate Redis outage (scale the cache down) takes the pod out of rotation **without** `/health` flapping. |
| 169 | 64.2 |  | Commit: `cachest` code + tests, then the homelab tag bump + probes. |
| 170 | 64.3 |  | Add liveness + readiness on `GET /` (the SPA's own `/health` returns `index.html` via the nginx catch-all, so it is not a health check). This proves nginx is serving, which is the only failure mode an SPA… |
| 171 | 64.3 |  | Add a comment in the helmrelease recording that this probe covers nginx only, so a future reader does not assume it validates the app. |
| 172 | 64.3 |  | Tests: pod 1/1; probe renders `httpGet` on `/`; rolling the deployment does not flap. |
| 173 | 64.3 |  | Commit. |
| 174 | 64.4 |  | **Blocked on open question 1.** `jobshot` returns `index.html` for `/health`, `/healthz` and `/ready` alike (SPA fallback), so any HTTP probe on it is a no-op that always passes. Either add a real `/health`… |
| 175 | 64.4 |  | Tests: the chosen endpoint returns something other than the SPA shell (assert on content, not just status), pod 1/1. |
| 176 | 64.4 |  | Commit. |
| 177 | 64.5 |  | `mastra-ticker` has a helmrelease with a `custom: true` probe but **no Deployment and no Service** in `pfire` — it is not deployed. Either deploy it or drop the manifest so the next audit is not misled by a… |
| 178 | 64.5 |  | Tests: if deployed, pod 1/1 and probe reaching a 200; if removed, `kubectl get deploy -n pfire mastra-ticker` 404s and the Flux kustomization reconciles clean. |
| 179 | 64.5 |  | Commit. |
| 180 | 64.6 |  | Add a `hack/validate-helmrelease.py` (or equivalent) to the homelab repo that validates **every** `cluster/apps/pfire/*/app/helmrelease.yaml` against the pinned chart's `values.schema.json`, and call it… |
| 181 | 64.6 |  | Also assert, in the same check, that a service declaring `probes:` has `type` set on each probe — the tcpSocket false friend is schema-**valid**, so only an explicit lint catches it. |
| 182 | 64.6 |  | Tests: the script exits non-zero on (a) a schema violation and (b) a probe missing `type`; exits 0 on the current tree after §64.1–64.3. |
| 183 | 64.6 |  | Commit. |
| 184 | 65.1 |  | Re-run the `Gotówka` recon (Admin → Jobs → dry sync, no `--wipe`) and confirm the report is shrinking toward empty. |
| 185 | 65.1 |  | When it is ~empty: Wipe & Reimport, then a full recompute of all 10 portfolios. |
| 186 | 65.1 |  | Assert: 0 row errors; the synthetic `#d`/`#t` legs still dedupe on a second run; all 10 `portfolio_backfill_metadata.status = complete` with empty `gap_symbols`. |
| 187 | 65.1 |  | Tests: `backfillStatus: complete` on `/api/portfolios/merged`; no single-day move worse than −25% in the ALL series (the bar established in §63.13 — the series' worst legitimate day is −24.1% on 2022-05-26). |
| 188 | 65.1 |  | Commit (plan closeout) + archive §65. |
| 189 | 67.1 | x | Make the Display-currency selector write through to the user's `baseCurrency` preference, so the backend can see it at all (`portfoliost` `1d1dd65`, 402 green, **committed but deliberately not deployed** —… |
| 190 | 67.1 | x | On deploy (with §68): confirm the aggregate base is now the user's chosen currency rather than the USD default. |
| 191 | 67.1 | x | Then close §63.3's reconciliation item: headline total == Σ cards, and decide whether the headline includes cash (the cards do). |
| 192 | 67.1 | x | Also still open there: `Crypto` reports `totalValue: 0, returnPercentage: -100` in the breakdown while holding 887.74 PLN and its card reads +1.65%. A portfolio with cash and a position must not floor at zero. |
| 193 | 67.1 | x | Tests: `total-metrics.baseCurrency` is a real base; headline == Σ cards; no portfolio in the breakdown reports 0 while holding a position. |
| 194 | 67.1 |  | Commit. |
| 195 | 67.2 | x | Move all four onto `useDisplayConversion` and delete the local implementations. The holdings tab's `totalsCcy` is now `computed(() => displayCurrencyOr())` and the totals rows still read `rate` **directly**… |
| 196 | 67.2 | x | Fix the two mislabelling degrades: the rate is left `null` (so the existing `—` path works) and the chart label falls back to the portfolio's own currency via `displayCurrencyOr()`. |
| 197 | 67.2 | x | Tests: 402 unit + 227 mock green, `vue-tsc` clean. |
| 198 | 67.2 | x | Playwright: `/en/investments` and the portfolio holdings/performance/detail tabs compared; no new failures (see the pre-existing note below). |
| 199 | 67.2 | x | Commit (`portfoliost` §67.2). `PortfolioPerformanceTab` keeps one `getLatestRate` call for the per-position `rateByCcy` map — that is N currencies → display, not a single base→display rate, so the… |
| 200 | 68.2 | x | `PortfolioTotalMetrics`: - `instrumentsValue: { type: number }` — positions only, aggregate base. - rename `totalCash` → **`cashValue`** (`cashBreakdown` already spells the card out; `cashValue` is what the… |
| 201 | 68.2 | x | `PortfolioSummaryMetrics` (per portfolio): same three — `instrumentsValue`, `cashValue`, and `currency` is already there from §66.3. |
| 202 | 68.2 | x | Tests: contracts `npm test` green; the spec is valid and `gen:types` regenerates in all three consumers. |
| 203 | 68.2 | x | Commit (contracts) → GHA bumps + publishes. |
| 204 | 68.3 | x | Per portfolio, derive the two components explicitly rather than by subtraction where possible: - `instrumentsValue` = Σ open positions' market value, **each converted from its own `instrument_currency` into… |
| 205 | 68.3 | x | `total-metrics`: sum the per-portfolio `instrumentsValue` and `cashValue` into the aggregate base (using the §67.1 preference, which the SPA now writes through), and derive `totalValue` as their sum. Keep… |
| 206 | 68.3 | x | Negative-cash handling: XTB and IKE Beata hold negative balances (margin accounts, §62). A negative `cashValue` must reduce `totalValue`, not be clamped, and must not make the tile render as `—`. |
| 207 | 68.3 | x | Decide and record whether `total-metrics` keeps `totalCash` as a deprecated alias for one release, or breaks outright. Prefer breaking outright: it has no consumer outside the SPA. |
| 208 | 68.3 | x | Tests: - a portfolio with positions and cash: `currentValue == instrumentsValue + cashValue` to the cent, and `totalValue` on `/total-metrics` equals Σ per-portfolio `totalValue`; - cash-only portfolio… |
| 209 | 68.3 | x | Full wallets suite green + `npm run build`. |
| 210 | 68.3 | x | Commit (portfoliost-wallets). |
| 211 | 68.4 | x | `InvestmentsView.vue` header: four tiles in this order — **Cash value**, **Instruments Value**, **Total Value**, **Total Invested**. All four formatted through `useDisplayConversion` so they are converted… |
| 212 | 68.4 | x | Derive **Total Gain / Loss** = `totalValue − totalInvested` and **Total Return** from the same pair, so the four tiles and the two derived figures can never disagree. The current tiles are computed… |
| 213 | 68.4 | x | **The chart's value line must include cash too** (confirmed by the user: "Total is always total: stocks+cash on this account. Also on chart"). `/portfolios/merged` currently plots positions and cash as… |
| 214 | 68.4 | x | While a rate is unresolved, render `—` (never a bare number with a foreign symbol — §66.2) and do not flash a converted value first. |
| 215 | 68.4 | x | Portfolio cards: show the cash/instruments split inside the existing Cash group rather than adding a fifth number to the top row. |
| 216 | 68.4 | x | Tests: a tile shows the right currency symbol; `Total Value` equals `Cash + Instruments` in the rendered output; a null rate renders `—`. |
| 217 | 68.4 | x | `npm run build`, `npm run test`, `npm run test:mock`, `npm run test:e2e` green (e2e snapshots of the header will need re-baselining — the tile count changes 4 → 4 but the labels and values do). |
| 218 | 68.4 | x | Commit (portfoliost). |
| 219 | 68.5 | x | Pin the real tags: contracts, wallets, portfoliost. The §67.1 preference write-through (`1d1dd65`, committed and green but **not yet deployed**) ships with this, so the aggregate base flips USD → PLN in the… |
| 220 | 68.5 | x | Playwright PROD `/en/investments`: - the four tiles read **Cash 345,228 · Instruments 1,035,259 · Total 1,380,487 · Invested 1,040,416** (PLN) — `Cash + Instruments == Total` exactly; - Σ the 10 cards'… |
| 221 | 68.5 | x | Then tick §63.3's reconciliation and its "Crypto reports 0 / −100%" findings, and archive §63 if nothing else in it is open. |
| 222 | 68.5 | x | Commit (plan closeout). |
| 223 | 69.1 | x | Diagnose (§69.1). |
| 224 | 69.1 | x | **§69.2 importer dedup** — see below. |
| 225 | 69.1 |  | Re-import (wipe & reimport) with the dedup, then ONE full backfill of all 10 portfolios so the 15,777 and the SAP SE value land on their proper dates. **User-approved**, deliberately deferred until after… |
| 226 | 69.2 | x | Importer dedup + tests (`portfoliost-sheets-sync`). |
| 227 | 69.2 | x | Release sheets-sync; the job image pin lives in the admin helmrelease. |
| 228 | 69.2 | x | Wipe & reimport (user-triggered from Admin → Jobs), then full backfill. |
| 229 | 69.2 | x | Verify: IBKR's cash no longer gains the duplicate; IKE's `invested` steps back to 132,099 / 54,548 on their proper 2021 dates; no cliff on 2026-09-27. |
| 230 | 69.3 |  | Decide and implement. |
| 231 | 70.4 | x | Find why `positions.market_value` is NULL for 75/85 — which writer should populate it, and why it is not reaching IBKR / Rach / IKE Marek / Obligacje / NN TFI PPK / Equate+. |
| 232 | 70.4 | x | Make both paths resolve market value identically, from prices. One function, one answer (the §68 lesson: drift is what happens when two code paths answer the same question). |
| 233 | 70.4 | x | **Never present cost as value.** With no price, render unresolved per §66.2 rather than silently substituting cost. A missing price must be visible, not plausible. → unpriced positions contribute NOTHING… |
| 234 | 70.4 | x | Decide the contract: does `instrumentsValue` require a resolved price, and is a partially-priced portfolio reported at all or flagged? → **Flagged, not hidden.** A partial portfolio is reported with… |
| 235 | 70.4 | x | Tests: a position with NULL `market_value` and no resolvable price must NOT contribute its cost basis; both paths agree to the cent on a mixed price/no-price portfolio. |
| 236 | 70.4 | x | Then re-run the single backfill and assert Σ cards == Total tile — the §63.3 reconciliation, still unproven after all of §66–§69. |
| 237 | 70.4 |  | Separately: the §68 `cashBreakdown` weight formula divides by a net total that can approach zero (EUR +64,898 against USD −45,434 in IBKR), producing weights from −398% to +648%. The user confirms the sign… |
| 238 | 70.5 | x | Find why `market_value` was NULL for 75/85 — the BUY insert never sets it, `refreshQuotes` is the only writer, and **no scheduled job called it**; `snapshots-sync` only ran `runBackfillRecent`. |
| 239 | 70.5 | x | Both paths resolve value identically (`splitPortfolioValue`), and the unpriced are excluded and counted rather than valued at cost. |
| 240 | 70.5 | x | `snapshots-sync` prices before snapshotting, reusing the existing writer rather than adding a second one. |
| 241 | 70.5 | x | Contract + SPA surface `unpricedPositions` / `priceAsOf` / `priceSource`. |
| 242 | 70.5 | x | Tests assert the ABSENCE of a value, so no future fallback can hide behind a plausible number. |
| 243 | 70.5 | x | Verified in PROD: unpriced 0, all ten cards reconcile, freshness note absent because there is nothing to warn about. Two defects found while doing this, both worth remembering: - The **contract lint could… |
| 244 | 71.1 | x | Prove cash is not the cause (both replays agree to the cent). |
| 245 | 71.1 | x | Bisect the instruments leg per symbol; isolate the single responsible row. |
| 246 | 71.1 | x | The stored bars are correct PLN (188.00 / 367.50 against trades of 194.00 / 369.00), so no data has to be invented to fix it. |
| 247 | 71.2 | x | `getExchangeCountry()` added; both guess branches removed. |
| 248 | 71.2 | x | A listing that records its own venue in the ticker (`SNT.WA` on WSE) is accepted when exchange data is incomplete — that row states its venue rather than implying it. (Found by the full suite: a fixture… |
| 249 | 71.2 | x | Tests: the exact call that returned CAD; `CRI` still ambiguous → `null`; a suffix naming an unknown exchange → `null`; no exact listing → `null`. |
| 250 | 71.2 | x | Verified live: `CRI.WA → PLN`, `ETFSP500.WA → PLN`, `SRT.F → EUR`, `ASML → EUR`, bare `CRI → null`. |
| 251 | 71.2 | x | `instruments` v1.0.76 (`a1d69a6`). |
| 252 | 71.3 | x | Carry `currencySource` through; provider-confirmed values may overwrite (`market_value` is in the **quote's** currency, so a confirmed disagreement has to win), estimated/unknown may only fill an empty… |
| 253 | 71.3 | x | `instrument_currency` is `char(3)`, so "unset" is whitespace — a `=== ""` check is dead code. Trim. |
| 254 | 71.3 | x | Tests: the PROD shape (estimated CAD must not beat a stored PLN, while the price still refreshes) and the empty-position case. The pre-existing §39 test now tags its mock `currencySource: "provider"`, which… |
| 255 | 71.3 | x | `wallets` v1.1.80 (`b9eed8d`), v1.1.81 (`12140c6`). |
| 256 | 71.4 | x | Both fetchers use `instrumentsAuthHeaders`, which already existed and already picks the right header for either credential. |
| 257 | 71.4 | x | Tests pin the routing in both directions. |
| 258 | 71.4 | x | `wallets` v1.1.82 (`72fe969`). |
| 259 | 71.5 | x | First PROD run returned 11 findings, **8 of them noise** — `AVGO: USD vs PLN/USD`, `0M6S.IL: EUR vs EUR/PLN`. These are PLN accounts buying foreign listings and paying in PLN, which is normal. The rule had… |
| 260 | 71.5 | x | Cut an FX-pair heuristic for naming the offending currency: a portfolio total is a sum, so one bad position in thirteen moves it by a *fraction* of a rate (0.847 against CAD→PLN's 2.7131). It would have… |
| 261 | 71.5 | x | Exit 2 when the audit cannot run — an audit that could not check must never be mistaken for one that found nothing. |
| 262 | 71.5 | x | Findings: 11 → 4 → **2**. |
| 263 | 71.6 | x | `CRI.WA` CAD → **PLN**, `SRT.F` GBP → **EUR** (one transaction, 2 rows; `MFC` deliberately untouched — CAD is correct, its trades are USD only because the US variant was bought). |
| 264 | 71.6 | x | `recalcPortfolioHistory` on IKE Marek. It rebuilds through *yesterday* and deletes first, so it dropped the corrupt `09-28` row rather than rewriting it with fallback prices. Series ends `91,072.72`,… |
| 265 | 71.6 | x | `SRT.F` vs `SRT3.DE`: **two share classes ~25% apart**, not two lines of one stock. The stored trades split 2–1, and FIFO leaves the surviving lot as the one `SRT3.DE` reproduces within 0.8% while `SRT.F`… |
| 266 | 71.6 | x | **`Equate+` +118.7%** (stored 3,947.57 vs live 8,635.30). Not a currency finding. It is a margin account, which is a plausible innocent explanation, but that is a hypothesis and has not been tested. |
| 267 | 71.6 |  | `MFC` is a **known false positive** in `valuation-audit`: a dual-listed ticker bought on the other line. The rule cannot distinguish it from corruption, and leaving it as a permanent red line trains people… |
| 268 | 71.6 |  | Pin `instruments` to the `f01e639` comment commit's release (a code comment that records a trap should not sit unpinned). |
| 269 | 72.1 | x | `src/scripts/price-audit.ts` — accept the instruments credential as `INSTRUMENTS_SERVICE_TOKEN` **or** a user JWT, and send it through `instrumentsAuthHeaders` (which already routes Bearer vs service… |
| 270 | 72.1 | x | `--exit-zero` so a findings report is a successful Job. |
| 271 | 72.1 | x | Report, per symbol: trades checked, unreconciled, worst deviation, instruments' `baseCurrency` vs the position's `instrument_currency`, and symbols with **no bars** listed separately as unverifiable rather… |
| 272 | 72.1 | x | Tests over the pure rules: same-day bar picked; weekend carry-forward bounded by `MAX_CARRY_DAYS` and no bar beyond it; `deviationPct`; `fxHint` naming a pair only when the ratio matches one; `summarise`… |
| 273 | 72.1 | x | Tests: the PROD `SRT3.DE` shape (a trade 16% off `SRT.F`, 0.8% off `SRT3.DE`) and the `CRI.WA` shape (a trade off by ≈ CAD→PLN). - Tests: `npm run build` (tsc) + full `npm run test` green. - Commit. |
| 274 | 72.2 | x | `src/price-audit.ts` — `PRICE_AUDIT_JOB_NAME`, `walletsImage()` reading `WALLETS_IMAGE`, `buildPriceAuditSpec(callerToken)`, and `registerPriceAuditRoutes(admin)` with `POST /jobs/price-audit/run` and `GET… |
| 275 | 72.2 | x | Register the routes in `src/index.ts` next to `registerSheetsSyncRoutes`. |
| 276 | 72.2 | x | `DATABASE_URL` comes from the pguser Secret, whose key is `uri` — jobshot wires the whole Secret through `envFrom`, so the entrypoint is `["sh","-c"]` with `export DATABASE_URL="$uri"; exec node… |
| 277 | 72.2 | x | Tests: the spec carries the wallets image, the caller's token, the pguser secret and the `sh -c` wrapper; a second concurrent run is refused 409. - Tests: `npm run build` + full `npm run test` green. - Commit. |
| 278 | 72.3 | x | `WALLETS_IMAGE: ghcr.io/marx2/portfoliost-wallets:<tag>` in the admin HelmRelease, matching the wallets pin in its own release, with a comment saying the two must move together. |
| 279 | 72.3 | x | Release both modules (GHA tags; verify the tag resolves to the intended commit before pinning), push, confirm one replica each on the new tag. |
| 280 | 72.3 | x | Confirm from inside the Job's image that the entrypoint exists and the script is present, before calling the job wired. |
| 281 | 72.3 | x | **The Jobs panel is a hardcoded card list — the backend route alone is not a usable job.** `JobsView.vue` gained a "Data quality" section with a Price audit card, a tolerance input and a Run button. The… |
| 282 | 72.3 | x | SPA `v1.0.260`. - Commit. |
| 283 | 72.4 |  | Run the job for real against PROD and record the findings in this section. |
| 284 | 72.4 |  | Every flagged symbol gets one of: a `NAME_VENUE_OVERRIDES` entry (validated against its stored trades, as `SRT3.DE` was), a currency fix, or a recorded false positive with the reason — never a silent… |
| 285 | 72.4 |  | Decide whether the `MFC` false positive from §71.6 is fixed by narrowing the rule or by recording the exception. |
| 286 | 72.4 |  | Re-run and assert the flagged count only goes down. - Commit. |
| 287 | 72.5 | x | Resolve or record the **`Equate+` +118.7%** reconciliation gap. |
| 288 | 72.5 |  | Archive §71 and §72 to `plan-archive.md`. |
| 289 | 73.3 | x | Measure and record the curve; bump the limit; document why it is a delay. |
| 290 | 73.3 | x | Verify the new pods start at ~320–358Mi against the 2Gi ceiling. |
| 291 | 73.4 |  | Reproduce deterministically: drive N sequential requests against ONE `/equity/logo/<sym>` and M against `/equity/ohlcv/<sym>`, sampling `working_set_bytes` between batches, so the two paths are separable… |
| 292 | 73.4 |  | For the leaking path, bisect inside it: one call vs many, and with the provider call stubbed. Stub-out is the decisive test — if memory flattens with the provider stubbed, the retention is ours (registry,… |
| 293 | 73.4 |  | Check the obvious holders in `src/main.py` and `src/openbb_client.py`: module-level dicts/lists, a `ThreadingPoolExecutor` retaining futures, and any `requests.Session` reused across calls. - Tests: a… |
| 294 | 73.5 |  | Fix the retaining structure, or pin/upgrade the upstream dependency if the retention is OpenBB's. Do not paper over it with a bigger limit. |
| 295 | 73.5 |  | Re-run 73.4's measurement and show working set flat across the same workload that produced +240Mi/30min. A screenshot of the curve is the deliverable. |
| 296 | 73.5 |  | Then reconsider the limit downward once the curve is flat — 2Gi is headroom for bursts, not a target to keep. |
| 297 | 73.5 |  | Add an alert on `container_memory_working_set_bytes` growth rate, so the next leak is caught by a trend rather than by an OOMKill. - Commit. |
| 298 | 72.6 |  | Resolve the open question with ING01's published NAV for 2023-04-07 (and one later date) before building anything. |
| 299 | 72.6 |  | If the class is wrong: add an openbb provider in `openst` for that specific ING Akcji class, following the provider-tier order in the planner contract — capture the provider's response into… |
| 300 | 72.6 |  | Sweep the other TFI rows for the same defect. `ticker_reference` knows **zero** `.TFI` symbols, so nothing cross-checks them, and the same family is named "NN Emerytura 2025/2030" but "Goldman Sachs… |
| 301 | 72.6 |  | Separately: `positions.company_name` inherited the stale sheet name, so the UI shows a fund's former brand. Cosmetic, but it is what made this look like a wrong-fund problem rather than a class problem. |
| 302 | 72.7 | x | Deploy §72.14 and recompute all ten portfolios |
| 303 | 72.7 | x | Confirm the spike is gone and history is a curve |
| 304 | 72.7 |  | §72.15 (below): reconcile the residual −0.5% last-day FX seam |
| 305 | 72.8 | x | Decide the rule: when the instrument's listing currency is known from the provider, it must win over the payment currency (never the reverse). Record it in `instrument-resolver` as the currency source, and… |
| 306 | 72.8 | x | Data fix: `BTC-USD` → `USD`; the two 2024-10-14 sells → `USD`. |
| 307 | 72.8 | x | Re-run the audit afterwards and confirm Crypto's 2022 jumps resolve to the real purchase steps (2 buys, 5 trades total). |
| 308 | 72.9 | x | §72.15 — grid checks the bar's own currency (deployed `v1.1.92`) |
| 309 | 72.9 | x | §72.16 — grid drops the prefix before `fxFrom` (deployed `v1.1.93`) |
| 310 | 72.9 | x | Recompute Crypto and confirm the jumps resolve |
| 311 | 72.10 | x | **DONE (instruments `375c91f`, NOT DEPLOYED — no cluster access).** Semantics chosen: **drop the bar**. `convertSeries` returns a `convertedMask`; the route filters timestamps/OHLC/volumes through it, so… |
| 312 | 72.10 | x | **Deploy `v1.0.77` when a cluster is available**, then recompute Crypto, IKE Marek, IKE Beata, IBKR and Equate+ (the portfolios with non-PLN positions). Expect Crypto's remaining +410% jumps to clear —… |
| 313 | 72.10 | x | **DONE** — `docs/proposals/price-data-architecture.md` rewritten. The old rule ("bars older than `fxFrom` are unconverted, left in the base currency") is marked superseded and must not be reimplemented; the… |
| 314 | 72.10 |  | Add `unconvertedDates` (or a count) to the `/price-bars` response so a caller can see what was dropped instead of inferring it. Needs a contracts change + `npm run gen:types` in… |
| 315 | 72.10 |  | Re-check the other `?currency=` consumers now that the response is shorter than requested: wallets grid (covered), `buildBenchmarkSeries`, the SPA history/compare charts, and `mocks/`. A consumer that… |
| 316 | 72.10 | x | Backfill `fx_rates` further back. The 2022-02-13 gap is a coverage problem as much as a code one; dropping bars is correct but it is better not to need to. |
| 317 | 72.11 |  | Re-run the full suite in CI and check whether it ever goes red; if it does, capture the name rather than re-running until green. |
| 318 | 72.11 | x | Deploy §72.18 with the next wallets release and re-run the audit, to confirm SAP.DE stops being reported. |
| 319 | 72.12 | x | **contracts** — `listingCurrency` added to `ImportPortfolioTx` (openapi.yaml documents the precedence and the never-guess rule). **Not yet released**, so generated types don't have it. |
| 320 | 72.12 | x | **wallets `c7993a5`** — the import row accepts `listingCurrency` and prefers it for both the transaction's and the position's `instrumentCurrency`. Works today because the route validates with local zod,… |
| 321 | 72.12 | x | **sheets-sync `93fc866`** — `ResolvedInstrument.listingCurrency`, set on both resolution paths, sent on every trade row. `cryptoListingCurrency` reads the quote currency off a crypto `BASE-QUOTE` ticker,… |
| 322 | 72.12 |  | Release `@marx2/contracts`, regenerate types in wallets (`npm run gen:types`), then drop the two local shims: the `ImportPortfolioTxWithListing` widening in `transakcje-mapper.ts` and the note in the… |
| 323 | 72.13 | x | 30s timeout on that test, with a comment saying the cost is the harness (`eb79515`). Six consecutive full-suite runs green, 460 tests. |
| 324 | 72.13 | x | Do not use `cmd \| tail` to gate a commit — it was how the first red run got committed in the first place. Check the test count explicitly. |
| 325 | 72.14 | x | **Run the ING01 published-NAV check for 2023-04-07 and a later date** — done via the 2026-09-25 value above; the series is verified against the official NAV, so the 2023-04-07 check is no longer the… |
| 326 | 72.14 | x | **Withdraw the "openst provider for a specific ING Akcji class" step** — the provider is right. |
| 327 | 72.14 |  | Compare the raw sheet columns for one flagged trade against the stored row to find which column produces 1.126. Needs cluster access. |
| 328 | 72.14 |  | If it turns out to be a distinct unit category, THEN reconsider a provider — and check first whether the sheet even records which category a row is, since without that no provider could disambiguate it either. |
| 329 | 72.15 | x | Source audit: no in-process leak in this repo |
| 330 | 72.15 | x | `GET /__mem` + `memdebug.py` + 6 tests (`dfede54`) |
| 331 | 72.15 | x | Deploy with `MEM_DEBUG=1`, exercise logo/search/research traffic, and take two `__mem` snapshots at least 30 minutes apart. That single pair decides whether this is even our bug. |
| 332 | 72.15 | x | If `traced_fraction` is large: `top_allocations` names the container. |
| 333 | 72.15 | x | If it is small: stop looking here. Options are bounding OpenBB's caches at the singleton, or a worker-per-request model. Both are bigger than the 2Gi mitigation already in place, and the measurement decides… |
| 334 | 72.16 | x | Fetch the NAV of all nine categories (A, E, F, I, K, S, T, U, W) for one known date, e.g. 2026-08-19 where our bar is 795.02. The class at **≈706 PLN** is ours. This is the identifying step and needs no code. |
| 335 | 72.16 |  | If identified, build the openst provider per the planner contract's provider-tier order: capture the provider response into `openst/tests/fixtures/` first, then the plugin with mocked I/O, then openst… |
| 336 | 72.16 |  | Map the class explicitly in `ticker_reference` (`INGAKC.TFI` → category), so the class stops being implicit. `ticker_reference` currently knows **zero** `.TFI` symbols, which is why nothing cross-checks them. |
| 337 | 72.16 |  | Fix the stored `positions.company_name` ("Goldman Sachs Akcji"), inherited from the stale sheet name. |
| 338 | 72.16 |  | Sweep the other `.TFI` rows: the same sheet names one family "NN Emerytura 2025/2030" and another "Goldman Sachs Emerytura 2060/2065" — the same rename applied inconsistently across rows. |
| 339 | 72.18 | x | Deploy `v1.0.79` and verify the live response |
| 340 | 72.18 | x | Recompute the five non-PLN portfolios |
| 341 | 72.18 | x | Confirm Crypto's jumps cleared (410.1% → 48.9%, alternating days now a curve) |
| 342 | 72.18 | x | For IBKR/IKE Beata/IKE Marek/Equate+, check each remaining worst-jump date against that day's transactions. A jump with a trade is real; one without is still a bug, and the symbol and currency for that date… |
| 343 | 72.18 |  | Re-run the price audit (§72.18 shipped but the audit has not been re-run) and confirm SAP.DE stops being reported. |
| 344 | 72.19 | x | Fetch E, F, I, S, T, U, W on 2026-09-25 and find the one at ≈922.5 PLN. |
| 345 | 72.19 | x | Confirm on a second date (2026-08-19, where our bar is 795.02 and the target is ≈706) so a coincidental match cannot pass. |
| 346 | 72.19 | x | If no category lands there, stop and treat the sheet's price column as the suspect — do not build a provider against a series that is not the problem. |
| 347 | 72.20 | x | Look for the **Goldman Sachs TFI-era "Akcji" series** and its unit categories (GS Akcji A/E/F/I/K…), and find the one at ≈1.126× the ING-era A series. This is the actual identification question now. |
| 348 | 72.20 | x | Establish what the GS → NN → ING rename did to the units: rename only, or rename plus re-denomination. A re-denomination would explain a constant ratio on its own, and would mean the sheet's *quantity* also… |
| 349 | 72.20 |  | Only then build the provider, per the planner contract's provider-tier order |
| 350 | 72.20 |  | Record the identifier in `ticker_reference` whatever it turns out to be: `INGAKC.TFI` carries no category letter, and `ticker_reference` knows zero `.TFI` symbols, so nothing cross-checks these rows today. |
| 351 | 72.21 | x | Confirm the hypothesis: find the earliest `fx_rates` date for the pairs held by IBKR and IKE Beata, and check it lands on 2022-06-20 and 2022-05-13. The endpoint is `GET /ohlcv/FX?symbol=<pair>&start=&end=`… |
| 352 | 72.21 | x | **Backfill `fx_rates` further back** (already a §72.17 follow-up, now load-bearing: it is what removes these steps). |
| 353 | 72.21 |  | Make the coverage boundary visible rather than leaving it to look like a market move — the same job `gapSymbols` does for missing bars, extended to FX. |
| 354 | 72.21 | x | **IKE Marek: the number moved between measurements** — reported as 176.4% @ 2025-05-02, then re-measured as +1.4% on the same series with no recompute in between. Treat any single "worst jump" figure from… |
| 355 | 72.22 | x | Add `/jobs/price-audit/log` for `price-audit` (and note `sheets-sync` has the same gap — its run output is also stdout-only). |
| 356 | 72.22 | x | Persist per-symbol verdicts so two runs can be compared; a symbol that was flagged and is now clean is exactly the signal §72.17b/§72.18 should produce. |
| 357 | 72.22 |  | Re-read this run's actual findings once a log route exists, and confirm SAP.DE no longer appears. |
| 358 | 72.23 |  | **The decisive check, and it is cheap:** for ONE flagged 2023-04-07 trade, dump every raw column of that sheet row beside the stored row. Whatever column produces 382 from 339 is the answer. This needs no… |
| 359 | 72.23 | x | If it is a restatement multiplier, check how many of the 79 rows carry a `Split` marker; 29 restated and 50 not would explain the split exactly. |
| 360 | 72.23 |  | Keep `INGAKC.TFI` mapped to `ING Akcji` — it is the right fund and the right class, whatever the price column turns out to say. |
| 361 | 72.23 |  | Still worth recording in `ticker_reference`: it knows zero `.TFI` symbols, so nothing cross-checks these rows. Correct identifier, no new provider. |
| 362 | 72.24 | x | **Run it** — `POST /api/admin/jobs/fx-backfill/run`. Not run: the Playwright session had expired and I was not going to sit waiting. |
| 363 | 72.24 | x | Recompute the affected portfolios afterwards and confirm the IBKR / IKE Beata steps are gone or much reduced. |
| 364 | 72.24 |  | Confirm `fx_rates` row count and earliest date per currency afterwards — the number to watch is the EARLIEST date, since the whole point is history. |
| 365 | 72.24 | x | If the steps survive, the boundary is not FX coverage and §72.21's hypothesis is wrong; the next suspect is a symbol whose bars simply start then. |
| 366 | 72.25 | x | Rewrite all four to the working shape |
| 367 | 72.25 | x | Add `startupProbe` to all four |
| 368 | 72.25 | x | Bump wallets + admin to chart 5.1.0 |
| 369 | 72.25 | x | jsonschema-validate all five + assert probe paths resolve |
| 370 | 72.25 | x | After Flux applies: confirm the pods come up and that `kubectl describe` shows real `httpGet` probe blocks rather than absent ones. The push is merged; the rollout is Flux's. |
| 371 | 72.26 | x | IBKR: run test 1 (the ±24h `executed_at` window around 2022-06-20). This is the likeliest of the two and needs one query. |
| 372 | 72.26 | x | IBKR: if that is empty, re-check every open symbol for the first date its **currency=PLN** response returns a close, not its first bar date. |
| 373 | 72.26 | x | FX backfill run and verified to have added history |
| 374 | 72.26 | x | IKE Beata 2022-05-13 explained (deposit) — no action, it is correct |
| 375 | 72.26 | x | §72.21's hypothesis falsified, recorded so it is not retried |
| 376 | 72.28 | x | **XTB: 1680 negative-value snapshots.** Values run -1.90 … -55.57 and XTB has **zero** cash rows, so the negative is coming from the position side, not from an overdraft. A negative portfolio value is a… |
| 377 | 72.28 | x | **IKE Marek 2022-06-13, +152% (6796 -> 17123), explained but a real defect.** Sold four bonds that day: BST0922, INS0922 (26 units each), NVA0624, VOX0224. Selling illiquid bonds into cash is a *swap*, so… |
| 378 | 72.28 | x | **Re-run the 11 unexplained with the near-zero-denominator filter.** `9.49 -> -4.04` is a 13 PLN move on a ~0 base, which is why XTB's small values keep tripping a 20% threshold. Filter on `abs(pv) > 1000`… |
| 379 | 72.28 | x | §72.21 / §72.26 step investigation closed — all four original flags were flows or the bond-valuation case above |
| 380 | 72.29 | x | **XTB needs its opening cash.** Data-side, not code: either the sheet is missing a DEPOSIT/transfer-in row, or sheets-sync should synthesise an opening deposit when a portfolio has positions but zero… |
| 381 | 72.29 | x | **Guard against the general case.** A portfolio with positions but no inflow is silently "valid" today and produces a negative history. Worth an explicit check in the audit: positions exist AND total inflow… |
| 382 | 72.29 | x | XTB's 1680 negative snapshots explained — missing opening deposit, not a valuation bug |
| 383 | 72.30 | x | Re-sample in ~24h and compute `(rss_now - 708MiB) / uptime_delta`. Flat or sub-linear ⇒ no unbounded growth, close §73. Linear at a fixed rate ⇒ the OpenBB singleton is leaking and the fix is a bounded… |
| 384 | 72.31 | x | Window-wide gap scan, separate abort accounting, tests, deployed v1.1.96 |
| 385 | 72.31 |  | **Bond pricing is a data problem, not a code one.** Six PL bonds 404 upstream. Either find a source that carries them, or accept the partial sum and make the UI say so. Until then these portfolios' pre-sale… |
| 386 | 72.31 |  | Propagate the window-wide gap into the UI: `GET /:id/analytics` can flag the value as partial, but "partial on which days" is not currently represented. |
| 387 | 72.32 | x | unfunded-portfolio finding, 4 tests, deployed v1.1.97, verified against prod |
| 388 | 72.32 |  | XTB: add the opening deposit to the source sheet and re-import. Until then its value history is offset and its TWR/MWR is meaningless. |
| 389 | 72.32 |  | The bond gap (§72.31) and this check are both "the import is incomplete" and both were invisible. Consider one import-completeness report rather than two checks living in different places. |
| 390 | 72.33 | x | §63.15 metadata sweep; 8 genuinely unpriceable held symbols identified, TOR false positive understood |
| 391 | 72.33 | x | The 8 bonds: find a source that carries PL government bonds, or accept the partial sum. Affects IKE Beata and IKE Marek history while held. |
| 392 | 72.33 |  | `price_bar_metadata` should distinguish "upstream profile 404" from "no price series", so `failed` stops conflating a delisting with a gap. |
| 393 | 72.34 | x | openst memory investigated to a verdict: 2-sample rate + RS history; no leak |
| 394 | 72.34 | x | §73 leak question closed — the suspected leak was never evidenced |
| 395 | 72.34 | x | Re-sample after a few days only if openst is redeployed for other reasons; not worth a dedicated investigation on current evidence |
| 396 | 72.35 | x | XTB root cause located in the source sheet, exact row specified |
| 397 | 72.35 |  | Add the `Wpłata` row above, re-import, confirm the unfunded-portfolio finding clears and `invested` stops being 0 |
| 398 | 72.36 | x | §72.23 decisive check: the raw row is internally consistent, unsplit, and the same fund — so the cause is a single price cell |
| 399 | 72.36 | x | §72.19 / §72.20 / §72.6 / §72.16 provider chain: closed, premise falsified |
| 400 | 72.36 |  | Correct row 604's price to the real 2023-04-07 NAV and re-import, then confirm the audit finding clears |
| 401 | 72.36 |  | Why is EUR absent from `fx_rates` while every other currency is stored? |
| 402 | 72.37 | x | §72.36 retracted; row 604 must NOT be edited |
| 403 | 72.37 | x | `1.126` explained: an audit comparison against the wrong date for an order-priced fund, not a fund class and not bad data |
| 404 | 72.37 |  | **Audit fix:** for fund/accumulation instruments (`*.TFI`, PPO/PPI) the executed price belongs to the valuation date, so compare against a date window rather than the exact `executed_at` bar — or skip the… |
| 405 | 72.37 |  | **Still open, and genuinely open:** `INGAKC.TFI` does not reproduce the executed NAVs — 351.93 on the 2023-04-13 valuation date against 382.05 paid, and 819.44 today against the sheet's own `aktualny kurs`… |
| 406 | 72.38 | x | **§72.6 / §72.16 provider items RESTORED to open** — the N/A was a conflation of name lineage with price series |
| 407 | 72.38 | x | §72.37's "valuation-date artefact" explanation withdrawn — a date offset cannot produce a ratio that grows 1.0899 → 1.1270 across three years |
| 408 | 72.38 | x | **No splits in this fund** (user-confirmed 2026-09-29), consistent with `instruments.split_adjustments` holding 0 rows. Rules out the split/restatement branch entirely — the divergence is not a units… |
| 409 | 72.38 |  | **Decisive, now cheap and unambiguous:** compare `INGAKC.TFI`'s bar against ING01's *published* NAV for **2026-08-19** (bar 795.02, paid 896.00) and **2023-04-13** (bar 351.93, paid 382.05). If ING01 ≈… |
| 410 | 72.38 |  | Build the openst provider for that class, in the planner contract's provider-tier order: fixture → plugin with mocked I/O → openst smoke → cachest route → instruments adapter → compose. |
| 411 | 72.38 |  | `ticker_reference` knows zero `.TFI` symbols, so nothing cross-checks them. |
| 412 | 72.38 |  | `positions.company_name` still shows the stale "Goldman Sachs Akcji". |
| 413 | 72.39 |  | Step 1 — ING01 published NAV for 2026-08-19 and 2023-04-13 |
| 414 | 72.39 |  | Step 2 — openst provider for the identified class, tier order |
| 415 | 72.39 |  | Step 3 — `ticker_reference` entry for the class + sweep the other `.TFI` rows |
| 416 | 72.39 |  | Step 4 — `positions.company_name` off the stale sheet name |
| 417 | 72.39 |  | Audit: date window / order-priced exemption for fund trades |
