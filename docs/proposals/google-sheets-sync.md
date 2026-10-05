# google-sheets-sync — discovery & column mapping

> Status: **final/done (2026-09-20)** — `portfoliost-sheets-sync` Job (§24 of
> plan.md) imports `Transakcje` into `wallets.wallet_transactions` and
> `portfolios.transactions`/`positions` via the wallets import API (§23); triggered
> on demand from the portfoliost-admin panel. The live-sheet inspection of
> 2026-09-17 corrected three proposal assumptions (all folded in below):
> col 29 `Konto` there is an account column (per-row wallet target); bonds import
> directly via the col 34 `Symbol` + `ticker_reference` (no exclusion); fees are
> settled per col 31–33 rather than always PLN.
>
> D24 follow-up (final, §28 of plan.md) — the import now resolves real instruments,
> not name-as-symbol:
>
> - **Podsumowanie catalog, name-first join** — the `Podsumowanie` tab (`A1:AL233`)
>   is read as a catalog of instrument names; each `Transakcje` row joins to it on
>   `Aktywo` name before any exchange lookup. This fixes brand-name-only cells
>   (`Text` → `TXT.WA`, `Gielda Papierow Wartosciowych w Wrszw SA`, ...).
> - **Venue-qualified `Symbol Yahoo` import** — the catalog's symbol column is a
>   Yahoo-style, venue-qualified ticker (`SNT.WA`, `AMS.S`, `TSLA`); the resolved
>   symbol is what lands in `positions.symbol`/`portfolio_transactions`.
> - **Country/sector sources** — `sector`/`industry`/`country` are sourced per
>   instrument from the catalog first, then `instruments.exchange_reference`
>   (exchange country etc.) as fallback; carried end-to-end in the import payload
>   (`ImportPortfolioTx.sector/industry/country`, wallets `coalesce`-persisted)
>   after the wallets `v1.1.41` release.
> - **Random-sector stock self-heal** — the "(Other) Stock" trap (matching a
>   `GOLDMAN SACHS AKCJI`-style row to a random `* Stock` when the catalog misses)
>   now self-heals on the next quotes pass because the stored `sector`/`country`
>   win over the provider guess, no wipe needed.
> - **Plan §34.7 venue override (2026-09-20)** — live `Podsumowanie` edits were
>   off-limits, so the sync carries a code-side `NAME_VENUE_OVERRIDES` map for the
>   two stale foreign stock rows: Allianz SE → `ALV.DE` / DE and Nintendo Co Ltd →
>   `7974.T` / JP. An approved prod wipe + re-import verified the stored symbols,
>   countries and live quote resolution.
>
> Data read-only from the `Transakcje` sheet of spreadsheet
> `1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps`. Access via the **Sheets REST API**
> only (the hosted Sheets MCP is a Developer Preview gated on Workspace enrollment —
> decided: not used).

## Goal

Sync the `Transakcje` sheet of a personal Google Sheet into portfoliost as a Kubernetes
Job. `Transakcje` is the single source — all other tabs are out of scope. Two writes per
row:

1. **Cash ledger** — `wallets.wallet_transactions` (signed, wallet currency).
2. **Portfolio** — `portfolios.transactions` + `positions` (BUY/SELL/DIVIDEND, lot
   bookkeeping).

## Source facts

- `Transakcje` is the source. Other tabs (`Transfery`, `Podatki`, `Gotówka`, `Konto:*`)
  exist as context for account detection / future work only — **not** imported by this
  proposal.
- `Transakcje` data starts at row 2 (row 1 = headers). `row` column = sheet row number.
- **Typ (7 distinct):** `Kupno` 959, `Div` 765, `Sprzedaż` 234, `Wpłata` 53,
  `Sell Call Option` 5, `Wypłata` 5, `Split` 3.
- **Aktywo (223 distinct):** e.g. `SAP SE`, `Goldman Sachs Akcji`, `Realty Income
  Corp`, `Gotówka IB` (broker cash). Mixed: WSE stocks (`MO-BRUK SA`, `Playway SA`,
  `IFirma SA`), US/DE/NL/UK stocks, PL sub-funds, options.
- **Waluta (8 distinct):** USD 940, PLN 696, EUR 303, GBP 41, SGD 15, CAD 14, SEK 11,
  JPY 4.
- `Contas`/handle columns `Opłaty` only 2 001 of 2 025 rows populated; `split` only 4
  rows.
- Dates are ISO (`2019-05-09`). **All money cells are display-formatted strings**:
  Polish locale — comma decimal separator, NBSP thousands separator, ` zł` suffix;
  `-` (not `0`) marks empty in some derived columns.

## `Transakcje` columns → targets

| # | Header | Format | Target (schema) | Mapping / notes |
|---|--------|--------|-----------------|-----------------|
| 1 | row | int | `external_id` (both targets) + `sync_runs` cursor | id = `(Data,Typ,Aktywo,Ilość,Waluta,Kurs)` hash for stability (§Idempotency); `row` kept as display/order metadata; also `external_id`/`reference` |
| 2 | Data | `yyyy-mm-dd` | `transactionDate` / `executedAt` (date part) / `portfolioTransactions.executedAt` | ISO already; time-of-day unknown → use date + midnight |
| 3 | Typ | text | `type` (both targets) | map: Kupno→INVEST(buy leg)/BUY; Sprzedaż→SELL/SELL; Div→DIVIDEND/DIVIDEND; Wpłata→DEPOSIT; Wypłata→WITHDRAWAL; Split→ADJUSTMENT (no cash, **drives restatement**, §Splits); Sell Call Option→SELL + option position (see Options §decisions) |
| 4 | Aktywo | text | `positions.symbol`(resolved) / `portfolioTransactions.instrumentSymbol`/`instrumentName` / `description` | resolve name → `ticker_reference` by `name`; unmatched → keep name as symbol + `instrumentName`; `Gotówka IB` = cash (no position) |
| 5 | Ilość transakcyjna | PL decimal | `quantity` | parse (comma→dot, strip spaces); sign: BUY +, SELL −; **pre-split rows restated ×factor** (§Splits); unused for DEPOSIT/WITHDRAWAL |
| 6 | Cena transakcyjna jednostki (PLN) | PL decimal | `price` / `convertedPrice` | unit price in display PLN; store `price` in `Waluta` with `exchangeRate` = col 21 to recover instrument currency (see FX) |
| 7 | Opłaty (PLN) | PL decimal | `fees` (wallet + portfolio), `feesType=fixed`, `feeCurrency=PLN` | empty on some rows → 0 |
| 8 | split | int/no-val | `positions`-adjustment / log | observed: Amazon 20 (2022-06-06), Alphabet 20 (2022-07-15), Dino Polska 10 (2025-07-30) — factor drives the §Splits restatement pass; no cash flow (col 19 = 0) |
| 9 | Poprzedni wiersz | int | — | integrity check only (prev-row pointer sanity during import) |
| 10 | Poprzednia ilość | PL decimal | — | position state; recomputable — not imported |
| 11 | Skumulowana ilość | PL decimal | — | position quantity after tx; recomputable — not imported |
| 12 | Wartość transakcji (PLN) | PL decimal | `portfolioTransactions.totalAmount` / `convertedTotalAmount` | signed gross value incl. fees? (verify against cols 5–7) |
| 13 | Poprzedni koszt (PLN) | PL decimal | — | recomputable — not imported |
| 14 | Koszt transakcji sprzedaży (PLN) | PL decimal | — | recomputable — not imported (0 on buy rows) |
| 15 | Koszt transakcji sprzedaży (na akcje) (PLN) | PL decimal | — | recomputable — not imported |
| 16 | Skumulowany koszt (PLN) | PL decimal | — | recomputable — not imported |
| 17 | Zysk/Strata ze sprzedaży (PLN) | PL decimal | `realizedGainLoss` (portfolio) | meaningful only on SELL rows |
| 18 | Zysk/Strata z transakcji (%) | PL decimal | — | recomputable — not imported |
| 19 | Przepływ gotówki (PLN) | PL decimal (signed) | `wallet_transactions.amount` (+ sign) | **primary cash amount.** Observed: Kupno −, Div +, Wypłata + (addr.) — sign is applied by `Typ`, not trusted verbatim (wallet convention: inflow +, outflow −); verify against balances in design |
| 20 | Waluta transakcji | ISO 4217 | `currency` (porfolio tx) / wallet `currency` + `exchangeRate` | wallet ledger is PLN-denominated; store original via `exchangeRate`/`rateSource=manual` |
| 21 | Kurs waluty transakcji | PL decimal | `exchangeRate` (wallet + portfolio, `rateSource=manual`, `feeRateSource=manual` if used) | e.g. `4,30 zł` = PLN per unit |
| 22 | Wycena aktywa na dzień transakcji (PLN) | PL decimal | — | snapshot/reference only → `value_snapshots` build, not per-tx |
| 23 | Dywidendy (PLN) | PL decimal | — | on `Div` rows duplicates col 19; recomputable |
| 24 | Skumulowane Dywidendy/Odsetki (PLN) | PL decimal | — | recomputable — not imported |
| 25 | Skumulowana wpłata (PLN) | PL decimal | — | recomputable — not imported |
| 26 | Skumulowany zrealizowany zysk (PLN) | PL decimal | — | recomputable — not imported |
| 29 | Konto | text | wallet target | **account name per row — the sheet has an account column** (the "no account col" gap was wrong); maps 1:1 to a wallet via `src/konto-map.ts`: `IB`→IBKR, `Equate+`, `IKE Marek`, `IKE Beata`, `NN TFI PPK`, `NN TFI PPO`, `Rach. rejestrowy PKO BP`, `XTB`, `Crypto`, `Obligacje PKO SA Beata` (10 distinct, zero empty rows). Fee currency decided independently of this column. |
| 30 | Cena transakcyjna jednostki (w walucie) | PL decimal | `price` | native-currency unit price; used as `price` (post-restatement; fallback `|cashFlow| ÷ rate ÷ qty` only when empty — never overrides a sheet value) |
| 31 | (fee) Waluta opłaty | ISO 4217 | `feeCurrency` | fee currency (≠ PLN on some rows → fee leg not always PLN) |
| 32 | (fee) Kurs | PL decimal | `feeExchangeRate` | fee FX (`feeRateSource=manual`) |
| 33 | (fee) Opłaty (w walucie) | PL decimal | `fees` | primary fee amount when `feeCurrency ≠ PLN`; else fees come from col 7 |
| 34 | Symbol | text | `positions.symbol` / resolved instrument | canonical ticker (WSE/venue suffix), primary instrument key for stocks, ETFs, bonds, Beta ETF FIZ; bonds resolve directly via `ticker_reference` — **no bond exclusion** (decision 6 superseded) |
| 35 | Giełda | text | resolve venue | canonical exchange (e.g. `NAS`, `WSE`, `LON`); venue-strict match with col 34 or name-fold fallback via aliases |

### Imported vs recomputed

The importer maps columns 1–8, 12, 17, 19–21, 29–35; all other columns (9–11, 13–16,
18, 22–28, 36–39) are derivable by the existing lot/cost-basis math (D54) and must
**not** be copied — import stays a faithful append of source events.

### FX convention

Ledger lives in the wallet's settlement currency (D17); **per-account currencies
decided**: IBKR = USD, Equate+ = EUR, all Polish brokers/banks = PLN; `baseCurrency` =
PLN on every wallet. The sheet's PLN columns are converted by the user with col 21 as
the unit FX — so `exchangeRate` = col 21 reconstructs the original currency amounts
from `Wartość transakcji (PLN)` / unit price. Keep `wallet_transactions.currency` +
`exchangeRate` + `rateSource=manual` consistent with fees-and-custom-fx D28/D29.
Cross-wallet legs (Equate+ → IBKR cash) use `transferFxRate`/`linkedTxId` (D22).

> **Superseded 2026-10-05 (pfire-docs#26).** Those cross-wallet *cash* legs no
> longer exist. An Equate+ `Sprzedaż` now emits a **`TRANSFER_OUT`** of the shares
> plus a **`SELL` booked on IBKR**, and **no cash row at all** — what
> `transferFxRate`/`linkedTxId` described was the simulation the transfer type
> replaced. The cash *table* is untouched; `DEPOSIT`/`WITHDRAWAL`/`TRANSFER` remain
> §89's unmerged domain.
>
> Two rules that row now follows, both owner-decided:
> - **`AU` (col 47) is not consulted.** A `Sprzedaż` on Equate+ is a transfer at
>   `AU=0` and `AU=1` alike, the same rule §87.3 applies to the kontо on
>   `ALWAYS_CASH_LEG`. No spreadsheet edit was needed — the `SALE_PROCEEDS_TO` gate
>   already existed and only what it produces changed.
> - **Send quantity, never `Wartość transakcji`.** That column is the sale
>   *proceeds*; using it as `price` would corrupt the receiving basis, because
>   wallets derives the price FIFO from the real source lots. `externalIdOf` is
>   untouched — it hashes date/typ/aktywo/quantity/currency/rate, so row identity
>   is stable however many per-lot pairs the server derives.

### Parsing rules

- Decimal: strip NBSP + ASCII space, strip ` zł`, replace `,` → `.`, parse float.
- Treat `-` (and empty) as 0 for money, null for derived references.
- `quantity` for SELL rows is positive in the sheet → sign it − for the ledger/position
  drain on import (or reuse `Skumulowana ilość` deltas to be safe).
- **Name normalization** for matching: fold to lowercase, collapse whitespace; the sheet
  drops Polish diacritics/typos in places (`Gielda Papierow Wartosciowych w Wrszw SA`),
  and strips vowels in some names (`Mnchnr Rckvrschrngs-Gsllschft n Mnchn AG`). Match
  via `ticker_reference` normalized `name`/`aliases`/`isin`; fall back to name-as-symbol,
  never fail the row import.

### Split restatement (decision)

The sheet keeps historical `Ilość transakcyjna`/`Cena` at **pre-split** values — only
`Skumulowana ilość` is restated (verified: Amazon 0,0209+0,0051 → split row ×20 → 0,52;
post-split buys are already in new terms, so raw columns are not additive across the
split). Import therefore restates, per asset with a `Split` row at date `D` and factor
`F`:

- every row of that asset with `Data < D`: **`quantity *= F`, unit `price /= F`**;
  `value`/`fees`/`kurs`/`waluta` unchanged (cost basis, realized P/L, cash preserved;
  `value = qty × price` invariant).
- multiple splits on one asset: apply in date order; equivalently each row absorbs the
  product of all later split factors (`factor_i = Π F_s for split.date > row.date`).
- the `Split` row itself → `ADJUSTMENT`, no cash, `split` factor stored on the position
  (`positions`-adjoint / log) — after restatement it is a no-op for quantity.
- **Validation gate**: after restatement, recomputed running quantity per asset must
  equal the sheet's `Skumulowana ilość` at every row; mismatch → abort that asset with a
  loud log (never partial-write).

## Provenance / source tracking (decision)

Every imported row is derivable from an external source, so both event tables gain two
columns (inline, **no separate per-tx table** in v1):

- `external_source` — text, kind/instance of the sync. e.g. `google-sheets:transakcje`
  (kind = Google Sheets, instance = spreadsheet `…FFps`).
- `external_id` — raw external row identifier, `1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps:<row>`.

Enforcement: `external_id` nullable (manual rows stay NULL), plus a **partial unique
index on `(external_source, external_id)`** for both `wallets.wallet_transactions` and
`portfolios.transactions` → the import is idempotent by construction. Existing
`wallet_transactions.reference` (uq_wtx_reference) stays for user-facing references and
is written from `external_id` for imported rows.

Separate **`sync_runs`** table (import bookkeeping, not per-tx): per
`(external_source, spreadsheet_id, sheet)`, keeps last imported `row`, run status,
started/completed timestamps — i.e. the incremental cursor, outside the event tables.

## Wallet/account model (decision)

- One `wallets.wallets` per broker/account. Main currency for the user: **PLN**.
  - IBKR: `currency=USD`, `baseCurrency=PLN`.
  - Equate+: `currency=EUR`, `baseCurrency=PLN` — **tracking-only wallet, no cash in the
    sheet**: stock sales there post proceeds as cash into the **IBKR** wallet (USD) via a
    transfer pair (`transferFxRate` EUR→USD, `linkedTxId`, D22) rather than a local cash
    row.
  - All other accounts (XTB, BOSSA, PKO BP, mBank, PPK, PPO, **IKE Marek, IKE Beata**…):
    `currency=PLN`, `baseCurrency=PLN`. IKE = Polish retirement accounts holding the
    NN/Goldman **Emerytura** sub-funds; their cash (`Gotówka IKE Marek/Beata` Wpłata rows)
    posts to the matching IKE wallet.
- `Wpłata` → DEPOSIT in the target wallet, `Wypłata` → WITHDRAWAL from it (rows 865/902/
  1193/1303/1744 confirm: `Aktywo=Gotówka IB`, cash out of IB).
- `Transfery` inter-account moves: not part of this Transakcje-scoped proposal (see
  follow-ups).
- **Account attribution (resolved 2026-09-17):** `Transakcje` **has an account
  column** — col 29 `Konto`, populated on every row (10 distinct values, zero empty;
  965 `IB`, 396 `IKE Beata`, 261 `IKE Marek`, 173 `Equate+`, 93 `NN TFI PPK`, 81
  `NN TFI PPO`, 26 `Rach. rejestrowy PKO BP`, 22 `XTB`, 5 `Crypto`, 2
  `Obligacje PKO SA Beata`). Each value maps directly to a wallet via `konto-map`
  (see the col 29 row above); the 10 values are exactly the 10 wallets the sync
  bootstraps, so no `Aktywo`/venue inference is needed.

## Instruments resolution & options (decision)

- Match `Aktywo` → `ticker_reference.name` (aliases/isin as fallback); `Waluta`
  hints the venue for ambiguous names. Unmatched names → keep as symbol, defer to
  openst enrichment, log a warning (import still succeeds).
- **Options: store them — the schema already can.** `positions` has
  `assetType`/`optionType`(CALL/PUT)/`direction`(LONG/SHORT)/`strikePrice`/
  `expirationDate`/`contractSize`, and `ck_ptx_type` already accepts BUY/SELL.
  Observed rows are **5 covered call sells on SAP SE** (qty 100 = 1 contract ×100,
  EUR premium ≈ 5–6 zł/unit, cash ledgered on sell): import as
  `type=SELL`, `assetType='OPTION'`, `optionType='CALL'`, `direction='SHORT'`,
  `contractSize=100`. The sheet carries **no strike/expiry** → those stay NULL; a
  SHORT call position is a distinct `positions` row (symbol alone doesn't collide, the
  row is keyed by id).
- V1 limits: no exercise/assignment/expiry events in the sheet → a written SHORT call
  stays open; premium P/L is what the ledger sees. Log as-is; full options lifecycle is
  future work.
- **Bonds (decision superseded 2026-09-17):** originally "not supported → future
  work", but live inspection showed the sheet's col 34 `Symbol` is populated for all
  bond rows (`ROD`/`EDO`/`BST`/… series) → they resolve directly via
  `ticker_reference.ticker` and import as `assetType=bond`/`fund` positions. No
  series-regex exclusion; the Bonds row in the coverage-audit table below no longer
  applies. (Full bond coupon/amortization accounting remains out of scope — the
  import stores the positions and the ledger, not the coupon schedule.)

## Position coverage audit (decision)

Audited all 223 distinct `Aktywo` / 2 024 rows (2026-09-13):

| Group | assets | rows | Import path |
|---|---|---|---|
| Stocks (WSE + intl, incl. ADS) | ~177 | ~1 648 | `type` BUY/SELL/DIVIDEND, `assetType=STOCK`; ticker_reference by name/alias/isin, else name-as-symbol |
| Funds & sub-funds (Goldman Sachs Emerytura 2065/2060, NN Emerytura/2030/2025, NN Obligacji, Beta ETF * FIZ) | 18 | 229 | `assetType=FUND`, units; name-as-symbol fallback |
| ETFs (UCITS) | 15 | 35 | `assetType=ETF`, units |
| Options (SAP SE covered calls) | 1 | 5 | SHORT CALL position (already in SAP SE rows) |
| Crypto (BTC, ETH) | 2 | 5 | `assetType=CRYPTO`, PLN-quoted, no venue |
| Cash markers (Gotówka IB / IKE Marek / IKE Beata) | 3 | 58 | wallet cash (DEPOSIT/WITHDRAWAL); never a position |
| Bonds (series ROD/EDO/BST/INS/KRI/ARH/VOX/NVA + `YMM` maturity) | 33 | 90 | **superseded 2026-09-17** — col 34 `Symbol` resolves via `ticker_reference` → `assetType=bond`/`fund`; no exclusion. Detector `^(ROD\|EDO\|…)\d{4}$` was from the original pre-inspection assumption |
| `Text` = **TEXT S.A. (WSE, `TXT.WA`)** | 1 | 18 | `Aktywo` cell holds the brand name only. Resolved via alias `Text`/`Text S.A.` → `TXT.WA` (WSE); BUY/SELL/DIVIDEND, PLN |

**Result: every non-bond, non-cash asset passes the import structurally** (schema holds
BUY/SELL/DIVIDEND + free `symbol`/`assetType`). Non-blocking cares:

- `Text` → `TXT.WA` (TEXT S.A.): brand-name-only cell; seed alias `Text`/`Text S.A.`.
- Noisy names (`Mnchnr Rckvrschrngs-Gsllschft n Mnchn AG`, `BRITISH AMERICAN TOBACCO PLC
  ADS Common Stock`, `Gielda Papierow Wartosciowych w Wrszw SA`): name-fold + alias
  table; fallback keeps import green.
- Cryptocurrencies: record PLN quote; pricing/valuation for crypto is future work.

## Incremental import + idempotency

- Cursor = last imported `row` value per sheet, persisted in `sync_runs`; re-import
  re-scans from row 2, upsert-guarded by the partial unique
  `(external_source, external_id)`.
- `row` mirrors the Google row number, so **row deletion shifts** later references →
  dedup id derived from `(Data, Typ, Aktywo, Ilość, Waluta, Kurs)` hash as the import
  key, with `row` kept as display/order metadata only.

## Decisions & follow-ups

Decided (2026-09-13):

1. **Provenance**: inline `external_source` + `external_id` columns on both event tables,
   partial unique `(external_source, external_id)`; no per-tx table; separate `sync_runs`
   for the cursor (§Provenance).
2. **Wallets**: one per broker/account; PLN main; IBKR USD, Equate+ EUR (tracking-only,
   sale proceeds → IBKR cash); others PLN; **IKE Marek/IKE Beata** added from `Gotówka
   IKE *` markers (§Wallet/account model).
3. **Options**: stored (schema already fits); SHORT CALL on SAP SE, strike/expiry NULL.
4. **value_snapshots**: recalculated separately already — out of scope here.
5. **MCP**: not used — REST only.
6. **Bonds**: unsupported → future work. **Superseded 2026-09-17** — bonds import
   via the col 34 `Symbol` → `ticker_reference` (see the decision bullet in
   §Instruments resolution & options).
7. **Splits**: restatement pass during import — pre-split rows `qty ×= F`, `price /= F`;
   validation against sheet `Skumulowana ilość` (§Splits).
8. **Position coverage**: all non-bond/non-cash assets pass; bonds excluded by series
   regex; `Text` = TEXT S.A. resolved via alias → `TXT.WA` (§Position coverage audit).

Follow-ups to design phase:

- ~~Account attribution map `Aktywo`/venue → wallet (sheet has no account column).~~
  **Closed 2026-09-17** — col 29 `Konto` is the account column; static `konto-map`
  covers all 10 values (§Wallet/account model).
- Inter-account `Transfery` handling (out of this Transakcje-scoped proposal).
- Full options lifecycle (exercise/assignment/expiry) + strike/expiry columns in the
  sheet; BOND support.
- Stable import id vs raw `row` (see §Idempotency).
- `Text`/brand-name aliases (seed `Text`→`TXT.WA`) and asset allowlist/denylist config UI.