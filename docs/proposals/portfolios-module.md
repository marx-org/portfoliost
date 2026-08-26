# Proposal: portfolio management inside the wallets module (`portfoliost-wallets` extension)

**Status**: proposed (2026-08-26)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [wallets-module.md](wallets-module.md) (D16–D24), [fees-and-custom-fx.md](fees-and-custom-fx.md) (D25–D33, D38–D41), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: replace **every** mock endpoint under `/api/portfolios*` (and the public-share route) with a real backend implemented as an extension of the existing `portfoliost-wallets` service. Delivery order: portfolio CRUD → transaction actions (buy/sell/edit/delete with the shared fee components' exact wire fields) → transaction history display → aggregates/shares → gateway flip → **analytics & charting last** (value snapshots → performance endpoints → risk metrics → dividends/calendar/compare), designed in full below (D61–D64) but implemented only after the core surface is live.

## Context

The SPA portfolio surface (InvestmentsView, PortfolioCard, PortfolioDetailView + tabs,
TransactionsView, SharedPortfoliosView/PublicPortfolioView, AddPositionDialog,
EditTransactionModal, EditPositionDialog) talks to ~33 endpoints that today are served
exclusively by `mocks/portfolios/index.js` (static JSON files + in-memory maps). The
wallets module (§11) is live and owns the cash ledger, including the `INVEST`/`SELL`/
`DIVIDEND` row types reserved for portfolio trades (D17) and the push model D19 assumed
a future portfolios writer. All transaction modals already collect fees/rates through
the shared `FeeFields.vue` + `FxRateFields.vue` components emitting the D28/D29 wire
format (`fees`, `feesType`, `feeCurrency`, `rateSource`, `exchangeRate`,
`feeRateSource`, `feeExchangeRate`) — the backend must consume exactly those fields so
the SPA needs zero modal changes.

### D53 — topology: extend `portfoliost-wallets`, no new module

| Dimension | Value |
| --- | --- |
| Repo | `Marx2/portfoliost-wallets` (existing) — new routers under `src/routes/portfolios/` |
| Container / compose service | `wallets` (unchanged) |
| K8s HelmRelease | `portfoliost-wallets` (unchanged) |
| Env keys consumed | existing `API_USERS_AUTH_URL` (prefs), **new `API_INSTRUMENTS_URL`** (quotes) on the wallets container |
| Postgres schemas | existing `wallets` + **new `portfolios`** schema owned by the same service |
| Gateway routing | `/api/portfolios` moves to `${API_WALLETS_URL}`; `/api/public/portfolios` gets its own location ahead of the `/api/public` catch-all |

Rationale:

1. **D19 collapses into a function call.** The wallets proposal made wallets the owner
   of the cash ledger and had portfolios *push* trades via `POST /internal/cash-movements`.
   Co-locating portfolios in the same service turns that HTTP hop into an in-process
   ledger write inside the same SQL transaction — atomic buy = position update +
   portfolio ledger row + wallet `INVEST` row + balance bump, no retry/dedupe protocol.
2. **Fee/FX settlement logic already exists there.** `wallets/src/services/fee-fx.ts`
   (D28/D29 resolution: fixed vs pct, fee-currency default, manual-rate validation) and
   `valuation.ts`/`fx-import.ts` (fx_rates access, carry-forward, `@marx2/contracts/fx`)
   are reused verbatim for portfolio transactions instead of being duplicated.
3. **MODULARISATION naming holds**: one env key per module (`API_WALLETS_URL`) serving
   several path areas — the users-auth precedent (`/api/auth` + `/api/users`). The
   now-redundant `API_PORTFOLIOS_URL` key is retired from `deploy/services.env` at the
   flip step.
4. One user journey (deposit cash → buy stock → see history) stays inside one
   deployable; splitting it would recreate the cross-service consistency problem D19
   was designed around.

Rejected alternative: a dedicated `Marx2/portfoliost-portfolios` repo — rejected because
of (1)+(2): it would need HTTP cash-movement pushes, duplicated fee-fx code, and a second
deployment for what is one domain boundary drawn only by URL prefix.

### D54 — database tables (schema `portfolios`)

Ledger-first, mirroring wallets D17: `transactions` is the source of truth;
`positions` and portfolio totals are denormalized aggregates maintained in the same
SQL transaction as every ledger write and rebuildable by recompute. Amounts follow the
wallets conventions (`numeric(20,8)`, CHECK constraints instead of enums, camelCase
wire ↔ snake_case columns, `user_id` denormalized everywhere for single-lookup
authorization per D24).

```sql
CREATE TABLE portfolios.portfolios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,                     -- JWT sub
  name            text NOT NULL,
  description     text,
  strategy        text NOT NULL DEFAULT 'GROWTH',
  type            text NOT NULL DEFAULT 'regular',
  currency        char(3) NOT NULL,                  -- settlement/reporting ccy; mandatory (422 when missing), like wallets D17
  base_currency   char(3) NOT NULL DEFAULT 'USD',    -- display ccy (D21b), default from user prefs
  wallet_id       uuid REFERENCES wallets.wallets(id), -- linked cash account (nullable)
  total_invested  numeric(20,8) NOT NULL DEFAULT 0,  -- denormalized, tx-maintained
  current_value   numeric(20,8) NOT NULL DEFAULT 0,  -- denormalized, valuation-maintained
  is_public       boolean NOT NULL DEFAULT false,
  is_margin_enabled boolean NOT NULL DEFAULT false,
  margin_rate     numeric(9,4),
  maintenance_margin_rate numeric(9,4),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portfolios_user ON portfolios.portfolios (user_id);

CREATE TABLE portfolios.positions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL,
  portfolio_id      uuid NOT NULL REFERENCES portfolios.portfolios(id) ON DELETE CASCADE,
  symbol            text NOT NULL,
  company_name      text,
  asset_type        text NOT NULL DEFAULT 'STOCK',   -- STOCK | ETF | CFD | OPTION | CRYPTO
  contract_size     numeric(20,8),
  direction         text CHECK (direction IN ('LONG','SHORT')),
  option_type       text CHECK (option_type IN ('CALL','PUT')),
  strike_price      numeric(20,8),
  expiration_date   date,
  quantity          numeric(20,8) NOT NULL DEFAULT 0,
  average_cost_basis numeric(20,8) NOT NULL DEFAULT 0, -- per unit, instrument ccy (moving average)
  instrument_currency char(3) NOT NULL DEFAULT 'USD',
  purchase_currency char(3),
  sector            text, industry text, country text,
  wallet_id         uuid REFERENCES wallets.wallets(id),
  fees              numeric(20,8),                   -- opening-lot fees (display only; truth lives in transactions)
  fees_type         text CHECK (fees_type IN ('fixed','pct')),
  fee_currency      char(3),
  is_open           boolean NOT NULL DEFAULT true,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz,
  -- valuation snapshot columns (refreshed from instruments quotes, D58)
  current_price     numeric(20,8),
  price_source      text NOT NULL DEFAULT 'manual',
  price_as_of       timestamptz,
  market_value      numeric(20,8),
  unrealized_gain_loss numeric(20,8),
  day_change        numeric(20,8),
  day_change_percent numeric(20,8),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_positions_portfolio ON portfolios.positions (portfolio_id);
CREATE INDEX idx_positions_symbol ON portfolios.positions (user_id, symbol);

CREATE TABLE portfolios.transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,                    -- denormalized owner (D24 pattern)
  portfolio_id     uuid NOT NULL REFERENCES portfolios.portfolios(id) ON DELETE CASCADE,
  position_id      uuid REFERENCES portfolios.positions(id),
  wallet_id        uuid REFERENCES wallets.wallets(id),
  type             text NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND')),
  instrument_symbol text,
  instrument_name  text,
  sector           text, industry text, country text,
  quantity         numeric(20,8) NOT NULL DEFAULT 0,
  price            numeric(20,8) NOT NULL DEFAULT 0,
  currency         char(3) NOT NULL,                 -- transaction/settlement ccy (mandatory)
  instrument_currency char(3),
  asset_type       text NOT NULL DEFAULT 'STOCK',
  fees             numeric(20,8),
  fees_type        text CHECK (fees_type IN ('fixed','pct')),
  fee_currency     char(3),                          -- D28: default = transaction ccy at write
  taxes            numeric(20,8),
  fees_settled     numeric(20,8),                    -- fee settled into transaction ccy (D28)
  total_amount     numeric(20,8) NOT NULL DEFAULT 0, -- qty × price (fees excluded, mock parity)
  realized_gain_loss numeric(20,8),                  -- SELL rows only (moving-average cost)
  exchange_rate    numeric(20,10),                   -- snapshot tx ccy -> base/display ccy (D21 semantics)
  rate_source      text NOT NULL DEFAULT 'automatic' CHECK (rate_source IN ('automatic','manual')),
  fee_rate_source  text NOT NULL DEFAULT 'automatic' CHECK (fee_rate_source IN ('automatic','manual')),
  fee_exchange_rate numeric(20,10),
  converted_total_amount numeric(20,8),
  converted_price  numeric(20,8),
  converted_fees   numeric(20,8),
  converted_realized_gain_loss numeric(20,8),
  display_currency char(3),
  is_gift          boolean NOT NULL DEFAULT false,
  synthesized_opening_lot boolean NOT NULL DEFAULT false,
  executed_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptx_portfolio ON portfolios.transactions (portfolio_id, executed_at DESC);
CREATE INDEX idx_ptx_user ON portfolios.transactions (user_id, executed_at DESC);
CREATE INDEX idx_ptx_position ON portfolios.transactions (position_id);

CREATE TABLE portfolios.shares (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  portfolio_id     uuid NOT NULL REFERENCES portfolios.portfolios(id) ON DELETE CASCADE,
  display_name     text NOT NULL DEFAULT '',
  view_count       integer NOT NULL DEFAULT 0,
  expires_at       timestamptz,
  privacy_settings jsonb NOT NULL,                   -- defaults per mock create (benchmarks SPY, all true, twr)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shares_portfolio ON portfolios.shares (portfolio_id);

-- Analytics foundation (D61). Migration + population land with Phase H (last),
-- defined here so the schema is designed once, up front.
CREATE TABLE portfolios.value_snapshots (
  portfolio_id  uuid NOT NULL REFERENCES portfolios.portfolios(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  value         numeric(20,8) NOT NULL,   -- EOD market value in portfolio base_currency
  invested      numeric(20,8) NOT NULL,   -- cumulative net invested capital to that date
  net_flow      numeric(20,8) NOT NULL DEFAULT 0, -- that day's external cash flow (for MWR/TWR)
  PRIMARY KEY (portfolio_id, snapshot_date)
);
CREATE INDEX idx_snapshots_portfolio_date ON portfolios.value_snapshots (portfolio_id, snapshot_date);
```

Notes:

- `positions` keeps **lot-per-row granularity** (one row per AddPositionDialog submit),
  matching example-service's holdings list; SELLs target a specific `position_id` (or FIFO across
  open lots of the symbol when omitted — D56).
- Wire `Transaction.required` includes `priceCurrency`; the column set above plus
  `currency` covers it (`priceCurrency` echoes `instrument_currency` unless the request
  differentiates them).
- `value_snapshots` is append-only reference data: recomputing history = truncate +
  rebuild for one portfolio (cheap, deterministic — same philosophy as balance-history
  reconstruction in wallets D21).

### D55 — endpoint map (complete mock/contract surface)

Phase column refers to the implementation steps below. "Stub-until" endpoints return
contract-valid **empty content** from their first deployed moment (instruments ownership
precedent) so the gateway flip never breaks a tab.

| Phase | Endpoint | Behavior |
| --- | --- | --- |
| B | `GET /api/portfolios` | user-scoped summaries incl. inline `metrics` |
| B | `GET /api/portfolios/light` | `{id,name,currency,totalValue,totalInvested}` for selectors |
| B | `POST /api/portfolios` | create; `name` required (422), `currency` mandatory (422 when missing, wallets D17 precedent), `baseCurrency` defaults from user prefs (D21b), `walletId` validated against caller's wallets |
| B | `GET /api/portfolios/:id` | detail + computed `metrics` + `positions[]` summaries (404 when not owned, D24) |
| B | `PATCH /api/portfolios/:id` | rename/settings; returns updated detail |
| B | `DELETE /api/portfolios/:id` | guarded (D59): 409 while transactions or open positions exist |
| C | `POST /api/portfolios/:id/transactions` | BUY/SELL/DIVIDEND; fee-fx resolution (D56), position mutation, wallet cash movement (D57); 201 → wire Transaction |
| C | `PATCH /api/portfolios/:id/transactions/:txId` | edit; re-runs fee-fx resolution + full downstream recompute (position, portfolio totals, paired wallet rows) |
| C | `DELETE /api/portfolios/:id/transactions/:txId` | delete; reverses ledger effects (wallet row deleted by `reference`) |
| C | `POST /api/portfolios/:id/positions` | manual lot open (parity with mock add-position); creates synthesized opening tx (`synthesizedOpeningLot=true`) so the ledger stays complete |
| C | `PATCH /api/portfolios/:id/positions/:positionId` | metadata only (name/sector/industry/country); quantity & cost edits rejected 422 → record a transaction instead (D56) |
| C | `DELETE /api/portfolios/:id/positions/:positionId` | soft close (`isOpen=false`, `closedAt`) when quantity is 0; otherwise 409 |
| D | `GET /api/portfolios/:id/transactions` | paginated; `type=dividend`, `positionId` filters; `paginatePage` shape |
| D | `GET /api/portfolios/transactions` | cross-portfolio feed; `sortBy` map (symbol/date/portfolio/type/quantity/price/fees/amount) × `sortOrder` like mock |
| D | `GET /api/portfolios/:id/transactions/export` | same pagination JSON (format param echoed; CSV rendering later if needed) |
| E | `GET /api/portfolios/:id/positions` | enriched Position wire shape: quote refresh (D58) + derived `percentageChange`, `percentOfPortfolio`, dayChange |
| E | `GET /api/portfolios/:id/positions/bare` | stored columns without quote enrichment |
| E | `GET /api/portfolios/:id/positions/cfd-hints` | open CFD lots projected onto hint shape |
| E | `PATCH`/`DELETE` position variants | see Phase C rows (same handlers) |
| E | `GET /api/portfolios/:id/allocation` | `{totalValue, bySector, byAssetType, byCurrency}` from live market values |
| F | `GET /api/portfolios/total-metrics` | cross-portfolio aggregation; `externalCapital*` null-safe (real values in Phase I via wallet deposit basis, D62) |
| F | `GET /api/portfolios/held-stocks` | symbol-aggregated across portfolios with quotes/logos |
| F | `GET /api/portfolios/merged/light` | merged-view light payload composed from real data |
| F | `GET /api/portfolios/:id/summary-metrics` | computed subset; `historyCoherence` stub |
| F | `GET /api/portfolios/:id/snapshot` | allocation + top/bottom performers subset; remainder empty-valid |
| F | `GET /api/portfolios/merged` | **empty-valid stub until Phase I** (needs snapshots); then merged analytics across all portfolios (D62) |
| I | `GET /api/portfolios/:id/analytics` | full PortfolioAnalytics: timeSeries from snapshots, return family, monthly returns, benchmarks (`?timeframe=6M\|1Y\|2Y\|ALL&benchmark=`), D62 |
| I | `GET /api/portfolios/merged` | promoted from stub: aggregated snapshots across the user's portfolios |
| J | `GET /api/portfolios/:id/risk-metrics` | sharpe/sortino/calmar, volatility, maxDrawdown, winRate + MWR withhold rules, D63 |
| K | `GET /api/portfolios/:id/dividends` | holdings × instruments dividend history within holding windows, D64 |
| K | `GET /api/portfolios/:id/calendar` | holdings × instruments earnings/ex-div calendar (upcoming/past split), D64 |
| K | `GET /api/portfolios/:id/compare` | positions enriched with instruments metrics (P/E, weight), D64 |
| — | `GET /api/portfolios/:id/news` | **permanent empty-valid stub** (AGENTS skip list: news screens not built); `{ data: [], total: 0 }` |
| G | `GET/POST /api/portfolios/shares`, `DELETE /api/portfolios/shares/:id` | share links; 10-active limit (422 LimitReached like mock); delete always allowed |
| G | `GET /api/public/portfolios/:shareId` | **auth-exempt**; increments `view_count`; honors `privacySettings` when projecting positions |

### D56 — ledger-first transaction math

All writes happen in ONE sql transaction: insert/update `portfolios.transactions` →
mutate affected `positions` row(s) → adjust `portfolios.portfolios.total_invested` →
write/remove the paired `wallets.wallet_transactions` cash row (D57) → bump wallet
balances. After any edit/delete, a **recompute helper** rebuilds the affected position's
quantity/average cost/realized P/L and the parent totals strictly from the transaction
ledger (self-healing, same philosophy as wallets D18 balance math).

- **BUY**: `total_amount = qty × price`; `fees_settled` resolved per D28 (fixed →
  amount in `feeCurrency` settled into tx ccy via `fee_exchange_rate`; pct →
  `notional × pct/100`, fee currency ignored). Cost basis adds
  `qty × price + fees_settled` to the targeted lot (moving-average merge).
- **SELL**: targets `positionId` when given, else FIFO across open lots of the symbol.
  `realized_gain_loss = qty × price − qty × avg_cost − fees_settled`; reduces lot
  quantity; zero-quantity lots auto-close. Oversell (> open quantity) → 422.
- **DIVIDEND**: no position mutation; credits the linked wallet (D57) with a `DIVIDEND`
  row; `taxes` subtracted in the cash amount.
- **Manual rates** (D29): `rateSource='manual'` ⇒ provided `exchangeRate` drives
  `converted_*` outputs verbatim; nonpositive/nonfinite → 422. `automatic` ⇒ snapshot
  from `fx_rates` at write time (D21 semantics — historical values never drift).
- **Enrichment**: `sector`/`country`/`industry`/`company_name` captured at write time
  from the instruments profile (best effort, cached per symbol) so transaction listings
  never need runtime fan-out (mirrors the mock's enrichTx, minus repeated lookups).

### D57 — cash movement integration (D19, in-process form)

Buy/sell/dividend write the wallet-side rows directly (same DB, same transaction):

| Trade | Wallet ledger row | Cash amount (wallet ccy) | Reference |
| --- | --- | --- | --- |
| BUY | `INVEST` | −(`total_amount` + `fees_settled`) | `PORTFOLIO_BUY_<SYMBOL>_<txId>` |
| SELL | `SELL` | +(`total_amount` − `fees_settled`) | `PORTFOLIO_SELL_<SYMBOL>_<txId>` |
| DIVIDEND | `DIVIDEND` | +(amount − taxes) | `PORTFOLIO_DIVIDEND_<SYMBOL>_<txId>` |

The existing `uq_wtx_reference` unique index gives idempotency for free. When the
portfolio has no `wallet_id` (or the wallet ccy ≠ tx ccy), the conversion uses
`@marx2/contracts/fx` against `fx_rates` at write time and snapshots the rate on the
cash row. **No overdraft rejection for buys** (example-service lets cash go negative; parity wins
— wallets withdrawals keep their own overdraft guard). Editing/deleting a portfolio
transaction updates/removes the paired rows by `reference`, keeping both ledgers in
lockstep without the HTTP retry protocol D19 once anticipated.

### D58 — valuation via the provider tier

Positions need live prices. The wallets container gains `API_INSTRUMENTS_URL` and a thin
adapter calling `GET /api/instruments/:symbol/quote` (batch loop over distinct symbols,
short-TTL in-memory cache):

- On positions/allocation/detail reads: refresh stale quotes (`price_as_of` older than
  market-hours threshold), persist snapshot columns, derive `market_value`,
  `unrealized_gain_loss`, `day_change[_percent]`, `percentageChange`,
  `percentOfPortfolio`.
- Instruments unreachable/staleness overflow → serve last stored price with
  `priceSource: 'fallback'` (never fail the read).
- Display-currency conversions use `@marx2/contracts/fx` + in-process `fx_rates`
  (D27/D21) — no new FX infrastructure.
- Logos for held-stocks come from the existing `/api/logos/:symbol` (already real).

### D59 — authorization, guards, deviations

- **User scoping** mirrors D24: `user_id` filter on every query; foreign resources → 404.
- **Guarded portfolio delete**: 409 Conflict while the portfolio has any transaction or
  open position; cascades shares otherwise. Deliberate deviation from the mock's silent
  drop — same rationale as wallets D18.
- **Position PATCH restricted to metadata** (quantity/cost go through transactions) —
  keeps the ledger authoritative; the SPA's EditPositionDialog already records
  additional transactions rather than mutating lots, so no frontend change is needed.
- Share links: deleting a share is unconditional; creating enforces the mock's
  10-active-shares limit (422 `LimitReached`).
- Public share route is registered auth-exempt (like `/api/currencies`) and projects
  positions through `privacySettings`.

### D60 — rollout: stubs first, flip once, retire later

1. Everything ships behind the unchanged gateway (still mock) while PGlite tests +
   a `scripts/portfolios-stack-test.mjs` (pattern: `wallets-stack-test.mjs`) prove the
   surface contract-first against the wallets container directly.
2. **Single flip step** (Phase F): `deploy/services.env` — `/api/portfolios` +
   `/api/public/portfolios` locations → `${API_WALLETS_URL}`, delete
   `API_PORTFOLIOS_URL`; stack-test runs both modes; full e2e suite green against the
   dockerized stack (SPA keeps calling identical paths/shapes — zero client changes).
   Analytics endpoints answer valid-empty content between F and their phases.
3. Cluster cutover happens **once, at the end** (Phase L): ingress paths →
   `portfoliost-wallets:3000` plus the separated snapshot Kubernetes Jobs (D61) — the
   cluster keeps
   serving the mock for `/api/portfolios` until the whole surface (analytics included)
   is real, so production users never see a half-built tab.
4. Mock handlers stay in place until L completes, then `mocks/portfolios/index.js` is
   retired like prior modules.

## Analytics & charting design (planned now, executed in Phases H–K)

The SPA's Performance tab (`PortfolioPerformanceTab`) consumes `PortfolioAnalytics`
(timeSeries line chart, monthly returns, ratio strip) and the detail header consumes
summary metrics. All of it derives from one data foundation plus pure math over stored
series — no runtime provider fan-out on read paths.

### D61 — value snapshots: the analytics source of truth

- **What**: nightly EOD row per portfolio per day in `portfolios.value_snapshots`
  (D54): `value` (positions × closing prices, converted into the portfolio's
  `base_currency` via `fx_rates` carry-forward), `invested` (cumulative net invested
  capital), `net_flow` (external cash that day — deposits/withdrawals through the linked
  wallet attributed to the portfolio, not trade-internal cash).
- **How**: `src/scripts/snapshots.ts` (pattern: existing `fx-sync.ts`) — iterate user
  portfolios, price each open position via the instruments adapter using historical
  close (`/price?date=` first, quote fallback for today), aggregate, upsert. Idempotent;
  safe to re-run any range.
- **Backfill on read**: an analytics query missing date ranges triggers a bounded
  backfill (max N days per request) before serving — same lazy-gap pattern as wallets
  FX imports. Portfolios created mid-history simply start their series at creation.
- **Cadence & execution model**: jobs run as **separated Kubernetes Jobs** (D11 job-pod
  pattern) — the API server never runs a scheduler loop. Each task gets its own Job
  manifest in the module's cluster dir (`job-snapshots.yaml`: same module image,
  command override → `node dist/scripts/snapshots.js`), so runs are isolated, rerunnable,
  and independently observable (`kubectl get jobs -l app=portfoliost-wallets-job`). The
  nightly trigger is a thin scheduler layer recreating that Job (~22:00 UTC, after US
  close); ad-hoc backfills are the same Job re-applied with explicit `--from/--to`
  date args. Compose (dev): the same script runs once at container boot — one code
  path, two triggers. Weekends/holidays: no rows (carry-forward handled by readers via
  `resolveRate`-style helpers, mirroring FX behavior).

### D62 — performance analytics & charting endpoint

`GET /api/portfolios/:id/analytics?timeframe=6M|1Y|2Y|ALL&benchmark=` →
`PortfolioAnalytics`, computed purely from snapshots + transaction ledger:

- `timeSeries`: daily `{date, value}` from `value_snapshots`, timeframe-windowed;
  `ALL` starts at first snapshot.
- Return family (all in base currency):
  - `simpleReturnPercent = (end − start) / start`;
  - `investmentReturnPercent` vs cumulative `invested`;
  - `totalReturn = end − invested`; `realizedGains` from SELL ledger sums,
    `unrealizedGains` from open positions;
  - `timeWeightedReturn` chained from daily sub-period returns excluding `net_flow`
    days; `moneyWeightedReturn` via XIRR over flows (null +
    `moneyWeightedReturnWithheldReason` when <2 flows or <30d history — the withhold
    pattern the schema already anticipates);
  - `annualizedReturn` from TWR over elapsed years (same withholding rule);
  - `currencyImpactPercent` = base-ccy return minus instrument-ccy return, both derived
    from snapshots vs ledger at historical `exchange_rate`s (D21 snapshots make this
    deterministic);
- `monthlyReturns`: month-over-month chained TWR;
- `benchmarks[]`: requested benchmark (default SPY; QQQ/IWM allowed) priced via the
  instruments `/history` adapter over the identical window, normalized to the same
  start value so the UI overlays percentage moves — mirrors instruments' compare
  alignment (T5d);
- `portfolioCurrency` = `base_currency`.

`GET /api/portfolios/merged` (promoted from its stub): same pipeline with
per-date-summed snapshots across all of the user's portfolios (flows netted across
portfolios), powering the InvestmentsView merged chart.

`externalCapital*` on total-metrics/summary-metrics promoted from null: basis = net
deposits into linked wallets since the portfolio's first transaction
(`externalCapitalBasisSource: 'wallet-deposits'`); suppressed-with-reason when no
linked wallet exists (schema fields already nullable).

Charting note: the standalone `/api/charting/*` module (instrument comparison) is
unaffected; portfolio charts are served by this endpoint alone.

### D63 — risk metrics & trade statistics

`GET /api/portfolios/:id/risk-metrics?timeframe=` → `PortfolioRiskMetrics` from the
same series (shared computation service with D62, one implementation):

- daily returns → annualized `volatility` (stddev × √252);
- `maxDrawdown` peak-to-trough on the windowed series;
- `sharpeRatio` (rf constant, default 0, env-tunable), `sortinoRatio` (downside dev),
  `calmarRatio` (CAGR / maxDrawdown);
- `periodReturnPercent`, `annualizedReturn` (+withhold rules), `moneyWeightedReturn`
  (+withhold rules);
- `winRate`/`winCount`/`lossCount` (analytics payload) from closed SELL lots:
  `realized_gain_loss > 0` counts a win — trade-level truth, not daily noise.

Pure functions over `(series, flows)` ⇒ unit-testable against hand-computed fixtures;
property tests reuse the fx triangle discipline where conversion applies.

### D64 — derived content: dividends, calendar, compare

Composition over holdings × instruments research (all reads cached per symbol/day):

- `/dividends`: for each open-or-closed holding, fetch instruments `/dividends/:symbol`,
  keep payments inside `[opened_at, closed_at|now]`, project
  `{symbol, companyName, date, year, amount, currency, type}`, sort desc, aggregate
  `{totalDividends, count, items}`;
- `/calendar`: instruments `/calendar/:symbol` earnings/ex-dividend events filtered to
  current holdings, split `upcoming`/`past` (past capped at 50 like the mock);
- `/compare`: positions weighted into `{totalValue, items[]}` rows enriched with
  instruments overview/metrics (P/E, market cap, sector) — the mock sourced the same
  fields from research files;
- summary-metrics `cumulativeDividends`/`income` switch from DIVIDEND transactions to
  these composed figures once Phase K lands (one source, no double counting: ledger
  rows record what was received; composition projects what holdings would have paid).

## Implementation plan

One step = one commit; a step is done only when its tests pass (wallets-module PGlite
unit tests + stack checks pre-flip; frontend build/unit/mock unaffected until the flip
step, then the full suite). Subtasks within a step may still be separate commits, but a
step never mixes domains.

### Phase A — foundation (schemas, seeds, harness)
- [ ] A1 `portfolios` pgSchema in `src/db/schema.ts` (4 tables per D54) + drizzle migration; PGlite schema test
- [ ] A2 dev seeds from `mocks/shared/data/raw/portfolio*.json` (schema-qualified, count-checked, seed skipped in prod CMD)
- [ ] A3 `scripts/portfolios-stack-test.mjs` scaffold (health/meta + placeholder checks); compose untouched

### Phase B — portfolio CRUD
- [ ] B1 `POST /api/portfolios` (422 rules, prefs default, wallet validation) + `GET /api/portfolios` + `/light`
- [ ] B2 `GET/PATCH /api/portfolios/:id` with computed `metrics` + position summaries (404 scoping)
- [ ] B3 `DELETE` guarded per D59 (409 copy)
- [ ] B4 stack-test: CRUD round-trips; unit tests incl. multi-user isolation

### Phase C — transaction actions (write path)
- [ ] C1 `POST /:id/transactions` BUY/SELL/DIVIDEND — fee-fx resolution via `services/fee-fx.ts`, D56 math, 422 matrix (oversell, bad manual rate, unknown symbol-less DIVIDEND)
- [ ] C2 position mutation + portfolio total updates in one SQL tx; FIFO fallback; synthesized opening lot for manual position add
- [ ] C3 wallet cash integration (D57 references, balance math, cross-currency settlement via fx)
- [ ] C4 `PATCH`/`DELETE` transaction with full recompute (position, totals, paired wallet rows by reference)
- [ ] C5 position `PATCH` (metadata-only 422 rule) + soft-close `DELETE`
- [ ] C6 unit tests: fee/pct/manual-rate propagation, realized P/L, oversell, recompute idempotence, wallet lockstep; stack-test write flows

### Phase D — history display
- [ ] D1 `GET /:id/transactions` — pagination + `type`/`positionId` filters + mock sort-field map
- [ ] D2 `GET /portfolios/transactions` cross-portfolio feed (`sortBy`/`sortOrder`)
- [ ] D3 export endpoint (paginated JSON, `format` echo)
- [ ] D4 tests: pagination shape parity, filter combos, sort stability; stack-test read flows

### Phase E — positions & allocation reads
- [ ] E1 positions read pipeline: stored columns → quote refresh (D58 adapter, staleness + fallback) → derived fields
- [ ] E2 `/positions/bare` + `/positions/cfd-hints` projections
- [ ] E3 `/:id/allocation` aggregation
- [ ] E4 tests: quote-refresh caching/fallback, derived-field math; stack-test

### Phase F — flip to real (gateway + compose)
- [ ] F1 stub audit: every Phase-F/later endpoint answers valid empty content (list below D55)
- [ ] F2 services.env + gateway template change (drop `API_PORTFOLIOS_URL`, add public-shares location), wallets env gains `API_INSTRUMENTS_URL`; compose rebuilt
- [ ] F3 stack-test both modes (distinguishing checks); full frontend suite: build · unit · mock · e2e green against flipped stack
- [ ] F4 docs sweep: README + mocks/README tables, MODULARISATION pointer

### Phase G — aggregates & shares
- [ ] G1 `total-metrics` + `held-stocks` + `merged/light` from real data
- [ ] G2 `summary-metrics` + `snapshot` computed subsets (externalCapital*/historyCoherence null-safe)
- [ ] G3 shares CRUD (10-limit, privacy jsonb defaults) + auth-exempt public route with view-count
- [ ] G4 tests incl. privacy projection + limit; stack-test

### Phase H — analytics foundation (executed last, per D61)
- [ ] H1 `value_snapshots` migration + PGlite schema test
- [ ] H2 snapshot service: positions × historical closes (instruments `/price?date=`, quote fallback) × fx carry-forward → base-currency rows; idempotent upserts
- [ ] H3 `src/scripts/snapshots.ts` + compose boot wiring; bounded backfill-on-read helper
- [ ] H4 tests: re-run idempotence, gap backfill limits, mid-history creation start, multi-currency aggregation

### Phase I — performance analytics & charting endpoint (D62)
- [ ] I1 shared series/returns service: TWR chaining, XIRR/MWR, annualization, withhold reasons, monthly returns
- [ ] I2 `GET /:id/analytics` (+benchmark normalization via instruments `/history`, instruments-compare alignment pattern)
- [ ] I3 promote stubs: `/merged` aggregated snapshots; `externalCapital*` wallet-deposit basis
- [ ] I4 fixture tests (hand-computed series), property tests, stack-test

### Phase J — risk metrics (D63)
- [ ] J1 `GET /:id/risk-metrics`: volatility/maxDrawdown/sharpe/sortino/calmar/win-rate from the shared service
- [ ] J2 tests incl. withholding rules and empty-history edge; stack-test

### Phase K — derived content (D64)
- [ ] K1 dividends composition within holding windows
- [ ] K2 calendar composition (upcoming/past split)
- [ ] K3 compare enrichment from instruments metrics
- [ ] K4 summary-metrics income/cumulativeDividends source switch; tests + stack-test

### Phase L — cluster cutover + closeout
- [ ] L1 homelab: ingress paths `/api/portfolios` + `/api/public/portfolios` → `portfoliost-wallets:3000`; separated snapshot Kubernetes Job manifest (D11 job-pod, nightly trigger, rerunnable `--from/--to`)
- [ ] L2 live verification: `/__meta`, CRUD + transactions + analytics through host; e2e suite green
- [ ] L3 plan.md marks; proposal status → Implemented; retire `mocks/portfolios/index.js` handlers; final docs sweep

## Resolved questions

1. **Separate module vs wallets extension** — settled: extension (D53). Revisit only if
   the wallets service needs independent scaling (it won't at homelab scale).
2. **Overdraft on buys** — settled: allowed (example-service parity); wallets withdrawals keep
   their guard.
3. **Direct position edits** — settled: metadata-only via PATCH; quantities change
   exclusively through transactions (D59).
4. **Mock removal timing** — settled: single retirement at Phase L, once analytics is
   real (D60.4) — the cluster stays on the mock for this area until then.
5. **Analytics scope** — settled: designed in this proposal (D61–D64), scheduled last
   (Phases H–K) so the interactive core (CRUD → trades → history) ships first without
   blocking analytics design on implementation learnings.
