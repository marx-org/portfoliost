# Proposal: wallets & transactions module (`portfoliost-wallets`)

**Status**: draft (2026-08-24)
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
  currency      char(3) NOT NULL,                 -- ISO 4217, wallet base currency
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
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wtx_wallet ON wallets.wallet_transactions (wallet_id, executed_at DESC);
CREATE INDEX idx_wtx_user_recent ON wallets.wallet_transactions (portfolio_id);

-- FX storage, owned by this module (D20). EUR-based daily closes.
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
- `CHECK` constraints instead of PG enums — adding types later must not need a migration dance.
- `exchange_rate` nullable: legacy/single-currency rows may skip it; UI treats null as "no conversion".
- Seed path reuses `mocks/shared/data/raw/wallets.json` so dev/mock-parity tests stay meaningful.

### D18 — endpoint map (all 14 contract endpoints)

| Endpoint | Logic | Contract notes preserved |
| --- | --- | --- |
| `GET /wallets` | list wallets for JWT user | includes `balance`, `availableBalance`, `isDefault` |
| `GET /wallets/total-balance` | convert all wallets → user base ccy at latest fx rate | `{totalBalance, totalAvailableBalance, baseCurrency, walletBreakdown[{original*, converted*, exchangeRate}]}` |
| `POST /wallets` | create (name, currency) | 201, zeroed balances |
| `PATCH /wallets/:id` | rename/settings | returns updated wallet |
| `DELETE /wallets/:id` | delete + cascade txns | blocked if referenced by a portfolio link (see D23 open question) |
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

### D21 — conversion semantics: snapshot on write, value at latest

Two distinct needs:

1. **Historical reporting** (transaction lists in base currency, performance over
   time) → uses the **rate of the transaction's date**, snapshotted into
   `exchange_rate` when the row is written. Rationale: providers retroactively
   revise series; snapshots keep the user's recorded history immutable. Null rate
   (same currency as base) renders without conversion.
2. **Current valuation** (balances, total-balance, chart "today") → always the
   **latest available rate**, computed at request time from `fx_rates`.

`balance-history`: deterministic reconstruction — opening balance + cumulative
signed sums per day from the ledger; when `baseCurrency ≠ wallet.currency`, each
day is converted at that day's carried-forward rate. Series start at wallet
creation (or `ALL` ⇒ earliest transaction).

Base currency resolution order: explicit `?baseCurrency=` → user preference
(`users_auth.user_preferences.ui_preferences.baseCurrency`, read via users-auth
internal endpoint or duplicated into wallets at write time — open question Q3)
→ wallet currency if single wallet → `USD`.

### D22 — cross-currency transfers

Same-currency transfers behave exactly like today (mirror legs). When
`from.currency ≠ to.currency`:

- debit source by `amount` (its own currency);
- credit destination by `amount × rate(from→to, transfer_date)`;
- both legs linked via `linked_tx_id`; the incoming leg stores the applied
  `exchange_rate` and its own currency;
- fees always charged in the source currency;
- response echoes both amounts + rate so the UI can show "1000 USD → 3 9xx PLN".

Alternative considered: let the user type the target amount manually (some brokers
do). Rejected for v1 (more UI churn); can be layered later as `to_amount` optional
field — the ledger shape above supports it unchanged.

### D23 — open questions

1. **Q1 — rate sourcing** (see D20): agree with ECB/frankfurter-primary +
   openst/cachest-fallback split?
2. **Q2 — default base/display currency**: USD (example-service parity) or user-settable
   with PLN-friendly default?
3. **Q3 — where does the user's base currency preference live**: users_auth
   preferences (read via internal call per request) vs copied/denormalized into
   wallets at profile-update time?
4. **Q4 — delete-guard for wallets referenced by portfolios**: wallets calls a
   portfolios internal endpoint at delete time (runtime coupling), or portfolios
   listens for deletion events? Decided properly when portfolios lands; v1 ships
   the naive delete.
5. **Q5 — INVEST rows editable?** Mock allows editing them; real systems usually
   forbid editing trade-derived cash rows. Proposal: allow edit/delete only for
   `DEPOSIT/WITHDRAWAL/TRANSFER/ADJUSTMENT`; reject others with 422.
