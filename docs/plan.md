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

- [ ] `src/components/PortfolioPerformanceChart.vue`: plot raw `value` (absolute) — remove the
  index normalisation and the `returnType` prop (example-service's cumulative columns are % stats, not
  the line).
- [ ] New props: `currency?: string` (default `"USD"`) for axis/tooltip formatting;
  `color?: string` (default `#16a34a` — example-service performance green with gradient area; the combined
  page passes `#2563eb` blue).
- [ ] yaxis `labels.formatter` = compact currency (reuse `formatCompact` + currency symbol/code,
  e.g. `$20k`); tooltip y = full `formatCurrency(v, currency)` — applies to the portfolio line
  AND the benchmark series (example-service formats the benchmark's index value as currency too).
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
  `performance.timeSeries[].value` from portfolio currency to the display currency before passing
  to the chart (`getLatestRate` once per distinct source currency — the existing `rateByCcy`
  pattern); pass `:currency="displayCurrency"`. Same-currency → rate 1, no request.
- [ ] Customize dialog: remove the Return Type block (the line no longer depends on
  TWR/MWR/Simple); keep the benchmarks section. Store `analyticsReturnType`/`setReturnType` and
  the `benchmarkCalcType` API param stay as-is for now (dead in UI, harmless) — noted as
  follow-up cleanup.
- [ ] Tests: `tests/e2e/chart-recompute.spec.ts` asserts visibility + pending line only (no index
  values) — expect no change; `npm run test:e2e` green (docker compose).
- [ ] Commit.

### 41.3 — Contracts + API client: merged mirrors single-portfolio analytics

- [ ] `portfoliost-contracts/contracts/openapi.yaml`: add optional `timeframe` query param
  (string, default `ALL`) to `GET /portfolios/merged` (mirroring `/:id/analytics`);
  `npm run gen:types` + `npm test`/`npm run lint` in the contracts package; rebuild/publish the
  `@marx2/contracts` artifact the SPA consumes, regenerate `generated/api-types.d.ts`.
- [ ] `src/api/portfolios.ts`: `getMergedAnalytics(timeframe: PortfolioAnalyticsTimeframe = "ALL")`
  → `http.get(`/api/portfolios/merged?timeframe=${timeframe}`)`.
- [ ] Verified by `npm run build` (vue-tsc) — thin wrapper, no dedicated unit test.
- [ ] Commit.

### 41.4 — Mock: `/api/portfolios/merged` serves the same per-timeframe fixture as a single portfolio

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
  `:currency="displayCurrency"`, `:loading="loading"`, `v-if="merged?.performance?.timeSeries?.length"`.
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

