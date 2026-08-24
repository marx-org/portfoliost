# Proposal: fees in their own currency + custom (manual) exchange rates

**Status**: accepted (2026-08-24)
**Builds on**: [backend-topology.md](backend-topology.md) (D1–D11), [wallets-module.md](wallets-module.md) (D16–D24)
**Scope**: contract + mock + SPA adjustment layer beneath the wallets module implementation (plan §10, ahead of §11). Touches BOTH portfolio transactions and wallet cash transactions:

1. a fee may be denominated in a currency different from the transaction (default: transaction currency);
2. the user may supply a **custom exchange rate** for the transaction itself and for the fee — default mode `automatic`, exactly the `rate_source='manual'` path the wallets proposal reserved (D21/D22);
3. UI surfaces both; OpenAPI contract documents both; mock behaves accordingly.

## Context

Today (contracts + mock + SPA):

- `Transaction` (portfolio) carries `fees: number` + `feesType: 'fixed'|'pct'`
  implicitly via request bodies; `exchangeRate` is a **required number that
  nothing populates meaningfully**; `convertedTotalAmount/convertedPrice/
  convertedFees` mirror raw values.
- `CashTransaction` carries `fees`/`fees_type` (nullable); wallet balance math in
  the mock subtracts `amount + fee` in the wallet's currency unconditionally.
- SPA (`AddPositionDialog`, `EditTransactionModal`, `WalletCashModals`) renders a
  fee input with a `%` toggle and computes the effective fee on the fly.

Real-world gap this closes: a PLN-based investor trading on a US exchange pays
the broker's fee in EUR, and the broker converts at **its own** rate — which is
rarely the market mid the system would pick automatically.

### D25 — fee currency (default = transaction currency)

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
  via the fee's exchange rate (D26). Until then the mock settles with a static
  demo rate table (D28) and records what it used.

### D26 — custom exchange rates with `automatic` default

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
- This is precisely the `rate_source='auto'|'manual'` column pair reserved in
  the wallets schema (D17/D21); this proposal finalizes the wire format so the
  module implementation consumes it unchanged.

Field naming: new fields use **camelCase everywhere on the wire**
(`feeCurrency`, `rateSource`, `feeExchangeRate`, `feeRateSource`) even though
legacy `CashTransaction` fields are snake_case — no renames of existing fields;
the inconsistency is documented, not propagated.

### D27 — UI adjustments (SPA)

1. **Buy/Sell stock step** (`AddPositionDialog`) and **EditTransactionModal**:
   - fee input gains a compact currency select bound to `feeCurrency`
     (preselected = transaction currency; options from the shared
     available-currencies registry, D31);
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

### D28 — contract changes (`portfoliost-contracts`)

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
- **`GET /api/currencies`** — the available-currencies registry (D31):
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

### D29 — mock behavior

- Persist + echo all new fields with defaults resolved (per D28 echo rule).
- Bundled static demo rate table in `mocks/lib` (EUR/USD/PLN/GBP/CHF snapshot)
  used to settle foreign-currency fees into the wallet currency and to fill
  `automatic` rates; `manual` rates override everything they apply to.
- Balance math for wallet movements becomes
  `Δbalance = signed(amount) − fees_settled` where `fees_settled` honors
  fee currency + fee rate; transfer destination crediting follows wallets D22
  (source/target amounts + `transfer_fx_rate`), pre-wiring §11.
- Round-trip tests: default resolution, pct ignoring feeCurrency, manual rate
  propagation into converted outputs, 422 on bad manual rates.

### D30 — wallets proposal alignment (supersedes parts of D17/D22)

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

### D31 — single source of truth for available currencies

All currency selectors (fee currency, wallet creation, base-currency picks,
later portfolio settings) consume one registry:

- **Availability SoT = the wallets `fx_rates` table** — we support exactly the
  currencies we can import rates for; the set refreshes automatically with every
  daily FX import (new currency appears in `fx_rates` ⇒ selectable; nothing else
  to maintain).
- **Display metadata** (name, symbol, minor units, popular flag) is a static
  catalog in `portfoliost-contracts` (`currencies.yaml` → generated TS) keyed by
  ISO code; the endpoint joins dynamic availability with this metadata.
- Wire shape: `GET /api/currencies` (D28). Long-term served by the wallets
  module (owner of `fx_rates`; gateway routes `/api/currencies` →
  `API_WALLETS_URL`). Interim (§10, pre-wallets): mock serves the same shape
  from its demo rate table so UI work is final-form from day one.
- SPA fetches once per session and caches; selectors never hardcode lists.

### Plan placement

Implemented as plan **§10 Fees & FX-rate entry (contract/mock/UI)** — before the
wallets module (§11), because §11 consumes these exact field shapes.
