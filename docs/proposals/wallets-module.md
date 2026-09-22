# Proposal: wallets & transactions module (`portfoliost-wallets`)

**Status**: accepted (2026-08-24)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [instruments-provider-module.md](instruments-provider-module.md) (D12–D15), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: third extracted backend module. Owns the cash-wallet domain: wallets, cash transactions (deposits/withdrawals/transfers), the unified recent-transactions feed, balance history, and multicurrency support (FX rate storage + conversion). Investment portfolios come later and will consume this module's internal cash-movement API.

## Context

The example-service contract defines 14 wallet endpoints (`/api/wallets*` per
`portfoliost-contracts/openapi.yaml` Wallets tag). The mock (`mocks/wallets/index.js`)
is the behavioral reference. Today everything is single-currency-by-convention
(`currency` per wallet exists, but totals sum raw amounts and `exchangeRate`
fields are always `null`). This proposal makes multicurrency real:

- every wallet has one base currency; transactions are stored in the wallet's currency;
- a per-user **display/base currency** aggregates all wallets (`total-balance`);
- historical FX rates are stored locally so past values never drift when providers revise data.

### D16 — module identity (per MODULARISATION.md naming table)

| Dimension | Value |
| --- | --- |
| Module name | `wallets` |
| Repo | `Marx2/portfoliost-wallets` |
| Image | `ghcr.io/marx2/portfoliost-wallets` |
| Compose service / container | `wallets` |
| K8s HelmRelease/controller | `portfoliost-wallets` |
| Env key | `API_WALLETS_URL` |
| Postgres schema | `wallets` |
| Stack | Hono + Drizzle + Postgres + PGlite tests + jose (copy users-auth skeleton) |
| Standard routes | `/health`, `/__meta`, `/internal/verify` |

Gateway owns routing `/api/wallets/*`; auth identical to instruments (JWT JWKS,
`X-User-*` compose fallback).

### D17 — database tables (schema `wallets`)

Ledger-first: `wallet_transactions` is the source of truth; balances are kept
denormalized on `wallets` for cheap list/total queries and updated in the same SQL
transaction as the ledger insert. Amounts are **signed** in the wallet currency
(deposit/inflow positive, withdrawal/outflow negative).

```sql
CREATE TABLE wallets.wallets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL,                    -- from JWT sub
  name          text NOT NULL,
  currency      char(3) NOT NULL,                 -- ISO 4217: settlement currency (cash held)
  base_currency char(3) NOT NULL DEFAULT 'USD',   -- display/valuation ccy (D21b); default from user prefs at creation
  balance       numeric(20,8) NOT NULL DEFAULT 0, -- denormalized, ledger-maintained
  available_balance numeric(20,8) NOT NULL DEFAULT 0, -- = balance - reserved (reserved stays 0 until portfolio integration)
  reserved      numeric(20,8) NOT NULL DEFAULT 0,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallets_user ON wallets.wallets (user_id);

CREATE TABLE wallets.wallet_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,                 -- denormalized owner (D24): direct authz on every tx op
  wallet_id        uuid NOT NULL REFERENCES wallets.wallets(id),
  type             text NOT NULL CHECK (type IN
                     ('DEPOSIT','WITHDRAWAL','TRANSFER','INVEST','SELL',
                      'DIVIDEND','FEE','INTEREST','ADJUSTMENT')),
  amount           numeric(20,8) NOT NULL,        -- signed, wallet currency
  currency         char(3) NOT NULL,              -- wallet currency at execution time
  status           text NOT NULL DEFAULT 'completed',
  description      text,
  transaction_date date,                          -- user-provided value date
  executed_at      timestamptz NOT NULL DEFAULT now(),
  payment_method   text,
  fees             numeric(20,8),
  fees_type        text CHECK (fees_type IN ('fixed','percent')),
  taxes            numeric(20,8),
  to_wallet_id     uuid REFERENCES wallets.wallets(id),   -- TRANSFER destination
  linked_tx_id     uuid REFERENCES wallets.wallet_transactions(id), -- transfer pair
  reference        text,                          -- e.g. PORTFOLIO_BUY_AAPL.US_<uuid>
  portfolio_id     uuid,                          -- set on INVEST/SELL/DIVIDEND rows
  exchange_rate    numeric(20,10),                -- D21 snapshot: wallet ccy -> user base ccy at execution
  rate_source      text NOT NULL DEFAULT 'automatic'
                     CHECK (rate_source IN ('automatic','manual')),
                   -- 'automatic': derived from fx_rates at write; 'manual': user-provided
                   -- (wire format finalized by fees-and-custom-fx.md D29)
  fee_currency     char(3),                       -- D28 (fees-and-custom-fx): default = transaction ccy
  fee_rate_source  text NOT NULL DEFAULT 'automatic'
                     CHECK (fee_rate_source IN ('automatic','manual')),
  fee_exchange_rate numeric(20,10),               -- settles foreign-currency fees into wallet ccy
  transfer_fx_rate numeric(20,10),                -- D22: from-ccy -> to-ccy rate applied on cross-currency
                                                   -- transfers; stored on BOTH legs of the pair
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wtx_wallet ON wallets.wallet_transactions (wallet_id, executed_at DESC);
CREATE INDEX idx_wtx_user_recent ON wallets.wallet_transactions (user_id, executed_at DESC);

-- FX storage, owned by this module (D20). EUR-based daily closes.
-- NOTE: fx_rates / fx_sync_state are GLOBAL reference data — not user-scoped (D24).
CREATE TABLE wallets.fx_rates (
  rate_date     date NOT NULL,
  currency      char(3) NOT NULL,                 -- quote currency; base is always EUR
  rate          numeric(20,10) NOT NULL,          -- 1 EUR = rate units of currency
  source        text NOT NULL DEFAULT 'ecb',      -- 'ecb' | 'provider' | 'manual'
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_date, currency)
);

CREATE TABLE wallets.fx_sync_state (
  id            int PRIMARY KEY DEFAULT 1,        -- singleton row
  last_rate_date date,
  last_run_at   timestamptz,
  last_status   text
);
```

Notes:
- **Currency is mandatory everywhere**: `wallets.currency` (settlement) and
  `wallet_transactions.currency` are `NOT NULL`; the API rejects wallet creation
  without an explicit currency (422 — the mock's silent `USD` default is not carried over).
- `CHECK` constraints instead of PG enums — adding types later must not need a migration dance.
- `exchange_rate` nullable: legacy/single-currency rows may skip it; UI treats null as "no conversion".
- Seed path reuses `mocks/shared/data/raw/wallets.json` so dev/mock-parity tests stay meaningful.

### D18 — endpoint map (all 14 contract endpoints)

| Endpoint | Logic | Contract notes preserved |
| --- | --- | --- |
| `GET /wallets` | list wallets for JWT user | includes `balance`, `availableBalance`, `isDefault` |
| `GET /wallets/total-balance` | convert all wallets → user base ccy at latest fx rate | `{totalBalance, totalAvailableBalance, baseCurrency, walletBreakdown[{original*, converted*, exchangeRate}]}` |
| `POST /wallets` | create (name, **currency required** — 422 when missing; `baseCurrency` optional, defaults from user prefs per D21b) | 201, zeroed balances |
| `PATCH /wallets/:id` | rename/settings | returns updated wallet |
| `DELETE /wallets/:id` | **Guarded delete (D24 rule)**: allowed only when the wallet has zero ledger rows AND is not referenced by any portfolio link; otherwise 409 Conflict | within the wallets domain, zero transactions already implies unreferenced — any inbound transfer leg would itself be a row; the portfolio-link check activates when that module lands |
| `POST /wallets/:id/deposits` | insert DEPOSIT row + bump balance | responds `new_balance` |
| `POST /wallets/:id/withdrawals` | overdraft guard → WITHDRAWAL row | responds `remaining_balance`; 422 if insufficient |
| `POST /wallets/:id/transfers` | two linked rows (out w/ fees, in converted) | same-currency: mirror of mock; cross-currency: D22 |
| `GET /wallets/:id/balance-history` | reconstruct daily series from ledger; optional `?currency=` converts per-date | period param `1D…ALL` |
| `GET /wallets/:id/transactions` | paginated ledger for wallet | `paginatePage` shape |
| `GET /wallets/transactions` | paginated ledger across user's wallets | same shape |
| `GET /wallets/recent-transactions` | unified feed incl. INVEST rows written by portfolios (D19) | signed string amounts, `displayLabel`, `isInternalTransfer` |
| `PATCH /wallets/transactions/:txId` | edit fields; re-sign amount per type | type→label mapping like mock |
| `DELETE /wallets/transactions/:txId` | delete row; reverse its balance effect | 204 |

Editing/deleting a transaction must recompute affected wallet balances from the
ledger delta (single UPDATE … recomputing SUM, or compensating entries) — the
mock's naive override approach is replaced by real ledger math.

### D19 — unified recent-transactions feed (cross-module, push model)

`recent-transactions` mixes cash activity with portfolio trades (INVEST rows,
`reference: PORTFOLIO_BUY_<symbol>_<id>`, `portfolioId`). Wallets cannot read the
future portfolios schema, and gateway-side composition doesn't exist — so:

- **Portfolios pushes cash movements into wallets.** On buy/sell/dividend/fee the
  portfolios module calls `POST /internal/cash-movements` (JWT-verified service-to-service
  or network-trusted internal route, mirroring `/internal/verify` conventions):
  `{walletId, type, amount(signed), currency, description, reference, portfolioId,
  transactionDate, fees, taxes}`.
- Wallets inserts the ledger row + adjusts balance exactly like a native transaction.
- `recent-transactions` becomes a plain indexed query — no runtime fan-out, no
  eventual-consistency window on reads.
- Failure mode: portfolios trade succeeded but push failed → portfolios retries
  (at-least-once); wallets dedupes on `(reference)` unique index.

This makes wallets the **owner of the cash ledger** for the whole system, which the
multicurrency requirements need anyway.

### D20 — FX rates: local store, ECB primary, provider tier fallback

Requirements: arbitrary wallet currencies, full history from first deposit,
deterministic past values, daily freshness. Rates are stored **locally** in
`fx_rates` (EUR-based) so charts/valuations never depend on external uptime, and
imports are reproducible.

Sourcing chain:

1. **Primary — ECB via frankfurter.dev** (free, no key, wraps ECB daily reference
   rates): one HTTP call imports full history back to 1999
   (`GET /v1/{start}..{end}?base=EUR&symbols=USD,PLN,…`), then a daily incremental
   fetch. Coverage ≈ 30 currencies: USD, PLN, CHF, GBP, JPY, CZK, HUF, SEK, DKK,
   NOK, CNY, etc. Published ~16:00 CET on business days only.
2. **Fallback — provider tier (openst → cachest)** for anything ECB lacks
   (exotics, crypto-cash): extend openst with an fx route backed by yfinance
   (`EURPLN=X` style tickers) and/or FMP fx-eod, cached by cachest. Aligns with the
   provider-tier-first rule (AGENTS.md); translation adapter lives in wallets (D2).
   Backfills gaps on demand: any query hitting a missing (date, currency) range
   triggers a bounded backfill before serving.
3. **Manual escape hatch** (`source='manual'`) for currencies nothing covers —
   admin-inserted rows win until overwritten.

Update cadence: cluster CronJob (same pattern as `tickersync`) at ~17:00 CET +
lazy backfill on read. Weekends/holidays: **carry forward** the last published
rate, flagged by `fetched_at`/absence of newer rows; conversions never fail due to
non-business days. Cross-rate math: `A→B(d) = rate(d,B) / rate(d,A)` (both EUR-based).

Rejected alternatives: exchangerate.host (now paywalled/keyed),
OpenExchangeRates (key + tight free tier), NBP API (PLN-only view),
reusing the stooq-importer pipeline (bypasses the provider tier; fine as a manual
seed source, not as the live chain).

Internal exposure: `GET /internal/fx-rates?date=&from=&to=` serves other modules
(portfolios will need it later) without them touching the `wallets` schema.

Currency registry (fees-and-custom-fx D25/D26): the set of distinct currencies in
`fx_rates` IS the supported-currency list; wallets serves it publicly as
`GET /api/currencies` joined with display metadata from the contracts catalog.
The list auto-updates with every daily import — no separate registry to maintain.

> **Addendum (plan §48, ownership decision 2026-09-26):** the FX store has **moved
> out of wallets** — `fx_rates` + the importer now live in **instruments** (plan
> §48.1) and the wallets tables were dropped in prod 2026-09-22 (plan §48.6c).
> Wallets keeps *settlement* only — the D21 snapshot-on-write semantics are
> unchanged — and reads rates from instruments' `GET /api/internal/fx-rates`
> (plan §48.3b); an unresolvable pair degrades to 1:1 / null converted fields,
> exactly the old "no row in the table" behavior. The `GET /api/currencies` +
> `GET /api/fx/latest` / `GET /api/admin/fx-rates` endpoints moved with the table
> (plan §48.3a); gateway routing updated in §48.6a.

### D21 — conversion semantics: snapshot on write (auto or manual)

Two distinct needs:

1. **Historical reporting** (transaction lists in base currency, performance over
   time) → uses the **rate of the transaction's date**, snapshotted into
   `exchange_rate` when the row is written. Rationale: providers retroactively
   revise series; snapshots keep the user's recorded history immutable.
2. **Current valuation** (balances, total-balance, chart "today") → always the
   **latest available rate**, computed at request time from `fx_rates`.

Every snapshot records its origin in `rate_source`:

- `'automatic'` — derived from the stored `fx_rates` table at write time;
- `'manual'` — user-provided rate, stored verbatim. The API accepts it already
  (`exchangeRate` + `rateSource` on create/edit), full UX for manually delivered
  rates lands in a follow-up proposal.

Null `exchange_rate` (wallet ccy = base ccy) renders without conversion.

#### D21b — per-wallet/per-portfolio display currency, user preference as default

There is no single global reporting currency:

- each wallet (and later portfolio) carries its own `base_currency` (display/
  valuation currency), settable at creation and changeable on screens that offer a
  currency choice (wallet detail, main investments page);
- the **user's preferred default** lives in `users_auth.user_preferences`
  (`ui_preferences.baseCurrency`) and is applied as the pre-selected value:
  - when creating a new wallet/portfolio,
  - as the fallback for aggregate screens (`total-balance`) when nothing more
    specific is chosen.
- Wallets resolves the preference once per request via users-auth internal route
  (`GET /internal/preferences/:userId`); if absent → `USD`.

`balance-history`: deterministic reconstruction — opening balance + cumulative
signed sums per day from the ledger; converted per-day at carried-forward rates
when the wallet's `base_currency ≠ currency`. Series start at wallet creation
(or `ALL` ⇒ earliest transaction).

### D22 — cross-currency transfers: elastic storage

Same-currency transfers behave exactly like today (mirror legs). Cross-currency
transfers store **both amounts explicitly** instead of deriving one from a rate
rule — elastic by design, works for automatic and (later) manually negotiated rates:

- debit source by `amount` (source currency);
- credit destination by `target_amount` (target currency);
- `transfer_fx_rate` (source→target) stored on **both** legs of the pair
  (`linked_tx_id` links them);
- v1 auto-fills `target_amount = amount × rate(source→target, transfer_date)`
  from `fx_rates`; because both values are persisted, a future UI can accept a
  manually entered target amount/rate without schema changes;
- fees carry their own currency and rate per [fees-and-custom-fx.md](fees-and-custom-fx.md)
  (D28/D29): settled into the source wallet via `fee_exchange_rate`;
- response echoes source amount, target amount, and the applied rates.

### D23 — resolved questions

1. **Q1 — rate sourcing**: settled → ECB/frankfurter primary + openst/cachest
   fallback (D20).
2. **Q2 — base currency**: settled → per-wallet/per-portfolio `base_currency`,
   defaulted from user preferences at creation and on aggregate screens (D21b).
3. **Q3 — rate snapshots**: settled → store on the transaction row; `rate_source`
   distinguishes auto (from `fx_rates`) vs manual delivery (full UX in follow-up
   proposal) (D21).
4. **Q4 — transfers**: settled → elastic storage of source amount, target amount
   and `transfer_fx_rate` on both legs; fees settle per the fees-and-custom-fx
   companion proposal (D28–D29).
5. **Open for portfolios phase** — delete-guard for wallets referenced by a
   portfolio: runtime internal check vs event-driven; decide when portfolios lands.
6. **Open** — INVEST rows editable? Mock allows editing them; real systems usually
   forbid editing trade-derived cash rows. Proposal: allow edit/delete only for
   `DEPOSIT/WITHDRAWAL/TRANSFER/ADJUSTMENT`; reject others with 422.

### D24 — user-centric data model (multi-user from day one)

The application is multi-user enabled; wallets are strictly per-user:

- `users_auth` JWT `sub` is the ownership key. `wallets.user_id` is the primary
  scoping column; `wallet_transactions.user_id` denormalizes it so every
  transaction read/edit/delete authorizes in a single indexed lookup.
- **Every** SELECT/UPDATE/DELETE filters by the authenticated user — including
  nested resources: a valid JWT for wallet A cannot read or mutate wallet B; the
  response is 404 (resource "not found" for this user), matching example-service's
  error-copy style rather than 403.
- Aggregations (`total-balance`, `recent-transactions`, history) operate only on
  the caller's rows.
- Internal service routes stay explicit about ownership:
  `/internal/cash-movements` payloads carry the `userId` from the trade context
  and are validated against an existing wallet owned by that user;
  `/internal/fx-rates` serves global reference data only.
- `fx_rates` / `fx_sync_state` are global shared reference data (rates are not
  per-user); no user column, no user filtering.
