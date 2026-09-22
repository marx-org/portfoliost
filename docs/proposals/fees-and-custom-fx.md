# Proposal: FX rates & supported currencies first, then fees in own currency + custom (manual) rates

**Status**: accepted (2026-08-24)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [wallets-module.md](wallets-module.md) (D16–D24)
**Scope**: the FX-rate foundation and the supported-currencies registry come **first** (everything else consumes them), followed by contract + mock + SPA adjustments for fees and manual rates. Touches BOTH portfolio transactions and wallet cash transactions:

1. FX rate store: which rates we import, how they refresh, and the single source of truth for selectable currencies;
2. a fee may be denominated in a currency different from the transaction (default: transaction currency);
3. the user may supply a **custom exchange rate** for the transaction itself and for the fee — default mode `automatic`, exactly the `rate_source='manual'` path the wallets proposal reserved (D21/D22);
4. UI surfaces all of it; OpenAPI contract documents it; mock behaves accordingly.

## Context

Today (contracts + mock + SPA):

- No FX store exists anywhere; nothing defines WHICH currencies the system
  supports; every selector would have to hardcode a list.
- `Transaction` (portfolio) carries `fees: number` + `feesType: 'fixed'|'pct'`
  implicitly via request bodies; `exchangeRate` is a **required number that
  nothing populates meaningfully**; `convertedTotalAmount/convertedPrice/
  convertedFees` mirror raw values.
- `CashTransaction` carries `fees`/`fees_type` (nullable); wallet balance math in
  the mock subtracts `amount + fee` in the wallet's currency unconditionally.
- SPA (`AddPositionDialog`, `EditTransactionModal`, `WalletCashModals`) renders a
  fee input with a `%` toggle and computes the effective fee on the fly.

Real-world gaps closed: a PLN-based investor trading on a US exchange pays the
broker's fee in EUR, and the broker converts at **its own** rate — rarely the
market mid the system would pick automatically.

### D25 — FX rate foundation: local store, daily import

Owned by the wallets module (`fx_rates`, EUR-based daily closes — details in
[wallets-module.md](wallets-module.md) D20):

- **Primary source — ECB via frankfurter.dev** (free, no key): one-shot full
  history import back to 1999, then daily incremental fetch ~17:00 CET via
  cluster CronJob; carry-forward across weekends/holidays.
- **Fallback — provider tier** (openst → cachest, yfinance/FMP) fills currencies
  outside ECB coverage and lazy-backfills gaps on demand.
- The physical store lands with the wallets module (plan §11.7); until then a
  static demo rate table inside the mock plays the same role so §10 UI/contract
  work is final-form from day one.

> **Addendum (plan §48, ownership decision 2026-09-26):** `fx_rates` and the daily
> importer are now owned by **instruments** — FX is daily market data and lives in
> the same module as the price series (plan §48.1); the wallets
> `fx_rates`/`fx_sync_state` tables were dropped in prod 2026-09-22 (plan §48.6c).
> This decision stands as the original design; the current responsibilities are
> recorded in [instruments-provider-module.md](instruments-provider-module.md) (D84).

### D26 — available-currencies registry (single source of truth)

All currency selectors (fee currency, wallet creation, base-currency picks,
later portfolio settings) consume ONE registry:

- **Availability SoT = the `fx_rates` table** — we support exactly the currencies
  we can import rates for; the set refreshes automatically with every daily FX
  import (a currency appears in `fx_rates` ⇒ selectable; nothing else to maintain).
- **Display metadata** (name, symbol, minor units, popular flag) is a static
  catalog in `portfoliost-contracts` (`currencies.yaml` → generated TS) keyed by
  ISO code; the endpoint joins dynamic availability with this metadata.
- Long-term served by the wallets module (owner of `fx_rates`; gateway routes
  `/api/currencies` → `API_WALLETS_URL`). Interim (§10, pre-wallets): the mock
  serves the same shape from its demo rate table.
- SPA fetches once per session and caches; selectors never hardcode lists.

> **Addendum (plan §48, ownership decision 2026-09-26):** the availability SoT and
> `GET /api/currencies` (along with `GET /api/fx/latest`) are now served by
> **instruments** — the gateway routes `/api/currencies` + `/api/fx` →
> `API_INSTRUMENTS_URL` (plan §48.3a/§48.6a). Semantics are unchanged: availability =
> the currencies present in `fx_rates` (now in the instruments schema) + the static
> contracts display-metadata catalog; SPA behavior is unchanged (fetch once, never
> hardcode).

### D27 — uniform FX conversion helper (shared, pure, one formula everywhere)

Cross-rate math (`A→B = rate(B)/rate(A)`, both EUR-quoted) is needed by the mock
settlement (D32), wallet transfers (wallets D22), balance-history per-date
conversion (wallets D21), total-balance aggregation, SPA live totals (D30), and
later portfolios — so it lives in **one place**: `src/fx.ts` in
`portfoliost-contracts` (zero-dependency TypeScript, consumed by SPA and every
Hono module alike).

```ts
convert(amount, from, to, ratesForDate)        // cross via EUR; identity when from === to
resolveRate(from, to, series, { maxStaleness }) // carry-forward aware, returns { rate, asOf }
settleFee(feeAmount, feeCcy, walletCcy, rates)  // fees_settled semantics (D27 fee settlement)
roundMinor(amount, minorUnits)                  // ISO 4217 minor units (JPY=0, USD=2, ...)
```

Owned edge cases: missing-rate carry-forward with staleness limit, same-currency
and EUR shortcuts, single rate convention ("1 EUR = X units of ccy"), manual-rate
validation (>0, finite), minor-unit rounding. Pure functions ⇒ property-testable
(`A→B × B→A ≈ 1`, triangle identity through EUR).

UI note: the SPA uses it synchronously for live totals; the rate table for
preview comes from the mock's demo endpoint now and from real rates once wallets
ships — server responses remain authoritative.

### D28 — fee currency (default = transaction currency)

- New optional field **`feeCurrency`** on every fee-bearing transaction
  (portfolio buy/sell; wallet deposit/withdraw/transfer). When omitted it
  defaults to the transaction's currency — API-side default AND UI preselection.
- `feesType` semantics unchanged: `pct` fees remain a percentage of the
  transaction notional calculated on the fly; a percentage has no independent
  currency, so `feeCurrency` is ignored/derived for `pct` and only meaningful
  for `feesType: 'fixed'`.
- Ledger/settlement view (used by balances once real modules land): the cash
  impact of a fee is its **settled amount in the wallet's currency**
  (`fees_settled`). Same-currency fees settle 1:1; foreign-currency fees settle
  via the fee's exchange rate (D29). Until then the mock settles with a static
  demo rate table (D32) and records what it used.

### D29 — custom exchange rates with `automatic` default

Two independent rate slots per transaction — one for the main amount, one for
the fee:

| Slot | Source flag | Rate value | Meaning |
| --- | --- | --- | --- |
| main amount | `rateSource: 'automatic'\|'manual'` (default `automatic`) | `exchangeRate` (now nullable) | converts transaction currency ↔ display/base currency |
| fee | `feeRateSource` (same enum, default `automatic`) | `feeExchangeRate` (nullable) | converts fee currency ↔ wallet/transaction currency |

Semantics:

- `manual` ⇒ the provided rate IS the truth: all converted outputs
  (`convertedTotalAmount`, `convertedPrice`, `convertedFees`, wallet settlement,
  later `exchange_rate` snapshots in the wallets schema) are derived from it.
  Validation: rate > 0, finite; supplied-but-nonpositive → 422.
- `automatic` ⇒ system resolves the rate (provider/fx store at write time once
  wallets §11 ships; until then today's behavior — identity/static). Supplied
  rate values are ignored in automatic mode (never persisted as manual).
- This is precisely the `rate_source='automatic'|'manual'` column pair in the
  wallets schema (D17/D21); this proposal finalizes the wire format so the
  module implementation consumes it unchanged.

Field naming: new fields use **camelCase everywhere on the wire**
(`feeCurrency`, `rateSource`, `feeExchangeRate`, `feeRateSource`) even though
legacy `CashTransaction` fields are snake_case — no renames of existing fields;
the inconsistency is documented, not propagated.

### D30 — UI adjustments (SPA)

1. **Buy/Sell stock step** (`AddPositionDialog`) and **EditTransactionModal**:
   - fee input gains a compact currency select bound to `feeCurrency`
     (preselected = transaction currency; options from the shared
     available-currencies registry, D26);
   - a collapsible **"Exchange rate"** section: segmented control
     `Automatic | Custom`. Custom reveals a rate input (placeholder shows the
     last automatic rate when known) and a hint of the direction
     (`1 <txCcy> = x <displayCcy>`); fee rate appears alongside when
     `feeCurrency ≠ transaction currency`;
   - totals recompute live: `total = qty×price ± fee(settled)` using the chosen
     rates; a `custom fx` badge marks manually rated rows in tables.
2. **Wallet cash modals** (`WalletCashModals`): deposit/withdraw get the same
   fee-currency select (default = wallet currency); transfer additionally
   exposes source→target amount/rate inputs matching the elastic-transfer shape
   (wallets D22) — pre-filled automatically, editable to manual.
3. **Transactions tables** (`PortfolioTransactionsTab`, `TransactionsView`,
   wallet detail): fee cell renders `12,50 EUR` style with its own currency;
   custom-rated rows show the badge; tooltips spell out applied rates.

### D31 — contract changes (`portfoliost-contracts`)

```yaml
# shared, new fields on Transaction (portfolio) and CashTransaction /
# request bodies of buys/sells/deposits/withdrawals/transfers:
feeCurrency:      { type: string, nullable: true }   # default: transaction currency
rateSource:       { type: string, enum: [automatic, manual], default: automatic }
exchangeRate:     { type: number, nullable: true }   # was required number — now nullable
feeRateSource:    { type: string, enum: [automatic, manual], default: automatic }
feeExchangeRate:  { type: number, nullable: true }
```

- `Transaction.required` drops `exchangeRate` (nullable now);
  `convertedFees` documented as "settled fee, honoring feeExchangeRate".
- Response echoes the effective values after defaults resolution (so clients
  never guess): omitted `feeCurrency` comes back as the transaction currency;
  `automatic` comes back with resolved rate values filled.
- **`GET /api/currencies`** — the available-currencies registry (D26):
  ```yaml
  CurrenciesResponse:
    currencies:
      - code: { type: string }        # ISO 4217
        name: { type: string }
        symbol: { type: string }
        minorUnits: { type: integer }
        popular: { type: boolean }
  ```
- Versioned as a minor contracts release; SPA regenerates `generated/api-types`.

### D32 — mock behavior

- Persist + echo all new fields with defaults resolved (per D31 echo rule).
- Bundled static demo rate table in `mocks/lib` (EUR/USD/PLN/GBP/CHF snapshot)
  doubles as the interim availability source for `/api/currencies`, settles
  foreign-currency fees into the wallet currency, and fills `automatic` rates;
  `manual` rates override everything they apply to.
- Balance math for wallet movements becomes
  `Δbalance = signed(amount) − fees_settled` where `fees_settled` honors
  fee currency + fee rate; transfer destination crediting follows wallets D22
  (source/target amounts + `transfer_fx_rate`), pre-wiring §11.
- Round-trip tests: default resolution, pct ignoring feeCurrency, manual rate
  propagation into converted outputs, 422 on bad manual rates.

### D33 — wallets proposal alignment (supersedes parts of D17/D22)

- Schema D17 gains the finalized columns:
  `fee_currency char(3)`, `fee_rate_source text CHECK IN ('automatic','manual')`,
  `fee_exchange_rate numeric(20,10)`; existing `rate_source`/`exchange_rate`
  cover the main amount. Enum value normalized to `'automatic'` (not `'auto'`)
  to match the wire format.
- D22 transfers: fee currency/rate treatment is no longer deferred — fees ride
  on the same mechanism defined here; the "deferred to next proposal" note is
  dropped.
- D20/D21 unchanged (fx store, snapshot semantics); `manual` here feeds
  `rate_source='manual'` snapshots verbatim.

### Plan placement

Implemented as plan **§10 Fees & FX-rate entry (contract/mock/UI)** — before the
wallets module (§11), because §11 consumes these exact field shapes. The FX
foundation itself (import pipeline, CronJob) materializes in §11.7; §10 ships
the contract shapes, the registry endpoint served by the mock (D26), and all UI.

## Implementation notes (2026-08-24)

- Contracts released with `FeeFxFields`, `/api/currencies`, and the shared
  helpers (`@marx2/contracts/fx` + `/currencies`); rate-source enums ship
  nullable without `default` keywords (codegen forced them required otherwise).
- Mock vendors `node_modules/@marx2/contracts/dist` into its image
  (.dockerignore exception) — one conversion implementation everywhere.
- UI: shared `CurrencySelect` + `FeeCell`; dialogs made scrollable
  (`max-h-[85vh]`) after e2e caught tall modals pushing submit buttons off-viewport;
  edit-modal price input relaxed to `step="any"` for sub-cent historical prices.

## Addendum: FX entry UX unification (2026-08-25, D38–D41)

Follow-up after real-world use of the §10 UIs: rate entry was inconsistent across
the four forms and ignored the transaction date. Extracts the duplicated
fee/rate UI into shared components and adds date-aware suggestions.

### D38 — reusable fee/FX field components

`FeeFields.vue` (fee amount + Fixed/% toggle + currency select) and
`FxRateFields.vue` (one "EXCHANGE RATE [Automatic|Custom]" disclosure **per
leg**) become the only sanctioned way to collect fees and rates. Legs:
**transaction** and **fee** — each carries its own `rateSource` + optional
manual rate, matching the contract fields 1:1. Consumers: AddPositionDialog
(stock + options), EditTransactionModal, WalletCashModals.

### D39 — custom-rate suggestion from the transaction date

Selecting **Custom** prefills the input from
`/api/fx/latest?from&to&date={leg date}` (D20 lookup incl. carry-forward);
the hint reads "market rate on {date}". `Automatic` keeps settling at the
daily rate at write time. `getLatestRate(from, to, date?)` gains the optional
date parameter (cached per from/to/date).

### D40 — conversion-target precedence

Every disclosure states its target explicitly. Precedence:
**wallet `currency` (payment currency) → portfolio `currency` → user display
base currency** (`useTargetCurrency` composable, single source of truth). A
transaction settles into the *wallet* it is paid from: when the wallet
currency differs from the instrument currency the transaction FX leg manages
that conversion; the portfolio currency is only the fallback when no wallet
context exists. Cash movements always settle into the wallet currency; the
profile base is the last resort.

### D41 — options form parity

The options leg adopts `FeeFields`/`FxRateFields` too (fee currency was
hardcoded USD; no rate entry) — no more per-form snowflakes.

### D42 — mock `/api/fx/latest`

The mock backend had no `GET /api/fx/latest` route, so automatic suggestions
(`getLatestRate`) 404'd and resolved to `null`. `mocks/fx` now serves the
endpoint from the demo rates: direct pairs via `crossRate`, cross pairs, and
`asOf` carries the single demo close forward for any requested leg date
(D20/D39 carry-forward semantics). Precedence remains: manual rate wins, else
the daily close. `mocks/tests/run.mjs` gains 5 round-trips (direct/cross,
date-ignored, 400/422).
