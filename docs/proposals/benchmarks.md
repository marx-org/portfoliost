# Proposal: benchmark overlay & return-type calculation on portfolio performance (D46)

**Status**: accepted (2026-09-04)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [wallets-module.md](wallets-module.md) (D16–D24), [fees-and-custom-fx.md](fees-and-custom-fx.md) (D25–D41), [admin-module.md](admin-module.md) (D42–D45), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: parity work on the portfolio Performance chart. Add a example-service-parity "Customize" chart-controls dialog (benchmark overlay with an arbitrary-ticker stock selector + a return-type calculation selector + a positions selector), and make the backend (`portfoliost-wallets`) serve real, contract-typed benchmark series. The `benchmarks` query param is a plain comma-separated ticker list (already in the contract); this proposal adds the return-type param and implements the computation.

---

## Context & the reported bug

The Performance chart legend previously showed a phantom **"Benchmark"** series with no way to pick or compute it. The real example-service app exposes a **Customize** dialog (`Chart controls`) on `/portfolios/{id}/performance` that the portfoliost build must replicate.

Confirmed root causes in the current portfoliost build (all verified by inspecting the running stack):

1. **Frontend**: `PortfolioPerformanceTab.vue` rendered a hard-coded series labeled `Benchmark` from `store.analytics.benchmarks` even though the endpoint never populated it.
2. **Backend**: the SPA's analytics calls are served by `portfoliost-wallets` (`GET /api/portfolios/{id}/analytics`), proxied by the nginx gateway. That handler reads only `timeframe`, ignores `benchmarks`, and always returns `benchmarks: []`.
3. **Mock caveat**: `mocks/` (example-service-mock) was extended with benchmark generation, but `/api/portfolios` is routed to the `wallets` module (not example-service-mock) in the dockerized stack, so only the direct mock tests (not the live SPA) exercise that generator.

---

## Facts captured from the real example-service app (`app.example-service.ai`, 2026-09-04)

Explored the Performance page → **Customize** (Chart controls). This is the source of truth for parity.

### Chart controls dialog layout

| Field | Control | Notes                                                                                           |
| --- | --- |-------------------------------------------------------------------------------------------------|
| Timeframe | `combobox` | options per contract timeline enum                                                              |
| Return Type | `combobox` | `Money-Weighted Return (cumulative)` / `Time-Weighted Return (TWR)` (default) / `Simple Return` |
| Based on | `combobox` (only when Return Type ≠ TWR) | `External Capital` (typical option) or `Cost Basis`                                              |
| Benchmarks | custom picker (standard list) + buttons | `Add Custom Benchmark`, `Manage benchmarks`                                                     |
| Positions | custom picker | `10 selected` — select from portfolio positions (default = all selected = sum of all)           |

### Benchmark picker (standard list, listbox of checkboxes)

- S&P 500 (`SPY`)
- Nasdaq 100 (`QQQ`)
- Dow Jones (`DIA`)
- Russell 2000 (`IWM`)
- Total Stock Market (`VTI`)
- EAFE (`EFA`)
- Aggregate Bond (`AGG`)

Multi-select. Testids seen in real example-service: `perf-controls-benchmarks`, `perf-controls-add-benchmark`, `perf-controls-manage-benchmarks`.

### Add Custom Benchmark (arbitrary ticker — stock search)

Opens a second dialog **"Add Custom Benchmark"** with a search box **"Search stocks, ETFs, or paste an ISIN..."**, a **Filter by Type** control, and **Popular searches**. This is the stock-selection component (same component used elsewhere for instrument search), letting the user pick *any* ticker as a benchmark, not just the standard list.

### Real API requests observed

```
GET /api/portfolios/{id}/analytics?timeframe=3M&benchmarks=SPY&displayCurrency=USD
GET /api/portfolios/{id}/analytics?timeframe=1Y&displayCurrency=USD
GET /api/portfolios/{id}/analytics?timeframe=All&displayCurrency=USD
```

- `benchmarks` is **plural** and a **comma-separated ticker list** (e.g. `benchmarks=SPY,QQQ`).
- `displayCurrency` is passed separately.
- Changing **Return Type** fired **no new analytics request** — example-service precomputes every cumulative return field (MWR/TWR/Simple) in the response and the selector switches which line the client plots. So the Return-Type selector is client-side only.

### Real benchmark response shape (subset)

```jsonc
{
  "benchmarks": [
    {
      "name": "S&P 500 ETF",
      "symbol": "SPY",
      "timeSeries": [{ "date": "2026-06-03", "value": 100 }, /* ... */ ],
      "volatility": 13.592288519463317,
      "returnPercent": 2.5098112006788225
    }
  ],
  "performance": {
    // portfolio series; per-point fields already include:
    "cumulativeMwr": 0.79, "cumulativeTwr": 0.79, "simpleReturnPercent": 0.79,
    // ...
  },
  "timeWeightedReturn": 11.7,
  "moneyWeightedReturn": 241.2,
  "simpleReturnPercent": 11.14,
  "totalReturnPercent": 11.14,
  "portfolioCurrency": "USD"
  // ...
}
```

Key facts about the benchmark series:
- `benchmarks[].timeSeries` is **normalized to a starting index of 100** (an indexed return line), so it overlays the portfolio's indexed line regardless of the ticker's absolute price.
- Per benchmark: `symbol`, `name`, `timeSeries[{date,value}]`, `volatility`, `returnPercent`.
- The portfolio `performance.timeSeries[]` already carries `cumulativeMwr`, `cumulativeTwr`, `simpleReturnPercent`, `investedCapital`, `externalCapital*`, etc., so the client can switch the plotted return line without a refetch.

---

## Design

### D46 — computation semantics

For a pure instrument benchmark (an arbitrary ticker) there are no cash flows, so **Simple, TWR and MWR collapse to the same indexed price line**: `value(d) = close(d) / close(d0) × 100`. The three return-type modes therefore differ only for the **portfolio's own** line (which already has distinct `cumulativeMwr` / `cumulativeTwr` / `simpleReturnPercent` series), matching example-service where changing Return Type does not refetch.

Return-type values are expressed as an enum in the contract: `moneyWeighted | timeWeighted | simple` (default `timeWeighted`).

### D47 — contract (`portfoliost-contracts/openapi.yaml`)

Add to `GET /portfolios/{id}/analytics`:

1. `benchmarks` (exists): comma-separated ticker list — keep. Document that tickers are arbitrary (SPY/QQQ/...) not only the standard list.
2. **new** query parameter `benchmarkCalc` (or `returnType`) — see naming question; enum `[moneyWeighted, timeWeighted, simple]`, default `timeWeighted`.

The `PortfolioAnalytics.benchmarks[]` item schema already has `symbol`, `name`, `timeSeries`; ensure it also has `returnPercent` (`number`) and `volatility` (`number`) typed. The `performance` schema already enumerates `moneyWeightedReturn`, `timeWeightedReturn`, `simpleReturnPercent`, and the per-point cumulative fields — verify `cumulativeMwr`/`cumulativeTwr` are typed for the client switch.

Border cases to type: empty `benchmarks` → `[]`; unknown/unresolvable ticker → omit that benchmark (not a 4xx).

### D48 — backend (`portfoliost-wallets`, `src/routes/portfolios.ts`)

Analytics handler `GET /:id/analytics`:

1. Read `benchmarks` (comma-list) and `benchmarkCalc` (enum, default `timeWeighted`) from the query.
2. For each requested ticker: fetch daily bars from the instruments module `GET /api/instruments/{symbol}/price-bars?from&to` (reuse the `fetchPriceBars` pattern already in `services/backfill.ts`); normalize the closer series to `close/close0 × 100`; drop tickers with no data.
3. Build `benchmarks[]` items typed against the contract: `{ symbol, name, timeSeries, volatility, returnPercent }`. Resolve `name` from the instruments quote/instrument name when available (example-service returns e.g. "S&P 500 ETF").
4. Keep serving the portfolio `performance` (with the already-computed cumulative MWR/TWR/Simple per point). The `benchmarkCalc` param primarily informs which cumulative field is authoritative; for the instrument lines all modes are identical (D46).

Unit tests (PGlite, per playbook): handler returns `benchmarks: []` for no param; returns one normalized series per supplied ticker; drops unknown tickers; computes `returnPercent` = `(last/first − 1)×100` and `volatility` from daily log returns.

### D49 — SPA (`PortfolioPerformanceTab.vue` + copy example-service UI)

Extend the existing "Customize" dialog to parity with example-service **Chart controls**:

- **Benchmarks** field: standard-list picker (SPY/QQQ/DIA/IWM/VTI/EFA/AGG) via checkboxes, plus **Add Custom Benchmark** opening the instrument **stock-search** component (arbitrary ticker, testid `perf-controls-add-benchmark`). Selected benchmarks → `benchmarks` query param.
- **Return Type** selector: `Money-Weighted Return (cumulative)` / `Time-Weighted Return (TWR)` (default) / `Simple Return`; plus **Based on** sub-option when not TWR.
- **Positions** selector: pick from portfolio positions (default all selected = sum of all). When narrowed, pass the position subset to the backend (out of scope for the analytic series today; store the selection).
- Store: keep `analyticsBenchmarks` (arbitrary ticker list), add `returnType`; thread both through `fetchDetail`/`setTimeframe`/`setBenchmarks` and the backfill-poll refetch (fix: the poll currently drops the benchmark param).
- Chart: plot the portfolio line from the selected return-type cumulative field + normalized benchmark indexed lines (already reads `benchmarks[].timeSeries`). Legend shows real `name`/`symbol`, no phantom "Benchmark".

Reuse the existing instrument search component used by Add Position / watchlists rather than building a new one.

### Mock + tests

- Align `mocks/portfolios/benchmarks.js` with the final contract (plural `benchmarks`, normalized series, `returnPercent`/`volatility`), and set the dockerized `wallets` module as the live path (or keep mock tests as a secondary reference). Update `mocks/tests/run.mjs`.
- SPA unit + Playwright e2e: customize dialog opens, adds a custom-benchmark ticker, toggles return type, and the chart legend shows real lines.

---

## Implementation order (one step = one commit, per AGENTS.md)

1. **Contracts first** (per directive "remember to update contracts first"): edit `openapi.yaml` (benchmark item `returnPercent`/`volatility`, new calc-type param), push to `main`, CI publishes a new `@marx2/contracts` version from the git tag, install in `portfoliost-wallets` + `portfoliost`, `npm run gen:types`.
2. Backend (`portfoliost-wallets`): wire `benchmarks` + calc type into the analytics handler + unit tests.
3. SPA: Customize dialog parity + store/API wiring; fix the poll dropping `benchmarks`.
4. Mock/tests + e2e.
5. Rebuild docker stack (`gateway` DNS note below), verify end-to-end in Playwright, commit per repo.

## Operational notes

- The nginx gateway resolves compose service names at runtime; after recreating a backend container, the gateway can 502 on stale DNS and needs `docker compose restart gateway`.
- In the dockerized stack the SPA's analytics hits the **wallets** module, not example-service-mock — account for this when testing (see Context §3).
