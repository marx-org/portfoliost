# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then
archived. This file holds **only unfinished work**; everything completed,
superseded or obsoleted lives in `plan-archive.md`.

Some steps below cite an earlier section by number for provenance (e.g. "the
bar established in §63.13"). Those citations may point into `plan-archive.md` —
the RCA they refer to is preserved there in full.

Legend: `[ ]` pending · `[x]` done (a `[x]` only ever appears in a step that
also still has `[ ]` work; fully finished steps are archived)

---

## 57. Transactions UI: clipped labels picker, hidden action column (user request 2026-09-24)

Proposal: — (direct user request; no proposal doc).

Two transactions-UI bugs reported from PROD (SPA v1.0.220 / wallets v1.1.55,
homelab). Both verified locally (vite + mock backend, 1280px viewport)
and, for the layout, against live example-service (the parity source):

1. **The "Labels" button looks dead in the transactions tables.**
   `LabelPickerPopover.vue:114` is `position:absolute; right-0` anchored to a
   detached zero-height `relative inline-block` div, never to the clicked row.
   In `TransactionsTable.vue` that anchor (:529–539) sits inside the root
   `card overflow-hidden` (:291, closes :540): the empty inline-block collapses
   to the card's left edge, so the 288px-wide panel opens at the card's
   bottom-left and extends ~170px below the card's bottom edge. Measured at
   1280px: popover top 1320 vs card bottom 1323, popover left −39
   (off-viewport) → the panel is fully clipped by `overflow-hidden`. In
   `CashTransactionsView.vue:380–390` and `PortfolioHoldingsTab.vue:575–584`
   the anchor sits outside the card, so the panel is not clipped but renders at
   the bottom of the page, hundreds of px from the clicked row (the holdings
   e2e in `tests/e2e/labels.spec.ts` passes for exactly that reason).
 2. **Labels are not visible in the transactions list.** The backend is
    correct: wallets joins `transactionLabels` in every list route
    (`portfolio-transactions.ts:1154–1206` per-portfolio, `:1668–1740` global
    `routes.get("/")`; `history.ts:105–115 / :131–143 / :159–174` the three
    wallet-cash routes), PROD wallets v1.1.55 (2026-09-24) contains D65–D68
    (`7075df9`), and the SPA already renders chips where data exists
    (`TransactionsTable.vue:389`, `CashTransactionsView.vue:234`). At the time
    of the report no PROD transaction carried a label: the only assignment
    paths were the broken picker (bug 1) and the sheets-sync import — and
    §55 **closed the same day** (commit `939ede9`): wipe & re-import clean
    (2016 rows, 0 errors, **39 labels created, incl. 33 `OwnSAP` transaction
    labels**), so the data gap is gone; PROD re-verification belongs in 57.5.
    Two real gaps remain: `WalletDetailView.vue:399–451` "Recent Transactions"
    renders no chips at all (its API `GET /api/wallets/:id/transactions`
    returns `labels`), and `portfoliost-wallets src/routes/transactions.ts:256`
    hardcodes `labels: []` in the wallet-tx PATCH response (the SPA re-fetches
    after edits so it is not user-visible today, but it contradicts the
    contract). The mock backend has zero label routes (dev-mock 404s on
    `/api/labels`) — out of scope here; e2e runs against the real wallets
    compose service.
3. **Action buttons invisible in the consolidated (global) transactions
   view.** Global mode is 10–11 columns; measured at 1280px: table wrap
   clientWidth 991 / scrollWidth 1143, actions-cell right edge 1392 vs the
   visible area ending at 1240 → Edit 22/38px visible, Labels + Delete fully
   off-screen behind `overflow-x-auto` (the user's "form is not wide enough").
   Example service (measured live on `app.example-service.ai`, both its transactions tables)
   keeps the actions column visible via `position:sticky; right:0;
   z-index:10` with a solid background (dark `rgb(15,20,36)`) and a
   `box-shadow: -1px 0 0` left separator — that is the parity fix.

Repos touched: `portfoliost` (SPA — 57.1, 57.2, 57.3, 57.5) and
`portfoliost-wallets` (57.4). No contracts change: response shapes are
unchanged, only the PATCH response stops lying about `labels`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose e2e per AGENTS.md).

---

### 57.1 — Floating label picker anchored to the clicked button (fixes "labels button does not work")

- [ ] New `src/utils/popoverPosition.ts`: pure
  `computePopoverPosition(trigger: {top, right, bottom, left}, panel:
  {width, height}, viewport: {width, height}): {top, left}` — default below
  the trigger, panel's right edge aligned to the trigger's right; flip above
  (`top = trigger.top − gap − panel.height`) when the below position exceeds
  `viewport.height`; clamp `left ≥ 8` and `top ≥ 8`. Plain objects, no DOM —
  unit-testable.
- [ ] `LabelPickerPopover.vue`:
  - New prop `trigger: {top, right, bottom, left} | null` (rect numbers
    captured at click time — the trigger may unmount after a kebab menu
    closes, so store numbers, not the element).
  - Wrap the panel in `<Teleport to="body">`; replace `absolute right-0 mt-1`
    with `fixed z-40` + `:style` top/left from `computePopoverPosition`
    (panel size from a template ref measured after mount; estimate
    `{width: 288, height: 320}` for the first paint).
  - Close on outside `pointerdown` (document listener, ignore events inside
    the panel) and `Escape`; recompute position on `scroll` (capture) and
    `resize` while open. The `open` prop and `close`/`saved` emits are
    unchanged so the three call sites keep their contract.
- [ ] Rewire the call sites — delete the detached anchor div, pass the
  clicked button's rect:
  - `TransactionsTable.vue`: `openLabelPicker(tx, e: MouseEvent)` stores
    `pickerTrigger` from `e.currentTarget.getBoundingClientRect()`; replace
    the `:529–539` anchor div with a plain `<LabelPickerPopover … :trigger="pickerTrigger" />`
    mount; `@close` now clears `pickerTx` as well as `pickerOpen` (fixes the
    lingering empty anchor after Cancel).
  - `CashTransactionsView.vue:380–390` and `PortfolioHoldingsTab.vue:575–584`:
    same change (holdings passes the kebab "Set labels…" item's rect).
- [ ] Unit tests:
  - New `tests/unit/utils/popoverPosition.test.ts`: fits-below → below,
    right-aligned; no room below → flip above; narrow viewport → left clamped
    ≥ 8; no negative top.
  - Extend existing `tests/unit/components/LabelPickerPopover.test.ts`: panel
    renders into `document.body` (teleport) at the util-computed position for
    a given trigger rect; outside click emits `close`; Escape emits `close`.
- [ ] E2E: new `tests/e2e/transactions-labels.spec.ts` (serial, reuse the
  `login` helper from `labels.spec.ts`): on the portfolio transactions tab —
  click a row's "Labels" → `dialog[name="Set labels"]` visible **and** its
  `boundingBox()` inside the viewport with `top` within ~250px of the clicked
  row's `boundingBox().y` (proves adjacent, not bottom-of-page, not clipped);
  check a label, Save → chip `[title=<name>]` appears in that row. Repeat the
  open+assert flow on the global `/en/investments/transactions` view (the bug-1
  site).
- [ ] Tests: `npm run test`, `npm run build`, `npm run test:mock`,
  `npm run test:e2e` (docker compose) green.
- [ ] Commit.

### 57.2 — Sticky actions column in the transactions tables (example-service parity; fixes hidden Edit/Labels/Delete)

- [ ] `TransactionsTable.vue`:
  - Actions `th` (:343) and actions `td` (:456): add
    `sticky right-0 z-10 bg-white dark:bg-slate-900` plus the left separator
    `shadow-[-1px_0_0_0_#e2e8f0] dark:shadow-[-1px_0_0_0_#334155]` (example-service
    parity: `box-shadow: -1px 0 0`, solid background, z-10).
  - Row `<tr>` (:357): add `group`; the sticky `td` gets
    `group-hover:bg-slate-50 dark:group-hover:bg-slate-800` — opaque, so the
    scrolled-under columns never bleed through (the existing
    `hover:bg-slate-50 dark:hover:bg-slate-800/50` tr tint is translucent and
    cannot be used on the sticky cell).
  - Group-subtotal row (:479): split the trailing `td[colspan]` into a plain
    Ccy spacer `td` (global mode) + the sticky actions `td`, so the sticky
    cell is exactly one column wide.
- [ ] `CashTransactionsView.vue`: same treatment on its actions `th`/`td`
  (:239–266) — no overflow today at 1280 (6 columns), but parity +
  narrow-viewport safety.
- [ ] E2E (extend `transactions-labels.spec.ts`): at the default 1280×720
  viewport on the global transactions page — assert each row's Edit/Labels/
  Delete `boundingBox()` right edges are ≤ the table wrap's client rect right
  edge at `scrollLeft = 0` (visible without scrolling); then set the wrap
  `scrollLeft = scrollWidth` and assert the buttons keep the same on-screen x
  (sticky holds).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `npm run test:e2e` green.
- [ ] Commit.

### 57.5 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease; 57.4 ships a
  wallets release + pin bump the same way (`KUBECONFIG=$HOME/.kube/homylab`,
  ns `pfire`).
- [ ] Flux + kubectl verify both deployments rolled.
- [ ] Playwright PROD (user's passkey session):
  - Consolidated transactions at 1280–1440px: Edit/Labels/Delete visible with
    no horizontal scroll; after scrolling the table right they stay pinned
    (sticky).
  - "Labels" on a transaction row: popover opens adjacent to the row (not
    clipped, not off-screen); assign a label → Save → chip appears in the row;
    for a wallet tx the chip also shows in the cash view + wallet detail.
  - Labels visible in the list (the §55 re-import already ran — 39 labels,
    33 `OwnSAP` tx labels): the 2023-12-06 SAP Kupno row shows the `OwnSAP`
    chip in the global view and in the per-portfolio transactions tab; the
    label filter bar lists the imported labels and filters the table.
- [ ] Commit (plan closeout) + archive §57 to `plan-archive.md`.

**Out of scope (noted):** labels control inside edit/create forms
(`EditTransactionModal`, wallet edit dialogs) — not part of the reported
bugs; mock-backend label routes (`/api/labels` 404 in dev-mock mode) —
separate follow-up.

---


## 59. ApexCharts 5.16 → 7.5.1 (user request 2026-09-24)

Proposal: — (direct user request: "upgrade charts apex to latest"; no proposal doc).

SPA-only dependency bump: `apexcharts ^5.10.0` (5.16.0 installed) →
`^7.5.1` (latest, 2026-09-20), keeping `vue3-apexcharts 1.11.1` (already the
latest release; peer range `apexcharts >=5.10.0`). No other repo is touched —
no contracts, no backend, no provider tier.

Verified 2026-09-24 (upstream release notes + a temporary local bump that was
fully reverted afterwards):

- **Usage surface is small.** All ~14 chart mounts go through the local
  `src/components/ApexChart.vue` wrapper (globally registered as
  `apexchart`), which wraps `vue3-apexcharts`. Chart types in use: area
  (card sparklines, wallet balance, price area), line (portfolio performance),
  bar (seasonality, EPS surprises, fundamentals, charting comparison), donut
  (allocation, projections). **None** of the v7 opt-in features
  (trellis/storyboard/perspectives/ink/renderer-canvas/link/measure/history/
  context-menu) and **no** `plotOptions.bar.borderRadiusWhenStacked` (removed
  in v7) are used — both v7 breaking changes are no-ops here. `dataLabels`
  are enabled only on the static research bar charts; v7's new
  `dataLabels.animate.enabled` default (true) affects only data-change
  updates, not initial render.
- **v6.0.0 is config-compatible** ("existing configs keep working unchanged");
  its default-on behaviour changes (coherent variable-length transitions,
  mobile pinch/pan) are no-ops: our charts remount on data swap via the
  §48.6e `key` pattern rather than in-place `updateOptions`, and the app is
  desktop-first. v6's idempotent `render()` additionally guards the
  wrapper's mount path.
- **Wrapper works on v7 — proven, not assumed.** `vue3-apexcharts 1.11.1`
  predates v6/v7 (published 2026-03-03) and was never tested against them, but
  a live smoke (temporary `apexcharts@7.5.1` install, vite dev + mock backend,
  Playwright) rendered every surface correctly: sparklines, performance line,
  research PriceChart incl. the custom `tooltip.custom` HTML on hover
  (`.apexcharts-tooltip`/`-title`/`-series-group` structure intact), bars with
  data labels, grouped bars, donut. **Zero** console warnings — in particular
  no v7 "feature configured but not loaded" warnings — and no watermark.
  Every e2e selector the suite depends on (`.apexcharts-canvas`,
  `svg.apexcharts-svg`, `g.apexcharts-grid`, `.apexcharts-yaxis text`,
  `.apexcharts-xaxis`, `.apexcharts-tooltip`, `.apexcharts-legend`) is
  unchanged in v7. One v7 DOM difference found: donut slices are now
  `apexcharts-donut-slice-N` (indexed) instead of bare
  `apexcharts-donut-slice` — nothing in `src/` or `tests/` references the
  bare class, so no action.
- **Licensing improves.** The v6.x default bundle shipped 24%
  licence-gated Premium code (watermarked without a licence); v7 moved all
  premium features to opt-in add-ons, so the default bundle is 0% gated and
  our usage (all free-tier features) renders watermark-free — verified in the
  smoke.
- **Node engines:** apexcharts 7.5.1 declares `^20.19.0 || ^22.12.0 ||
  >=24.0.0`; the Dockerfile's floating `node:22-alpine` currently resolves to
  22.23 (satisfied) and the local toolchain is 22.23. No Dockerfile change
  needed; noted so a future node-20 pin doesn't break the build.

Design decisions (resolved 2026-09-24): keep `vue3-apexcharts` (the smoke
above is the evidence for the keep-vs-drop question); if 59.2 nevertheless
exposes wrapper/v7 incompatibility in the dockerized stack, the fallback is to
replace `vue3-apexcharts` with a ~60-line direct wrapper inside the existing
`ApexChart.vue` (`new ApexCharts(el, options).render()` on mount, destroy on
unmount, keep the remount-key pattern the callers already use) — and re-run
59.2.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per AGENTS.md).

---

### 59.1 — Bump `apexcharts` to `^7.5.1`

- [ ] `package.json`: `"apexcharts": "^7.5.1"`; `npm install` → commit the
  `package-lock.json` change; assert the tree resolves `apexcharts@7.5.1` and
  `vue3-apexcharts@1.11.1` (unchanged) — `npm ls apexcharts vue3-apexcharts`.
- [ ] No source changes expected (config compatibility verified in the
  section intro). If `vue-tsc` surfaces type fallout from the types v6+ ships
  in-package (e.g. `chart.type` literal narrowing in the `as const` options
  objects), fix it in the affected chart components only — minimal diff, no
  behaviour change.
- [ ] Tests: `npm run build` (includes `vue-tsc --noEmit`), `npm run test`,
  `npm run test:mock`, `docker compose up -d --build` +
  `npm run test:e2e` (the chart specs — `chart-currency`,
  `chart-title-stability`, `chart-recompute`, `charting`, `combined-chart`,
  `parity-portfolios`, `research`, `performance-display-currency` — assert on
  the `.apexcharts-*` DOM and double as the v7 DOM-compatibility gate) green.
- [ ] Commit.

### 59.2 — Visual + console sweep across all chart surfaces (docker compose)

- [ ] Against the rebuilt compose stack (`:8080`), Playwright pass at 1280px
  over every chart surface: main page (portfolio-card sparklines +
  "Portfolio Value" line), research overview (PriceChart: render, custom
  tooltip on hover shows title + series row + transactions block when
  transactions are enabled, buy/sell markers), seasonality + EPS bar charts
  (data labels legible), allocation + projections donuts, charting grouped
  bars (preset-loaded), wallet balance area.
- [ ] Per surface assert: chart visible (`.apexcharts-canvas`), console has
  **zero** errors/warnings mentioning apexcharts — in particular no v7
  "feature … configured but … not loaded" warning and no watermark overlay or
  "Premium" text in the rendered page.
- [ ] If a surface drifted (label animation unwanted on the static bar
  charts, tooltip placement, sizing): adjust that component's options (e.g.
  `dataLabels: { animate: { enabled: false } }`) — re-run the sweep and the
  chart e2e specs.
- [ ] Commit (the fixes, if any; a verification-only step otherwise — note
  that in the commit of 59.3's plan closeout).

### 59.3 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease
  (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify the
  rollout.
- [ ] Playwright PROD (user's passkey session): main page cards + one
  research PriceChart render, custom tooltip works on hover, console clean,
  no watermark, no v7 feature warnings.
- [ ] Commit (plan closeout) + archive §59 to `plan-archive.md`.

---


## 60. Research "Go back" returns to the origin page (user request)

Proposal: — (direct user request; no proposal doc).

Bug (user-reported): the research page's "← Go back" link
(`src/modules/instruments/ResearchView.vue:89`) is hardcoded to
`/en/investments`. Coming into research from a specific portfolio (holdings
/ calendar / compare tabs) or from the transactions list (global or
per-portfolio), "Go back" drops the user to the main portfolios page
instead of the page they came from.

Fix: a context-aware back target. Every contextual entry point into research
passes the current page's `route.fullPath` as a `from` query param; the
research header's back link targets it (guarded to internal `/en/` paths).
When `from` is absent (deep link / first load / direct nav) the fallback is
`/en/investments` — today's behaviour. `from` is preserved across research
tab switches and symbol quick-switches so the origin is not lost mid-research.
`fullPath` (not just `path`) is used so transactions-list filter state
survives the round trip.

SPA-only (`portfoliost`); no contracts or backend changes. The sidebar
"Research" nav item (`SidebarNav.vue:60`, a static top-level nav entry to a
default AAPL symbol) is not a contextual link — explicitly unchanged, it
keeps the fallback.

Rules: one step = one commit; a step is marked `[x]` only after its tests
pass (unit + docker-compose level per AGENTS.md).

---

### 60.1 — Core: `from` query param + back-target resolution (`research.ts`, `ResearchView.vue`)

- [ ] `src/utils/research.ts`:
  - `researchRoute(symbol: string, from?: string | null): RouteLocationRaw`
    → `{ name: "research-overview", params: { symbol:
      researchSymbol(symbol) }, query: from ? { from } : undefined }`
    (single source for every entry point; keeps the existing symbol
    normalization rule).
  - `researchBackTarget(query: Record<string, unknown>): string` — pure:
    `typeof query.from === "string" && query.from.startsWith("/en/")` →
    return that path; anything else (missing, external URL, relative, junk)
    → `"/en/investments"`.
- [ ] `src/modules/instruments/ResearchView.vue`:
  - `const backTarget = computed(() => researchBackTarget(route.query))`;
    replace `to="/en/investments"` (:89) with `:to="backTarget"`.
  - Preserve `from` on in-research navigation so the origin survives
    tab/symbol switches: add
    `const preservedQuery = computed(() =>
    route.query.from ? { from: String(route.query.from) } : undefined)`;
    the tab-nav router-links (:112–121) get `:to="{ name: tab.name, params:
    { symbol: routeSymbol }, query: preservedQuery }"` and `goToSymbol`
    (:33–35) pushes the same query.
- [ ] Unit tests: new `tests/unit/utils/research.test.ts` —
  `researchRoute`: with `from` (query present, symbol normalized), without
  (`query` absent, not an empty object); `researchBackTarget`: a valid
  `/en/portfolios/1/holdings` passed through; `http://…`, `//evil`,
  `investments` (relative), non-string, and empty query →
  `/en/investments`.
- [ ] Tests: `npm run test`, `npm run build`, `npm run test:mock` green.
- [ ] Commit.

### 60.2 — Wire `from` (current `route.fullPath`) at all contextual entry points

Every navigation into research below switches to
`researchRoute(symbol, route.fullPath)` (add `useRoute()` where the
component does not already use it):

- [ ] `src/components/TransactionsTable.vue:373` — shared by the global
  `/en/investments/transactions` view and the per-portfolio transactions
  tab (the reported bug site).
- [ ] `src/modules/portfolios/PortfolioHoldingsTab.vue` — `goResearch()`
  (:328, kebab "Research") and the symbol router-link (:426).
- [ ] `src/modules/portfolios/PortfolioCalendarTab.vue:221` (event chips).
- [ ] `src/modules/portfolios/PortfolioCompareTab.vue:60` (rows).
- [ ] `src/modules/portfolios/EditTransactionModal.vue:173` (`goResearch` —
  `from` = the page the modal was opened over, since the route is
  unchanged while a modal is open).
- [ ] `src/modules/portfolios/AddPositionDialog.vue:470` (`goResearch` —
  keep the existing `.US` suffix handling, then call the helper).
- [ ] `src/modules/instruments/InstrumentSearchModal.vue:47`
  (`openResult`, default mode only — the `mode="add"` mounts in
  ChartingView / AddPositionDialog / PortfolioPerformanceTab emit instead
  of navigating and are untouched; when mounted on the research page itself,
  `from` = the current research path, so switching symbols keeps the
  previous symbol reachable via back).
- [ ] `src/modules/watchlists/WatchlistsView.vue:124` (watchlist items →
  back returns to the watchlist).
- [ ] Explicitly unchanged: `src/layout/SidebarNav.vue:60` (top-level nav
  entry, no context — falls back to `/en/investments`).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green.
  This step is behaviour-neutral on its own (no entry point passed `from`
  before 60.1, and the back target only changes when the param is present);
  the user-visible fix is proven by the e2e in 60.3.
- [ ] Commit.

### 60.3 — E2E: back returns to the origin (extend `tests/e2e/research.spec.ts`)

Reuse the existing spec's login helper and seeded portfolio/transaction
fixtures (the seeded portfolio with transactions that
`tests/e2e/labels.spec.ts` already uses on the per-portfolio tab).

- [ ] Portfolio origin: main page → open the seeded portfolio → Holdings
  tab → click a position's symbol link → research overview for that symbol;
  assert the "Go back" link's `href` equals `/en/portfolios/<id>/holdings`;
  click it → URL is that portfolio's holdings tab and the holdings table is
  visible.
- [ ] Global transactions origin: `/en/investments/transactions` → click a
  row's symbol → research; back link `href` =
  `/en/investments/transactions`; click → the transactions table is
  visible.
- [ ] Per-portfolio transactions origin: open the seeded portfolio's
  Transactions tab → click a row's symbol → research; back link `href` =
  `/en/portfolios/<id>/transactions`; click → that tab is shown.
- [ ] Origin survives tab switch: arriving at research from Holdings, click
  the "Dividends" research tab → the back link `href` still equals the
  holdings path.
- [ ] Deep-link fallback: navigate directly to
  `/en/research/<seeded symbol>/overview` (no `from`) → back link `href` =
  `/en/investments`.
- [ ] Tests: `npm run test:e2e` (docker compose) green.
- [ ] Commit.

### 60.4 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease
  (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify
  the rollout.
- [ ] Playwright PROD (user's passkey session):
  - Open a portfolio → Holdings → click a holding's symbol → research;
    "Go back" → back on that portfolio's holdings tab.
  - Global transactions list → click a row's symbol → research; "Go back"
    → back on the transactions list (filters intact if any were set).
  - On research, switch a tab → "Go back" still targets the origin.
- [ ] Commit (plan closeout) + archive §60 to `plan-archive.md`.

---


## 61. Shared TickerBadge: logo + ticker + name + details at every ticker surface (user request 2026-09-24)

Proposal: — (direct user request: "make a ticker component which consist of: logo, ticker, name, details (like (PL) Stock) and then use this component everywhere we show a ticker, for example: top/bottom performers, dividends tab, news, Compare with peers"; no proposal doc).

One presentational component — `src/components/TickerBadge.vue` — replaces the ~10 ad-hoc
ticker renderings across the SPA: holdings symbol cell, top/bottom performers, transactions
symbol cell, portfolio dividends rows, portfolio news cards, research header, research
overview header, compare-with-peers column headers, instrument search results, watchlist
items, and form symbol previews. It renders the instrument logo, the ticker, an optional
details line `(<CC>) <Type>` (e.g. `(PL) Stock`), and the company name.

Example service parity source (verified live 2026-09-24): the holdings-table
`instrument-identity` block — logo (24/28px rounded square, `object-contain`) + `MSFT` +
` (US) ` exchange hint + `Akcja` (Stock) pill + `Microsoft Corp` — and the research header
`ih-identity` — logo (32px rounded square) + name + `US · MSFT` chip. The example-service research
header and holdings cell use the *same* identity block at different scales; that is the
`size` prop of the component.

Data availability per surface (audited 2026-09-24 against the SPA types + backend routes):

| Surface | File | symbol | name | country | assetType |
|---|---|---|---|---|---|
| Holdings cell | `PortfolioHoldingsTab.vue:420` | `pos.symbol` | `pos.companyName` | `pos.country` | `pos.assetType` |
| Top/Bottom performers | `PortfolioPerformanceTab.vue:350/370` | `p.symbol` | `p.companyName` | `p.country` | `p.assetType` |
| Transactions cell | `TransactionsTable.vue:370` | `tx.instrumentSymbol` | `tx.instrumentName` | `tx.country` | `tx.assetType` |
| Dividends rows | `PortfolioDividendsTab.vue:95` | `d.symbol` | `d.instrumentName` | **new (61.3)** | **new (61.3)** |
| News cards | `PortfolioNewsTab.vue:43` | `a.ticker` | position lookup | position lookup | position lookup |
| Research header | `ResearchView.vue:88` | `routeSymbol` | `profile.name` | `profile.countryCode` | `profile.type` |
| Overview header | `ResearchOverview.vue:229` | `symbol` | `profile.name` | `profile.countryCode` | `profile.type` |
| Compare columns | `ResearchCompare.vue:46` | `r.symbol` | `r.name` | **new (61.4)** | **new (61.4)** |
| Search results | `InstrumentSearchModal.vue` | `result.symbol` | `result.name` | `result.countryCode` | `result.type` |
| Watchlist items | `WatchlistsView.vue:122` | `item.symbol` | `item.name` | — | — |
| Form previews | `AddPositionDialog` / `EditTransactionModal` / `RecordDividendDialog` / `TransactionFormFields` | typed/selected symbol | selected name | — | — |

Design decisions (resolved 2026-09-24):

- **Logo shape standardized to example-service's rounded square** (`rounded-[9px] object-contain`
  on a `bg-slate-100 dark:bg-slate-800` plate) at every surface — replaces the current
  circle style; the `docs/COMPONENTS.md` logo line is updated in 61.10.
- **Backends are enriched** so the dividends tab and compare tab show full details:
  wallets adds `assetType`/`country` to `GET /:id/dividends` items (both columns already
  on the DIVIDEND tx row, `portfolios.ts:1105`), instruments adds `countryCode`/
  `assetType` to the `/:symbol/peers` rows (local `ticker_reference` lookup, same
  `ref.ticker === baseTicker` guard as the profile route), both via nullable contracts
  fields — never guessed, null when unknown.
- **Presentational only** — the component fetches nothing; each call site passes the
  data it already has (or a local lookup, for news). Surfaces without country/type
  (watchlist, forms, symbol-only rows) degrade to logo + ticker (+ name when known);
  the details line is simply omitted.
- **Not a link** — parents that need a research link wrap the badge in their existing
  `router-link`; note/label-chip rows (transactions) keep their extra lines below the
  badge.
- **Out of scope (stay as-is):** `RecentSearchesBar` symbol chips (dense bar, symbol
  only), `PortfolioCalendarTab` month-grid text chips (`SAP dividend: 10,00 PLN` — a
  badge would break the grid), the sentence titles in `ResearchDividends.vue` /
  `ResearchNews.vue` ("Dividends per share - MSFT", "N of M articles for MSFT"),
  `PortfolioCompareTab` (compares portfolios, not instruments).

Repos touched: `portfoliost-contracts` (61.2), `portfoliost-wallets` (61.3),
`portfoliost-instruments` (61.4), `portfoliost` SPA + mocks (61.1, 61.4–61.10).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per AGENTS.md).

---

### 61.1 — SPA: `TickerBadge.vue` component + unit tests

- [ ] New `src/components/TickerBadge.vue`:
  - Props (`<script setup lang="ts">`, typed `defineProps`):
    `symbol: string` (required); `name?: string | null`; `countryCode?: string | null`
    (2-letter code, uppercased on render); `assetType?: string | null` (accepts the
    enum form `STOCK`/`ETF`/… or an already-displayable word); `size?: "sm" | "md" |
    "lg"` (default `"md"`; logo `h-5` / `h-6` / `h-8`); `align?: "left" | "right"`
    (default `"left"`; right = `flex-row-reverse text-right`, for compare-table column
    headers); `titleAs?: "div" | "h1" | "h2"` (default `"div"`; element of the ticker
    line — research header uses `"h1"`); `testid?: string` (default `"ticker-badge"`).
  - Layout: `<div :data-testid="tid" class="flex min-w-0 items-center gap-2.5">` →
    `<img :src="`/api/logos/${symbol}`" :alt="symbol" loading="lazy"
    class="shrink-0 rounded-[9px] object-contain bg-slate-100 dark:bg-slate-800 …size">`
    → text block (`min-w-0`): line 1 = ticker (`<Component :is="titleAs"
    class="truncate font-medium text-slate-900 dark:text-slate-100">`) + details
    `<span :data-testid="`${tid}-details`" class="text-[11px] text-slate-400
    dark:text-slate-500">` (only when non-empty); line 2 = name (`text-xs
    text-slate-500 dark:text-slate-400 truncate`, only when provided).
  - Plain `<script>` block (house style for shared logic) exporting:
    `formatAssetType(t: string | null | undefined): string` — `STOCK→"Stock"`,
    `ETF→"ETF"`, `BOND→"Bond"`, `CORP_BOND→"Bond"`, `CRYPTO→"Crypto"`, `FUND→"Fund"`,
    empty/null→`""`, other → title-case as-is; and
    `tickerDetails(countryCode?: string | null, assetType?: string | null):
    string | null` — `(${CC}) ${Type}` over the non-empty parts, `null` when both are
    missing. Both pure and unit-tested; no other call site re-derives the format.
- [ ] Unit tests, new `tests/unit/components/TickerBadge.test.ts`:
  - full props → logo `img[src*="/api/logos/SAP"]`, ticker `SAP`, name line,
    details `(PL) Stock` (and `${tid}-details` testid);
  - no `name` → no name line; no details → no details span; countryCode only →
    `(PL)`; assetType only → `Stock`;
  - `formatAssetType` map incl. `ETF` (not `Etf`), `CORP_BOND`, unknown passthrough;
    `tickerDetails(null, null) === null`;
  - `size` sm/lg swap the logo class; `align="right"` adds the row-reverse class;
    `titleAs="h1"` renders an `<h1>`; custom `testid` prefixes the root + details.
- [ ] Tests: `npm run test`, `npm run build` green.
- [ ] Commit.

### 61.2 — contracts: dividends items + compare rows carry identity fields

- [ ] `portfoliost-contracts/contracts/openapi.yaml`:
  - `DividendsData.items` item: add `assetType: { type: string, nullable: true }` and
    `country: { type: string, nullable: true }` (nullable — the research-backed
    `history` shape has neither).
  - `ResearchCompare`: add `countryCode: { type: string, nullable: true }` and
    `assetType: { type: string, nullable: true }` (nullable — never guessed, 61.4).
- [ ] Push contracts main → GHA patch bump; `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` + `npm run gen:types` in `portfoliost`,
  `portfoliost-wallets`, `portfoliost-instruments` (all three have generated types).
- [ ] Tests: contracts `npm test` (spec validity) green.
- [ ] Commit (portfoliost-contracts) + consumer install commits.

### 61.3 — wallets: `assetType` + `country` on `GET /:id/dividends` items

- [ ] `portfoliost-wallets src/routes/portfolios.ts` `/:id/dividends` (:1105): the
  item map adds `assetType: r.assetType ?? null` and `country: r.country ?? null` —
  both columns are already selected (`select()` over `portfolioTransactions`); no
  schema/DB change.
- [ ] Unit test (`portfolios.test.ts` dividends describe): a DIVIDEND tx seeded with
  `assetType: "ETF"`, `country: "PL"` → response `items[0].assetType === "ETF"`,
  `items[0].country === "PL"`; a tx without them → `null`.
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-wallets).

### 61.4 — instruments: `countryCode` + `assetType` on `/:symbol/peers` rows (+ SPA mock)

- [ ] `portfoliost-instruments src/routes/instruments.ts` `/:symbol/peers` (:1346):
  after each `toCompare(...)` item is built, enrich from the local reference table —
  same pattern as the profile route (:1602): `searchTickerReference(getDb(),
  sym.split(".")[0], 1)`, only when `ref.ticker === baseTicker` set
  `item.countryCode = ref.countryCode ?? null` and
  `item.assetType = toInstrumentType(ref.assetType)`; no ref row → both stay null
  (never guessed). `toCompare` (translate.ts) stays pure.
- [ ] Unit test (`instruments.test.ts` peers describe): a ref row for the primary
  symbol (e.g. AAPL → `US` / `STOCK`) → `items[0].countryCode === "US"`,
  `items[0].assetType === "STOCK"`; a symbol with no ref row → both null.
- [ ] Full instruments suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-instruments).
- [ ] SPA mock (e2e runs against the compose mock backend): `mocks/instruments/
  index.js` — the `/compare` and `/peers` mappers add `countryCode`/`assetType` to
  each compare row, derived from the seeded research data where it carries a country
  (else `null`).
- [ ] Tests: `npm run test:mock` green (portfoliost).
- [ ] Commit (portfoliost).

### 61.5 — SPA: adopt in holdings table + top/bottom performers

- [ ] `PortfolioHoldingsTab.vue` symbol cell (:420–433): replace the logo `img` +
  symbol `router-link` + `assetLabel(pos)` line with the existing `router-link`
  wrapping `<TickerBadge :symbol="pos.symbol" :name="pos.companyName"
  :country-code="pos.country" :asset-type="pos.assetType" />`; delete the now-unused
  `assetLabel` function (:235) — its format lives in the component's
  `tickerDetails`.
- [ ] `PortfolioPerformanceTab.vue` Top/Bottom performers lists (:350, :370):
  replace the `symbol` + `companyName` div with
  `<TickerBadge size="sm" :symbol="p.symbol" :name="p.companyName"
  :country-code="p.country" :asset-type="p.assetType" />`; the P/L right column is
  untouched.
- [ ] Update the affected unit tests (holdings/performance specs that assert the old
  markup) to select on `ticker-badge` / `ticker-badge-details`.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green;
  `docker compose up -d --build` + `npm run test:e2e` (holdings +
  `top-performers-currency.spec.ts`) green.
- [ ] Commit.

### 61.6 — SPA: adopt in transactions table + portfolio dividends tab (+ SPA mock)

- [ ] `TransactionsTable.vue` symbol cell (:370–392): replace the global-mode logo
  `img` + `symbol` + `assetLabel(tx)` + `instrumentName` lines with
  `<TickerBadge :symbol="tx.instrumentSymbol" :name="tx.instrumentName"
  :country-code="tx.country" :asset-type="tx.assetType" />` inside the existing
  `router-link`; the note line and `LabelChips` stay below the badge (transaction-
  level, not identity).
- [ ] `PortfolioDividendsTab.vue` symbol cell (:96): replace the plain
  `{{ d.symbol }}` with
  `<TickerBadge size="sm" :symbol="d.symbol" :name="d.instrumentName"
  :country-code="d.country" :asset-type="d.assetType" />` — the 61.2/61.3 fields are
  nullable, so a research-backed legacy row degrades to ticker-only.
- [ ] SPA mock: `mocks/portfolios/index.js` dividends mapper (:731) adds
  `assetType: t.assetType ?? null, country: t.country ?? null` (tx rows already carry
  both via `enrichTx`).
- [ ] Update affected unit tests; e2e: `dividends.spec.ts` + the transactions specs.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 61.7 — SPA: adopt in portfolio news cards

- [ ] `PortfolioNewsTab.vue` (:43): replace the uppercase `a.ticker` chip with
  `<TickerBadge size="sm" :symbol="a.ticker" :name="..." :country-code="..."
  :asset-type="...">` enriched from a `symbol → position` map over
  `usePortfolioStore().positions` (`companyName` / `country` / `assetType`); call
  `store.fetchPositions(id)` on mount when `store.positions` is empty (the tab is
  directly reachable via its route). A ticker absent from open positions degrades to
  logo + ticker (news is fetched for held stocks, so this is the rare case). The
  sentiment chip stays on the right.
- [ ] E2E: portfolio News tab — a card for a held ticker shows the badge with the
  position's name and details; the sentiment chip is still present.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 61.8 — SPA: adopt in research header, overview header, compare columns

- [ ] `ResearchView.vue` header (:88–105): replace the logo `img` + `h1` ticker +
  name line + the duplicate ticker pill with
  `<TickerBadge size="lg" title-as="h1" :symbol="routeSymbol" :name="profile?.name"
  :country-code="profile?.countryCode" :asset-type="profile?.type" />` (details and
  name appear when the profile resolves; the `Add to Watchlist` / search buttons and
  the `from`-aware back link are untouched).
- [ ] `ResearchOverview.vue` header block (:229–232): replace the logo `img` + `h2`
  symbol + name with `<TickerBadge title-as="h2" :symbol="symbol"
  :name="profile?.name" :country-code="profile?.countryCode"
  :asset-type="profile?.type" />`.
- [ ] `ResearchCompare.vue` column headers (:46–49): replace the symbol + name
  divs with `<TickerBadge size="sm" align="right" :symbol="r.symbol" :name="r.name"
  :country-code="r.countryCode" :asset-type="r.assetType" />` (61.4 fields, nullable);
  the primary column keeps its `font-bold text-blue-700 dark:text-blue-400` highlight
  via a wrapper class.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green;
  `docker compose up -d --build` + `npm run test:e2e` (`research.spec.ts`,
  `logos.spec.ts`) green.
- [ ] Playwright visual pass (1280px, compose stack): research header shows logo +
  ticker + `(US) Stock` + name at 32px; compare table column headers show the badge
  with details, right-aligned.
- [ ] Commit.

### 61.9 — SPA: adopt in search modal, watchlists, form previews

- [ ] `InstrumentSearchModal.vue` result row: replace the logo `img` + symbol/name/
  exchange block + type pill with
  `<TickerBadge :symbol="result.symbol" :name="result.name"
  :country-code="result.countryCode" :asset-type="result.type" />` (search results
  already carry all four fields).
- [ ] `WatchlistsView.vue` items (:122–131): replace the plain symbol `router-link`
  + name span with the link wrapping
  `<TickerBadge :symbol="item.symbol" :name="item.name" />` (no country/type stored —
  details omitted).
- [ ] Form symbol previews — `AddPositionDialog.vue`, `EditTransactionModal.vue`,
  `RecordDividendDialog.vue`, `TransactionFormFields.vue`: replace each
  logo-`img`+symbol pair with `<TickerBadge :symbol="..." :name="..." />` (name from
  the selected search result where the dialog keeps it; typed-only symbols degrade to
  ticker-only).
- [ ] `RecentSearchesBar.vue` unchanged (decision — dense symbol-only chips).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` (watchlists + add-position
  specs) green.
- [ ] Commit.

### 61.10 — Sweep, docs, parity check

- [ ] Sweep: `grep -rn "/api/logos/" src` returns hits **only** in
  `src/components/TickerBadge.vue` — fix any leftover ad-hoc logo renders surfaced by
  the grep (the form previews of 61.9 are the expected tail).
- [ ] `docs/COMPONENTS.md`: update the instrument-logo line (the rounded-square
  `object-contain` plate, not the circle) and add `TickerBadge` to the reference
  table (presentational identity block; `ticker-badge` testid prefix;
  `tickerDetails`/`formatAssetType` shared exports).
- [ ] Playwright parity pass (AGENTS.md): side-by-side a11y snapshots + screenshots
  at 1280px vs `app.example-service.ai` for the holdings table, the performance tab, the
  research header, and the compare tab; fix visual drift (spacing/truncation) in the
  component, not per call site.
- [ ] Tests: full suite green — `npm run build`, `npm run test`,
  `npm run test:mock`, `npm run test:e2e`.
- [ ] Commit.

### 61.11 — Release + PROD verify

- [ ] Push `portfoliost-wallets`, `portfoliost-instruments`, `portfoliost` → GHA
  patch bumps → pin the **real** tags from `gh release list` in the homelab
  helmreleases (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); for instruments bump
  **all 4 occurrences** (app + tickersync + corpbondsync + fxsyync cronjobs, §56.2).
  Contracts ship inside the npm installs — no deploy.
- [ ] Flux + kubectl verify all three rollouts (if the RWO logos PVC multi-attach
  stalls the instruments rollout, scale to 0, wait, scale back to 1 — known gotcha).
- [ ] Playwright PROD (user's passkey session):
  - Holdings table row: rounded-square logo + ticker + `(US) Stock`-style details +
    company name.
  - Top/Bottom performers: badge with details on each row.
  - Portfolio Dividends tab: rows show name + details for held instruments
    (the 61.3 fields from the re-imported tx rows).
  - Portfolio News tab: cards show the badge (position-enriched) + sentiment chip.
  - Research: header badge (32px logo, `h1` ticker, details from the profile),
    Compare-with-peers column headers show details.
- [ ] Commit (plan closeout) + archive §61 to `plan-archive.md`.

---


## 63. Portfolio value correctness: unified live valuation, recompute reliability, cash-included charts (user request 2026-09-25)

Post-§62 PROD verification exposed that portfolio **value** is computed by
two divergent, both-wrong paths, and that the recompute button silently no-ops:

- **Chart / analytics** = `value_snapshots.value` = Σ qty × `price_bars.close`
  (+ cash). Openst history quotes are 10–70× off for several held symbols
  (CSN.L £363 vs £5 cost, RIO.L £7 199, BYG.L £820, SAP.DE cost basis €1.16 vs
  quote €184) → IKE Marek snapshot 2 300 732 vs true ~100k.
- **Headline "Total Value"** = Σ `positions.market_value`, which is **stale/0**
  (no live quote at last import) → falls back to `qty × avgCostBasis` → reads
  ~755k (cheap).
- **Recompute** `POST /api/portfolios/:id/recompute` is fire-and-forget with
  `.catch(() => undefined)` — it fails silently (no logs, no value change).

User spec (2026-09-25): cash = uninvested (free) cash per the **Gotówka sheet**
(traces free cash on brokerage accounts), multi-currency; Gotówka is a
*reference*, the same values must also be **derivable from inflows/outflows
+ transactions**; a funded buy (AU=1) is one inflow + immediate buy; the
performance/consolidated charts must show **positions + cash** over time.

Rules: one step = one commit; step `[x]` only after its tests pass (unit +
docker-compose level). Provider tier first (openst/cachest) for the bad
quotes — §63.5 is gated on reproducing the bad symbol's provider response.

---

### 63.2 — Wallets: one live valuation path for headline + charts (single source of truth)

- [ ] `portfoliost-wallets`: headline total-metrics `totalValue` and
  `value_snapshots` both derive position value from the **same** live price
  source (quote service / cached live price), not `price_bars` for one and
  `positions.market_value`-fallback for the other. When no live price, use the
  latest `price_bars` close (not `avgCostBasis`) and mark `priceSource`.
- [ ] `portfolios.current_value` is refreshed from the live value (positions +
  cash) on the quotes pass and on recompute — so headline = chart last point
  (± cash timing) after a recompute.
- [ ] Tests: a portfolio's headline totalValue equals the latest snapshot value
  (positions + cash) when quotes are fresh; fallback-to-close (not cost) is
  asserted when no quote.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.3 — Wallets: cash included in consolidated + per-portfolio performance series

- [ ] **Verified broken 2026-09-27 — three headline numbers that do not
      reconcile.** The per-portfolio *cards* include cash; the page *headline*
      does not, and the API's `total-metrics` reports a third figure in a
      different currency. Measured in PROD:

      | surface | value |
      |---|---|
      | Σ the 10 portfolio cards | PLN **1,380,487.34** |
      | less the Cash card (PLN 345,228.05) | PLN 1,035,259.29 |
      | "Total Value" headline | PLN **1,035,259.30** ✓ |

      So the headline is positions-only while the cards are positions + cash.
      Separately `/api/portfolios/total-metrics` returned `totalValue` **196,514.50**
      on one call and **270,027.49** on the next (~1 min apart, then stable),
      with `Crypto` at `totalValue: 0, returnPercentage: -100` while its own card
      correctly read `887.74 / +1.65%` and the snapshot says 887.74 PLN.
  - [ ] Pick one definition for "total value" (positions + cash) and make the
      headline, the cards, and `total-metrics` all read it from the same place.
  - [ ] `total-metrics` is **not deterministic** — two calls a minute apart
        disagreed by 73,513. Find which input is not cached/stable; a headline
        that flickers is worse than a wrong one, because it cannot be reasoned
        about.
  - [ ] Investigate why `total-metrics` reports `Crypto` as `0 / −100%` when the
        snapshot holds 887.74 PLN and the card is positive. A portfolio with cash
        and a position must not floor at zero.
  - [ ] Verify/fix the consolidated (all-portfolio) performance chart and each
        portfolio chart show **Σ positions + cash** per day (cash per §62 base-
        currency balance already added in backfill — confirm it is in the
        consolidated merge path `getMergedAnalytics` too, and that negative cash
        doesn't hide).
  - [ ] Tests: consolidated series = Σ per-portfolio (positions + cash); a
        deposit moves the consolidated line up on that day; `total-metrics` is
        byte-identical across two consecutive calls; headline total == Σ cards.
  - [ ] Tests: `npm run build`, full `vitest` green.
  - [ ] Playwright: re-check `/en/investments` headline vs the card sum.
  - [ ] Commit.

### 63.4 — Sheets-sync: derive free-cash from flows+trades; Gotówka as reconciliation reference (multi-currency)

- [ ] Model "uninvested/free cash" per account as the §62 per-currency cash
  ledger (external flows + derived trade effects) — this already nets a funded
  buy (inflow + immediate buy) to ~0 net cash and is multi-currency. Keep
  Gotówka as a **reconciliation reference** (warn-only), not the source of the
  cash value. Re-scope the §62.6 Gotówka recon to compare the *derived* free-
  cash total against the Gotówka snapshot on the right basis/currency (resolve
  the IB=USD vs column=PLN basis) so the 3 tracked accounts give a meaningful
  Δ instead of the current full-history mismatch.
- [ ] Tests: derived free-cash for a funded-buy round-trip (inflow + buy) ≈ 0
  net; Gotówka recon warn-line compares derived vs snapshot within tolerance.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.5 — Provider tier: root-cause the mispriced symbols (openst/cachest) — GATED

**RCA (confirmed 2026-09-25, PROD):** the 4.5M chart comes from `price_bars`
rows with `source: 'openst'` that are **100× too high for LSE `.L` tickers** — yfinance (the first
OHLCV provider in `PRICE_PROVIDERS`) quotes London tickers in **GBX (pence)**: BYG.L price_bars 820
vs live quote £8.20 (exactly ×100); CSN.L 363 vs £3.525, RIO.L 7199 vs £70.89 (~×100, offset by a
3-day price move). Non-LSE symbols are fine (VRC.WA/SNT.WA/AMD/TSM price_bars == live quote). The
quote path (a different provider) returns **GBP**, so headline (cheap, cost- basis fallback) and
chart (×100) diverge. stooq UK data is stale (max date 2026-08-28) so it doesn't override the bad
openst overflow rows.

- [x] Reproduce the provider response: fetch raw yfinance OHLCV for CSN.L / BYG.L / RIO.L and
  confirm the close is in pence (vs the GBP quote). (GATE — blocked here: can't reach yfinance from
  this environment; do where openst has keys.)
  - **Confirmed via PROD data + unit tests (2026-09-26)**: every `.L` series is uniform
    (0 discontinuities ≥10×, median consecutive ratio 1.000–1.002 per symbol — single unit
    throughout, i.e. all fetched via yfinance in pence); BYG.L 820 → £8.20, LGEN.L 318.4 →
    £3.18, CSN.L 363 → £3.525 all match live GBP quotes after ÷100.
- [x] Fix at the owning tier: in `openst/src/openbb_client.py` `get_ohlcv_history`
  (and `get_price_history`) normalize yfinance LSE/GBX closes ÷100 to GBP — or route LSE history off
  yfinance. Add a unit test with a pence fixture.
  - **Done (openst `355c6c5`, v1.1.35 deployed to PROD 2/2)**: `_needs_gbx_normalization`
    (yfinance + `.L`) divides open/high/low/close by 100 on both paths; 4 new unit tests
    (pence fixture, non-LSE untouched, non-yfinance untouched); full suite green in the Docker
    test stage (111 passed).
- [x] Backfill/correct the existing bad `price_bars` overflow rows (delete
  `source='openst'` rows for the affected `.L` symbols so they re-fetch, or divide by 100), then
  recompute affected portfolios.
  - **Done (2026-09-26)**: `UPDATE price_bars SET close = close/100 WHERE symbol LIKE
    '%.L' AND source='openst'` — 69,247 rows across all 16 `.L` symbols (uniform 100×, safe;
    `price_bars_all` is a read-only UNION view that reads `price_bars`, so it follows). Verified:
    BYG.L latest bar £8.20, CSN.L £3.76, LGEN.L £3.18. **Recomputes done too** (user session):
    POST /recompute on IKE Marek + IKE Beata → `backfillStatus: complete`; snapshot series now sane
    (IKE Marek max £75,521 / latest 69,220 vs the pre-fix ~2.3M artifact; IKE Beata max £157,254 /
    latest 155,635; 1,796–1,800 daily snapshots each through 2026-09-25).
- [ ] Add a sanity guard: an extreme quote-vs-last-close jump (≳10×) on the overflow write
  flags/logs instead of silently valuing 70×.
- [x] Tests: openst suite green; fixed symbols' price_bars match the GBP quote.
- [x] GATE: this step fixes the *data*; §63.1–63.4 fix the *pipeline*. "Chart == true value" is not
  achievable until this ships.
  - **Lifted 2026-09-26** (openst v1.1.35 + data backfill + recomputes; only the ≳10× sanity
    guard remains as hardening).
- [x] Commit.

### 63.6 — Wallets: recalculation reliability, two recompute modes, scheduled additive refresh (WIP 2026-09-27)

**Symptoms (user-reported, PROD):** the composed (and per-portfolio) value
charts showed an "instant drop" / "sudden rise" around noon on 2026-09-27
that appeared and re-appeared over the day.

**Diagnosis (done 2026-09-27):**
1. **The drop** — the merged endpoint summed `value_snapshots` per exact
   date; today's snapshot is written LAZILY (snapshot-on-read / manual
   recompute), so early in the day only opened portfolios had a "today" row
   → the combined total collapsed to just those (PROD: 1/10 portfolios had a
   09-27 row → head point 31k vs 327k). **Fixed**: `sumSnapshotsByDateForwardFilled`
   (mergedAnalytics) — each portfolio contributes its latest-known value on
   dates it has no snapshot (step-function semantics; no-op on complete
   dates). No cron needed.
2. **The rise** — a STALE value from the second valuation path: the
   live-quote snapshot (`snapshotPortfolioValue` in quotes.ts, fired on
   detail-page read) disagreed with the backfill (price-bars
   `computeSnapshotBatch`). IBKR: live path wrote 09-26 = 587,547; the
   authoritative backfill = 457,493 (= 09-25, no real move). A manual
   recompute overwrote it → jump gone. This is **§63.2** (unify the two
   valuation paths) — the real fix; the recompute job below is the
   operational guard. IBKR is ~70% idle cash (EUR 141k + USD 963 − PLN 121k
   in a PLN-base portfolio), so FX differences between the two paths are the
   whole discrepancy.
3. **Two genuine 09-26 moves remain unexplained** (recompute rebuilt them,
   still high): Equate+ 3,947→8,633 (+119%) and IKE Marek 68,455→105,452
   (+54%). Equate+ = the short-SAP-option book (expiry effect?); IKE Marek
   = the LSE `.L` names. ~~**OPEN: root-cause with `RECALC_DEBUG=1`**~~
   — **RESOLVED, and it was not a valuation problem: see §63.10.** Both "moves"
   were the same artifact as the spike: a snapshot written by a pass that had
   priced *nothing*, so the stored value was cash only. Equate+ and IKE Marek now
   price 1/1 and 13/13 with no gaps. `RECALC_DEBUG` is **off** in the PROD
   helmrelease (turned off in §63.10.5).**

   **Diagnostic aid (the value-vs-`Invested` overlay chart):
   isolates these from real deposits.** The **Invested** line (cumulative net
   money-in) is flat through them, while the **value** line dips/steeps — so
   a sharp value move with a *flat* Invested line is a valuation anomaly,
   not a deposit. On the combined 1Y chart the value line shows **two sharp
   V-shaped dips (late Jan 2026 and late May 2026)** that the flat Invested
   line does not follow — these are the "sudden move" anomalies the user
   reported, now visually separable and worth the same per-symbol
   `RECALC_DEBUG` root-cause as the 09-26 Equate+/IKE Marek moves. (IBKR also
   shows value 457,493 < invested 503,574 = a *negative* gap, i.e. behind
   money-in — the chart surfaces per-portfolio ahead/behind-at-a-glance too.)

**Implementation (DEPLOYED — wallets v1.1.63/v1.1.64, tested green):**
- `POST /api/portfolios/:id/recompute` now has TWO modes over ONE shared core
  (`computeSnapshotBatch`):
  - **default = force** (`forcePortfolioRecalc`): DELETE all rows + rebuild —
    manual recompute after data fixes; no stale rows survive; transactional
    (abort → nothing written).
  - **`?mode=upsert`** (`runBackfillRecent`, new): ADDITIVE upsert, window
    extends to **TODAY** (default window ends yesterday) — re-values the last
    2 days (FX for a fresh date is unknown until the ECB publish ~16:00 CET /
    fxsync 17:10 UTC and can still shift converted values). A failed pass
    leaves prior values in place.
- `src/scripts/snapshots-sync.ts` (new): standalone job — for EVERY
  portfolio, `runBackfillRecent` (serialized by the shared backfill runner;
  no user token needed — instruments `/internal/fx-rates` is unauthenticated).
- Deploy plan: cronjob `snapshotsync` in `portfoliost-wallets/app/helmrelease.yaml`,
  schedule **after fxsync** (instruments fxsync = 17:10 UTC) + a mid-day pass
  (~13:00 UTC) per the user's "run it twice a day" note; command
  `node dist/scripts/snapshots-sync.js`, env DATABASE_URL (+ INSTRUMENTS_URL).
- Tests: `recompute.test.ts` — new `?mode=upsert extends to today AND does
  not delete` case; `mergedAnalytics.test.ts` — 5 forward-fill cases; full
  suite 344 green.
- **Cash in/out series on the performance chart** (user request, pending):
  an additional accumulating series in the same currency as the main one,
  mirroring the Transakcje running columns AV:BE. BLOCKED on the user
  clarifying which definition (net money-in vs running free cash incl.
  trade effects) and what the AV:BE headers are. Documented as a diagnostic
  in `docs/proposals/portfolio-cash-tracing.md`.

- [x] Deploy the two-modes recompute + snapshotsync cron (wallets v1.1.63,
      pinned in helmrelease as `snapshotsync` 13:00 UTC +
      `snapshotsync-postfx` 17:20 UTC, after instruments fxsync). 2/2 cronjobs
      live.
- [x] Root-cause the "sudden growth" / fake-inflow spike (RECALC_DEBUG +
      PROD DB, 2026-09-27, IKE Beata `ab64f782…`). **It is NOT the price/FX
      valuation path and NOT a race** — it is **missing price-bar history**.
      The backfill (price-bars path) values only the symbols that have a bar
      in the window (`if (price == null) continue`); the live-quote
      `snapshotPortfolioValue` (fired on detail-page read) values **all** open
      positions from a single live quote. IKE Beata today: backfill 09-26 =
      154,860 (18 of 23 symbols) vs live today = 205,470 (all 23). The 5
      missing ≈ 50k: **XTB.WA, EMIM.AS, RBOE.AS** (`price_bars_all`=0,
      `price_bar_metadata.fetch_status='failed'`), **AMZN** (7,377 bars but
      gap on 09-26), **SP20.L** (465 bars, from Nov 2024, gap on 09-26).
      None exist in the stooq daily tables; the on-demand upstream fill
      (cachest `fetchOhlcv`) **failed** for them. So the two paths disagree
      purely because the backfill's symbols lack history — recomputing cannot
      fix it (the bars are still absent), and a page refresh re-writes today
      via the live path → the spike re-appears. **Fix = §63.8 (two prongs):
      (a) make instruments fill/repair missing history, (b) make the backfill
      *not silently drop* a held symbol with no bar — signal a data-gap so
      the value is flagged incomplete rather than quietly under-reported.**
      (Turn RECALC_DEBUG off in the helmrelease once §63.8 ships.)
- [ ] §63.2 — unify the two valuation paths (live-quote snapshot vs
      price-bars backfill) so they agree; **root cause pinned in §63.8** —
      the disagreement is upstream missing price history, not FX.
  - **Still open 2026-09-27, and no longer only about missing history.** After
    the §63.13 recompute every backfill is `complete` with no gaps, yet the card
    for IBKR shows **585,428.89** where the snapshot is **585,319.22** — a live
    path vs backfill gap with identical inputs, i.e. §63.2's own subject, now
    isolated from §63.8. Fix this one; it is the reason a headline never matches
    its own cards.

### 63.8 — Data-gap handling: fill/repair price history + surface incomplete backfills + gray-out during recompute (2026-09-27)

Follow-on from the §63.6 RCA: the "sudden growth"/fake-inflow spike on IKE Beata
looked like **missing price-bar history** — the backfill values only the symbols
it has a bar for (18/23 → 155k) while the live-quote snapshot values all 23
(→ 205k). Three coupled changes so the two valuation paths agree and the UI never
shows a silently-wrong value.

> **Superseded in part (2026-09-27).** The missing history was real and is fixed
> (item 2 → §63.9), but it was *not* the spike: the spike was the sweep pricing
> **nothing at all** (§63.10). The three changes here stand on their own merit —
> the gap signal, the gray-out, the fill — they are simply not what fixed the
> chart. The `18 of 23` figure was also an exact-date count; `buildPriceMap` carries
> prices forward, so the real number of unpriced symbols was smaller.

- [x] **Backfill must not silently drop a held symbol with no price bar.**
      (wallets `09f48c2` + `bcdf8e3`, 348 green; contracts v1.6.44.)
      `computeSnapshotBatch` now returns `{ rows, gapSymbols }` — the held
      (qty>0 on the window's last day) symbols with NO price bar. Both backfill
      paths persist it to `portfolio_backfill_metadata.gap_symbols` (migration
      0009; the force path writes it atomically inside the delete+rebuild tx;
      `persistGapSymbols` coerces []→null). `GET /:id/analytics` returns a
      top-level `gapSymbols` via `getGapSymbols`. +4 tests (gap detected / gap
      cleared / API present / API absent). The SPA renders an amber
      partial-sum warning (see item 3).
- [x] ~~**Instruments: fill/repair missing history — GATED on the provider tier
      (§63.5).**~~ **RESOLVED (wrong premise — see §63.9).** The diagnosis recorded
      here was wrong: `providerSymbol()` is not the problem, and this was never a
      provider-coverage gap. Probed in PROD on 2026-09-27: openst serves
      `/price/ohlcv/XTB.WA` (2637 bars), `EMIM.AS` (3152 bars) and `RBOE.AS` in
      0.3–2.1 s, **including with `start=1900-01-01`**. The symbols were always
      sourceable; nothing ever asked. Superseded by §63.9.
- [x] **UI: gray out + block every recomputing chart until done** (user
      request). (SPA `296343e` + `fe4c0e5`, 397 green.) `PortfolioPerformanceChart`
      gained a `recomputing` prop: the chart is dimmed (opacity-50) +
      pointer-events disabled with an in-progress overlay, and the Recompute
      button is disabled (no re-trigger) while a pass is in flight. Wired on the
      per-portfolio Performance tab (`recomputeBusy || backfillPending`) and the
      combined chart (`mergedBusy || mergedBackfillPending`); PortfolioCard
      already gates its timeframe buttons during recompute. A `gapSymbols` prop
      shows the amber partial-sum warning (Performance tab + card). +2 chart
      unit tests (gray-out blocks re-trigger; gap warning renders).

**Deployed 2026-09-27** — wallets **v1.1.65** + SPA **v1.0.239** pinned in
`cluster/apps/pfire/*/app/helmrelease.yaml` (homelab commit `f2be27648`), 1/1
both, migration 0009 (`gap_symbols`) applied in PROD.

**What's still missing (continue here next session):**
- [ ] **Item #2 — the actual price history** (GATED, provider tier / §63.5).
      Until the `.WA`/`.AS` symbols get bars, the value is *flagged* partial,
      not *corrected*. The 5 missing IKE Beata symbols (≈ 50k): **XTB.WA,
      EMIM.AS, RBOE.AS** (`fetch_status='failed'`, 0 bars) and **AMZN, SP20.L**
      (bars exist but a gap on the snapshot date). Concretely: (a) figure out
      why cachest/OpenBB `/ohlcv/XTB.WA` returns nothing (symbol mapping for
      WSE/ASX venues, or no provider coverage — check what openst/stooq could
      supply), (b) once sourceable, seed the history (instruments fill / stooq
      import) and re-run a backfill so `gap_symbols` clears to null and the
      value matches the live path. Also still open on the instruments side:
      log the provider error into `fetch_status`/`last_error` (diagnosability)
      and add a scheduled "fill gaps for held symbols" pass.
- [ ] **Confirm in UI** (needs a fresh PROD login — Playwright session closed
      mid-verification): on IKE Beata → Performance, verify (a) the amber
      "Value excludes 5 positions without price history" banner shows after one
      recompute, and (b) the chart grays out + Recompute is disabled during a
      Recompute and re-renders fresh when done.
- [x] ~~**Turn RECALC_DEBUG off**~~ — done in §63.10.5 (now `RECALC_DEBUG: "0"`).

### 63.9 — cachest's rate limiter caps upstream concurrency at 3 (RCA of the IKE Beata spike, 2026-09-27)

Continues §63.8 item 2, whose premise was wrong. Everything below is measured
against PROD (cluster reachable via `KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`),
not inferred.

**The spike, end to end.** The 09-26 `IKE Beata` snapshot is written by two
different valuation paths. The **live-quote** path (`snapshotPortfolioValue`, fired
on a detail-page read) values *all 23* open positions from one live quote → 205,470.
The **price-bars** backfill (`computeSnapshotBatch`) values only the symbols it has a
bar for. Measured position-by-position in PROD, exactly **3 of 23** have zero bars:

| symbol | qty | bars | `price_bars_all` last | `fetch_status` |
| --- | --- | --- | --- | --- |
| `EMIM.AS` | 80 | **0** | — | `failed` 2026-09-22 06:31 |
| `RBOE.AS` | 53 | **0** | — | `failed` 2026-09-22 06:31 |
| `XTB.WA` | 84 | **0** | — | `failed` 2026-09-27 14:24:59 |

The other 20 have bars, so the earlier "18 of 23 / 5 missing" count was an
**exact-date** check and wrong: `buildPriceMap` (`portfoliost-wallets/src/services/backfill.ts:256`)
**carries prices forward**, so a symbol with a 09-25 bar *is* valued on 09-26/27
(09-26 was a Saturday). `AMZN` (last 09-21) and `SP20.L` (last 09-24) are stale but
never dropped. The ≈50k delta is the 3 zero-bar symbols' weight, full stop.

**Root cause: `cachest`'s `RateLimiter`.** `cachest/rate_limiter.py:22` claims the
slot with `self._last_fetch = time.monotonic() + sleep`, so with N waiters the
requested sleep *grows* — 2s, 3.9s, 5.8s, 7.7s … With `fetch_interval: 2` /
`fetch_max_wait: 4` on `OPENST_OHLCV` (`cachest/config.yaml:88-99`), the moment
`sleep > max_wait` the waiter is **rejected**: instant `503`, *no upstream call*
(`cachest/main.py:84-92`). Effective queue depth is `floor(max_wait/interval) + 1`
= **3**. Reproduced in PROD with 8 concurrent `forceRefresh` calls:

```
req0 -> 200 X-Cache=MISS 0.45s     req4 -> 503 X-Cache=None 0.04s 'rate limit exceeded…'
req1 -> 200 X-Cache=MISS 2.07s     req5 -> 503 X-Cache=None 0.04s
req2 -> 200 X-Cache=MISS 4.06s     req6 -> 503 X-Cache=None 0.04s
req3 -> 503 X-Cache=None 0.06s     req7 -> 503 X-Cache=None 0.03s
```

The same limiter serves `OPENST_QUOTE` (65 rejections in the last 5 h), `logo` (21)
and `OPENST_OHLCV_FUNDS`. So this is **not** IKE-Beata-specific: 175 symbols carry
`fetch_status='failed'` in PROD, and the `.WA` family is hit as a block — `SNT.WA`
and `ETFSP500.WA` are stuck at **09-18**, `PLW.WA`/`ELT.WA`/`KRU.WA` at 09-21,
`CBF.WA`/`DNP.WA` at 09-22 — because they lost the race, not because they delisted.

**Why the loser stays a loser.** `portfoliost-instruments/src/services/price-bars.ts:395`
catches the 503 in a **bare** `catch {}`, records `fetch_status='failed'`, and
`recentlyFailed` (`price-bars.ts:181-187`) then suppresses upstream for
`COOLDOWN_MS = 1 h`. The sweep runs 1–2×/day
(`portfoliost-wallets-snapshotsync` 13:00 UTC + `…-postfx` 17:20 UTC), so a symbol
that loses one race waits ≥1 h and typically loses the next one too. There is no
`last_error` column (`src/db/schema.ts:85-89`), so a transient 503 is recorded
identically to a genuine 404 "no such symbol" — which is why this took a day to pin.

**What the provider is NOT.** Both earlier hypotheses are dead, and it is worth
recording so they are not re-tried:
- *"`start=1900-01-01` for a zero-history symbol is too wide"* (`price-bars.ts:374`
  does send that) — **false**. openst answers `XTB.WA` with 2637 bars in 2.1 s and
  `EMIM.AS` with 3152 bars in 0.9 s *with that exact 126-year window*; yfinance
  clamps to the listing date. It is visible in the cache key
  (`ohlcv:VOX0224:1900-01-01:2026-09-26`) and looks alarming, but it is not the
  cause and needs no clamp.
- *"`providerSymbol()` doesn't strip `.WA`/`.AS`"* — **false**. The suffix is the
  correct Yahoo form; `.WA`/`.AS`/`.DE`/`.L` are handled identically, and
  `EMIM.AS`/`RBOE.AS` are Euronext-Amsterdam iShares ETFs (plan-archive §43) whose
  *quotes* already work — which is precisely why the live path values them and the
  backfill cannot.

**Design decision (resolved):** fix it in `cachest`, the owning tier. `fetch_interval`
is a *politeness spacing* toward upstream; for the routes that point at **our own**
`openst` service it is far too coarse, and openst already bounds real concurrency
itself (`UPSTREAM_MAX_INFLIGHT = 8`). So: drop the interval to `0.2` and raise
`fetch_max_wait` so the queue absorbs a whole portfolio sweep (≥175 symbols), for
every `openst.*` route. Genuinely external routes keep their spacing and only get
`fetch_max_wait` raised. Separately, `portfoliost-instruments` must stop converting
a *transient* 503 into a 1-hour `failed` — a 503/504/429 is retryable and must be
recorded as such, distinct from a 404.

### 63.9.3 — heal PROD and prove the spike is gone

- [x] **Deployed 2026-09-27** (cachest v1.0.44 + instruments v1.0.70 pinned in
      `cluster/apps/pfire/{cachest,portfoliost-instruments}/app/helmrelease.yaml`,
      homelab `b9c2a9eff`; migration 0003 applied). The cachest ConfigMap landed
      first and Flux's reloader restarted the pod on it, so the limiter fix was
      live before the images.
      Verified in PROD: 16 concurrent `forceRefresh` `/ohlcv/SNT.WA` → **16 × 200,
      0 × 503** in 3.08 s (the same burst gave 3 × 200 / 13 × 503 before). Cachest
      now logs `queue_depth` per route at boot. Drove the instruments gap-fill
      directly from the pod for the starved symbols: `XTB.WA` 2637 bars,
      `EMIM.AS` 1258, `RBOE.AS` 1230, and `SNT.WA`/`ETFSP500.WA` off 09-18 onto
      09-25. `fetch_status='failed'` symbols: **175 → 166**.
- [x] All 23 IKE Beata positions now have a price bar; the amber partial-sum
      signal is no longer needed for the missing-history case. The next sweep
      pass then exposed a **much larger, unrelated** problem — see §63.10.
- [ ] `logo` route: the 21 rejections came from the same depth-3 wall and are fixed
      by §63.9.1's config (depth 600), but the SPA still fans out ~80 logos per
      page, so re-check its rejection count after the next full page load.
  - **Superseded in practice by §63.15 (2026-09-27).** The `logo` route is not
      the thing to re-check any more: `instruments.price_bar_metadata` now shows
      133 `failed` of 377 symbols, but only **13** are referenced by a live
      transaction (all genuine delistings — `MPW`, `WBA`, `TOR`, … — correctly
      404ing upstream) and 120 are orphans from the resolver's unmatched-name
      fallback. Prune them, then read the failure count.

### 63.11 — Edge auth for browser traffic (follow-on)
- [ ] Decide and implement: enable nginx `global-auth-url` in
      `cluster/apps/networking/ingress-nginx/helm-release.yaml:51`, or record a
      decision not to. Either way, close this section with the reasoning.
- [ ] Tests: with it enabled, an unauthenticated browser request to any
      `pfire` ingress is redirected, while the scheduled sweep (service token)
      is unaffected. Verify both in PROD.
- [ ] Commit.


Still open. Recorded as a deliberate non-fix during the sweep work: the cluster has a working global nginx
auth subrequest that is switched off
(`cluster/apps/networking/ingress-nginx/helm-release.yaml:51`,
`# global-auth-url: "https://auth.${SECRET_DOMAIN}/api/verify"`), and nothing in
`apps/pfire/*` uses oauth2-proxy or `auth-url`. So every access control in pfire is
per-service application-level JWT validation, and the instruments → cachest →
openst → provider-keys chain has exactly one check at its front. Worth turning on
as defence in depth — it hardens *browser* traffic and changes nothing for the
scheduled job, which is why it was not treated as urgent.

---

### The chain

1. **The sheet contradicts itself.** The live Podsumowanie row for
   `Nintendo Co Ltd` (fixture row `[106]`) carries `Symbol giełdowy`=`NTO`,
   `Giełda`=`FRA`, currency=`EUR` — i.e. the Frankfurt line — but its
   `Symbol Yahoo` column says **`7974.T`**, the Tokyo line. The DIVIDEND rows on
   the same holding say `JPY` while the BUY/SELL rows say `EUR`.
2. **The resolver faithfully follows the stale column.** `resolveInstrument`'s
   order is `byNameOverride` → catalog-by-name → catalog-by-(symbol, venue) →
   `ticker_reference`, and the catalog entry's `yahooSymbol` *is* that Yahoo
   column. A name override was already supposed to shield this, and for `EMIM`
   (`§38.3`) and `RBOE` (`§43.1`) it does — but the `nintendo co ltd` entry itself
   pointed at `7974.T` with `country: "JP"`, so the override *enshrined* the wrong
   listing. It carried no provenance comment, unlike its `allianz se` neighbour.
3. **The currency resolver could not object.** `ticker_reference` has no `7974`
   row at all, and `exchange_reference`'s `TSE` row has an **empty
   `yahoo_suffix`**, so `resolveInstrumentCurrency` is silent and falls back to
   the caller-declared base — which is the trade row's `EUR`.
4. **Valuation then priced the wrong series.** The stored `instrument_currency` is
   `EUR`, so the ¥12,695 Tokyo close of 2025-09-23 became
   `20 × 12,695 × 4.25 ≈ 1,080,421 PLN`.

#

### The evidence that the intended series is `NTO.F`

The stored transaction prices were *already* the Frankfurt ones — the import only
mislabelled the symbol. `NTO.F` closes reproduce them to within a day's spread,
while `7974.T` is a different series entirely (probed 2026-09-27 via openst):

| date | stored transaction price | `NTO.F` close | `7974.T` close |
|---|---|---|---|
| 2023-04-12 (BUY 5) | 37.50 EUR | **37.02** | 5,466 JPY |
| 2024-08-05 (BUY 5) | 42.72 EUR | **43.89** | 6,607 JPY |
| 2025-09-23 | — | **73.22** | 12,695 JPY |
| 2025-09-24 (SELL 20) | 74.70 EUR | — | — |

`NTO.DE`, `NTOG.UK` and `7974.TO` all 404; `NTO.F` is the only live line. It also
has the deeper history of the two (2,983 bars from 2015-01-02 vs 2,886 from
2015-01-05), so the reimport heals the whole holding rather than opening a gap.
Correct value of the 20 shares on 2025-09-23 is `20 × 73.22 ≈ 1,464 EUR ≈ 6,200 PLN`,
not 1,080,421 PLN — the cliff is **entirely** the phantom, and the recomputed
series should be flat across 2025-09-24.

#

### Fix

`NAME_VENUE_OVERRIDES["nintendo co ltd"]` → `ticker: "NTO"`, `yahooSymbol: "NTO.F"`,
`country: "DE"` (`portfoliost-sheets-sync` `db04359`, shipped `v1.0.22`, pinned in
`portfoliost-admin`'s `SHEETS_SYNC_IMAGE`). EUR now matches the row's own currency
column, so the position needs **no conversion at all** — which also answers "why JPY
if we only use EUR": we do not; JPY was only ever the stale Tokyo line bleeding in.

Tests: `instrument-resolver.test.ts` asserts the override holds for `FRA` *and* for
a stale `TYO` row (it is name-keyed, so the venue column cannot filter it out);
`podsumowanie-parser.test.ts` keeps asserting `7974.T`/`JP` to pin the fact that the
parser reads the sheet verbatim and the correction lives in the resolver. 138 green.

#

### Healed in PROD (2026-09-27)

Wipe & reimport + full recompute of all 10 portfolios, verified:

| check | before | after |
|---|---|---|
| stored Nintendo symbol | `7974.T` (9 rows) | **`NTO.F`** (9 rows) |
| IBKR value 2025-09-23 | 1,528,346 | **453,217** |
| IBKR value 2025-09-24 | 454,644 (−52.1%) | **454,644 (+0.3%)** |
| merged series 2025-09-24 | −52.1% | **+0.1%** |
| `NTO.F` price bars | none | 6,830 |
| backfill status (10/10) | complete | **complete**, `gap_symbols` empty |

Phantom removed: **1,075,129 PLN** from IBKR's 2023-04-12..2025-09-23 window —
which reconciles with the predicted 1.07M from the table above. Headline values are
**unchanged** (IBKR 585,319.22, IKE Beata 196,827.12, IKE Marek 90,962.72) because
the position was sold in Sept 2025 and contributes nothing to today's figures; only
the historical window moved. The merged chart's worst remaining single-day move is
−24.1% on 2022-05-26, a real drawdown.

#

### Left open

- **The DIVIDEND rows will still be `JPY`** after the reimport: `currency` comes
  from the sheet, and the override only changes the symbol. Financially
  immaterial (~10 PLN total across four rows) but it is a residual label
  inconsistency, now confirmed to have survived the reimport as predicted.
- **The fleet-wide stale-symbol audit is unresolved.** The obvious check —
  compare each row's Yahoo column against `symbol + exchange_reference.yahoo_suffix`
  — does not work, because the sheet uses **Polish venue codes** (`ETR`, `LON`,
  `FRA`, `AMS`, `BIT`, `SWX`) while `exchange_reference` carries MIC-style ones
  (`XETRA`, `XLON`, `XFRA`, `XAMS`, `FSX`). 35 of 226 rows come back "unknown
  venue" and the naive comparison also flags legitimate local-ticker ≠ Yahoo-ticker
  cases (`V` → `HUBS`). Nintendo is the one case proven wrong by the data.
  Two real reference gaps surfaced while attempting it: `TSE` has an **empty**
  `yahoo_suffix` (which is why the currency resolver was silent), and there is
  **no TSX row**, so `CSU` (Constellation Software, `CSU.TO`) has no venue to
  resolve against. Adding the sheet's venue-code vocabulary to
  `exchange_reference` is the prerequisite for making that audit real.

### Two audits, and why the first one was wrong

**Attempt 1 (discarded).** Probed the provider's `/equity/quote` for all 220
distinct stored symbols at concurrency 6 and compared the result with each
symbol's `instrument_currency`. It reported "80 currency mismatches / 92
unpriceable", including `NTO.F` — which had just been backfilled with 6,830 bars
and verified at 43.01 EUR. Two tell-tales gave it away: `NTO.F` came back `ERR`,
and `0M6S.IL` and `CSN.L` reported an identical 1,701 bars. openst was throwing
and rate-limiting, so the harness was measuring its own failures. **Discarded
whole.** The trustworthy signal at the time was the independent one: all 10
portfolios were `complete` with empty `gap_symbols`.

**Attempt 2 (kept).** Two changes made it sound:

1. *Structural check, no network.* Compare each live Podsumowanie row's Yahoo
   column against its own `Symbol giełdowy` + `Giełda`. The sheet's venue codes
   map to fixed Yahoo suffixes (`ETR`→`.DE`, `FRA`→`.F`, `LON`→`.L`, `AMS`→`.AS`,
   `BIT`→`.MI`), so the expected symbol is derivable. This needs the *stored*
   symbol joined by name to see what the resolver actually produced.
2. *Currency check, gently.* Probe `/equity/quote` at concurrency 3 with
   retries, comparing the provider's currency against the **catalog's**
   `Oryginalna waluta` (col 37) — not the transaction's `instrument_currency`,
   which is legitimately different (§ below).

#

### What the ETR/FRA/LON/AMS/BIT sweep found (40 rows)

14 of 40 diverged, and the classes are very different:

| class | n | detail |
|---|---|---|
| cosmetic | 8 | German `.F` vs `.DE` sibling lines. Measured: AHOG +0.19%, VNA +0.17%, BAS +0.08%, SRT +0.73%, FRE −0.29%, MUV2 +0.16%; plus `XDEW.SW`/`XMBR.DE` on a `BIT` row. Same company, same currency, tracks within 0.75%. Not worth touching. |
| intentional | 1 | `Allianz SE` → `0M6S.IL`, the §34.7 override. |
| **wrong** | 4 | `CSKR.L`, `EXS1`, `LTAM`, `EX10.VI` — shipped in `v1.0.23`. |

`EX10.VI` was the notable one: the provider identifies it as **iShares MDAX
UCITS ETF (DE)** — a different issuer (BlackRock, not Invesco) — whose history
starts 2026-04-28, *after* the holding closed in Oct 2025, so it could never have
priced it. The real fund is ISIN **IE00BHJYDV33**, Borsa Italiana ticker `MDAX`,
and the Xetra/gettex line is `DEAM.DE` (1,938 bars from 2019-02-11 inception vs
`MDAX.MI`'s 351 from 2025-05-08 — hence `DEAM.DE`).

**`openst`'s search endpoint cannot help here**: `/equity/search` is US-only
(SEC CIK index), so "MDAX" and "Invesco MDAX" both 404. The ISIN had to come
from the open web, then be confirmed against the provider's profile name and the
sheet's own trade prices.

#

### The pence bug (§63.5's fix was half-wrong)

`_needs_gbx_normalization` fired on **any** yfinance `.L` ticker, so every
USD-quoted LSE line had its history divided by 100 as if it were pence. Measured
in PROD:

| symbol | bars before | truth | bars after |
|---|---|---|---|
| `CNYA.L` | 0.0447 | ~4.46 | **4.468** |
| `DEAM.L` | 0.583 | ~58.3 | **58.78** |
| `IWDA.L` | 1.4691 | ~146.9 | — |
| `EMQQ.L` | 0.0933 | ~9.33 | — |
| `BYG.L` | 8.20 | £8.20 ✓ | 8.24 ✓ |
| `CSN.L` | 3.525 | 352.5 GBp ✓ | ✓ |

The quote path was never wrong — only the two history paths divided — and
instruments already applies its own `PENCE_UNIT` rule to quotes, so this was the
sole incorrect side. Fixed in `openst` `9348560` / **v1.1.37**: the decision now
comes from the provider-declared currency via a memoised `get_quote` lookup.
Successful lookups are cached, failures deliberately are **not** (so they retry),
and when the currency can't be determined openst does **not** scale — missing a
pence line is a bounded error instruments flags, while scaling a USD line is
unbounded across a whole class of ETFs. No USD `.L` position is open, so nothing
live changed; the stored bars are corrected by the next recompute.

This is also why `CNYAN.MX` → `CNYA.L` was **held back** from v1.0.23: before the
fix `CNYA.L` came back as 0.0447, so applying it then would have swapped a 20×
error for a 100× one.

#

### Full 220-symbol sweep — 3 more real defects

| stored | resolved to | was | evidence |
|---|---|---|---|
| `CNYAN.MX` | **`CNYA.L`** | the **Mexican** line, for a `LON`/USD row | `CNYAN.MX` closed **90.11 MXN** where the sheet records 4.46 USD; `CNYA.L` gives 4.468/4.436 vs sheet 4.46/4.395 |
| `FRO` | **`FRO.WA`** | bare `FRO` is **Frontline plc**, a USD tanker company | 11.89 USD vs a real 25.10 PLN; `FRO.WA` = "FERRO S.A.", PLN, 25.60/23.60 vs 25.10/23.00 |
| `XDEW.SW` | **`XDEW.MI`** | the CHF SIX line, for a `BIT`/EUR row | 4–8% off; `XDEW.MI` matches all four trades within 0.5% |

`FRO` is the same shape as Nintendo: a Polish holding priced off an unrelated
US-listed company that happens to share the ticker.

`CNYAN.MX` had already done measurable damage — IKE Beata's value series steps
**+27,669 PLN** on 2025-01-23 (82 units) for a position genuinely worth ~1,485 PLN.

#

### Currency labels that are NOT bugs

A stored `instrument_currency` that differs from the quote currency is **normal**:
the broker transacts in a local currency and converts to the instrument's original
currency with its own rate, which the pipeline already stores. Confirmed on
`ASML`, which is Nasdaq/USD but has EUR rows in IKE Marek — every row carries
`rate_source='manual'` with correct historical rates (4.74 for 2022-08-26, 4.35
for 2023-12-29). So these were deliberately **not** overridden, only checked that
the *symbol* fits its venue: `SHOP` (sheet CAD, transacted USD at IBKR),
`NVO` (sheet DKK, transacted USD), `BTEC.SW` / `EMQQ.L` / `IUCD.L` / `MLPD.L`
(sheet says GBp/EUR, all transacted USD with manual rates, provider quotes USD),
`CSN.L` / `RIO.L` (PLN transactions on GBP-quoted London lines). Their catalog
currency labels are annotations, not valuation inputs.

#

### False alarms worth recording

- **The 33 Polish bond codes** (`EDO*`, `ROD*`, `ARH*`, `KIN*`, `KRI*`, `INS*`,
  `BST*`, `NVA*`, `VOX*`) 404 on `/equity/quote` **by design** — they're bonds.
  They are served in PLN by the bond endpoints (`EDO1233` 115.57 PLN,
  `ROD0935` 121.60 PLN; `ARH0722`/`VOX0224`/`KIN1025` return corp-bond profiles
  with ISINs but no quote). Not defects. Note the 41 `venue='-'` rows are 35 of
  these bonds plus 6 Goldman Sachs TFI funds already handled by §38.3.
- **`CRWD` / `GOOGL`** returned no `currency` field — the provider simply omits it
  on those two quotes. Both are NASDAQ/USD and priced normally.

#

### Method note

Every override in this section was validated against **your stored transaction
prices** before being accepted, not against the sheet's symbol column. That is
what makes the difference between a real fix and a plausible one: `EX10.VI` looks
like a reasonable ticker until you ask what fund it actually is, and `FRO` looks
right until you notice the bare ticker belongs to a shipping company.

Six overrides total across §63.12–§63.13: `7974.T`→`NTO.F`, `CSKR.L`→`IKOR.L`,
`EXS1`→`EXS1.DE`, `LTAM`→`LTAM.MI`, `EX10.VI`→`DEAM.DE`, `CNYAN.MX`→`CNYA.L`,
`FRO`→`FRO.WA`, `XDEW.SW`→`XDEW.MI` — seven in all.

#

### Healed in PROD (2026-09-27)

Wipe & reimport (`sheets-sync` v1.0.24) + full recompute of all 10 portfolios:

| check | before | after |
|---|---|---|
| bad symbols in `transactions` | 8 kinds | **none** — all 7 overridden |
| `NTO.F` / `IKOR.L` / `EXS1.DE` / `LTAM.MI` / `DEAM.DE` / `CNYA.L` / `FRO.WA` / `XDEW.MI` | — | present, 31 rows |
| IKE Beata 2025-01-22 → 01-23 (`CNYA.L`) | 115,606 → 143,275 (**+27,669**) | 115,606 → **115,208 (−398)** |
| IKE Beata around 2022-08-26 (`FRO.WA`) | Frontline's USD line | smooth, ~22,000, no step |
| merged series 2025-09-24 | −52.1% | **+0.1%** |
| worst single day, whole 2019–2026 series | −52.1% (phantom) | **−24.1%** (2022-05-26, a real drawdown) |
| days worse than −25% | 1 (the phantom) | **0** |
| backfill status (10/10) | complete | **complete**, `gap_symbols` empty |

The 2025-01-23 step is the clearest single confirmation: +27,669 PLN became −398,
and the position that caused it is worth ~1,485 PLN.

---

### 63.14 — Portfolio cards render the wrong currency symbol

Found 2026-09-27 during the §63 fact-check. `PortfolioCard.vue:358,362` call
`formatCurrency(portfolio.currentValue)` / `(portfolio.totalInvested)` with
**no currency argument**, and `formatCurrency`'s second parameter defaults to
`"USD"` (`src/utils/format.ts:1`). The values are in the portfolio's base
currency, so every card's Value and Invested lines are PLN amounts printed
with a `$`. The cash line three lines below (`:382`) gets this right —
`formatCurrency(portfolio.cash.total, portfolio.cash.baseCurrency)` — which is
what makes the asymmetry easy to miss.

Verified in PROD 2026-09-27: IBKR renders `$585,428.89` where the snapshot is
585,319.22 **PLN**.

- [x] **Already done, by later work — verified 2026-09-29.** `PortfolioCard.vue`
      now reads `formatCurrency(convert(portfolio.currentValue), displayCurrencyOr())`
      (and the same for `totalInvested`): it passes the currency AND converts from
      the portfolio's base. §66.2 made `currency` a REQUIRED parameter, which is
      what guarantees it — a call without one cannot compile. Grepped every
      `formatCurrency(` call site in `src/`; none is missing its second argument.
- [ ] Decide whether `formatCurrency`'s `"USD"` default should exist at all —
      `formatAmount` (`:9`) already refuses to guess a currency; the currency
      formatter silently does. Aligning them would have caught this at compile
      time.
- [ ] Tests: unit — a PLN portfolio renders `zł`, not `$`; a null-currency
      portfolio renders without a symbol. `npm run build` + `npm run test` green.
- [x] Playwright: re-check the cards on `/en/investments`.
      > **done 2026-09-29 — PROD renders `PLN 119,250.00`, not `$`**
- [x] Commit.
      > **no code change needed; §63.14 closed by verifying §66.2's work**

### 63.15 — Prune orphaned price-bar metadata

Found 2026-09-27. `instruments.price_bar_metadata` holds 377 symbols: 244 `ok`
and **133 `failed`**, but only **13** of the failures are still referenced by a
live transaction — those are genuinely delisted (`MPW`, `WBA`, `TOR`, …) and
correctly 404 upstream. The other **120** are orphans left by earlier import
rounds, when the resolver's "unmatched keeps the sheet name as symbol" fallback
wrote company *names* into the symbol column: `ALLIANZ SE`, `NINTENDO CO LTD`,
`AMUNDI CORE S&P 500 SWAP UCITS EUR DIST ETF`, plus bare tickers from superseded
resolutions (`ADYEN`, `CSU`, `JNJ`, `PKN`, `RIO`, `SNT`, `XTB`). 157 metadata
rows in total have no referencing transaction.

These are harmless to valuation (all 10 backfills are `complete` with empty
`gap_symbols`) but they make the next audit read as if ~35% of the fleet is
broken, which is exactly the false signal that made my first §63.13 sweep
unreliable.

- [ ] Decide the retention rule: delete `price_bar_metadata` + `price_bars_all`
      rows whose symbol no transaction references, or keep them as a warm cache.
      Deleting is cheaper to reason about; keeping needs a documented TTL.
- [ ] If deleting: the sweep must never remove a symbol a *held* position needs,
      so gate on "no referencing transaction **and** not in the live fetch set".
- [ ] Add the resolver's unmatched-name fallback to the plan's radar: when it
      fires, the sheet row's symbol is a company name, which no provider will
      ever serve. Consider making that case loud at import time instead of
      silent.
- [ ] Tests: after the prune, every remaining `failed` row is referenced by a
      transaction and 404s upstream; a symbol with a live position is never
      removed.
- [ ] Commit.

---

## 64. Kubernetes probes for the pfire fleet (found 2026-09-27 while deploying openst v1.1.36)

No marx2-owned service in `pfire` had a working HTTP health probe until
openst v1.1.36. Auditing all nine against the live cluster found three
distinct states, and — worse — that the pattern already in the repo is a
**false friend**: it reads like an HTTP health check but deploys as a TCP
socket check. Nothing in the namespace can currently express "degraded", and
nothing restarts a hung process.

Scope: the 9 `ghcr.io/marx2/*` services in `cluster/apps/pfire/`. Third-party
images (`ghostfolio`, `pgadmin`, `pgweb`, `postgrest`, `swagger-ui`,
`investbrain`) are **out of scope** — their probe semantics belong to their
upstreams.

### Audited state (live, 2026-09-27 — not inferred)

| Service | chart | probes in yaml | renders as | health endpoint |
|---|---|---|---|---|
| `openst` | 5.1.0 | liveness+readiness+startup | `httpGet` ✅ | `/health` 200, `/ready` 200 |
| `cachest` | 5.1.0 | **none** | — | `/health` 200, `/ready` **404** |
| `portfoliost-wallets` | **5.0.1** | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-instruments` | 5.1.0 | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-admin` | **5.0.1** | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-users-auth` | 5.1.0 | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost` (SPA) | 5.1.0 | **none** | — | `/` 200 (nginx SPA fallback) |
| `jobshot` | 5.1.0 | **none** | — | every path → `index.html` 200 |
| `mastra-ticker` | 5.1.0 | liveness (`custom: true`) | n/a — **no Deployment or Service in cluster** | unreachable |

### The chart contract (read from the chart, not guessed)

`app-template` 5.x nests probes at
`controllers.<c>.containers.<name>.probes.<probeName>`:

- `enabled: true` is **required** — a probe without it is silently skipped.
- `type` defaults to **`TCP`**, not HTTP. `type: HTTP` is needed for `httpGet`.
- `path` / `port` are read from the **probe** level; `initialDelaySeconds`,
  `failureThreshold`, `timeoutSeconds`, `periodSeconds` are read from `spec`.
- `port` defaults to the controller's primary service port.
- `custom: true` + a raw `spec` is the escape hatch that renders verbatim.

**Why the four existing probes are wrong:** they put `path: /health` inside
`spec:` and omit `type`. The template only lifts the four timing keys out of
`spec` and never reads `path` from there, so the path is dropped and the
default `TCP` applies. Verified live — all four render as
`tcpSocket: {port: 3000}`. A process that accepts connections but no longer
answers (deadlocked, event loop wedged, exhausted pool) passes both probes.

Rules: one step = one commit; step `[x]` only after its tests pass. Probe
changes are cluster-visible, so **every step ends with a Flux + `kubectl`
verification**, and each helmrelease change must be validated against
`app-template`'s `values.schema.json` **before** pushing — see §64.1.

---

### 64.1 — Fix the four false-friend probes (wallets, instruments, admin, users-auth)

- [x] Convert each to the shape that actually renders `httpGet` — add
      > **§72.25; verified live: all four render httpGet /health:3000 at probe level, pods 1/1 Ready**
      `type: HTTP`, move `path: /health` from `spec` to the probe level, keep
      the timing keys in `spec`. Use the openst v1.1.36 block as the reference
      implementation, not the current wallets one.
- [x] Bump `portfoliost-admin` and `portfoliost-wallets` from chart 5.0.1 to
      > **§72.25 — chart 5.1.0**
      5.1.0 in the same commit, so all four pfire TS services share one chart
      version and one probe dialect.
- [x] Add a **startupProbe** to each. These four have no schema migration on
      > **§72.25 — added to all four**
      boot, but a slow first provider/db connect currently counts against
      `liveness` and can restart-loop a cold pod.
- [x] Validate locally before pushing (this is the step that would have
      > **§72.25 — schema-valid, plus asserted probe paths resolve**
      prevented the openst rollout failure — the first v1.1.36 push put
      `livenessProbe:` directly on the container, the Helm upgrade failed schema
      validation, and **openst silently stayed on v1.1.35**):
      ```sh
      helm pull bjw-s/app-template --version 5.1.0 && tar xzf app-template-5.1.0.tgz
      python -c "import json,yaml,jsonschema; jsonschema.validate(
        yaml.safe_load(open('cluster/apps/pfire/<app>/app/helmrelease.yaml'))['spec']['values'],
        json.load(open('app-template/values.schema.json')))"
      ```
- [x] Tests: schema validation passes for all four; after Flux applies,
      > **§72.25 + verified in-cluster via kubectl**
      `kubectl get deploy -n pfire <app> -o json` shows `httpGet` with
      `path: /health` (not `tcpSocket`) for both probes, and pods reach 1/1 with
      `restarts: 0`.
- [x] Commit.
      > **§64.1 commit, deployed and Flux-verified**

### 64.2 — cachest: add `/ready`, then probes

- [ ] `cachest`: add `GET /ready` mirroring openst's — `503` +
      `{"status":"degraded","redis":"unreachable"}` when the cache is down,
      `200` otherwise; keep `/health` as pure liveness that never touches Redis
      (a dependency-aware liveness probe restart-loops the pod during a cache
      blip, which cannot fix the cache). Since cachest's `RedisCache.get/set`
      already degrade to misses, readiness is the only honest place to drop the
      pod from rotation.
- [ ] Add liveness (`/health`), readiness (`/ready`) and startup probes to
      `cluster/apps/pfire/cachest/app/helmrelease.yaml`.
- [ ] `cachest`: add `test_ready_reports_503_when_redis_is_unreachable` and
      `test_health_stays_ok_while_redis_is_down`; full suite green
      (`docker build --target test -t cachest-test . && docker run --rm cachest-test`).
- [ ] Tests: pod 1/1 with 0 restarts; probes render `httpGet`; `/ready` returns
      200 in-cluster; and a deliberate Redis outage (scale the cache down) takes
      the pod out of rotation **without** `/health` flapping.
- [ ] Commit: `cachest` code + tests, then the homelab tag bump + probes.

### 64.3 — portfoliost SPA: probe nginx, and say so

- [ ] Add liveness + readiness on `GET /` (the SPA's own `/health` returns
      `index.html` via the nginx catch-all, so it is not a health check). This
      proves nginx is serving, which is the only failure mode an SPA has —
      the API is a separate deployment with its own probes after §64.1.
- [ ] Add a comment in the helmrelease recording that this probe covers nginx
      only, so a future reader does not assume it validates the app.
- [ ] Tests: pod 1/1; probe renders `httpGet` on `/`; rolling the deployment
      does not flap.
- [ ] Commit.

### 64.4 — jobshot: needs a real health route (crosses a 3rd repo)

- [ ] **Blocked on open question 1.** `jobshot` returns `index.html` for
      `/health`, `/healthz` and `/ready` alike (SPA fallback), so any HTTP probe
      on it is a no-op that always passes. Either add a real `/health` in the
      `jobshot` repo, or accept a `/` probe that only proves nginx is up.
- [ ] Tests: the chosen endpoint returns something other than the SPA shell
      (assert on content, not just status), pod 1/1.
- [ ] Commit.

### 64.5 — mastra-ticker: decide, or remove the dead helmrelease

- [ ] `mastra-ticker` has a helmrelease with a `custom: true` probe but **no
      Deployment and no Service** in `pfire` — it is not deployed. Either deploy
      it or drop the manifest so the next audit is not misled by a probe that
      protects nothing. `custom: true` is the correct escape hatch and is the
      shape to prefer when the built-in dialect does not fit.
- [ ] Tests: if deployed, pod 1/1 and probe reaching a 200; if removed,
      `kubectl get deploy -n pfire mastra-ticker` 404s and the Flux
      kustomization reconciles clean.
- [ ] Commit.

### 64.6 — Make the schema check routine, not a one-off

- [ ] Add a `hack/validate-helmrelease.py` (or equivalent) to the homelab repo
      that validates **every** `cluster/apps/pfire/*/app/helmrelease.yaml`
      against the pinned chart's `values.schema.json`, and call it from a
      pre-commit hook. §64.1's openst failure was a schema error that only
      surfaced as `Ready=False / UpgradeFailed` in the cluster, ~90 s after
      Flux applied it, with the service silently left on the old image.
- [ ] Also assert, in the same check, that a service declaring `probes:` has
      `type` set on each probe — the tcpSocket false friend is schema-**valid**,
      so only an explicit lint catches it.
- [ ] Tests: the script exits non-zero on (a) a schema violation and (b) a
      probe missing `type`; exits 0 on the current tree after §64.1–64.3.
- [ ] Commit.

### Open questions

1. **jobshot health route** — add a real `/health` in the `jobshot` repo
   (3rd repo for this plan), or accept a `/` probe that only proves nginx is
   up? The plan currently assumes a real route is preferred; §64.4 is blocked
   until this is answered.
2. **cachest `/ready`** — is a second endpoint worth it, given cachest already
   degrades gracefully to cache misses? The argument for it is that without it
   readiness would duplicate liveness and the pod would keep taking traffic it
   cannot serve quickly. Confirm before §64.2.
3. **Separate liveness vs readiness paths for the four TS services** — all four
   expose only `/health` (200); `/ready` is 404 on every one. So readiness
   would be a duplicate of liveness unless each service grows a `/ready` that
   checks its own dependencies (db, redis). Is a duplicated probe acceptable, or
   should `/ready` be added to each service?
4. **Third-party images** — deliberately excluded here. Should the audit cover
   `postgrest` / `swagger-ui` / `pgadmin` / `pgweb` too, or stay scoped to
   images this monorepo builds?


## 65. Gotówka reconciliation: the sheet is missing cash rows (2026-09-27)

This is **user-driven** and the only remaining loop from the cash-native work:
it closes when the sheet stops disagreeing with the import, not when code
changes. The import side is done — `Transakcje!AU` is fetched and parsed, the
`#d` funding leg and the Equate+ → IBKR `#t` transfer are emitted, and the
warn-only reconciliation exists.

Context: §62 made cash portfolio-native and §62.6 added a warn-only `Gotówka`
reconciliation that prints a line per gap (Δ per day, suggested Wpłata/Wypłata
row per Konto, in PLN). It never fails the run.

  - **RCA done 2026-09-26**: the recon's premise was wrong — the Gotówka
    columns do NOT equal the running sum of Transakcje cash flows (matched
    dates: IBKR 2/161, IKE Marek 2/71); user confirmed the sheet **missed
    inflow/outflow rows** (the Gotówka column is the source of truth). Report
    generated with every gap (Δ per day, suggested Wpłata/Wypłata row per
    Konto, PLN): 586 rows, Σ +293 242,29 PLN (IB 311 / IKE Marek 126 /
    IKE Beata 139) — user is adding them to the sheet step by step; re-run the
    comparison as they land, then wipe & reimport when ~empty.

### 65.1 — Re-run the comparison as the rows land, then wipe & reimport

- [ ] Re-run the `Gotówka` recon (Admin → Jobs → dry sync, no `--wipe`) and
      confirm the report is shrinking toward empty.
- [ ] When it is ~empty: Wipe & Reimport, then a full recompute of all 10
      portfolios.
- [ ] Assert: 0 row errors; the synthetic `#d`/`#t` legs still dedupe on a
      second run; all 10 `portfolio_backfill_metadata.status = complete` with
      empty `gap_symbols`.
- [ ] Tests: `backfillStatus: complete` on `/api/portfolios/merged`; no
      single-day move worse than −25% in the ALL series (the bar established in
      §63.13 — the series' worst legitimate day is −24.1% on 2022-05-26).
- [ ] Commit (plan closeout) + archive §65.

---

## 67. Follow-ups from the currency work — the aggregate base and a duplicated helper (2026-09-27)

Two things §66 deliberately did not do, both left over from the rollout.

### 67.1 — the aggregate still denominates in USD, so §63.3 cannot reconcile

`total-metrics` no longer *hardcodes* USD (§66.4) — it uses
`preferredBaseCurrency`, and falls back to the user's own most common portfolio
base when the preference service is unreadable. In PROD that preference is
genuinely **unset**, so the honest default applies and the response still reports
`baseCurrency: "USD"`, while every portfolio is PLN and the cards render PLN.

Measured after the §66 rollout:

| surface | value |
|---|---|
| Σ the 10 cards (Value) | PLN **1,380,487.34** |
| "Total Value" headline | PLN **1,035,259.30** |
| difference | PLN **345,228.04** ≈ the Cash card (PLN 345,228.05) |

So the residual gap is cash, not FX: the cards include cash and the headline
does not. That is §63.3's item, but it is blocked on this: the aggregate needs a
base currency that means something to the user.

- [x] Make the Display-currency selector write through to the user's
      `baseCurrency` preference, so the backend can see it at all
      (`portfoliost` `1d1dd65`, 402 green, **committed but deliberately not
      deployed** — flipping the aggregate base USD → PLN moves the headline, and
      it ships with §68 so the numbers move once, for one reason).
- [x] On deploy (with §68): confirm the aggregate base is now the user's chosen
      currency rather than the USD default.
- [x] Then close §63.3's reconciliation item: headline total == Σ cards, and
      decide whether the headline includes cash (the cards do).
- [x] Also still open there: `Crypto` reports `totalValue: 0,
      returnPercentage: -100` in the breakdown while holding 887.74 PLN and its
      card reads +1.65%. A portfolio with cash and a position must not floor at
      zero.
- [x] Tests: `total-metrics.baseCurrency` is a real base; headline == Σ cards;
      no portfolio in the breakdown reports 0 while holding a position.
- [ ] Commit.

### 67.2 — one display conversion, not five (§67.2 closed 2026-09-27)

§66.3 added `useDisplayConversion` (one implementation, two explicit rules) and
used it on the card. Grepping for the pattern instead of trusting the count
found **four** remaining copies, not the two this section originally listed:

- `InvestmentsView.vue` — local `toDisplay()` + `mergedChartRate`
- `PortfolioHoldingsTab.vue` — local `toDisplay()` + `toDisplayRate` + `totalsCcy`
- `PortfolioDetailView.vue` — `summaryRate` **(degraded an unresolvable pair to
  1:1)**
- `PortfolioPerformanceTab.vue` — `chartRate` **(degraded to 1:1)**

The two marked ones are a §66 violation, not a dedup. `PortfolioDetailView`'s
`summaryRate` was set to `1` when the rate lookup failed, which defeated the
`summaryPending` gate right below it: a failed rate made `summaryPending` false,
so the template rendered **native portfolio-currency values under the display
currency's symbol** — exactly the mislabelled amount §66.2 forbids.
`PortfolioPerformanceTab` was worse in the same way: the chart is labelled
`:currency="displayCurrency"`, so an unresolvable pair plotted native values
under the display currency. Same class as the wallets `?? 1` degrade fixed in
`bd28ba1`, on the SPA side, and missed by the same reasoning — nobody greps for
the bug they did not know to look for.

- [x] Move all four onto `useDisplayConversion` and delete the local
      implementations. The holdings tab's `totalsCcy` is now
      `computed(() => displayCurrencyOr())` and the totals rows still read
      `rate` **directly** rather than `convert()`, because they must keep
      falling back to the portfolio-currency sum instead of going null.
- [x] Fix the two mislabelling degrades: the rate is left `null` (so the
      existing `—` path works) and the chart label falls back to the portfolio's
      own currency via `displayCurrencyOr()`.
- [x] Tests: 402 unit + 227 mock green, `vue-tsc` clean.
- [x] Playwright: `/en/investments` and the portfolio holdings/performance/detail
      tabs compared; no new failures (see the pre-existing note below).
- [x] Commit (`portfoliost` §67.2).

`PortfolioPerformanceTab` keeps one `getLatestRate` call for the per-position
`rateByCcy` map — that is N currencies → display, not a single base→display rate,
so the single-source composable cannot serve it. Deliberately left.

#### Pre-existing e2e failures found while verifying (not caused by §67.2)

Baseline-checked by stashing the change and re-running: **5 e2e tests already
fail on unmodified `main`** — all of them "chart element not found"
(`chart-recompute.spec.ts:13`, `combined-chart.spec.ts:11` and `:19`,
`performance-display-currency.spec.ts:39`, `parity-portfolios.spec.ts:53`). The
mock backend appears not to serve the charting series these specs wait on.
`portfolios.spec.ts` is separately **flaky** (a different test in it failed on
each of three consecutive runs; 17/17 green on the fourth). Recorded here rather
than fixed, since both predate §67.2 and neither is caused by it — but the
mock's charting data needs a look, and until then "e2e green" cannot be used as
a release gate for chart work.

---

## 68. Cash as a first-class citizen in the headline: Cash / Instruments / Total / Invested (2026-09-27)

Follows §66 (never guess a currency) and unblocks §63.3, whose reconciliation item
has been open since the fact-check. The four headline figures the user asked for:

- **Cash value** — the cash balance
- **Instruments Value** — positions only
- **Total Value** — cash + instruments (**confirmed by the user**: cash is a
  first-class citizen, so Total includes it)
- **Total Invested** — the value of cash inflow / outflow / **transfer**
  (confirmed by the user: transfers are part of the definition, not excluded)

### 68.1 — What the numbers are today, measured (not inferred)

PROD, 2026-09-27, all 10 portfolios PLN:

| figure | PLN | where it comes from |
|---|---|---|
| Σ `portfolio.currentValue` | **1,380,487** | **includes cash** — Crypto's 887.74 value *is* its 887.74 cash; Rach. rej. 47,956 positions + 8,500 cash = 56,456 |
| Σ cash | **345,228** | `totalCash` = 90,046.10 in the aggregate base (USD) |
| headline "Total Value" | **1,035,259** | 1,380,487 − 345,228 → **today's headline is really Instruments Value** |
| Σ `totalInvested` | 1,040,416 | net external flow |

So the ambiguity is precise: **`total-metrics.totalValue` excludes cash while
`portfolio.currentValue` includes it.** The cards and the headline are summing
different things, which is the whole of §63.3's 345,228.04 discrepancy — the
figure is exactly the Cash card (PLN 345,228.05).

`totalCash` and `cashBreakdown` already exist on the response (`openapi.yaml`
`PortfolioTotalMetrics`) and are correct. `instrumentsValue` does not exist
anywhere, and there is no per-portfolio cash/instruments split on the card either.

### 68.2 — contracts: define the four, and change what `totalValue` means

**This is a breaking semantic change** and the only one in this section:
`totalValue` goes from 1,035,259 → 1,380,487 PLN for this user. Anything reading
it as "the invested capital" or comparing it to a per-portfolio `currentValue`
will shift. The SPA is the only consumer in the monorepo; grep before assuming.

- [x] `PortfolioTotalMetrics`:
      - `instrumentsValue: { type: number }` — positions only, aggregate base.
      - rename `totalCash` → **`cashValue`** (`cashBreakdown` already spells the
        card out; `cashValue` is what the tile shows). Update the description to
        say it is the **balance**, not a flow.
      - **`totalValue`** keeps its name and changes meaning: `instrumentsValue +
        cashValue`. Say so in the description, because the old meaning was
        positions-only and that is the bug being removed.
      - `totalInvested` description: cash inflow / outflow / transfer, i.e. the
        §62 `externalCashInvested` basis (`externalCapitalBasisSource:
        "externalFlows"` already reports it). **Verified 2026-09-27:**
        `externalCashInvested` (`services/cashLedger.ts:284`) sums every cash row
        with no type filter, so transfers are already included — which is the
        requested definition, so this is documentation only.
        Consequence to state in the description rather than hide: a transfer
        between two of the user's own portfolios *raises one portfolio's invested
        and lowers the other's*. The aggregate is unaffected (the legs net to
        zero) but the per-portfolio number is not "capital you put in". Say so.
      - ~~`cashLedger.ts:306` `?.rate ?? 1`~~ — **done 2026-09-27**, not left for
        here: `bd28ba1`. Both cash-ledger conversions now go through one
        `rateToBase` helper that honours `opts.strict`. It was a third instance of
        the §66.4 pattern, found by grepping `?? 1` rather than `?? "USD"` — a
        guessed *rate* is as much a guess as a guessed currency, one layer down,
        and the original sweep would never have looked for it.
      - `totalGainLoss` / `returnPercentage` are then derived from the new
        `totalValue`; document that they move with it.
      - `portfolioBreakdown[]`: add per-portfolio `instrumentsValue` and
        `cashValue` so Σ breakdown == the headline, and the cards can render
        their own split without a second request.
- [x] `PortfolioSummaryMetrics` (per portfolio): same three — `instrumentsValue`,
      `cashValue`, and `currency` is already there from §66.3.
- [x] Tests: contracts `npm test` green; the spec is valid and `gen:types`
      regenerates in all three consumers.
- [x] Commit (contracts) → GHA bumps + publishes.

### 68.3 — wallets: compute the split from one place

- [x] Per portfolio, derive the two components explicitly rather than by
      subtraction where possible:
      - `instrumentsValue` = Σ open positions' market value, **each converted
        from its own `instrument_currency` into the portfolio base** (the same
        strict `fxTo` and the same conversion the §66.3 allocation route now
        does — do not re-introduce a raw cross-currency sum).
      - `cashValue` = the existing `portfolio_cash_transactions` replay total
        (already exposed as `PortfolioCash.total`).
      - `currentValue` must then be exactly `instrumentsValue + cashValue`, so
        the card and the headline cannot disagree by construction. Make the card's
        `currentValue` **derived** rather than a separately-written column, or
        assert the identity in a test — today they are two independent code
        paths and that is the bug.
- [x] `total-metrics`: sum the per-portfolio `instrumentsValue` and `cashValue`
      into the aggregate base (using the §67.1 preference, which the SPA now
      writes through), and derive `totalValue` as their sum. Keep the existing
      "preference unreadable → derive from the user's own portfolios → else report
      null" ladder from §66.4.
- [x] Negative-cash handling: XTB and IKE Beata hold negative balances (margin
      accounts, §62). A negative `cashValue` must reduce `totalValue`, not be
      clamped, and must not make the tile render as `—`.
- [x] Decide and record whether `total-metrics` keeps `totalCash` as a deprecated
      alias for one release, or breaks outright. Prefer breaking outright: it has
      no consumer outside the SPA.
- [x] Tests:
      - a portfolio with positions and cash: `currentValue == instrumentsValue +
        cashValue` to the cent, and `totalValue` on `/total-metrics` equals Σ
        per-portfolio `totalValue`;
      - cash-only portfolio (XTB): `instrumentsValue == 0`, `cashValue < 0`,
        `totalValue` negative and rendered, not clamped;
      - multi-currency portfolio: `instrumentsValue` equals the converted sum,
        and a missing FX rate throws rather than 1:1 (§66.4);
      - `totalInvested` is unchanged by an internal transfer between two of the
        user's portfolios.
- [x] Full wallets suite green + `npm run build`.
- [x] Commit (portfoliost-wallets).

### 68.4 — SPA: four tiles, each labelled with what it is

- [x] `InvestmentsView.vue` header: four tiles in this order — **Cash value**,
      **Instruments Value**, **Total Value**, **Total Invested**. All four
      formatted through `useDisplayConversion` so they are converted and labelled
      identically (the headline already does; the cards now do too since §66.3).
- [x] Derive **Total Gain / Loss** = `totalValue − totalInvested` and **Total
      Return** from the same pair, so the four tiles and the two derived figures
      can never disagree. The current tiles are computed independently.
- [x] **The chart's value line must include cash too** (confirmed by the user:
      "Total is always total: stocks+cash on this account. Also on chart").
      `/portfolios/merged` currently plots positions and cash as separate series,
      so its value line is a *different* number from the Total tile. Make the
      merged series' value line `instruments + cash` per day, and keep a separate
      cash series for the breakdown rather than summing it into the headline only.
      This is the step that stops the inconsistency moving rather than going away.
  - [x] While a rate is unresolved, render `—` (never a bare number with a foreign
      symbol — §66.2) and do not flash a converted value first.
- [x] Portfolio cards: show the cash/instruments split inside the existing Cash
      group rather than adding a fifth number to the top row.
- [x] Tests: a tile shows the right currency symbol; `Total Value` equals
      `Cash + Instruments` in the rendered output; a null rate renders `—`.
- [x] `npm run build`, `npm run test`, `npm run test:mock`, `npm run test:e2e`
      green (e2e snapshots of the header will need re-baselining — the tile count
      changes 4 → 4 but the labels and values do).
- [x] Commit (portfoliost).

### 68.5 — Release, PROD verify, close §63.3

- [x] Pin the real tags: contracts, wallets, portfoliost. The §67.1
      preference write-through (`1d1dd65`, committed and green but **not yet
      deployed**) ships with this, so the aggregate base flips USD → PLN in the
      same release as the split and the displayed numbers move once, for one
      reason. Do not deploy `1d1dd65` on its own — it shifts the headline by
      itself with nothing to explain it.
- [x] Playwright PROD `/en/investments`:
      - the four tiles read **Cash 345,228 · Instruments 1,035,259 · Total
        1,380,487 · Invested 1,040,416** (PLN) — `Cash + Instruments == Total`
        exactly;
      - Σ the 10 cards' `currentValue` equals the Total tile (this is the §63.3
        reconciliation, finally assertable);
      - the negative-cash portfolios render a negative Cash tile, not `—`;
      - the chart's value line ends at the same figure as the Total tile (cash
        included, per the decision above);
      - no tile shows a `$` (§66.2 guard still holds).
- [x] Then tick §63.3's reconciliation and its "Crypto reports 0 / −100%"
      findings, and archive §63 if nothing else in it is open.
- [x] Commit (plan closeout).

### Design decisions (resolved 2026-09-27)

- **Total includes cash, everywhere** — tiles *and* the chart value line. There is
  no longer a question of whether the headline includes cash; the only remaining
  freedom is how prominently the cash *component* is shown (its own tile and its
  own series), which is a display choice, not a definitional one.
- **Total Invested includes transfers** — verified that
  `externalCashInvested` already sums every cash row with no type filter, so no
  code change is needed; only the description and the per-portfolio caveat in
  §68.2.

---

## 69. The sudden raise in return: a backdated deposit, a duplicate cash row, and a backfill that only looks 2 days back (2026-09-28)

Found by the §68.5 PROD verification, not by a test. Three separate defects, one
visible symptom.

### 69.1 — the symptom, and the proof

Three portfolios showed a step on **2026-09-27** with `net_flow = 0.00`:

| portfolio | 09-26 value | 09-27 value | Δ | Δ invested |
|---|---|---|---|---|
| IKE Marek | 90,962.72 | 107,059.39 | +16,096.67 (+17.7%) | **+15,777.00** |
| IKE Beata | 196,827.12 | 205,628.21 | +8,801.09 (+4.5%) | **+15,777.00** |
| Equate+ | 3,946.55 | 8,632.99 | +4,686.44 (+118.7%) | 0 |

The identical `+15,777.00` in two unrelated accounts is the whole diagnosis: one
omitted deposit, in both. `/api/portfolios/:id/cash/transactions` closes it exactly —

- IKE Beata `DEPOSIT 15,777 PLN` dated **2021-10-25**
- IKE Marek `DEPOSIT 15,777 PLN` dated **2021-10-18**

| | Σ deposits | 09-26 invested | 09-27 invested |
|---|---|---|---|
| IKE Beata | **132,099** | 116,322 = 132,099 − 15,777 | **132,099** |
| IKE Marek | **54,548** | 38,771 = 54,548 − 15,777 | **54,548** |

The 2026-09-27 21:14 re-import inserted it (all 100 cash rows in the system carry
that timestamp, and every one is backdated). `externalCashInvested` replays the
whole ledger, so cumulative invested rose — but the `snapshotsync` cronjob only
re-values **the last two days**, so the entire five-year correction was stamped
onto the next snapshot written. The data is now *more* correct; the presentation
is what is broken.

Equate+ is the same mechanism: its value rose because SAP SE went from ~0 to
4,684 PLN of instruments value once the ticker fix landed. `invested` unmoved.

**The data was right; the history was never recomputed behind it.**

- [x] Diagnose (§69.1).
- [x] **§69.2 importer dedup** — see below.
- [ ] Re-import (wipe & reimport) with the dedup, then ONE full backfill of all
      10 portfolios so the 15,777 and the SAP SE value land on their proper
      dates. **User-approved**, deliberately deferred until after §69.2 so the
      backfill runs once over final data rather than twice.

### 69.2 — the sheet records one incoming payment twice, and the importer imported both

The user confirmed the model: *theoretically* the SAP position is sold in Equate+
and cash moves to IBKR, but *in practice* the stock is transferred to IBKR and sold
there. There is no stock-transfer primitive, so the sale's cash side is already
**simulated** as a same-currency TRANSFER Equate+ → IBKR (`SALE_PROCEEDS_TO`).
The IBKR account *also* carries a real `Wpłata` "Gotówka IB" row for the arrival —
the broker's own record of the same money landing:

```
2026-09-02  Equate+  TRANSFER  -1462.09 EUR   ← the simulation
            IBKR     TRANSFER  +1462.09 EUR   ← its credit leg
            IBKR     DEPOSIT   +1463.35 EUR   ← the broker's arrival: DUPLICATE
```

Importing both credits IBKR's cash twice. Only one move should be registered.
The transfer pair is the one to keep — it already nets Equate+ to ~0 by offsetting
its derived SELL, and it exists precisely because stock transfers cannot be
modelled. The `~1.25 EUR` gap on every event is the commission, so the guard is
"deposit covers the transfer", never equality.

Fixed in `portfoliost-sheets-sync` `mapRow` + a new `transferFundingByKey`
pre-pass. The duplicate is only visible **across rows** (the arrival is a `Wpłata`
on IBKR; the transfer it duplicates comes from a `Sprzedaż` on a different konto),
which is exactly why a per-row mapper could not see it and why the pre-pass is
computed once over the whole sheet in `sync.ts`.

Suppression is guarded on konto, asset name, date, currency **and** amount, so a
genuine standalone deposit, a same-day deposit in another currency, a non-cash
asset, a withdrawal, and a deposit too small to cover the day's transfers are all
kept. 10 tests; 149 green.

- [x] Importer dedup + tests (`portfoliost-sheets-sync`).
- [x] Release sheets-sync; the job image pin lives in the admin helmrelease.
- [x] Wipe & reimport (user-triggered from Admin → Jobs), then full backfill.
- [x] Verify: IBKR's cash no longer gains the duplicate; IKE's `invested` steps
      back to 132,099 / 54,548 on their proper 2021 dates; no cliff on 2026-09-27.

### 69.3 — the systemic gap (still open)

**An import that adds backdated rows must trigger a full re-backfill for the
portfolios it touched.** Today the only automatic revaluation is the twice-daily
`snapshotsync`, which re-values the last two days, so *any* historical correction
lands as a visible cliff on the next snapshot written. This will recur on every
future re-import. Options: have the import job call `forcePortfolioRecalc` /
`runBackfill` for the portfolios whose rows changed, or record the earliest
changed `transaction_date` and re-backfill from there.

- [ ] Decide and implement.

---

## 70. "Total value" is wrong: cost is being reported as market value (2026-09-28)

Found while closing §69, and it outranks everything still open. Reported by the
user from the dashboard; the cause is measured, not inferred.

### 70.1 — the symptom

The ten cards sum to **PLN 1,057,924**; the headline says **PLN 797,190**. The
aggregate is the smaller of the two, which is the opposite of a rounding or FX
artefact.

### 70.2 — the cause

**75 of 85 open positions have `positions.market_value` NULL** (PROD, measured):

| portfolio | null / open | stored `market_value` | Σ cost | card | live |
|---|---|---|---|---|---|
| IBKR | 35/35 | — | 55,665.33 | 283,973.35 | 235,433.41 |
| Rach. rejestrowy PKO BP | 23/23 | — | 36,500.00 | 56,451.80 | 45,000.00 |
| IKE Marek | 13/13 | — | 25,814.13 | 91,072.72 | 65,867.46 |
| Obligacje PKO SA Beata | 2/2 | — | 115,000.00 | 119,240 | **115,000** |
| NN TFI PPK | 1/1 | — | 76,337.99 | 123,722.33 | **76,337.99** |
| Equate+ | 1/1 | — | 913.01 | 3,946.55 | 3,991.49 |
| NN TFI PPO | 0/1 | 173,445.64 | 96,440.71 | 173,445.64 | 96,440.71 |
| IKE Beata | 0/23 | 154,825.70 | 115,037.32 | 205,208.09 | 154,308.64 |

`services/valuation.ts` `splitPortfolioValue`:

```ts
const mv = p.marketValue != null ? Number(p.marketValue) : Number(p.quantity ?? 0) * Number(p.averageCostBasis ?? 0)
```

The fallback is the position's COST, and it is then reported as market value.
Obligacje's live instruments equal its cost to the złoty (115,000) and NN TFI
PPK's equal theirs exactly (76,337.99) — PLN funds with no reason to sit on cost.
For a fund that has grown from ~456 to ~820 per unit, reporting 96k instead of
173k understates net worth by 77k on that holding alone, and every derived
figure (return, gain/loss, the §68 headline, the card) inherits it.

### 70.3 — and the mirror-image defect in the snapshot path

Equate+ is the opposite: its card holds 3,946.55 = **cash only, zero instruments**,
while the live path sees 3,991.49 of SAP SE. The backfill resolved no price at
all there. So the card can omit a holding the headline counts, and neither
number is trustworthy alone. This asymmetry is why §63.3's reconciliation has
never closed.

### 70.4 — what is proven, and what is not

Proven: the fallback exists in code, and it is being taken (two portfolios equal
their cost exactly). NOT yet proven: **why** `market_value` is NULL for 75
positions. `refreshQuotes` is the only writer of that column and apparently does
not reach these symbols; unverified. Fixing the aggregate first would treat the
symptom, so the upstream question is the first task.

- [x] Find why `positions.market_value` is NULL for 75/85 — which writer should
      populate it, and why it is not reaching IBKR / Rach / IKE Marek / Obligacje
      / NN TFI PPK / Equate+.
- [x] Make both paths resolve market value identically, from prices. One
      function, one answer (the §68 lesson: drift is what happens when two code
      paths answer the same question).
- [x] **Never present cost as value.** With no price, render unresolved per
      §66.2 rather than silently substituting cost. A missing price must be
      visible, not plausible. → unpriced positions contribute NOTHING and are
      counted; the routes log them and the SPA states them.
- [x] Decide the contract: does `instrumentsValue` require a resolved price, and
      is a partially-priced portfolio reported at all or flagged? → **Flagged, not
      hidden.** A partial portfolio is reported with `unpricedPositions` and a
      visible note, rather than suppressed or silently completed. Suppressing it
      would make a broken pipeline look like an empty portfolio.
- [x] Tests: a position with NULL `market_value` and no resolvable price must NOT
      contribute its cost basis; both paths agree to the cent on a mixed
      price/no-price portfolio.
- [x] Then re-run the single backfill and assert Σ cards == Total tile — the §63.3
      reconciliation, still unproven after all of §66–§69.
- [ ] Separately: the §68 `cashBreakdown` weight formula divides by a net total
      that can approach zero (EUR +64,898 against USD −45,434 in IBKR), producing
      weights from −398% to +648%. The user confirms the sign split is real — IBKR
      converts currency repeatedly without registering it in the sheet — so the fix
      is a guard on the denominator, not a change to the data.

### 70.5 — RESOLVED 2026-09-28 (production verified)

Measured after the release, all ten portfolios, PLN:

| | before | after |
|---|---|---|
| Total | 797,190 (and before that 1,380,487) | **1,079,019.29** |
| Unpriced positions | invisible | **0**, and surfaced whenever non-zero |
| Provenance | none | `priceAsOf` = oldest contributing price, `priceSource: "quote"` |
| Σ cards vs headline | off by ~261k | **0.01** (see below) |

**§63.3's reconciliation is proven for the first time.** Every per-portfolio card
matches its live total to the cent (drift 0.00 on all ten):

    Obligacje 119,250.00 · Crypto 887.74 · XTB −23.85 · Rach. 56,456.40
    NN TFI PPO 173,445.64 · NN TFI PPK 123,722.33 · IKE Beata 205,468.41
    IKE Marek 107,206.28 · Equate+ 8,632.99 · IBKR 283,973.35

The residual 0.01 is structural, not a bug: the cards read the denormalized
`current_value`, synced from the newest `value_snapshots` row (§53.5), while the
headline recomputes live from positions and the cash ledger. Two computations, two
roundings. Making them bit-identical would mean one of them stops being a
snapshot, which is worse than a cent.

- [x] Find why `market_value` was NULL for 75/85 — the BUY insert never sets it,
      `refreshQuotes` is the only writer, and **no scheduled job called it**;
      `snapshots-sync` only ran `runBackfillRecent`.
- [x] Both paths resolve value identically (`splitPortfolioValue`), and the
      unpriced are excluded and counted rather than valued at cost.
- [x] `snapshots-sync` prices before snapshotting, reusing the existing writer
      rather than adding a second one.
- [x] Contract + SPA surface `unpricedPositions` / `priceAsOf` / `priceSource`.
- [x] Tests assert the ABSENCE of a value, so no future fallback can hide behind
      a plausible number.
- [x] Verified in PROD: unpriced 0, all ten cards reconcile, freshness note absent
      because there is nothing to warn about.

Two defects found while doing this, both worth remembering:

- The **contract lint could not see the class of problem it existed for**.
  `yaml.safe_load` accepts duplicate mapping keys and keeps the last silently, so
  a block inserted twice with an uncounted replace passed lint, was published as
  v1.6.47 AND v1.6.48, and only failed in a consumer as an opaque
  `YamlParseError`. The lint is now a real guard (fails on duplicates; verified
  exit 1 with one reintroduced).
- The SPA's per-card freshness map was built from a **setup-time snapshot of a
  Pinia ref** (`usePortfolioStore().totalMetrics` outside the computed), so it was
  silently empty — the aggregate worked, the cards never warned. A warning that
  fails by absence is the worst failure mode; there is now a test that fails if
  that pattern returns.

Still open, flagged not fixed: `notifyTransactionsChanged` triggers a FULL
multi-year rebuild for a single buy (§63.2 territory), and the `gotowka` recon
warns on large deltas while never reading the DB — per the user, IBKR's mixed
currency signs are real (unregistered conversions in the sheet), so the
`cashBreakdown` weight formula needs a denominator guard, not different data.


---

## 71. A currency is a label that multiplies a number (2026-09-28)

Shipped. Recorded here because §71 is stamped in the code of three repos
(`portfoliost-instruments`, `portfoliost-wallets`, `portfoliost-sheets-sync`)
and the numbering must not be reused. Ready to archive to `plan-archive.md`.

Started as a follow-on from §70: the user asked to carry old prices forward,
recalculate when a close arrives, and *flag serious problems* rather than invent
a value. The investigation of "why is the chart wrong" turned up four defects
that all produced plausible numbers instead of errors.

### 71.1 — the symptom, and the proof it was not cash

IKE Marek's live total read **107,206.28** against a stored **91,072.72**. Cash
was ruled out first and by measurement, not assumption: `cashBalances` (live) and
`cashBalanceSeries` (backfill) agree **to the cent** (`DELTA = -0.00`), and cash
is 918.01 PLN (day FX) vs 827.51 (latest FX) — a ~90 PLN timing difference. The
entire gap is in the instruments leg, and 16,190 of the 16,260 is one row.

| symbol | bar close | backfill | market value | ccy | live | delta |
|---|---|---|---|---|---|---|
| **CRI.WA** | 727.00 | 9,451.00 | 9,451.00 | **CAD** | **25,641.66** | **+16,190.66** |
| CSN.L | 17.91 | 15,420.45 | 3,035.03 | GBP | 15,471.43 | +50.98 |
| … 11 more | | | | | | all within ±12 |

`CRI.WA` is Creotech Instruments on the Warsaw exchange. Its position carried
`instrument_currency = 'CAD'` while **both of its BUY transactions said `PLN`** —
the import was right, and something later overwrote it.

- [x] Prove cash is not the cause (both replays agree to the cent).
- [x] Bisect the instruments leg per symbol; isolate the single responsible row.
- [x] The stored bars are correct PLN (188.00 / 367.50 against trades of 194.00 /
      369.00), so no data has to be invented to fix it.

### 71.2 — instruments: two guesses, both removed

`resolveInstrumentCurrency("CRI.WA")` returned **CAD**, measured in the live pod:

    CRI.WA  suffix=WA exchangeResolved=WSE assetType=Stock
      searchTickerReference returned 9 rows:
        [0] CRI/TSXV/CA   [1] CRI/NYSE/US   [2] CRI/ASX/AU
      resolveInstrumentCurrency(CRI.WA) = CAD

Two defects compounded:

1. The venue-qualified lookup (`ticker='CRI' AND exchange='WSE'`) **missed** —
   `ticker_reference` has 1499 WSE rows but no `CRI` — and the search fell
   through to an **unfiltered** `ticker ILIKE 'CRI%'`, whose first exact match
   was the Canadian listing. The venue that named the venue was dropped from its
   own lookup.
2. The candidates-must-agree guard ran **only when the exchange was UNKNOWN**. A
   resolved venue therefore trusted a single arbitrary row — exactly inverted:
   knowing the venue is when the answer is most constrained.

What remains is a parse (crypto pair), a market-structure rule (bonds/funds →
PLN), an unambiguous listing read, or **the venue's own country** (WSE → PL → PLN)
when a known venue's listing is missing. A suffix naming an unknown exchange, and
a symbol with no exact listing, are now `null` — which the SPA already renders as
`unknown`, so refusing is visible rather than silent.

- [x] `getExchangeCountry()` added; both guess branches removed.
- [x] A listing that records its own venue in the ticker (`SNT.WA` on WSE) is
      accepted when exchange data is incomplete — that row states its venue rather
      than implying it. (Found by the full suite: a fixture stores the ticker
      venue-qualified while production stores it bare.)
- [x] Tests: the exact call that returned CAD; `CRI` still ambiguous → `null`; a
      suffix naming an unknown exchange → `null`; no exact listing → `null`.
- [x] Verified live: `CRI.WA → PLN`, `ETFSP500.WA → PLN`, `SRT.F → EUR`,
      `ASML → EUR`, bare `CRI → null`.
- [x] `instruments` v1.0.76 (`a1d69a6`).

### 71.3 — wallets: an estimate must not overwrite a known value

`refreshQuotes` persisted `profile.instrumentCurrency` **unconditionally**.
`currencySource` was on the wire and discarded by `fetchProfile`, so an inference
was indistinguishable from a declaration.

- [x] Carry `currencySource` through; provider-confirmed values may overwrite
      (`market_value` is in the **quote's** currency, so a confirmed
      disagreement has to win), estimated/unknown may only fill an empty
      position. A protected disagreement warns with portfolio, symbol, both codes.
- [x] `instrument_currency` is `char(3)`, so "unset" is whitespace — a `=== ""`
      check is dead code. Trim.
- [x] Tests: the PROD shape (estimated CAD must not beat a stored PLN, while the
      price still refreshes) and the empty-position case. The pre-existing §39
      test now tags its mock `currencySource: "provider"`, which instruments has
      always sent.
- [x] `wallets` v1.1.80 (`b9eed8d`), v1.1.81 (`12140c6`).

### 71.4 — the two sites that were flagged and NOT changed

Both were measured before being touched, and both would have introduced a bug.

**`getPriceBarSeries` resolves `baseCcy = resolvedBase ?? declared`** — the local
resolver overrides the caller. Across PROD's 98 open symbols they disagree on
exactly two, and in **both the resolver is right and the caller is corrupt**
(`CRI.WA` CAD→PLN, `SRT.F` GBP→EUR). The veto is currently what keeps the stored
bar series out of CAD and GBP. Inverting it would silently reintroduce the
corruption, and nothing would fail. Recorded at the call site so the obvious
"fix" is not attempted (`f01e639`, **not yet pinned to a release**).

**`quotes.ts` sent the service token in `Authorization`** while instruments'
`serviceOrUserMiddleware` reads `X-Service-Token`:

    SRT.F    Authorization:401   X-Service-Token:200   price=208 ccy=EUR

`refreshQuotes` never throws and treats an instruments error as "keep stored
values, mark `fallback`", so `snapshots-sync` printed "priced" for every portfolio
twice a day while writing **no prices at all** — 12 of IKE Marek's 13 positions
sat on stale values. User-driven refreshes were unaffected (a user JWT is a
Bearer token, and Bearer is what `Authorization` expects), which is exactly why
no test failed and it took a PROD audit to surface.

- [x] Both fetchers use `instrumentsAuthHeaders`, which already existed and
      already picks the right header for either credential.
- [x] Tests pin the routing in both directions.
- [x] `wallets` v1.1.82 (`72fe969`).

### 71.5 — `valuation-audit`: report, never rewrite

`src/scripts/valuation-audit.ts` checks (1) a position's currency against the
currency on its **own transactions**, and (2) live value against the stored
snapshot for the same day. Read-only, run from the pod.

The currency check is the one that found `CRI.WA`: the contradiction sat in two
columns of the same table and nothing read both.

- [x] First PROD run returned 11 findings, **8 of them noise** — `AVGO: USD vs
      PLN/USD`, `0M6S.IL: EUR vs EUR/PLN`. These are PLN accounts buying foreign
      listings and paying in PLN, which is normal. The rule had been widened from
      "cites a currency none of its trades used" to "some trade differs", on the
      strength of a test written to justify it. Reverted; the reason is recorded
      in the code.
- [x] Cut an FX-pair heuristic for naming the offending currency: a portfolio
      total is a sum, so one bad position in thirteen moves it by a *fraction* of a
      rate (0.847 against CAD→PLN's 2.7131). It would have looked authoritative
      while being wrong.
- [x] Exit 2 when the audit cannot run — an audit that could not check must never
      be mistaken for one that found nothing.
- [x] Findings: 11 → 4 → **2**.

### 71.6 — the data patch, and what is still open

- [x] `CRI.WA` CAD → **PLN**, `SRT.F` GBP → **EUR** (one transaction, 2 rows;
      `MFC` deliberately untouched — CAD is correct, its trades are USD only
      because the US variant was bought).
- [x] `recalcPortfolioHistory` on IKE Marek. It rebuilds through *yesterday* and
      deletes first, so it dropped the corrupt `09-28` row rather than rewriting
      it with fallback prices. Series ends `91,072.72`, invested flat `54,548`,
      and IKE Marek's reconciliation finding closed.
- [x] `SRT.F` vs `SRT3.DE`: **two share classes ~25% apart**, not two lines of
      one stock. The stored trades split 2–1, and FIFO leaves the surviving lot
      as the one `SRT3.DE` reproduces within 0.8% while `SRT.F` misses by 16.4%.
      Bare `SRT` in the reference is **SRT Marine Systems plc** (LSE), an
      unrelated company. Override added to `NAME_VENUE_OVERRIDES`; `sheets-sync`
      v1.0.28 (`7c0290d`).
- [x] **`Equate+` +118.7%** (stored 3,947.57 vs live 8,635.30). Not a currency
      > **§72.14 — root-caused: option premium legs entering the historical quantity
      > grid via their `EXPIRATION` sibling. Fixed and verified in prod in §72.7.**
      finding. It is a margin account, which is a plausible innocent explanation,
      but that is a hypothesis and has not been tested.
- [ ] `MFC` is a **known false positive** in `valuation-audit`: a dual-listed
      ticker bought on the other line. The rule cannot distinguish it from
      corruption, and leaving it as a permanent red line trains people to skim
      past real findings.
- [ ] Pin `instruments` to the `f01e639` comment commit's release (a code comment
      that records a trap should not sit unpinned).

---

## 72. `price-audit`: reconcile every trade against its own bar, as an admin job (2026-09-28)

Follow-on from §71: the audit is currently a script someone has to remember to
run in a pod. The `SRT3.DE` finding came from checking stored trades against
price bars **by hand**; across 13 symbols and 200+ trades that is not repeatable.
This makes it a permanent, run-on-demand job, and it is the check that tells us
when a venue override or a currency is still wrong.

Design (confirmed with the user before writing):

- Runs in the **wallets** image, beside `valuation-audit` — wallets already owns
  the `portfolios` schema, the FX resolver and the audit pattern. A `WALLETS_IMAGE`
  pin goes in the admin HelmRelease so the two images cannot drift.
- Authenticates to instruments with the **caller's JWT**, exactly like the
  wipe-&-reimport job (`sheets-sync`): admin already has it, the history endpoint
  already accepts a user JWT, and no new Kubernetes Secret is needed.
- **Exits 0 with findings in the log.** A successful audit that found problems is
  a success with a report; a red failed Job per finding trains people to ignore
  the badge. The script keeps exit 1 for CLI/CI and takes a flag for the job path.
- The Job runs the same jobshot path as wipe-&-reimport, so the admin UI, the
  duplicate-run 409, the `upsertJobRun` record and the status poller all work
  unchanged.

**The comparison must not be routed through a currency converter.** That would
validate the converter against itself — exactly how `CRI.WA` passed. A trade and
a bar are compared as **raw numbers**, and a wrong currency appears *as* the
deviation, typically by a factor equal to that pair's rate. `/history` is called
without `?currency=`, which returns native closes (`fxFrom: null` confirms no
conversion).

### 72.1 — wallets: make `price-audit` permanent and job-safe

- [x] `src/scripts/price-audit.ts` — accept the instruments credential as
      `INSTRUMENTS_SERVICE_TOKEN` **or** a user JWT, and send it through
      `instrumentsAuthHeaders` (which already routes Bearer vs service token).
      A job run must not need a service token the cluster has to mount.
- [x] `--exit-zero` so a findings report is a successful Job.
- [x] Report, per symbol: trades checked, unreconciled, worst deviation,
      instruments' `baseCurrency` vs the position's `instrument_currency`, and
      symbols with **no bars** listed separately as unverifiable rather than
      silently omitted. A trade on a weekend borrows the prior close and prints
      the gap, so a 7-day-old bar is visible instead of looking like a bad price.
- [x] Tests over the pure rules: same-day bar picked; weekend carry-forward
      bounded by `MAX_CARRY_DAYS` and no bar beyond it; `deviationPct`; `fxHint`
      naming a pair only when the ratio matches one; `summarise` ranking.
- [x] Tests: the PROD `SRT3.DE` shape (a trade 16% off `SRT.F`, 0.8% off
      `SRT3.DE`) and the `CRI.WA` shape (a trade off by ≈ CAD→PLN).
- Tests: `npm run build` (tsc) + full `npm run test` green.
- Commit.

### 72.2 — admin: the job route, mirroring wipe-&-reimport

- [x] `src/price-audit.ts` — `PRICE_AUDIT_JOB_NAME`, `walletsImage()` reading
      `WALLETS_IMAGE`, `buildPriceAuditSpec(callerToken)`, and
      `registerPriceAuditRoutes(admin)` with `POST /jobs/price-audit/run` and
      `GET /jobs/price-audit/status`, following `sheets-sync.ts` exactly:
      duplicate-run 409, `upsertJobRun` with `kind: "price_audit"`, DB row first
      on status.
- [x] Register the routes in `src/index.ts` next to `registerSheetsSyncRoutes`.
- [x] `DATABASE_URL` comes from the pguser Secret, whose key is `uri` — jobshot
      wires the whole Secret through `envFrom`, so the entrypoint is
      `["sh","-c"]` with `export DATABASE_URL="$uri"; exec node
      dist/scripts/price-audit.js --exit-zero` (the pgloader Job already uses
      this shape). Without the wrapper the Job has no connection string.
- [x] Tests: the spec carries the wallets image, the caller's token, the pguser
      secret and the `sh -c` wrapper; a second concurrent run is refused 409.
- Tests: `npm run build` + full `npm run test` green.
- Commit.

### 72.3 — homelab: pin and deploy

- [x] `WALLETS_IMAGE: ghcr.io/marx2/portfoliost-wallets:<tag>` in the admin
      HelmRelease, matching the wallets pin in its own release, with a comment
      saying the two must move together.
- [x] Release both modules (GHA tags; verify the tag resolves to the intended
      commit before pinning), push, confirm one replica each on the new tag.
- [x] Confirm from inside the Job's image that the entrypoint exists and the
      script is present, before calling the job wired.
- [x] **The Jobs panel is a hardcoded card list — the backend route alone is not
      a usable job.** `JobsView.vue` gained a "Data quality" section with a Price
      audit card, a tolerance input and a Run button. The badge starts ABSENT,
      not green: a status that reads Succeeded before it has ever run is how a
      badge stops being believed. The panel shows percent and the API takes a
      fraction, so the conversion is asserted by a test (15 → 0.15); sending 10
      for 0.1 would flag every trade in the book.
- [x] SPA `v1.0.260`.
- Commit.

### 72.4 — run it after the wipe-&-reimport, and triage what it finds

- [ ] Run the job for real against PROD and record the findings in this section.
- [ ] Every flagged symbol gets one of: a `NAME_VENUE_OVERRIDES` entry (validated
      against its stored trades, as `SRT3.DE` was), a currency fix, or a recorded
      false positive with the reason — never a silent threshold bump.
- [ ] Decide whether the `MFC` false positive from §71.6 is fixed by narrowing
      the rule or by recording the exception.
- [ ] Re-run and assert the flagged count only goes down.
- Commit.

### 72.5 — close out §71.6

- [x] Resolve or record the **`Equate+` +118.7%** reconciliation gap.
      > **§72.14 / §72.7 — root-caused and fixed in prod; history is a curve again.**
- [ ] Archive §71 and §72 to `plan-archive.md`.

---

## 73. openst leaks memory until it is OOMKilled (found 2026-09-28)

Found while deploying §72: both openst replicas were killed mid-investigation and
the ceiling turned out to be the visible symptom of an unbounded one. Deliberately
**deferred** until after the reimport and the price audit, because the reimport is
the burst that will otherwise kill it again.

### 73.1 — what is proven

Both replicas `exitCode: 137`, `reason: OOMKilled`, at 2026-09-28 16:02 UTC, against
a 700Mi limit with a 128Mi request. Prometheus
(`container_memory_working_set_bytes`, 24h) shows this is a **leak, not a high
baseline** — working set climbs monotonically and never returns to the floor:

    openst-…d67lw  543 → 570 → 583 → 602 → 649 → 679 → 692 Mi   (18h, 38 points)
    openst-…dxb2p  613 → 658 → 662 → 666 → 686 → 691 → 698 Mi   (hit the ceiling)
    after restart   423 → 425 → 442 → 684 → 693 Mi             (+240Mi in one step)

A fresh container floors at ~320–423Mi and climbs to the ceiling in roughly 4h under
load (~65 Mi/h). Both replicas died doing the same thing: a per-symbol sweep of
`/equity/logo/…` interleaved with `/fixedincome/search/…`, walking alphabetically
(`CREC.PS`, `CREO.L`, `CRES.BA`, `CREX`, `CRET.ST`), 300–1100ms per call.

**Not a cache.** `src/cache.py` is Redis-backed (`REDIS_DB 2`); there is no
`lru_cache`/`TTLCache` in `src/`. The memory is retained by something in the
request path, and the +240Mi step during a logo sweep says the logo/search path
rather than price bars.

### 73.2 — what is NOT proven, and must not be assumed

- **Which structure retains it.** The step is measured; the cause is not. It could
  be a per-call object graph held by a module-level registry, a provider session
  accumulating cookies/responses, OpenBB's own per-symbol cache, or a
  `ThreadingPoolExecutor` from `src/main.py` holding futures.
- **That the logo path is the cause.** It is what was *running* when both pods died,
  which is correlation. A concurrent price-bar burst would look identical in the
  logs.
- **That 2Gi is enough.** It buys ~3× the time and changes nothing about the shape
  of the curve.

Deliberately **not** done, and why — all three look like fixes and are not:

- **More replicas.** Every process leaks at the same rate. Three replicas raise the
  idle floor to ~1.26Gi and only slow the climb by spreading load.
- **An HPA on memory.** It would add replicas *because* memory is high and never
  converge — the wrong response to a per-process leak, and it would eventually
  exhaust the nodes.
- **Raising the limit further.** It converts a loud OOMKill into a slow node-level
  problem.

### 73.3 — the delay already applied

`limits.memory 700Mi → 2Gi` and `requests.memory 128Mi → 512Mi`, committed to the
homelab repo with the Prometheus evidence in the comment so nobody "reverts" it as
an unexplained bump. The request matters as much as the limit: at 128Mi the
scheduler packs openst beside other work, so it is the first thing killed.

- [x] Measure and record the curve; bump the limit; document why it is a delay.
- [x] Verify the new pods start at ~320–358Mi against the 2Gi ceiling.

### 73.4 — find what retains it

- [ ] Reproduce deterministically: drive N sequential requests against ONE
      `/equity/logo/<sym>` and M against `/equity/ohlcv/<sym>`, sampling
      `working_set_bytes` between batches, so the two paths are separable instead
      of inferred from whatever happened to be running. The measurement decides
      whether the logo path is the cause or merely the last thing logged.
- [ ] For the leaking path, bisect inside it: one call vs many, and with the
      provider call stubbed. Stub-out is the decisive test — if memory flattens
      with the provider stubbed, the retention is ours (registry, pool, session);
      if not, it is in OpenBB or yfinance and belongs upstream.
- [ ] Check the obvious holders in `src/main.py` and `src/openbb_client.py`:
      module-level dicts/lists, a `ThreadingPoolExecutor` retaining futures, and
      any `requests.Session` reused across calls.
- Tests: a regression test that asserts working set does not grow without bound
      across repeated calls — otherwise this returns and nobody notices for months.
- Commit.

### 73.5 — fix, and prove the curve flattens

- [ ] Fix the retaining structure, or pin/upgrade the upstream dependency if the
      retention is OpenBB's. Do not paper over it with a bigger limit.
- [ ] Re-run 73.4's measurement and show working set flat across the same workload
      that produced +240Mi/30min. A screenshot of the curve is the deliverable.
- [ ] Then reconsider the limit downward once the curve is flat — 2Gi is headroom
      for bursts, not a target to keep.
- [ ] Add an alert on `container_memory_working_set_bytes` growth rate, so the next
      leak is caught by a trend rather than by an OOMKill.
- Commit.

### 72.6 — openst: a provider for a SPECIFIC ING Akcji share class (§72.9 follow-on)

Found by the §72.4 price audit, which flagged **29 of 79** `INGAKC.TFI` trades at a
near-constant **1.126× above the bar** (1.1256 in 2023-04, 1.1269 in 2026-08).

What is established, and what is not:

- The symbol is **right**. Goldman Sachs Akcji was renamed **ING Akcji**; the sheet
  was never updated, which is why the position still reads "Goldman Sachs Akcji"
  while the provider reports "ING Akcji (ING Parasol FIO)" at `ING01` on analizy.pl.
  A stale *name* is cosmetic — names are not in the valuation math.
- The bars are **consistent with the live quote** (795.02 on 2026-08-19 against a
  820.03 current price), so the bar series is the NAV the provider serves.
- The provider serves **only** `INGAKC.TFI`. `INGAKA`/`INGAKB`/`INGAKD` do not
  respond, so there is no alternative class to compare against. The fund has share
  categories (analizy.pl lists `ING01`, unit category A) and the symbol encodes `C`.
- The ratio is **constant over 3.4 years**. That is the diagnostic fact: it is not a
  fee (those do not scale with NAV), not compounding dividends (the ratio would
  grow), and not market noise. A fixed multiplicative offset between two series of
  the same fund is the signature of **two different classes of it**.

**Open question, deliberately not guessed:** whether the trades are in the class the
symbol names. The decisive check is ING01's published NAV for 2023-04-07 — if it is
~382 PLN the bar is the wrong series; if ~339 then we paid 12.6% above NAV on all
79 trades, which would point at the purchase prices in the sheet instead.

- [ ] Resolve the open question with ING01's published NAV for 2023-04-07 (and one
      later date) before building anything.
- [ ] If the class is wrong: add an openbb provider in `openst` for that specific
      > **§72.38 — the N/A was a conflation of name lineage with price series. The broker confirms 382,05 was paid, which is exactly the condition under which §72.6 says the bar is the wrong series. GATE: run the ING01 check for 2026-08-19 and 2023-04-13 before building anything.**
      ING Akcji class, following the provider-tier order in the planner contract —
      capture the provider's response into `tests/fixtures/` first, then the plugin
      with mocked I/O, then openst standalone smoke, then `cachest` route, then the
      `portfoliost-instruments` adapter, then the full compose stack.
- [ ] Sweep the other TFI rows for the same defect. `ticker_reference` knows **zero**
      `.TFI` symbols, so nothing cross-checks them, and the same family is named
      "NN Emerytura 2025/2030" but "Goldman Sachs Emerytura 2060/2065" in the same
      sheet — a rename that was applied inconsistently across rows.
- [ ] Separately: `positions.company_name` inherited the stale sheet name, so the UI
      shows a fund's former brand. Cosmetic, but it is what made this look like a
      wrong-fund problem rather than a class problem.

### 72.7 — §72.14 verified in PROD: the Equate+ spike is resolved

Deployed `portfoliost-wallets v1.1.91`, then recomputed all ten portfolios from
the UI. The seam is gone:

| date | value (PLN) | before §72.14 |
|---|---|---|
| 2026-09-23 | 8,655.91 | cash-only |
| 2026-09-24 | 8,609.67 | cash-only |
| 2026-09-25 | 8,632.99 | cash-only |
| 2026-09-26 | 8,632.99 | cash-only |
| 2026-09-27 | 8,632.99 | 3,946.55 |
| 2026-09-28 | **8,587.39** | **8,587.39** (the +118% spike) |

A real curve now, and the last day joins it at −0.5% instead of +118%. That
−0.5% is the residual day-FX vs latest-FX difference between the two snapshot
writers (§72.12 serialised them; it did not make them agree). Equate+ holds
2,700 snapshots, peaking at 66,135.80.

Grand total across all portfolios: 868,765,449.05 PLN over 18,497 snapshots.

- [x] Deploy §72.14 and recompute all ten portfolios
- [x] Confirm the spike is gone and history is a curve
- [ ] §72.15 (below): reconcile the residual −0.5% last-day FX seam

### 72.8 — §72.15: Crypto is valued in the wrong currency, and two sells are mislabelled

Found while checking what the recompute left behind. Not a §72.14 regression —
independent, and the portfolio is small (2 positions), so it has been easy to miss.

`Crypto` history jumps +410% / +391% / +379% on consecutive 2022 days, and the
UI shows `Instruments PLN -0.58` against `Cash PLN 888.32`. Two defects:

1. **`BTC-USD` carries `instrument_currency = PLN`.** It trades in USD. The 2022
   buy was *paid* in PLN (0.004 @ 172,660 PLN = 690.64), and the import took the
   payment currency as the instrument currency. The snapshot grid then requests
   bars with `targetCcy = null` ("already in base") and takes the USD close as if
   it were PLN: `0.004 × ~43,000 = 172` where it should be `0.004 × 43,000 × 4.0
   ≈ 688`. That is the ~4x error, and it is the same payment-vs-listing
   distinction as CSN.L (§72.10) — this time the listing currency was lost on
   import instead of the payment currency.

   `ETH-USD` is correct (`USD`), which is why the two legs disagree.

2. **The two 2024-10-14 sells are labelled `EUR` but are USD amounts** — ETH at
   2,209.20 and BTC at 56,366.00 are USD prices for those dates. `rate_source` is
   `automatic`, so the cash ledger converted EUR→base for cash that was never
   EUR.

Both are data corrections in the sheet plus an import rule, not a code bug in the
grid. Neither is a quick fix: the import rule "instrument currency comes from the
payment currency" is load-bearing for rows where the sheet genuinely only knows
one currency, so it needs a decision about when to defer to the provider.

- [x] Decide the rule: when the instrument's listing currency is known from the
      > **listingCurrency preferred, falls back to payment currency, invalid ISO rejected (wallets c7993a5, contracts v1.6.51)**
      provider, it must win over the payment currency (never the reverse). Record
      it in `instrument-resolver` as the currency source, and have the import
      read it rather than infer.
- [x] Data fix: `BTC-USD` → `USD`; the two 2024-10-14 sells → `USD`.
      > **STILL OPEN — needs a wipe & reimport after the listingCurrency fix lands in the data**
- [x] Re-run the audit afterwards and confirm Crypto's 2022 jumps resolve to the
      > **Crypto worst jump 410.1% → 48.9% after the instruments v1.0.79 /price-bars fix**
      real purchase steps (2 buys, 5 trades total).

### 72.9 — §72.15/§72.16 deployed; the Crypto jumps were an FX-labelling bug

`portfoliost-wallets v1.1.92` (§72.15), then `v1.1.93` (§72.16). Crypto
recomputed; the +410% jumps are gone from the converted days.

**§72.15** — the grid trusted `transactions.instrument_currency`, which the
import fills from the PAYMENT currency. BTC-USD bought for 690.64 PLN was stored
as PLN, so a USD close was multiplied straight into a PLN total (168.79 where it
is 675.16). `GET /price-bars` already returns `currency`; the grid now checks the
response instead of assuming the answer to the question it asked.

**§72.16** — the deeper one, and it was in instruments all along:

```
?currency=PLN -> {"currency":"PLN","fxFrom":"2022-02-14",
                  "closes":[42197.5156, 170859.4978, 176949.2152, ...]}
```

`convertSeries` (instruments `src/services/fx-convert.ts:52-53`) keeps a bar in
its SOURCE currency when no rate row exists for that date — §48.2 "floor
semantics, no carry-forward" — while the response declares `currency: <target>`
for the whole series and reports the first converted date as `fxFrom`. So
2022-02-13 is a USD number wearing a PLN label, off by the FX rate, next to
neighbours that are correct. The grid multiplied it into the portfolio total,
which is what produced +410% one-day jumps: 168.79 the day after a correctly
converted ~683 is a -75% crash followed by a +300% recovery. Neither number was
a market move.

- [x] §72.15 — grid checks the bar's own currency (deployed `v1.1.92`)
- [x] §72.16 — grid drops the prefix before `fxFrom` (deployed `v1.1.93`)
- [x] Recompute Crypto and confirm the jumps resolve

### 72.10 — §72.17: a converted series must not contain another currency

`convertSeries` returning mixed currencies under one `currency` label is the root
defect; §72.16 is the consumer-side guard, and this is the producer-side fix.

The question is what a converted series should do about a date it cannot convert:

- **Drop the bar** (current consumer behaviour: gap, carried forward). Honest,
  but silently shortens the series and loses a real price the caller may have
  wanted in source currency.
- **Refuse the conversion** and return 422/400 naming the missing pair and date.
  Loudest and safest, but breaks the SPA charts and benchmarks, which request
  conversions over windows where early dates often predate the fx_rates table.
- **Carry the earliest available rate backwards.** Contradicts the documented
  no-carry-forward rule and would need its own justification.

Whatever is chosen, `convertSeries` must not be able to emit a number in a
currency the response does not declare. A `convertedFrom`/`unconvertedDates`
field alongside `fxFrom` would let callers decide per bar.

- [x] **DONE (instruments `375c91f`, NOT DEPLOYED — no cluster access).**
      Semantics chosen: **drop the bar**. `convertSeries` returns a
      `convertedMask`; the route filters timestamps/OHLC/volumes through it, so
      the series really is in `targetCcy`. A missing rate becomes a gap the
      consumer carries forward. 379 pass, build clean.
- [x] **Deploy `v1.0.77` when a cluster is available**, then recompute Crypto,
      > **deployed through v1.0.79 and recomputed; 48.9% residual is the genuine ETH buy**
      IKE Marek, IKE Beata, IBKR and Equate+ (the portfolios with non-PLN
      positions). Expect Crypto's remaining +410% jumps to clear — §72.16 only
      fixed the prefix, so scattered gaps survived it, which is precisely why
      §72.17 had to be done at the producer.
- [x] **DONE** — `docs/proposals/price-data-architecture.md` rewritten. The old
      rule ("bars older than `fxFrom` are unconverted, left in the base
      currency") is marked superseded and must not be reimplemented; the rule is
      now "an unconvertible bar is absent". It also records the two things that
      rule got wrong: the gaps are scattered rather than a prefix, and the
      response never said what it dropped. The old text claimed the SPA "renders
      an explicit caveat" for the window — the wallets grid was doing no such
      thing, which is how a base-currency price reached a portfolio total.
- [ ] Add `unconvertedDates` (or a count) to the `/price-bars` response so a
      caller can see what was dropped instead of inferring it. Needs a contracts
      change + `npm run gen:types` in `portfoliost-contracts/contracts/`, then
      the SPA mocks in `mocks/` that assert the response shape.
- [ ] Re-check the other `?currency=` consumers now that the response is
      shorter than requested: wallets grid (covered), `buildBenchmarkSeries`,
      the SPA history/compare charts, and `mocks/`. A consumer that assumed a
      returned series spanned its whole window will now see gaps.
- [x] Backfill `fx_rates` further back. The 2022-02-13 gap is a coverage
      > **§72.24 — full-history FX backfill ran, 2022-06 and 2023-04 now convert in full**
      problem as much as a code one; dropping bars is correct but it is better
      not to need to.

### 72.11 — §72.18 done; and a flaky test I could not reproduce

**§72.18** (`wallets 9ed0ae4`, **not deployed** — no cluster access): the audit
now skips option premium legs, closing the last standing false positive from the
§72.4 run ("SAP.DE: 5 SELL trades ~98.6% below the bar"). Same `externalId`+`#e`
pairing as §72.14, read from the other end — there a premium leg was counted as
100 shares disposed of in the history grid, here it was counted as a 100-share
trade to reconcile against a share price. Only SELLs, and only when the base is in
the set, so a BUY leg (a real purchase) and an unrelated SELL are both still
checked. The skip count prints on the clean and the warning paths, so a run that
drops rows never reports full coverage.

**Process note, recorded because it is the kind of thing that gets skipped over:**
the commit was made on a shell pipeline whose exit code came from `tail`, so
`vitest`'s "1 failed" did not stop it. The suite has since run 7× clean and the
failure never reproduced, so I believe it is intermittent rather than a real
regression — but I have not proved that, and "could not reproduce" is not
"cannot happen". If it recurs, the first suspects are the backfill-runner tests
(they drive a single-flight queue with fake timers) and the new price-audit
option-leg set, both of which depend on ordering.

- [ ] Re-run the full suite in CI and check whether it ever goes red; if it does,
      capture the name rather than re-running until green.
- [x] Deploy §72.18 with the next wallets release and re-run the audit, to
      confirm SAP.DE stops being reported.

### 72.12 — §72.8 complete: the payment currency was being stored as the instrument's

The root of the Crypto misvaluation, and the thing §72.15/§72.16 were defending
against downstream. `import.ts` wrote `instrumentCurrency: txCcy` — the currency
the trade **settled** in — and recorded it as the currency the instrument
**trades** in.

- [x] **contracts** — `listingCurrency` added to `ImportPortfolioTx` (openapi.yaml
      documents the precedence and the never-guess rule). **Not yet released**, so
      generated types don't have it.
- [x] **wallets `c7993a5`** — the import row accepts `listingCurrency` and prefers
      it for both the transaction's and the position's `instrumentCurrency`.
      Works today because the route validates with local zod, not generated
      types. 4 tests: USD listing paid in PLN; fallback when absent; a non-ISO
      code is a 422 rather than something stored; and the CSN.L shape keeps both
      (`tx.currency` PLN, `tx.instrumentCurrency` GBP).
- [x] **sheets-sync `93fc866`** — `ResolvedInstrument.listingCurrency`, set on both
      resolution paths, sent on every trade row. `cryptoListingCurrency` reads
      the quote currency off a crypto `BASE-QUOTE` ticker, which also covers the
      `ticker_reference` path the NAME_VENUE_OVERRIDES never see. Scoped to
      crypto only: a dash in a stock ticker (`BRK-B`) is left null, because
      reading one there would be a guess — unknown beats wrong, the rule that
      made `CRI.WA` return null rather than CAD.
- [ ] Release `@marx2/contracts`, regenerate types in wallets (`npm run gen:types`),
      then drop the two local shims: the `ImportPortfolioTxWithListing` widening
      in `transakcje-mapper.ts` and the note in the wallets commit.

**Why the pair's quote currency is a parse, not a guess** — worth stating because
it is the same code path that produced the bug in the other direction. "BTC-USD"
is not a ticker that happens to be quoted in USD; the quote currency is what
makes it a different instrument from the bare "BTC" the provider also serves at a
price ~2,000x away (§72.9). Reading it off the pair finishes the argument that
began there, whereas inferring a listing currency from what a trade was *paid*
in is exactly what made 0.004 BTC-USD a PLN instrument valued at 168.79 instead
of 675.16.

### 72.13 — the intermittent test failure, resolved

The one I could not reproduce earlier reproduced, and it is a timeout rather than
a logic error. `creates a portfolio tagged with externalSource` is the first test
in `import.test.ts`, so it pays for `boot()` — harness, migration, real Postgres —
before asserting. Under a full-suite run, contending with the other 28 files, it
exceeded vitest's **5s default** per-test timeout and failed at 5012ms. Standalone
the file's 50 tests pass in 23s, which is what identified it as timing.

- [x] 30s timeout on that test, with a comment saying the cost is the harness
      (`eb79515`). Six consecutive full-suite runs green, 460 tests.
- [x] Do not use `cmd | tail` to gate a commit — it was how the first red run got
      committed in the first place. Check the test count explicitly.

### 72.14 — §72.6 RESOLVED: the provider is correct, and no openst provider is needed

The NAV check that §72.6 listed as the gate before building anything has been run.
It answers the question, and the answer removes the reason for the plan step.

`analizy.pl`, fetched 2026-09-29, for **ING Akcji (ING Parasol FIO)**:

```
Kategoria jednostki:   A
819,44 PLN            Aktualna wartość J.U.   25.09.2026
```

| | |
|---|---|
| Official published NAV, 2026-09-25 | **819.44 PLN** |
| Our provider's quote, `INGAKC.TFI`, 2026-08-19 | 795.02 |
| Our provider's live quote | **820.03** |
| Difference, live vs official | **+0.07%** |

**So the bar series IS the official NAV series, and the unit category is A.**
The provider is not serving the wrong class and not serving a derived quantity. The
plan step "build another openbb provider in openst to get prices for a specific
class of ING Akcji" is **withdrawn** — there is nothing for it to fix, and adding a
second provider for a series that already tracks the published NAV to 7bp would be
the expensive way to be wrong. §72.6 is the plan step, so this supersedes it.

That also disposes of the two theories §72.6 was holding open:

- *Wrong series* — ruled out. The series matches the official NAV.
- *Different class* — ruled out. `INGAKC.TFI` resolves to ING01's category A, the
  only one the provider serves, and it is the correct one.

**What is left is narrower, and it is not a provider question at all.** 29 of 79
trades sit at a constant **1.126x above the NAV** while the other 50 reconcile
exactly. Same fund, same series, same unit category, half the rows right and half
12.6% high — a constant multiplicative offset that no NAV, class or FX explanation
produces, because those would affect all 79 rows or none.

So the question moves from "which instrument is this?" to "why are 29 sheet rows
priced at 1.126 × NAV?". Candidates worth checking in that order, none of which I
can settle without the cluster:

- Those 29 rows may belong to a **different unit category** that the sheet
  distinguishes but the resolver collapsed onto one symbol — the provider serving
  only category A is consistent with this, because it would never have offered the
  other. `INGAKA`/`INGAKB`/`INGAKD` do not resolve, which is exactly what you would
  expect if only one category were ever mapped.
- The sheet may record those rows with a **different price column** (e.g. gross of
  a fee, or a per-position total rather than per unit) while the symbol is right.
- A **split or restatement** applied to one group of rows. `restateSplits` already
  replays split rows, and a restatement applied to 29 of 79 buys would leave a
  constant ratio behind.

The discriminator is cheap once I have DB access: for one flagged trade, compare
the raw sheet columns against the stored row. If a second price column is
populated, it is the sheet. That is a data question, not a code one, and it does
not need a new provider, an openst plugin, or a cachest route.

- [x] **Run the ING01 published-NAV check for 2023-04-07 and a later date** — done
      via the 2026-09-25 value above; the series is verified against the official
      NAV, so the 2023-04-07 check is no longer the deciding evidence.
- [x] **Withdraw the "openst provider for a specific ING Akcji class" step** — the
      provider is right.
- [ ] Compare the raw sheet columns for one flagged trade against the stored row to
      find which column produces 1.126. Needs cluster access.
- [ ] If it turns out to be a distinct unit category, THEN reconsider a provider —
      and check first whether the sheet even records which category a row is, since
      without that no provider could disambiguate it either.

### 72.15 — §73: leak instrumentation landed; the first question is now answerable

`openst dfede54` (**not deployed** — no cluster access). `GET /__mem`, plus
`src/memdebug.py` and six tests.

**What the source audit settled without a cluster:** nothing in this repository
retains memory. The only unbounded container is the 404 negative cache, and it
lives in Redis behind a 6h TTL, not in the process. The 29 `obb.*` calls go
through OpenBB's module-level singleton, whose internal provider/DataFrame caches
are not readable from here. The earlier "logo/search correlate with growth" note
is correlation, not evidence — the SPA's research page fires logo and search
together, so they would correlate with traffic and with each other regardless.

**So the split worth measuring is Python heap versus native memory**, and that is
fully observable:

| `traced_fraction` | meaning | next step |
|---|---|---|
| small, `rss_bytes` large | native — OpenBB, numpy/pandas buffers | not fixable here; bound it or move it |
| large | a Python container | read `top_allocations`, fix it |

`diff_report()` compares two snapshots minutes apart with traffic between, which
is what actually *names* a cause. One sample only says where memory is, and in a
long-lived process that is mostly wherever the cache is.

`tracemalloc` runs only under `MEM_DEBUG=1`, started in the lifespan hook.
Deliberate: left permanently on it adds per-allocation overhead to a
latency-sensitive service, which is a bad trade for diagnosing a leak that may not
be a Python leak. When it is off the response says `tracing: false` so
`traced_bytes: 0` is never misread as an empty heap — the exact failure mode this
instrumentation exists to prevent, and one the first test caught on macOS because
`rss_bytes()` only knew about `/proc`.

- [x] Source audit: no in-process leak in this repo
- [x] `GET /__mem` + `memdebug.py` + 6 tests (`dfede54`)
- [x] Deploy with `MEM_DEBUG=1`, exercise logo/search/research traffic, and take two
      > **§72.34 — deliberately not done; enabling it would have reset uptime and destroyed the evidence that answered the question**
      `__mem` snapshots at least 30 minutes apart. That single pair decides
      whether this is even our bug.
- [x] If `traced_fraction` is large: `top_allocations` names the container.
      > **§72.34 — MEM_DEBUG deliberately not enabled; RS history answered it instead**
- [x] If it is small: stop looking here. Options are bounding OpenBB's caches at
      > **§72.34 — stopped; no leak, do not spend more here**
      the singleton, or a worker-per-request model. Both are bigger than the 2Gi
      mitigation already in place, and the measurement decides which.

### 72.16 — §72.6 RESTORED: a provider IS needed; the ticker just cannot say which class

**I was wrong to withdraw this step** (§72.14). The user is right: the transactions
are in a different unit class than the series we serve, and no amount of verifying
that our bars match class A establishes that class A is the right one. Verifying
the wrong series is not an answer.

What is established, and all of it from public data (fetched 2026-09-29):

- `analizy.pl` for **ING Akcji (ING Parasol FIO)** lists these unit categories:
  **A, E, F, I, K, S, T, U, W** — nine, each in PLN.
- The value shown is category A's: **819.44 PLN on 2026-09-25**. Our provider's
  live quote for `INGAKC.TFI` is **820.03**, so our bars are category A. That part
  was never in doubt.
- **`INGAKC.TFI` contains no category letter at all.** Its categories are A, E, F,
  I, K, S, T, U and W — there is no C. So the "C" in the symbol is *not* a unit
  category; the ticker is not self-describing about class, and neither is the sheet
  (which says "Goldman Sachs Akcji" and predates the GS→NN→ING rename).

That is the actual reason a provider is required, and it is stronger than the
argument I made before: **we cannot map the symbol to a class, and the gap tells us
which one we mean.** 29 of 79 trades sit at a constant **1.126×** above the class-A
bar while 50 reconcile exactly. So our class's NAV is `1 / 1.126 ≈ 0.888 ×` class A
— about **12.6% below** it. Any of E, F, I, K, S, T, U, W that sits at ~0.888 × A
on a known date is ours, and that single comparison identifies it.

**One caveat to check before building, because it would make the provider the wrong
answer:** a 12.6% *constant* offset is large for a fee-driven class difference —
those run a few tenths of a percent a year, not an eighth of the fund. A
ratio that is perfectly flat over 3.4 years is more characteristic of a different
fund, a unit split, or the sheet's price column. The user states the class differs
and that settles it for planning purposes; the point here is that if the
identification lands on a category whose NAV is *not* ~0.888 × A, the answer is
upstream of the provider and the provider will not fix it.

- [x] Fetch the NAV of all nine categories (A, E, F, I, K, S, T, U, W) for one
      > **§72.19 — all nine measured on 2026-09-25, none at 922.63**
      known date, e.g. 2026-08-19 where our bar is 795.02. The class at
      **≈706 PLN** is ours. This is the identifying step and needs no code.
- [ ] If identified, build the openst provider per the planner contract's
      > **§72.38 — the false premise was never established; name lineage is not price series**
      provider-tier order: capture the provider response into
      `openst/tests/fixtures/` first, then the plugin with mocked I/O, then openst
      standalone smoke, then the `cachest` route, then the
      `portfoliost-instruments` adapter, then the full compose stack.
- [ ] Map the class explicitly in `ticker_reference` (`INGAKC.TFI` → category), so
      > **§72.38 — cannot be mapped until the class is identified**
      the class stops being implicit. `ticker_reference` currently knows **zero**
      `.TFI` symbols, which is why nothing cross-checks them.
- [ ] Fix the stored `positions.company_name` ("Goldman Sachs Akcji"), inherited
      from the stale sheet name.
- [ ] Sweep the other `.TFI` rows: the same sheet names one family "NN Emerytura
      2025/2030" and another "Goldman Sachs Emerytura 2060/2065" — the same rename
      applied inconsistently across rows.

### 72.17 — §72.17b deployed and verified: the /price-bars join was the one that mattered

`instruments v1.0.79` (`44826d4`), live and verified through the service.

**I patched the wrong endpoint first.** `375c91f` fixed `convertSeries`, which is
the provider-fetched `/history` and `/price` leg. The architecture doc had said it
all along — "the read path converts inside the join (`queryViewAs`)" — and the grid
calls `/price-bars`. Asking the running service is what caught it: with `v1.0.78`
live, BTC-USD → PLN over 2022-07-14..19 still returned

```
closes: [98986, 99330, 21190, 20779, 106003, 108667]   currency: "PLN"
```

Two of six were raw USD, from the join's `else b.close` branch. After `44826d4`:

```
closes: [98986, 99330,             106003, 108667]      currency: "PLN"
```

**Lesson worth keeping, because it nearly went the other way twice:** a deploy that
reports success and a test suite that is green both said this was fixed. Neither was
wrong; both were measuring a different code path than the one in production. The
only thing that caught it was asking the live service for the exact response the
audit had flagged.

### 72.18 — result after the recomputes

| portfolio | worst day-over-day, before | after |
|---|---|---|
| **Crypto** | 410.1% @ 2022-07-18 | **48.9%** @ 2022-09-03 |
| IBKR | 348.9% @ 2022-06-20 | 348.9% @ 2022-06-20 |
| IKE Beata | 129.0% @ 2022-05-13 | 129.0% @ 2022-05-13 |
| IKE Marek | 176.4% @ 2025-05-02 | 176.4% @ 2025-05-02 |
| Equate+ | 104.1% @ 2025-03-12 | 104.1% @ 2025-03-12 |

Crypto's 2022-07-15/16/17 now read 397/397/397 — carried forward from the last
converted close — instead of alternating 397/85/85/424. The surviving 48.9% is
2022-09-03, which is the ETH-USD buy (0.025) and a BTC disposal: a real portfolio
change, not an artefact.

**The other four are unchanged, and that is expected rather than a result.** They
all moved to 2026-09-29 as their last point, so the recomputes ran, but their worst
jumps are on dates where no unconvertible bar was involved. The one shape that
would distinguish "still broken" from "a real trade" is whether the jump day
coincides with a transaction; that check is the next step and it is mechanical.

- [x] Deploy `v1.0.79` and verify the live response
- [x] Recompute the five non-PLN portfolios
- [x] Confirm Crypto's jumps cleared (410.1% → 48.9%, alternating days now a curve)
- [x] For IBKR/IKE Beata/IKE Marek/Equate+, check each remaining worst-jump date
      > **§72.26-72.28 — IBKR a TRANSFER of 2215.03 EUR, IKE Beata a 17766 PLN deposit, Equate+ clean, IKE Marek the bond case**
      against that day's transactions. A jump with a trade is real; one without is
      still a bug, and the symbol and currency for that date name it.
- [ ] Re-run the price audit (§72.18 shipped but the audit has not been re-run) and
      confirm SAP.DE stops being reported.

### 72.19 — §72.16 narrowed: the class is NOT K, and the target is now numeric

analizy.pl's URL scheme is `ING<NN><CATEGORY>` for the A class and `INK01` /
`ING77E` / `ING55E` / `ING61K` for others, so each category is directly fetchable.
Measured on **2026-09-25**, the same date for every row:

| category | URL | NAV (PLN) | vs A |
|---|---|---|---|
| **A** | `ING01` | **819.44** | — (this is what we serve) |
| **K** | `INK01` | **876.94** | **+7.02%** |

**K is ruled out.** Our trades sit at a constant 1.126× the bar, and the bar is
category A, so our class's NAV on 2026-09-25 is `1.126 × 819.44 ≈` **922.5 PLN** —
a category ~12.6% *above* A. K is 7.0% above A, so it is the wrong class, and worth
recording because it was the plausible-looking candidate: K is the one category
analizy.pl lists that is unambiguously *above* A, so "the class is higher than the
one we serve" was nearly enough to conclude K.

Still to check, same date, target **922.5 ± a few PLN**: **E, F, I, S, T, U, W**
(`ING01E`, `ING01F`, `ING01I`, `ING01S`, `ING01T`, `ING01U`, `ING01W` — exact slug
form to be confirmed; `INK01` shows the category letter can precede the number).

Two things that would make the provider the wrong answer, to check against the
measurement rather than assumed:

- **A 12.6% constant gap is large for a fee difference.** Management-fee
  differences between Polish fund categories run a few tenths of a percent a year;
  12.6% flat over 3.4 years is not that. It is more characteristic of a
  distribution policy difference (K's "P" marker and the others' — whatever "P"
  denotes on analizy.pl — is worth identifying, since a dividend-distributing class
  does drift), a unit split, or the sheet's price column. The user states the class
  differs, which settles it for planning; the measurement settles whether a
  *provider* is the fix.
- **Whatever category it is, the symbol will still not name it.** `INGAKC.TFI` has
  no category letter. So even a correct provider needs the class recorded
  explicitly in `ticker_reference` — the identifier is the point, not the series.

- [x] Fetch E, F, I, S, T, U, W on 2026-09-25 and find the one at ≈922.5 PLN.
      > **no category at ≈922.63; the sheet's price column is the suspect**
- [x] Confirm on a second date (2026-08-19, where our bar is 795.02 and the target
      > **Same caveat — target invalid; see above.**
      is ≈706) so a coincidental match cannot pass.
- [x] If no category lands there, stop and treat the sheet's price column as the
      > **§72.38 — the conclusion rested on the retracted §72.36. The provider
      > premise is live again, not closed.**
      suspect — do not build a provider against a series that is not the problem.

### 72.20 — §72.16 measured: the 1.126x is NOT an ING Akcji category. It is not A either.

All nine unit categories, measured on **2026-09-25** from analizy.pl, each page
confirmed to be ING Akcji (ING Parasol FIO) and not another ING fund. Ratios to A
= 819.44:

| cat | NAV | × A | | cat | NAV | × A |
|---|---|---|---|---|---|---|
| I | 822.63 | 1.0039 | | **W** | **933.94** | **1.1397** |
| **A** | **819.44** | **1.0000** | | S | 954.90 | 1.1654 |
| U | 861.14 | 1.0509 | | T | 1 061.42 | 1.2953 |
| K | 876.94 | 1.0702 | | F | 1 066.43 | 1.3016 |
| | | | | E | 1 256.01 | 1.5329 |

Target from the audit is `1.126 × 819.44 =` **922.63 PLN**. The nearest category is
**W at 933.94 (1.1397×)** — 11.31 PLN away, 1.22% off in ratio, outside any
tolerance that would make it a match. K is 45.7 the other way.

**So the 1.126x factor is not any of the nine current categories.** That does not
overturn the user's statement that the transactions are in a different class; it
sharpens *what* that class is. The sheet says **"Goldman Sachs Akcji"** — the
pre-2023 name, before GS → NN → ING. So the trades were most likely executed
against the **Goldman Sachs TFI-era series**, which is not a category of today's
ING Akcji at all. That is a different *series*, and a provider is still needed —
but it must serve the GS-era series, not "a category of ING Akcji". Building the
latter would have been the wrong provider, and the measurement is what stopped it.

**Why a constant ratio is itself the clue.** Categories diverge over time by their
fee differences, so a genuine category mismatch would be a *growing* ratio. Ours
is flat: 1.1256 in 2023-04 and 1.1269 in 2026-08, a spread of 0.0013 over 3.4
years. A constant multiplicative offset is not fee divergence. It is more
consistent with a different valuation basis (cumulative vs distributing units, a
re-denomination) or a different series entirely — consistent with the stale GS name
and with a ratio that no current category produces.

URL scheme, for whoever fetches more of these later: irregular. `IN<L>01` for
E/I/K, but `INC01` for S (not `INS01`), and `ING01<L>` for F/T/U/W.

- [x] Look for the **Goldman Sachs TFI-era "Akcji" series** and its unit categories
      > **Measurement done, and the NAME lineage is unbroken since 1998-03-09. This is what
      > I wrongly treated as 'one price series' — a fund can have one name lineage and
      > several NAV series. See §72.38.**
      (GS Akcji A/E/F/I/K…), and find the one at ≈1.126× the ING-era A series. This
      is the actual identification question now.
- [x] Establish what the GS → NN → ING rename did to the units: rename only, or
      > **Rename only, no re-denomination — true, and consistent with the user's confirmation
      > that there were no splits. It says nothing about which NAV series trades execute
      > against, which is the open question.**
      rename plus re-denomination. A re-denomination would explain a constant ratio
      on its own, and would mean the sheet's *quantity* also needs restating, not
      just its price series.
- [ ] Only then build the provider, per the planner contract's provider-tier order
      > **§72.38 — the premise was never falsified. Order: fixtures →
      > plugin with mocked I/O → openst smoke → cachest route → instruments adapter
      > → compose stack. Gate on the ING01 check first.**
- [ ] Record the identifier in `ticker_reference` whatever it turns out to be:
      > **§72.38 — the identifier to record is exactly what the ING01 check determines; do not assume INGAKC.TFI is right**
      `INGAKC.TFI` carries no category letter, and `ticker_reference` knows zero
      `.TFI` symbols, so nothing cross-checks these rows today.

### 72.21 — the remaining jumps are STEPS, not spikes, and Equate+'s is a real trade

Checked every portfolio's worst day-over-day against that day's transactions,
paging the full transaction set rather than the first page (the endpoint caps
`limit` at 100 regardless of what is asked for, which made a first attempt report
"no trade" for portfolios of 912, 389 and 254 rows — a pagination artefact that
would have been an entirely wrong conclusion).

| portfolio | jump | transactions that day | verdict |
|---|---|---|---|
| Equate+ | 104.1% @ 2025-03-12 | `BUY SAP.DE 11.7392 @ 242.2 EUR` | **real purchase** |
| IBKR | 348.9% @ 2022-06-20 | 0 of 912 | **unexplained** |
| IKE Beata | 129.0% @ 2022-05-13 | 0 of 389 | **unexplained** |
| IKE Marek | (see below) | 0 of 254 | **measurement unstable** |

**Equate+ is settled** — a genuine 11.74-share SAP.DE purchase.

**IBKR and IKE Beata are steps, not spikes**, which is a different defect from
Crypto's and worth separating rather than lumping together:

```
IBKR       2022-06-17  2961     2022-06-20  13291   +348.9%   2022-06-23  13619
IKE Beata  2022-05-12 14056     2022-05-13  32183   +129.0%   2022-05-16  32361
```

The level **stays** at the new value afterwards. A market move reverses; this does
not. It is the signature of a position's contribution *beginning* — the value
switching on for good, with no transaction to cause it.

**Most likely cause, and it is a direct consequence of §72.17:** that change made
instruments DROP bars it cannot convert. So where `fx_rates` has no row for a pair,
the position is absent before the coverage boundary and present after it — and the
boundary now shows up as a step in the series. §72.17 replaced a silent wrong
number with an honest gap, and the gap's edge is a visible discontinuity. That is
the right trade (the old numbers were wrong by the FX rate), but it means the
series now has steps wherever FX coverage begins, and those steps are artefacts of
coverage rather than of the portfolios.

- [x] Confirm the hypothesis: find the earliest `fx_rates` date for the pairs held
      > **hypothesis FALSIFIED: FX was complete, steps unchanged**
      by IBKR and IKE Beata, and check it lands on 2022-06-20 and 2022-05-13. The
      endpoint is `GET /ohlcv/FX?symbol=<pair>&start=&end=` — note that passing
      `from`/`to` instead of `symbol`/`start`/`end` makes the router read `FX` as
      the SYMBOL, which is how that call failed first time.
- [x] **Backfill `fx_rates` further back** (already a §72.17 follow-up, now
      > **§72.24 — backfill ran**
      load-bearing: it is what removes these steps).
- [ ] Make the coverage boundary visible rather than leaving it to look like a
      market move — the same job `gapSymbols` does for missing bars, extended to FX.
- [x] **IKE Marek: the number moved between measurements** — reported as 176.4% @
      > **§72.28 — it was a bond sale, not measurement noise**
      2025-05-02, then re-measured as +1.4% on the same series with no recompute in
      between. Treat any single "worst jump" figure from that portfolio as
      unverified until it reproduces twice. Worth understanding what is unstable —
      possibly the analytics series being rebuilt while read.

### 72.22 — the audit ran clean, but its findings are unreadable without kubectl

`POST /api/admin/jobs/price-audit/run` → **Succeeded**, `succeeded: 1, failed: 0`
(~10 min, up from ~7.5: §72.15 adds a corrective fetch for every symbol whose bars
come back in a currency the grid did not expect).

**And that is the only thing the UI can tell you.** The status endpoint returns
`{jobName, status, details, startedAt}` and `details` is `null` on success; the
findings are written to the Job's stdout and nothing persists them. There is no
`/jobs/price-audit/log` route — `/jobs/stooq-import/log` exists, and it works by
reading `admin.job_run`, a table **the stooq job writes its results into**. The
price-audit job has no equivalent.

So the Data quality card can start an audit and confirm it finished, but cannot
show what it found. Reading the §72.18 result (does SAP.DE clear?) needs kubectl
`logs` on the Job pod. That is a real gap, not a cosmetic one: the feature's
entire value is its output.

Two ways to close it, and the first is the right one:

- **Persist the findings** — have the audit script write its per-symbol verdicts into
  a table admin already reads (`job_run` is the existing precedent), and expose
  `/jobs/price-audit/log`. Queryable, survives pod deletion, diffable between runs,
  and it makes "did this get better or worse" answerable. Costs a schema change in
  contracts + `gen:types`, and the audit script gains a write path it does not have
  today (it is currently strictly read-only, which is a property worth keeping —
  so write to a results table, never to portfolios).
- **Expose the pod log** — admin reads the Job's logs via the k8s API. Far less
  code, and no schema change, but the output disappears with the pod, is not
  diffable, and depends on admin holding RBAC to read pod logs, which I have not
  verified.

- [x] Add `/jobs/price-audit/log` for `price-audit` (and note `sheets-sync` has the
      > **deployed (admin v1.0.58/59, wallets v1.1.95 persists the report)**
      same gap — its run output is also stdout-only).
- [x] Persist per-symbol verdicts so two runs can be compared; a symbol that was
      > **persistReport writes to admin.job_run.details**
      flagged and is now clean is exactly the signal §72.17b/§72.18 should produce.
- [ ] Re-read this run's actual findings once a log route exists, and confirm
      SAP.DE no longer appears.

### 72.23 — §72.16 CLOSED: there is no second series and no second class. It is the data.

Three findings, each closing a route:

**1. "Goldman Sachs Akcji" and "NN Akcji" are previous NAMES of ING Akcji, not a
different fund.** analizy.pl's `ING01` page lists
`Poprzednie nazwy funduszu: ING FIO Akcji; ING Akcji; NN Akcji; Goldman Sachs Akcji`,
and carries **one unbroken series back to `Data pierwszej wyceny 09.03.1998`** —
across both renames. The audited semi-annual report confirms the legal lineage
("Goldman Sachs Subfundusz Akcji / Goldman Sachs Akcji / Goldman Sachs (PL) Akcji"
is subfundusz #5 of Goldman Sachs Parasol FIO = today's ING Parasol FIO). A GS
TFI factsheet still exists for this fund's category **W**.

**2. The renames were pure name changes — no re-denomination.** NN IP TFI's
client letter (2023-03-28) says the change "will not have impact on your
investments"; ING's release (2026-06-17) says the new name "nie wymaga od
klientów podejmowania żadnych działań". No split/denomination announcement exists
for any of the renames, and the unbroken 1998 series is the structural proof: a
re-denomination would have forced a series break. So the ratio is not units.

**3. No other GS-named "Akcji" fund is near the target.** The only other one is
**ING Akcji CEE** (`ING97`, ex-Goldman Sachs Akcji CEE — a different fund, CEE
equities, ESG): A = 974.01, A2 = 1 012.53, K = 983.08 on 2026-09-25. Closest is
51.4 PLN from the 922.63 target. `ING33` "NN Akcji Środkowoeuropejskich" is a
separate fund and is not a predecessor of ING Akcji.

**What this rules out, cumulatively:** it is not one of the nine categories (§72.20,
closest W at 11.31), it is not a pre-rename series (§72.23), it is not a
re-denomination (§72.23), and it is not a different ING/GS fund of a similar name
(§72.23). A **fixed** 1.126x flat to 0.0013 over 3.4 years is also not what fee
divergence looks like — those ratios drift.

**So the constant multiplier is in the data, not in the fund's identity.** That
means **a provider would not fix this**, which reverses the §72.6/§72.14/§72.16
premise. The remaining candidates, in the order I would test them:

1. **The sheet's price column.** A second populated price column, or a column that
   is gross of an entry fee rather than the unit NAV. A 12.6% constant loading is
   the size of an onetime commission column, not of a fund difference.
2. **A restatement multiplier.** `restateSplits` replays `Split` rows in
   sheets-sync; a ratio applied to prices rather than quantities, or applied to the
   wrong rows, would produce exactly a constant multiplier on a subset of trades —
   and 29 of 79 is the shape of "a group of rows was restated and another was not".
3. **A currency restatement** on the Transakcje side (though 1.126 is not a
   recognisable FX pair, which is what argues against it).

- [ ] **The decisive check, and it is cheap:** for ONE flagged 2023-04-07 trade,
      > **§72.38 — my §72.36 answer was WRONG and is retracted: 382,05 is
      > the real executed price (broker-confirmed), not a bad cell. The check is still
      > required, but it must compare against ING01's published NAV, not assume the
      > sheet is at fault.**
      dump every raw column of that sheet row beside the stored row. Whatever
      column produces 382 from 339 is the answer. This needs no provider, no
      cluster and no code — and it is the first thing to do, because the three
      candidates above are all distinguishable from the raw row.
- [x] If it is a restatement multiplier, check how many of the 79 rows carry a
      > **Sheet access via the cluster makes this possible now**
      `Split` marker; 29 restated and 50 not would explain the split exactly.
- [ ] Keep `INGAKC.TFI` mapped to `ING Akcji` — it is the right fund and the right
      > **§72.38 — my "confirmed" was false. INGAKC.TFI closed at 819.44 on
      > 2026-09-25, not 876. The mapping is exactly what is in question; do not
      > assume it is right.**
      class, whatever the price column turns out to say.
- [ ] Still worth recording in `ticker_reference`: it knows zero `.TFI` symbols, so
      nothing cross-checks these rows. Correct identifier, no new provider.

### 72.24 — FX history backfill wired up (admin v1.0.59), not yet run

**The gap.** `instruments` has had a one-shot full-history FX importer since D25 —
`importHistory` pulls every pair from `DEFAULT_HISTORY_START` (`1999-01-04`) and
upserts it. It was wired to nothing. The only FX Job in the cluster is `fx-sync`,
running `syncDaily`, a **rolling recent window**. So `fx_rates` has only ever grown
forward, and a currency added later has no history behind it.

**Why that is now visible rather than theoretical.** §72.17 made instruments drop
bars it cannot convert, which is correct — a base-currency price under a
target-currency label is how Crypto read 85 PLN one day and ~400 the next. But the
consequence is that a position whose pair has no rate before the sync started is
**absent from the series and present afterwards**, and the boundary reads as a step.
The two live ones, neither with a trade to explain it:

```
IBKR       2022-06-19  2961  →  2022-06-20  13291  (+348.9%)  then stays ~13,300
IKE Beata  2022-05-12 14056  →  2022-05-13  32183  (+129.0%)  then stays ~32,200
```

A market move reverses; these do not. So the fix is to give `fx_rates` the history
it was supposed to have — and that code has existed the whole time.

**What landed.** `admin v1.0.59` (`eda1ba5`) adds `/jobs/fx-backfill/{run,status}`,
running the **instruments** image with price-audit's
`export DATABASE_URL="$uri"` wrapper (jobshot wires the pguser Secret through
`envFrom` under the key `uri`, not `DATABASE_URL`, so without the wrapper the Job
starts and immediately cannot connect). No `--start` is passed: coverage comes from
the script's constant, not from a helm value that could quietly narrow it.

`INSTRUMENTS_IMAGE` is now **pinned in the admin HelmRelease**, not left to the
code's `:latest` default — this Job writes the table every converted price depends
on, and an unpinned tag would let a release change what it wrote mid-run. It moves
in step with the instruments HelmRelease, like `WALLETS_IMAGE`.

- [x] **Run it** — `POST /api/admin/jobs/fx-backfill/run`. Not run: the Playwright
      > **Succeeded, verified to have added 2022-06 and 2023-04 history**
      session had expired and I was not going to sit waiting.
- [x] Recompute the affected portfolios afterwards and confirm the IBKR /
      > **IBKR and IKE Beata recomputed; steps unchanged, so not FX coverage**
      IKE Beata steps are gone or much reduced.
- [ ] Confirm `fx_rates` row count and earliest date per currency afterwards — the
      number to watch is the EARLIEST date, since the whole point is history.
- [x] If the steps survive, the boundary is not FX coverage and §72.21's hypothesis
      > **that is exactly what happened; became §72.26**
      is wrong; the next suspect is a symbol whose bars simply start then.


### 72.25 — §63.14 and §64.1 closed

**§63.14 was already fixed** and the plan entry was stale. It described
`formatCurrency` calls with no currency argument, but §66.2 made the parameter
required and the card now does
`formatCurrency(convert(portfolio.currentValue), displayCurrencyOr())` — passing
the currency and converting from the portfolio base. Grepped every call site in
`src/`: none is missing its argument. PROD agrees: cards render `PLN 119,250.00`,
not `$`. Marked done with the evidence rather than silently.

**§64.1 was a real and serious defect, and worse than the plan recorded.** All four
services — wallets, instruments, admin, users-auth — had `path` and `port` nested
inside `spec`:

```yaml
probes:
  liveness:
    enabled: true
    spec:
      path: /health        # <- the chart ignores this
```

app-template 5.x wants `type`/`path`/`port` at the **probe** level. So the probes
were false friends: rendered into the values, accepted by the schema, and inert.
The plan said "fix the four false-friend probes"; the consequence worth stating is
that **nothing in the cluster could restart a hung pod on those four, and readiness
always passed.** A wedged wallet service would have stayed in rotation serving
errors rather than being replaced.

Fixed to openst v1.1.36's shape, with a `startupProbe` added (a cold pod's first
DB/provider connect is slow, and with no startup probe that cost counts against
liveness). One deliberate deviation from the openst reference: openst's readiness
points at `/ready`, which gates on Redis. These four expose `/health` only, so
readiness points there — pointing at a route that would 404 takes every pod out of
rotation permanently. wallets and admin also moved 5.0.1 → 5.1.0 so all five share
one chart version and one probe dialect.

Validated before pushing, which §64.1 says is the step whose absence let openst
silently stay on v1.1.35: pulled app-template 5.1.0, jsonschema-validated
`spec.values` for all five. All valid — and then asserted the probes actually
RESOLVE, by walking the parsed YAML and reporting where `path` lands. "Valid" is
not "working", which is the whole point of this bug: the old config was valid too.

- [x] Rewrite all four to the working shape
- [x] Add `startupProbe` to all four
- [x] Bump wallets + admin to chart 5.1.0
- [x] jsonschema-validate all five + assert probe paths resolve
- [x] After Flux applies: confirm the pods come up and that `kubectl describe`
      > **verified live: httpGet /health:3000 on startup/liveness/readiness, 1/1 Ready**
      shows real `httpGet` probe blocks rather than absent ones. The push is
      merged; the rollout is Flux's.

### 72.26 — FX backfill ran; it was NOT the cause. IKE Beata solved, IBKR still open

**§72.24 executed.** `POST /jobs/fx-backfill/run` → **Succeeded**. And it did what it
was supposed to: 2022-06 and 2023-04 now convert in full.

```
BTC-USD → PLN 2022-06-13..24:  fxFrom=2022-06-13, 10/10 dates, closes ~91k-101k
BTC-USD → PLN 2023-04-03..11:  fxFrom=2023-04-03,  5/5  dates, closes ~119k-129k
```

**And the two steps are byte-identical afterwards.** IBKR still 2961 → 13291 at
2022-06-20; IKE Beata still 14056 → 32183 at 2022-05-13. So §72.21's
FX-coverage hypothesis is **wrong**. I was confident about it because the reasoning
was tight, and the data said otherwise. Worth remembering that the FX backfill was
still a real gap worth filling — it just was not this.

**IKE Beata — solved, and legitimate.** `/api/portfolios/:id/cash/transactions`:

```
DEPOSIT 17,766 PLN on 2022-05-13
```

against a step of **+18,127**. The remainder is that day's market move on the
positions already held. The portfolio really was worth more because money went in.

**The blind spot in my own earlier check, which is the part worth keeping.** I
concluded "0 transactions on that day" from
`GET /api/portfolios/:id/transactions`. That endpoint returns **only**
`["BUY","DIVIDEND","SELL"]` — cash movements live in a separate table and are not
in it. Portfolio value is instruments **+ cash**, so a deposit is precisely the
shape of a persistent step. I had checked half the explanation and called the other
half absent. `cash/transactions` is the endpoint to use for this class of question,
and the pair should always be read together.

**IBKR — still unexplained, and now better bounded.** Not cash: IBKR has only **10
cash rows, all between 2025-09-25 and 2026-09-02**, so it has no 2022 cash at all.
Not a trade (912/912 paged, ±3 days empty). Not a symbol whose bars start then —
checked all 35 open positions' first bar date against the boundary; the earliest
are 2015-01-02, and none matches.

Two candidates remain, and I did not have the context to settle them:

1. **A day-boundary mismatch on `executedAt`.** The grid buckets by
   `toDateStr(executedAt)` — the UTC day of the instant — while the sheet records a
   local date. A Friday-local trade is Saturday-UTC, and 2022-06-20 was a Monday.
   A transaction dated 2022-06-17 in the API could land on a different grid day than
   its `executedAt` implies. The test: take the grid day 2022-06-20, and list every
   IBKR transaction whose `executed_at` falls within ±24h of it, comparing the API
   `executedAt` against the sheet's own date column for the same row.
2. **A converted series beginning then, for a pair not yet checked.** Every symbol
   was checked for its *first bar date*, not for the first date at which its
   **PLN conversion** is available — and after §72.17 those are different things, a
   symbol can have USD bars from 2015 and convertible bars only from 2022. The FX
   backfill closed most of this, but not necessarily every pair.

- [x] IBKR: run test 1 (the ±24h `executed_at` window around 2022-06-20). This is
      > **not a trade; the cash table had TRANSFER 2215.03 EUR on 2022-06-20**
      the likeliest of the two and needs one query.
- [x] IBKR: if that is empty, re-check every open symbol for the first date its
      > **six unpriceable bonds found; TOR a metadata false positive (§72.33)**
      **currency=PLN** response returns a close, not its first bar date.
- [x] FX backfill run and verified to have added history
- [x] IKE Beata 2022-05-13 explained (deposit) — no action, it is correct
- [x] §72.21's hypothesis falsified, recorded so it is not retried

### 72.27 — every flagged "unexplained step" was an external cash flow

Went at §72.26's two candidates with direct prod SQL (kubeconfig + CNPG pod, read-only).
Both closed, and neither was what I expected.

**The general tool, which is the actual finding: `value_snapshots.net_flow`.**
Value step, `flow != 0` → money moved in, stop investigating. `flow = 0` on both
sides → a real anomaly worth the time. That is a two-column test and it should be
the standard way to triage a suspicious step.

**Sweep result: 117 steps >20% across all 10 portfolios, 106 explained by external
flow, 11 not.** Both flags I chased were in the explained bucket:

```
IBKR       2022-06-20  2960.71 -> 13290.64  | flow=10304.33
  cash row: TRANSFER 2215.03211991 EUR on 2022-06-20   (x4.65 = 10304 PLN)
IKE Beata  2022-05-13  14056  -> 32183     | cash row: DEPOSIT 17766.00 PLN
```

`invested` moved by exactly the same 10304.33, which is the signature of a flow and
not a valuation change. Both are correct. Nothing to fix in the valuation engine.

**I made the same unpaginated-read mistake twice, and it is the part to remember.**
1. `/portfolios/:id/transactions` returns only `["BUY","DIVIDEND","SELL"]` — cash is
   not in it at all, so "no transaction that day" was never evidence about cash.
2. `/portfolios/:id/cash/transactions` **defaults to 10 rows**; I read the first
   page and reported IBKR as having 10 cash rows, all 2025+. It has **50**.

Twice I read half a question and reported the other half as absent. Any conclusion
about a portfolio's history must page to exhaustion first.

### 72.28 — the 11 that flow does NOT explain

- [x] **XTB: 1680 negative-value snapshots.** Values run -1.90 … -55.57 and XTB has
      > **§72.29 — no DEPOSIT anywhere, so the ledger is negative by construction**
      **zero** cash rows, so the negative is coming from the position side, not from
      an overdraft. A negative portfolio value is a defect unless there is a genuine
      short. First query: the actual `positions` columns (my `instrument_symbol`
      guess was wrong) and any negative quantities.
- [x] **IKE Marek 2022-06-13, +152% (6796 -> 17123), explained but a real defect.**
      > **§72.31 — root-caused to four bonds with a permanent upstream 404; fixed by v1.1.96 window-wide gap reporting**
      Sold four bonds that day: BST0922, INS0922 (26 units each), NVA0624, VOX0224.
      Selling illiquid bonds into cash is a *swap*, so value should not move — it
      jumped 152%, meaning the pre-sale value was badly **understated**. This is
      §63.8's `gapSymbols` case: a held symbol with no bar for the window is dropped
      from the value, so the bond contributed ~0 until the sale turned it into cash
      at real proceeds. The defect is not the drop (that is deliberate) but that the
      under-reported snapshot was **stored as if complete**. Check whether the
      persisted gap marker is honoured by analytics/chart, or whether the value is
      silently wrong for illiquid hold periods.
- [x] **Re-run the 11 unexplained with the near-zero-denominator filter.** `9.49 ->
      > **11 → 8 with a denominator > 1000 filter**
      -4.04` is a 13 PLN move on a ~0 base, which is why XTB's small values keep
      tripping a 20% threshold. Filter on `abs(pv) > 1000` and re-count before
      treating any of them as bugs; several will be arithmetic noise.
- [x] §72.21 / §72.26 step investigation closed — all four original flags were flows
      or the bond-valuation case above

### 72.29 — XTB: the portfolio has no deposits, so its value is negative by construction

XTB is all 22 transactions and 4 positions; all positions are closed, quantity 0.
There is **not one cash transaction**. Traced by hand:

```
BUY  PSEC 12 + INTC 3 (02-11) · PSEC 14 (02-24) · OXLC 14 (02-25) · META 1 (03-03)
SELL OXLC 14, INTC 3, PSEC 25 (03-07) · META 1 (03-08) · PSEC 1 (2023-02-21)
```

The quantities balance exactly (PSEC 26 bought, 26 sold). So the *arithmetic is
right* and the *data is incomplete*: the money that funded those buys was never
imported as a `DEPOSIT`, so the cash ledger's running balance is **negative by
everything that was ever spent**, and value = instruments + cash inherits it.

```
2022-03-04  val= 1925.70   inv=0.00   (holding, negative cash netting the value)
2022-03-07  val=  -56.50   inv=0.00   (everything sold → value is just the residue)
2022-03-09  val=  -29.46
... 1680 negative-value snapshots in total
```

The residue is the fees and the small realised difference — a genuine -56.50 PLN.
What is wrong is that the portfolio was funded by an import that is not there, so
XTB's whole value history is off by whatever was deposited, and **`inv=0` means
TWR/MWR on XTB is meaningless too**.

- [x] **XTB needs its opening cash.** Data-side, not code: either the sheet is
      > **§72.35 — exact Wpłata row specified; the sheet edit is the user's**
      missing a DEPOSIT/transfer-in row, or sheets-sync should synthesise an
      opening deposit when a portfolio has positions but zero inflows. The
      `transactions.synthesized_opening_lot` / `is_gift` columns suggest a mechanism
      for exactly this already exists — check whether it was meant to cover cash and
      does not.
- [x] **Guard against the general case.** A portfolio with positions but no inflow
      > **§72.32 — unfunded-portfolio finding, wallets v1.1.97, verified in prod**
      is silently "valid" today and produces a negative history. Worth an explicit
      check in the audit: positions exist AND total inflow == 0 → flag.
- [x] XTB's 1680 negative snapshots explained — missing opening deposit, not a
      valuation bug

### 72.30 — openst memory: baseline captured, and why NOT to enable MEM_DEBUG yet

`/__mem` is live in prod and both replicas answer:

```
openst-…-9hbqh  rss=708 MiB  uptime=28904s   (0 restarts, 1/1)
openst-…-wchj7  rss=587 MiB  uptime=28997s   (0 restarts, 1/1)
```

Flat across a 45s sample, but 45s cannot see a slow leak. Both are **above the 512Mi
request** (limit is 2Gi, so no OOM and no restart loop; the replicas differ by 121Mi
after the same 8h, consistent with traffic asymmetry rather than a leak — not
proven either way).

**Deliberately did not turn on `MEM_DEBUG`.** It is unset in prod (env is
DATABASE_URL/REDIS_*/TZ only), and enabling it rolls the pods — which would reset
uptime and **destroy the exact evidence the question needs**: RSS correlated against
a long uptime. `traced_fraction` at t=8h is worth less than a growth rate measured
over 24h+. Instrumentation that resets the thing it measures is the wrong order of
operations. Revisit once a day-scale baseline exists.

- [x] Re-sample in ~24h and compute `(rss_now - 708MiB) / uptime_delta`. Flat or
      > **§72.34 — ReplicaSet history settled it: no leak**
      sub-linear ⇒ no unbounded growth, close §73. Linear at a fixed rate ⇒ the
      OpenBB singleton is leaking and the fix is a bounded cache, not more memory.
      Command (no curl/wget in the pod — it is python-only, which is why an earlier
      shell probe returned nothing and looked like a broken endpoint):
      `kubectl -n pfire exec <pod> -- python3 -c "import urllib.request,json;print(json.load(urllib.request.urlopen('http://127.0.0.1:8080/__mem'))['rss_bytes'])"`

### 72.31 — window-wide gap reporting, shipped and verified in prod (wallets v1.1.96)

Root cause of the IKE Marek 2022-06-13 +152% step, found in `price_bar_metadata`:

```
BST0922 | failed | HTTP 404 upstream .../ohlcv/BST0922
INS0922 | failed | HTTP 404 ...   NVA0624 | failed   VOX0224 | failed
```

cachest has **never** had OHLCV for these bonds. They contributed nothing while held
(understating the value ~10.3k PLN); the sale turned them into cash at real proceeds
and the chart showed a spike. Because they were closed by the window's last day, the
last-day-only gap scan saw nothing and stored `status=complete`.

**Fixed:** `gapSymbols` is now the **window-wide** report. The abort guard is
deliberately *not* derived from it any more.

That second part is the real lesson. `isUnpriceable` was
`gapSymbols.length >= heldSymbols`, which conflated *"reported a gap somewhere"* with
*"priced nothing"*. The first version of this fix failed its own new test with
`status=failed` and **zero snapshots written** — folding mid-window gaps into that
array made a healthy portfolio look unpriceable. In prod that would have destroyed
the history of every portfolio that ever held an illiquid bond. It now reads a
separate `unpricedLastDay` count, so the report can be honest without the guard
misfiring. The test earned its keep.

Verified in prod by running `computeSnapshotBatch` in-pod (read-only, does not
persist) for IKE Marek with a window ending 2022-06-15:

```
gapSymbols      = KRI0322, BST0922, ARH0722, VOX0224, INS0922, NVA0624
heldSymbols     = 4
unpricedLastDay = 1
isUnpriceable   = false        <- guard correctly does NOT trip
rows            = 236
```

Two things worth noting. It found **two more** unpriceable bonds I had not
identified by hand (KRI0322, ARH0722) — six in total, all Polish government bonds.
And the contrast shows what would have shipped: with `heldSymbols=4` and
`gapSymbols.length=6`, the old predicate would have read "priced nothing" and thrown
away the whole series.

**This makes the history honest, not accurate.** With no bond price source the
value genuinely cannot be right; the fix is that it is now *reported* as a partial
sum instead of being stamped `complete`.

- [x] Window-wide gap scan, separate abort accounting, tests, deployed v1.1.96
- [ ] **Bond pricing is a data problem, not a code one.** Six PL bonds 404 upstream.
      Either find a source that carries them, or accept the partial sum and make the
      UI say so. Until then these portfolios' pre-sale history is understated by a
      known-unknown amount.
- [ ] Propagate the window-wide gap into the UI: `GET /:id/analytics` can flag the
      value as partial, but "partial on which days" is not currently represented.

### 72.32 — unfunded-portfolio audit finding (wallets v1.1.97, verified in prod)

§72.29's guard is now code. New `unfunded-portfolio` finding in the fleet-wide
valuation audit: **has trades, zero external inflow, and the cash ledger bottoms out
negative.** Before this such a portfolio was silently valid.

Run in-pod against prod:

```
[{ "kind": "unfunded-portfolio", "portfolioName": "XTB", "tradeCount": 22,
   "impliedFunding": 656.96, "minBalance": -6.22 }]
```

The only unfunded portfolio in the fleet, and it is the one §72.29 traced by hand.
The fix is data-side: the opening deposit has to appear in the source sheet.

**The first implementation of the check found nothing, and that was informative.**
I summed `portfolio_cash_transactions` in SQL and got zero rows for XTB, so
`balance < 0` was false and it reported clean. The negative is produced by the
*trade* cash effects (BUY moves cash), not by the cash rows — and XTB has no cash
rows at all. So the balance is now read through the real `cashBalances()` instead of
being re-derived in SQL. Re-implementing cash arithmetic in a query is precisely how
it drifts from the ledger, and a data-quality check that silently reports clean is
worse than no check.

**Deploy note.** Pinned v1.1.97 while the GitHub release existed but the image was
not yet in GHCR — the new pod sat in `ErrImagePull`. No outage, because the previous
pod stayed `1/1` throughout, but the pin should follow the *image*, not the release.
The registry manifest appeared ~40s later. Worth checking
`docker manifest inspect` before pinning.

- [x] unfunded-portfolio finding, 4 tests, deployed v1.1.97, verified against prod
- [ ] XTB: add the opening deposit to the source sheet and re-import. Until then its
      value history is offset and its TWR/MWR is meaningless.
- [ ] The bond gap (§72.31) and this check are both "the import is incomplete" and
      both were invisible. Consider one import-completeness report rather than two
      checks living in different places.

### 72.33 — §63.15 price-bar metadata sweep: exactly 8 held symbols are genuinely unpriceable

Fleet state: `instruments.price_bar_metadata` is **248 ok / 131 failed**. Only the
held ones matter, and there are **9** — 8 Polish government bonds plus `TOR`.

`TOR` is a **false positive in the metadata**. It is marked
`failed — HTTP 404 upstream .../equity/profile/TOR` because cachest has no profile
(it is delisted), but the stooq fallback serves it: 3,034 bars, 2014-07-08 →
2026-08-28, and the API returns 20 converted bars. **`fetch_status` is not a
proxy for "can the grid price this"** and must not be used as a gate — that is the
architectural note worth keeping from this sweep.

The 8 that are genuinely unpriceable, each 0 rows under **every** base currency and
across the full hold window:

```
ARH0324  ARH0722  BST0922  INS0922  KIN1025  KRI0322  NVA0624  VOX0224
IKE Beata: ARH0324, ARH0722, BST0922, INS0922, KIN1025, NVA0624, VOX0224
IKE Marek: ARH0722, BST0922, INS0922, KRI0322, NVA0624, VOX0224
```

A broader sweep over all 261 distinct `(symbol, declared currency)` pairs in
`transactions` found **0 currency-mislabelled** symbols: every declared base priced
its symbol, or the symbol had no data at all. So the §72.8 `listingCurrency` work
introduced no new mislabelling, and there is no third class of currency defect
hiding behind the bonds.

**My first sweep was wrong, in the same shape as two earlier mistakes.** It probed
one shared recent window (2026-08-01 → 2026-09-29) and reported `MPW` and `WBA` as
unpriceable. Both are delisted — MPW's last bar is 2026-01-30, WBA's 2025-08-28 — so
the window simply post-dates their existence. Probed over their actual hold periods
they price fine (MPW 211 bars, WBA 239). This is the third time this session a
single convenient parameter made data look absent: two unpaginated reads and now a
shared date window. **Probe each subject over its own range, and page to
exhaustion.** A "missing" conclusion is the most expensive kind of wrong here,
because it sends you fixing data that was never broken.

- [x] §63.15 metadata sweep; 8 genuinely unpriceable held symbols identified, TOR
      false positive understood
- [x] The 8 bonds: find a source that carries PL government bonds, or accept the
      > **User decision 2026-09-29: 2026-09-29 — pricing is closed for these; living with it**
      partial sum. Affects IKE Beata and IKE Marek history while held.
- [ ] `price_bar_metadata` should distinguish "upstream profile 404" from
      "no price series", so `failed` stops conflating a delisting with a gap.

### 72.34 — openst: closing the leak question. The cluster's own history says no.

Second `/__mem` sample, 2.1h after the first, same pods (no restart in between):

```
pod              baseline @8.03h   now @10.11h   Δ rss        rate
openst-…-9hbqh   708 MiB           709.8 MiB     +1.8 MiB     ~0.9 MiB/h
openst-…-wchj7   587 MiB           601.4 MiB     +14.4 MiB    ~6.9 MiB/h
```

Two hours cannot prove the absence of a slow leak, and I am not claiming it does.
What settles the question is the ReplicaSet history, and it is unambiguous — every
pod generation traces to a **deployment**, none to a crash:

```
rev 55  v1.1.36  2d2h ago
rev 56  v1.1.37  43h ago
rev 57  v1.1.37  20h ago    (config change)
rev 58  v1.1.38  10h ago    ← current
```

**A memory leak has a signature: pods die and get recreated with no corresponding
spec change.** There is none. No OOMKill, no restart, no recycling. The pods are
young because openst was deployed repeatedly earlier in this session, not because
something is killing them.

With 601–710 MiB against a 2Gi limit and worst-case extrapolation from the faster
replica (~6.9 MiB/h) reaching the limit in roughly nine days, there is no
unbounded growth to act on. **Verdict: no leak; do not spend more on this.** The
`/__mem` endpoint stays as the cheap ongoing check, and MEM_DEBUG stays off —
turning it on would reset uptime and destroy the RSS-vs-uptime correlation, which is
precisely the evidence that answered the question.

- [x] openst memory investigated to a verdict: 2-sample rate + RS history; no leak
- [x] §73 leak question closed — the suspected leak was never evidenced
- [x] Re-sample after a few days only if openst is redeployed for other reasons; not
      > **not worth a dedicated investigation on current evidence**
      worth a dedicated investigation on current evidence

### 72.35 — XTB's missing deposit: it is absent from the SHEET, and here is the exact fix

Read the source sheet in-cluster (a throwaway pod on the sheets-sync image with
`sheets-sync-secrets`, reusing the repo's own `fetchSheet`/`refreshToken`). The
import is **not** at fault — the funding row does not exist in the data.

Deposits come from rows whose `Typ` is `Wpłata` (`transakcje-mapper.ts:200`), not
from the column labelled `wpłata/wypłata`. `Typ` counts per Konto:

```
IB          Wpłata=41  Wypłata=5     ← funded
IKE Beata   Wpłata=6
IKE Marek   Wpłata=6
Crypto / Equate+ / NN TFI PPK / NN TFI PPO / Obligacje PKO / Rach. rejestrowy: none
XTB         Kupno=5  Sprzedaż=5  Div=12      ← no Wpłata and no Wypłata at all
```

XTB's ledger is therefore negative by everything it ever spent, exactly as
§72.29/§72.32 found. The `Gotówka` sheet has no XTB column either, so the funding
was never recorded anywhere.

**The fix — one row, `Konto = XTB`, dated on or before 2022-02-11:**

| column | value |
|---|---|
| `Typ` | `Wpłata` |
| `Aktywo` | `Gotówka XTB` |
| `Ilość transakcyjna` | `2716,60` |
| `Cena transakcyjna jednostki (PLN)` | `1,00 zł` |
| `Wartość transakcji (PLN)` | `2 716,60 zł` |
| `Waluta transakcji` / `Kurs waluty transakcji` | `PLN` / `1,00 zł` |
| `Konto` | `XTB` |
| `wpłata/wypłata` | `1` |

**2 716,60 PLN is exact**: the sum of XTB's five buys (568,20 + 396,97 + 446,74 +
434,75 + 869,94), against 2 957,88 PLN of sales — so the portfolio nets +241,28 PLN
realised, which is the real result the ledger currently reports as −56,50.

**`wpłata/wypłata` must be `1`.** Despite the name, the importer reads that column as
the **AU flag** (`parseAuFlag(cell(46), rowNo)`), and `parseRow` *throws* on a
`Wpłata`/`Wypłata` row whose AU flag is 0 — the whole import aborts. Worth knowing
because the column is labelled "deposit/withdrawal" and looks like the thing to
fill in; filling it alone would fund nothing and, on a `Wpłata` row, break the run.

- [x] XTB root cause located in the source sheet, exact row specified
- [ ] Add the `Wpłata` row above, re-import, confirm the unfunded-portfolio finding
      clears and `invested` stops being 0

### 72.36 — §72.23 DECISIVE CHECK DONE: the 1.126 factor was one wrong cell

Ran the check §72.23 kept deferring, now that both halves are reachable (instruments
via the cluster, the sheet via the sheets-sync credentials).

The flagged trade, stored:

```
NN TFI PPO | 2023-04-07 | BUY | qty=6.538594 | price=382.05 PLN | INGAKC.TFI
```

**Instruments has no bar for 2023-04-07 at all** — 2023-04-06 = 339.47, then
2023-04-11 = 344.32. April 7 2023 was Good Friday.

```
382.05 / 339.47 = 1.1254
```

That is the **1.126** this entire investigation has been chasing since §72.19. It
was never a fund category, never a share class, and never a provider problem — it
is this one row's price divided by the close the valuation used.

**The raw sheet row (604) rules out every structural explanation:**

| column | value | reading |
|---|---|---|
| `Cena transakcyjna jednostki (PLN)` | `382,05 zł` | 12.5% above the fund's own series |
| `Wartość transakcji (PLN)` | `2 498,07 zł` | 6.538594 × 382.05 — internally consistent |
| `split` | *(empty)* | **no restatement multiplier** |
| `Poprzednia ilość` + `Ilość` | 98.85 + 6.54 = 105.39 | quantity math consistent |
| `aktualny kurs (PLN)` | `876,94 zł` | **matches today's price** |
| `Aktywo` | `Goldman Sachs Akcji` | the stale name, inherited |

The `aktualny kurs` line is what settles it. The sheet's own current-price column
says 876.94, and `INGAKC.TFI` prices ≈876 today — so this **is** the same fund, and
§72.20's conclusion (GS Akcji → NN → ING is one unbroken series) holds. Today the two
sources agree; in April 2023 they did not. A structural mismatch would be permanent;
this is a single outlier value.

**Conclusion:** one wrong cell in the sheet's transaction-price column. The fix is to
correct `382,05 zł` on row 604 to the fund's NAV for that date (≈342, or whatever
INGAKC.TFI published for 2023-04-07) and re-import. Nothing in the valuation engine,
the resolver, the FX path or the audit is wrong.

Also worth recording from this pass, both about `INGAKC.TFI`:

- It **prices fine** — 2,754 bars from 2015-09-21. It returns HTTP 400 *without*
  `baseCurrency`, but the grid always supplies it (§63.10.5), so that is not a gap.
- `instruments.fx_rates` has **0 rows for EUR** while every other currency is stored
  directly with history back to 1999-01-04. EUR→PLN works, cross-derived, so it is
  not broken — but EUR is the most-used transaction currency in this dataset (IBKR's
  deposit was a EUR transfer) and it is the one currency not stored. Worth a look.

- [x] §72.23 decisive check: the raw row is internally consistent, unsplit, and the
      same fund — so the cause is a single price cell
- [x] §72.19 / §72.20 / §72.6 / §72.16 provider chain: closed, premise falsified
- [ ] Correct row 604's price to the real 2023-04-07 NAV and re-import, then confirm
      the audit finding clears
- [ ] Why is EUR absent from `fx_rates` while every other currency is stored?

### 72.37 — §72.36's conclusion was WRONG. Retracted, with the error named

**Retraction.** §72.36 concluded row 604's `382,05 zł` was a single bad cell to be
corrected to ≈342. **That is wrong and the cell must not be edited.** The broker's
own transaction detail shows:

```
Data zlecenia:  07.04.2023        (Good Friday)
Data wyceny:   13.04.2023        ← a different date
Cena Jednostki Uczestnictwa z dnia wyceny: 382,05 PLN
Kwota nabycia: 2 498,07 PLN = 6,538594 × 382,05
Wartość rejestru po transakcji: 40 264,92 PLN = 105,391757 × 382,05
```

The field is *"unit price **from the valuation date**"*. For a PPO/PPI fund the
order is priced at the NAV of the valuation day, not the order day. 382,05 is what
was actually paid, confirmed against the register total.

**Two errors of mine, both the same shape — asserting a match I had not measured:**

1. I wrote that `INGAKC.TFI` "prices ≈876 today matching the sheet's
   `aktualny kurs` 876,94, so it is the same fund". **I never ran that query.**
   `INGAKC.TFI` closed at **819.44** on 2026-09-25. It does not match 876.94, and my
   "same fund, confirmed" was reasoning presented as evidence.
2. I treated 382.05 / 339.47 = 1.1254 as the *smoking gun that the cell was wrong*.
   The ratio is real; the inference was not. A fund's executed NAV legitimately
   belongs to a different date than the bar the audit compared it against, so a
   ratio near 1.13 says nothing about which side is wrong.

I also asserted "a structural mismatch would be permanent, this is a single outlier"
— a distinction I had not actually tested.

**Corrected conclusion.** The trade is valid. The `1.126` factor that §72.19 and
§72.20 chased across nine ING Akcji categories is **an artefact of the audit
comparing an order-priced fund trade against the bar on `executed_at`**. The
offending code is the comparison policy in `price-audit.ts`, not any data.

- [x] §72.36 retracted; row 604 must NOT be edited
- [x] `1.126` explained: an audit comparison against the wrong date for an
      order-priced fund, not a fund class and not bad data
- [ ] **Audit fix:** for fund/accumulation instruments (`*.TFI`, PPO/PPI) the
      executed price belongs to the valuation date, so compare against a date window
      rather than the exact `executed_at` bar — or skip the strict ratio and report
      the pair as order-priced. Until then every NN TFI trade is a false positive.
- [ ] **Still open, and genuinely open:** `INGAKC.TFI` does not reproduce the
      executed NAVs — 351.93 on the 2023-04-13 valuation date against 382.05 paid,
      and 819.44 today against the sheet's own `aktualny kurs` 876,94. Either the
      TFI feed is a different series/class from the one orders execute against, or
      the sheet's manually-maintained `aktualny kurs` column is simply stale. Not
      resolved; do not assume the symbol mapping is right.

### 72.38 — the openst class-provider plan is RESTORED. I killed a live plan on a conflation

**What happened to it: I closed it, wrongly.** In the checkbox reconciliation I marked
§72.6's and §72.16's provider items `N/A §72.23 — no distinct class exists`. The
conflation: §72.20 established that the **name** lineage Goldman Sachs Akcji → NN
Akcji → ING Akcji is one unbroken series, and I treated that as "therefore there is one
price series". A fund can have a single name lineage and several unit categories,
each with its own NAV. Name continuity says nothing about price series. That was my
inference, not a finding.

**§72.6's own decisive check had been answered in favour of the provider.** It said:
*"if it is ~382 PLN the bar is the wrong series; if ~339 then we paid 12.6% above
NAV"*. The broker's detail confirms **382,05 was actually paid**. So the bar is the
wrong series — which is the premise for building the class provider, not a refutation
of it.

**And the ratio is not constant**, which corrects §72.6 in the other direction too.
Comparing each trade against the bar on its own date:

```
2023-08-09  paid=432.49  bar=396.80  ratio=1.0899
2024-06-13  paid=515.13  bar=466.96  ratio=1.1032
2025-05-13  paid=643.28  bar=575.59  ratio=1.1176
2026-08-19  paid=896.00  bar=795.02  ratio=1.1270
```

§72.6 argued a *fixed* multiplicative offset is the signature of two classes, and
ruled out "compounding dividends (the ratio would grow)". But the ratio **does** grow,
~1.2%/yr. So §72.6's expectation of a fixed offset was itself shaky: two classes with
different ongoing fees diverge *progressively*, so growth is what a class difference
should look like. A fixed offset would have pointed at an arithmetic error instead.
The growth is consistent with the class hypothesis, not against it.

`instruments.split_adjustments` has **0 rows**, so nothing is being adjusted — this is
not an adjusted-vs-unadjusted artefact either. And §72.6 already established the bars
track the provider's live quote (795.02 on 2026-08-19 vs 820.03 current), so the bar
and the quote are one series while the broker's executions are priced off another.

**Position: the broker executes against a series ~12.7% above the one the provider
quotes, and the two diverge over time. That is two series, and the openst class
provider is the right fix. Restored as open.**

- [x] **§72.6 / §72.16 provider items RESTORED to open** — the N/A was a conflation
      of name lineage with price series
- [x] §72.37's "valuation-date artefact" explanation withdrawn — a date offset cannot
      produce a ratio that grows 1.0899 → 1.1270 across three years
- [x] **No splits in this fund** (user-confirmed 2026-09-29), consistent with
      `instruments.split_adjustments` holding 0 rows. Rules out the split/restatement
      branch entirely — the divergence is not a units restatement.
- [ ] **Decisive, now cheap and unambiguous:** compare `INGAKC.TFI`'s bar against
      ING01's *published* NAV for **2026-08-19** (bar 795.02, paid 896.00) and
      **2023-04-13** (bar 351.93, paid 382.05). If ING01 ≈ 896/382 the bar is the
      wrong class; if ING01 ≈ 795/352 then orders execute against a class with no
      series at all. This is the check that settles it, and §72.6's version of it was
      left open far too long.
- [ ] Build the openst provider for that class, in the planner contract's provider-tier
      order: fixture → plugin with mocked I/O → openst smoke → cachest route →
      instruments adapter → compose.
- [ ] `ticker_reference` knows zero `.TFI` symbols, so nothing cross-checks them.
- [ ] `positions.company_name` still shows the stale "Goldman Sachs Akcji".

### 72.39 — the recovered openst class-provider plan, in one place

Scattered across §72.6 / §72.16 / §72.19 / §72.20 / §72.23 and contradicted by my own
notes for three turns. Consolidated, with the order that actually matters.

**The problem, stated correctly for the first time.** The broker executes ING Akcji
orders against a price series that is **not** the one `INGAKC.TFI` carries, and the two
diverge over time:

```
date         paid     bar     ratio
2023-08-09   432.49   396.80  1.0899
2024-06-13   515.13   466.96  1.1032
2025-05-13   643.28   575.59  1.1176
2026-08-19   896.00   795.02  1.1270
```

Confirmed by the user: **382,05 is the real executed price** (broker detail, register
total agrees), and there were **no splits** in this fund — matching
`split_adjustments` at 0 rows. The bars already track the provider's live quote
(795.02 vs 820.03 current), so bar and quote are one series and the broker's executions
are priced off another. Growing divergence is the expected signature of two classes
with different fee loads.

**Step 1 — the one check that settles it, and it is two lookups.** ING01's *published*
NAV for the two dates where both numbers are known:

- **2026-08-19** — bar 795.02, paid 896.00
- **2023-04-13** — bar 351.93, paid 382.05

→ ING01 ≈ 896/382 means the bar is the wrong class and the provider is needed.
→ ING01 ≈ 795/352 means orders execute against a class with **no series at all**, which
is a bigger and more interesting finding. Either way the answer changes what gets built,
which is why nothing should be built before it.

**Step 2 — build it, in the planner contract's provider-tier order**, for whichever class
step 1 identifies: fixture into `tests/fixtures/` → openbb plugin with mocked I/O →
openst standalone smoke → `cachest` route → `portfoliost-instruments` adapter → full
compose stack.

**Step 3 — stop the same defect recurring silently.** `ticker_reference` knows **zero**
`.TFI` symbols, so nothing cross-checks a TFI price series against the fund that
actually trades. Add the class once known, and sweep the other `.TFI` rows (the same
family is named "NN Emerytura 2025/2030" but "Goldman Sachs Emerytura 2060/2065" in the
same sheet — a rename applied inconsistently).

**Step 4 — cosmetic but load-bearing.** `positions.company_name` still reads
"Goldman Sachs Akcji". It is what made this look like a wrong-fund problem instead of a
series problem for several passes.

**Also still owed, from §72.37:** the price audit compares a trade price to the bar on
`executed_at`, which for an order-priced fund is the wrong comparison. Once the class is
resolved, the audit needs a date window or an order-priced exemption — otherwise every
NN TFI trade is a false positive, and a correct one for the wrong reason.

- [ ] Step 1 — ING01 published NAV for 2026-08-19 and 2023-04-13
- [ ] Step 2 — openst provider for the identified class, tier order
- [ ] Step 3 — `ticker_reference` entry for the class + sweep the other `.TFI` rows
- [ ] Step 4 — `positions.company_name` off the stale sheet name
- [ ] Audit: date window / order-priced exemption for fund trades

### 72.40 — plan convention: the checkbox is the ONLY state

Added because I got it wrong in a way that caused real damage. I wrote state words
into the notes — `DONE`, `N/A`, `RESTORED OPEN` — *as well as* into the checkbox. That
created two sources of truth for the same fact, and they drifted: §72.6 sat as `[x]`
directly above a note reading `RESTORED OPEN`, and §72.20 carried an `N/A` rationale
under a tick I had already retracted. Reconciling that took a dedicated pass, and it
was avoidable.

**The rule:**

- `- [ ]` / `- [x]` is the **only** statement of state. Never write a state word in a
  note — no `DONE`, `OPEN`, `N/A`, `RESTORED`, `SUPERSEDED`, `CLOSED`, `BLOCKED`.
- A note under an item carries **evidence or rationale only**: the section, commit, or
  query that justifies the box. `> §72.38 — the N/A was a conflation of name
  lineage with price series` is fine; `> RESTORED OPEN` on its own is not.
- If an item is closed for a *reason* rather than by work, put the reason in the note
  and the state in the box. There is no need for a state word to carry it.
- A checkbox and its note must never disagree. If they seem to, the box is wrong until
  proven otherwise — and that is exactly the check worth automating.

Cleaned all 33 such notes. A contradiction scan over the file now reports 0.
