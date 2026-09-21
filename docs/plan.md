# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 41. Combined (all-portfolios) value chart on the main portfolios page (example-service parity, 2026-09-21)

User request (no proposal file): the example-service portfolio dashboard shows a large combined
(all-portfolios) value chart between the header metrics and the portfolio cards; portfoliost's
main page (`InvestmentsView`, `/en/investments`) is missing it. Reuse the existing
`PortfolioPerformanceChart.vue` — adapted with a `combined` variant (absolute values, currency
axis, no Recompute button) — fed by `GET /api/portfolios/merged`.

State of the endpoint: `openapi.yaml` already defines `GET /portfolios/merged`
(operationId `getMergedPortfolios`, returns `PortfolioAnalytics`, no query params); the mock
currently answers `[]` (the example-service capture was empty); the real `portfoliost-wallets` route is
**not** implemented yet (follow-up, separate repo — SPA degrades gracefully: chart simply hidden).
Mock semantics: per-date sum of the shared analytics fixture across the portfolios listed in
`portfolios_total_metrics.json` → `portfolioBreakdown` (each seeded portfolio serves the same
`portfolio_analytics_all.json` fixture, so N× per date is the true sum, and the series stays
consistent with the header Total Value).

Scope: portfoliost SPA + mocks only.

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit + mock suite per
AGENTS.md; E2E against docker compose).

---

### 41.1 — `PortfolioPerformanceChart`: `combined` variant (absolute values, currency axis, no Recompute)

- [ ] `src/components/PortfolioPerformanceChart.vue`: add props
  `variant?: "portfolio" | "combined"` (default `"portfolio"`) and `currency?: string` (default `"USD"`);
  extend the header doc comment.
- [ ] `options` computed, `combined` mode: series data = raw `[ts, value]` points (no index
  normalisation); yaxis `labels.formatter` = compact + currency (reuse `formatCompact` from
  `@/utils/format`, e.g. `100k USD`), yaxis title hidden; tooltip y = full `formatCurrency(v, currency)`;
  no benchmark overlay (combined ignores the `benchmarks` prop); single blue line `#2563eb`.
- [ ] Template: hide the Recompute button row when `variant === "combined"`.
- [ ] `portfolio` variant behaviour unchanged (all existing tests stay green).
- [ ] Tests: `tests/unit/components/PortfolioPerformanceChart.test.ts` — new cases: combined plots
  raw `value` un-normalised; yaxis formatter output carries the currency code; recompute button
  absent in combined; benchmarks ignored in combined.
- [ ] Tests: `npm run test` green.
- [ ] Commit.

### 41.2 — API client: `getMergedAnalytics()`

- [ ] `src/api/portfolios.ts`: add
  `getMergedAnalytics(): Promise<components["schemas"]["PortfolioAnalytics"]>` →
  `http.get("/api/portfolios/merged")` (operation already in `generated/api-types.d.ts`).
- [ ] Thin http wrapper — verified by `npm run build` (vue-tsc); no dedicated unit test.
- [ ] Commit.

### 41.3 — Mock: `GET /api/portfolios/merged` serves merged analytics

- [ ] `mocks/portfolios/index.js`: replace `ctx.res.json(loadRaw("merged_portfolios.json"))` with
  `ctx.res.json(mergedAnalytics())`.
- [ ] `mergedAnalytics()`: load `portfolio_analytics_all.json` (shared fixture, ALL timeframe) +
  `portfolios_total_metrics.json`; per-date sum of `value`, `positionValue`, `walletCashBalance`,
  `investedCapital`, `costBasis` across each `portfolioBreakdown` entry; return
  `{ timeframe: "ALL", portfolioCurrency: metrics.baseCurrency, performance: { totalValue,
  totalInvested, totalReturn: totalGainLoss, totalReturnPercent, timeSeries }, benchmarks: [] }`.
  Empty (no fixture / no breakdown) → empty `timeSeries` (SPA hides the chart).
- [ ] `mocks/tests/run.mjs`: add checks — `/api/portfolios/merged` returns 200 with non-empty
  `performance.timeSeries`; last point `value` within 2% of
  `portfolios_total_metrics.json` → `totalValue`.
- [ ] Tests: `npm run test:mock` green.
- [ ] Commit.

### 41.4 — `InvestmentsView`: render the combined chart (example-service position)

- [ ] `src/modules/portfolios/InvestmentsView.vue`: `merged` ref; fetch `getMergedAnalytics()` in
  the `onMounted` `Promise.all` — on failure set `merged = null` (chart hidden, page unaffected).
- [ ] Render a `card` section between the metrics grid and the "Investment Portfolios" section
  (example-service layout: big chart above the cards, no title, no timeframe control — ALL history):
  `<section data-testid="combined-chart">` → `PortfolioPerformanceChart` with
  `variant="combined"`, `:time-series="merged?.performance?.timeSeries ?? []"`,
  `:currency="merged?.portfolioCurrency ?? store.totalMetrics?.baseCurrency ?? 'USD'"`,
  `:loading="loading"`; `v-if="merged?.performance?.timeSeries?.length"`.
- [ ] E2E: `tests/e2e/combined-chart.spec.ts` — login → `/en/investments` →
  `[data-testid="combined-chart"] .apexcharts-canvas` visible.
- [ ] Tests: `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 41.5 — Full suite + visual parity vs example-service

- [ ] `npm run build && npm run test && npm run test:mock`; `docker compose up -d --build`;
  `npm run test:e2e` — all green.
- [ ] Playwright side-by-side: portfoliost `/en/investments` vs `app.example-service.ai` portfolio page —
  combined chart block position/look; screenshot diff, note residual gaps.
- [ ] Commit.

---

Open follow-up (out of scope, wallets repo): implement the real `GET /api/portfolios/merged` in
`portfoliost-wallets` (sum value snapshots across all portfolios → base currency,
`PortfolioAnalytics` shape) so production serves the chart; until then the SPA hides it gracefully.

---

