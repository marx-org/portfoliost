# Portfolio cash tracing — investigation & reconciliation

Status: **reference doc** (created 2026-09-27; findings + decisions revised
2026-10-03). Records how portfolio cash is traced end-to-end through the
sheets → wallets → charts pipeline, how the **Gotówka vs Transakcje gap
report** is produced, what the recon has found, and the decisions taken about
it. Supersedes the inline recon notes in `plan.md` §58.7 / §62.6 / §62.9b.
Implementation of the 2026-10-03 decisions is `plan.md` §89.

## 1. The data model (what is the source of truth for cash?)

Free (uninvested) cash per portfolio is **derived**, not imported as a number:

- **Transakcje sheet** (Google Sheets, sheet `Transakcje`, 2,042 rows =
  header + 2,041 data, 49 cols) is the *source of truth* for cash flows. Each
  row is one of:
  - a **trade** (`Kupno`/`Sprzedaż`/`Div`/`Split`/`Sell Call Option`) — the
    cash effect is the row's *Przepływ gotówki (PLN)* column (0-idx col 18);
  - a **Wpłata / Wypłata** (deposit/withdrawal) — an external cash movement,
    must carry the same column filled (enforced: AU=0 Wpłata/Wypłata aborts).
- **Gotówka sheet** (sheet `Gotówka`, 334 rows = header + 333 dated) is a
  **reconciliation reference only** — the user's own per-account ledger. It
  never drives values; a mismatch is warn-only.
- **AU flag** (col 46): AU=1 → the row moves cash (imports a cash leg);
  AU=0 → no cash movement (pure position replay).

### 1.1 What a Gotówka column actually is (verified 2026-10-03)

Not previously established, and it changes how the recon may be read. The grid
is **eight whole accounts stated in PLN**, and the sheet partitions them
exactly:

| col | header | measured range (333 dated rows) |
|---|---|---|
| 1 | `ING ROR` | 13,64 … 53 013,27 |
| 2 | `OKO wspolne` | 39 663,34 … 170 083,36 |
| 3 | `OKO Obligacje` | 377,40 … 104 446,88 |
| 4 | `Smart Saver/PKO SA/OKO Rudnik` | 0,00 … 102 511,47 (n=169) |
| 5 | `Inteligo ROR` | 4 370,00 … 116 592,15 |
| 6 | **`IKE Marek`** | 0,84 … 34 611,16 (n=327) |
| 7 | **`IKE Beata`** | 7,93 … 35 634,92 (n=327) |
| 8 | **`IB`** | −730,30 … 41 876,34 (n=323, 5 negative days) |
| 9 | `Suma` | 56 853,82 … 302 323,57 |
| 10 | `Suma ROR` | 55 929,40 … 271 023,90 |
| 11 | `Suma brokerzy` | 0,00 … 50 771,40 |

- `Suma` (9) == Σ(cols 1..8) on **333/333** rows.
- `Suma ROR` (10) = the five bank/wealth columns; `Suma brokerzy` (11) =
  `IKE Marek` + `IKE Beata` + `IB`, also **333/333**.

So each column is one account, and the three tracked columns are the three
brokerage accounts the app models as portfolios.

**They also move on days with no cash event at all** — 143 of 302 IBKR
"gap days", 81 of 130 for IKE Marek, 86 of 137 for IKE Beata. `IB` holds eight
currencies against one PLN figure, so its column revalues daily; the two IKE
columns step on contribution days and decay as the money is invested. This is
the single most important thing to know before reading any Δ against them
(§3.3).

### 1.2 Wallets' storage

Wallets stores the per-portfolio cash as **`portfolio_cash_transactions`**
(§62): one row per cash movement — `DEPOSIT` (+), `WITHDRAWAL` (−),
`TRANSFER` (debit leg − with `toPortfolioId`/`targetAmount`; the server
creates the paired credit leg `#t` with `linkedTxId` both ways). Per-currency
balances (`cashBalances`), daily base-currency series (`cashBalanceSeries`),
and external flows only (`dailyExternalFlows` — DEPOSIT/WITHDRAWAL/TRANSFER,
**not** trades) live in `portfoliost-wallets/src/services/cashLedger.ts`.

Portfolio *value* = Σ positions (live/close) + cash balance (base ccy);
`invested` (as of 2026-09-27) = **cumulative net external cash flow**
(deposits − withdrawals ± transfer legs), see §63.6 / the Total Invested
redefinition.

The ledger is a **pure replay** — nothing is stored, every balance is
`Σ` over rows. That is what makes a balance *correction* inexpressible today
(§4.2).

## 2. The recon: Gotówka vs Transakcje

### 2.1 The original design premise, and why it was wrong twice

The first premise (plan §62.6) was: *Gotówka column on day D should equal its
first value + Σ all Transakcje cash flows up to D* — i.e. the sheet's cash
flows fully explain the account balance.

**First RCA (2026-09-25/26):** the premise is wrong, and not because of a bug —
the **Transakcje sheet is missing inflow/outflow rows**. Several
deposits/withdrawals were never recorded as Wpłata/Wypłata rows. The first
full-history report showed **580 gap rows, Σ +293,240.54 PLN**, and it was read
as "the user should paste in the `do dodania` column".

**Second RCA (plan §63.4, 2026-10-01):** that reading was itself wrong. The old
recon built **both** sides out of the user's own workbook — it took the
column's first balance as a base and summed the sheet's own signed cash-flow
column — so it was the sheet checked against itself, and a sheet missing rows
agrees with itself and is still wrong. The derived side now comes from
wallets' own ledger (`GET /internal/cash-balances`), and the sign is
`derived − sheet`. This is the recon `src/gotowka-recon.ts` implements today.

§3 is the third reading, and it says the remaining Δ is not a missing-row
problem at all.

### 2.2 The gap report

For each tracked column (IB→IBKR, IKE Marek, IKE Beata; bank accounts are out
of scope — they don't map to a wallet):

```
Δ Gotówka(D)    = net change of the column's balance on day D
                  (a day may hold several rows — a deposit step and a trade
                  step — so Δ is the sum of the day's row-to-row deltas)
Σ Transakcje(D) = Σ "Przepływ gotówki (PLN)" of the Transakcje rows of the
                  same wallet + day (Konto column → wallet via konto-map)
BRAKUJE(D)      = Δ Gotówka(D) − Σ Transakcje(D)
```

**`Σ Transakcje` is missing a sign normalisation, and it inflates every
contribution day roughly twofold** (found 2026-10-03). The sheet writes
`Wpłata` with a **negative** col 19 — it is cash leaving the owner's bank
account and entering the portfolio — and `Wypłata` positive:

| sheet row | date | `Typ` | col 19 |
|---|---|---|---|
| 101 | 2021-10-18 | `Wpłata` | `−15 777,00 zł` |
| 865 | 2023-12-20 | `Wypłata` | `+20 850,00 zł` |

`scripts/gotowka-gap-report.ts:78` sums the raw column, so on a contribution
day it scores `Δ Gotówka − (−|amount|)` — a deposit is booked as a withdrawal
of twice the amount. This is a large part of why §2.1's report produced 580
rows of noise.

### 2.3 How to generate the report

The generator is a **standalone script** in the sheets-sync repo
(`scripts/gotowka-gap-report.ts`) — it reads only the two sheets (no DB, no
wallets), so it can be run any time the sheet changes.

```bash
cd /Users/marx/prv/pfire/portfoliost-sheets-sync
# Service account JSON: k8s secret `sheets-sync-secrets`, key
# `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 inside the secret → one decode).
# Once decoded, keep it at /tmp/sa_raw.txt for the session:
kubectl -n pfire get secret sheets-sync-secrets \
  -o jsonpath='{.data.GOOGLE_SERVICE_ACCOUNT_JSON}' | base64 -d > /tmp/sa_raw.txt

GOOGLE_SA_JSON="$(cat /tmp/sa_raw.txt)" \
  npx tsx scripts/gotowka-gap-report.ts > /tmp/recon-report.txt
```

**Nothing under `scripts/` is tested.** `vitest.config.ts` sets no `include`,
so the default `**/*.{test,spec}.*` glob never matches a script, and the
report's arithmetic has no fixture pinning it. That is why §2.2's sign bug
survived from 2026-09-25 to 2026-10-03.

The **live import** also runs a lighter in-memory recon after every run
(`src/gotowka-recon.ts`, warn-only, never fails the run): it compares each
tracked column's last dated balance against wallets' derived balance at that
same date and logs `[gotowka] <portfolio> <date>: derived X vs sheet Y (Δ …)`
(tolerances: IBKR ±50, IKE ±10, all PLN). `src/sync.ts:303-325` is the call
site.

## 3. Findings, 2026-10-03 (PROD re-measurement)

Re-measured on PROD with `KUBECONFIG=$HOME/.kube/homylab`. sheets-sync
`v1.0.36` had last run ~19 h earlier (`inserted=21 skipped=2365 errors=0`,
`portfoliosTouched=5`); the derived side was re-read live from
`GET /internal/cash-balances?asOf=2026-09-29`. Sheet's last dated row is
2026-09-29.

| account | derived | sheet | Δ | direction |
|---|---|---|---|---|
| IBKR | 24 741,35 | 6 006,42 | **+18 734,93** | app knows more |
| IKE Marek | 961,87 | 4 951,85 | **−3 989,98** | sheet knows more |
| IKE Beata | 4 442,52 | 3 032,89 | **+1 409,63** | app knows more |

**Byte-identical to §63.4's first run on 2026-10-01.** Nothing has moved in two
days; no owner action has landed.

Gap report today, against the §2.1 baseline of 580 rows:

| account | gaps | on days with no Transakcje row | Σ BRAKUJE |
|---|---|---|---|
| IBKR | 302 | 143 | +152 558,79 PLN |
| IKE Marek | 130 | 81 | +12 686,64 PLN |
| IKE Beata | 137 | 86 | +120 355,32 PLN |

### 3.1 IBKR's "missing inflows" are not missing — they are dropped on purpose

The sync log's 37 no-op `Wpłata Gotówka IB` rows are `isDuplicateTransferFunding`
hits (`src/transakcje-mapper.ts:239`, §69). They are the broker's own record
of the Equate+ SAP sale proceeds landing, and the importer keeps the
synthesized `Equate+ → IBKR` TRANSFER pair instead so the same money is not
credited twice. IBKR's only deposits in the ledger are two rows
(49,99 + 912,55 USD) plus one `#d` (0,099 USD).

§69 records the owner confirming this model. It is working as designed, so
IBKR's Δ is a **modelling difference**, not a data gap, and no spreadsheet
edit closes it.

### 3.2 The IKE Δ is a near-cancellation of two ~40k errors, not a small gap

All four per-currency legs were re-derived from `portfolios.transactions` and
match to the penny:

| account | PLN | EUR | GBP | USD | other | total | sheet |
|---|---|---|---|---|---|---|---|
| IKE Marek | **+43 425,30** | −2 883,46 | −3 154,49 | −3 592,67 | — | 961,87 | 4 951,85 |
| IKE Beata | **+47 429,70** | −4 075,48 | −2 860,98 | −2 764,18 | — | 4 442,52 | 3 032,89 |
| IBKR | −121 130,00 | +70 779,33 | +193,18 | −39 041,46 | CAD −4 337,85 · JPY +4 374,00 · SEK −4 075,56 · SGD −255,74 | 24 741,35 | 6 006,42 |

IKE Marek's PLN leg alone is **+38 473,45** over the sheet, and its foreign
legs are ≈ **−42 463,43** of purchases that were never funded. Same shape on
IKE Beata (+44 396,81 on the PLN leg). The −3 989,98 headline is what is left
when two large offsetting errors nearly cancel.

**Why:** the Gotówka column is a single-PLN cash ledger, but the Transakcje
grid records **no FX-conversion rows**, and the importer debits each buy in
its own currency. The PLN that left the account to buy EUR/GBP/USD is
therefore invisible, and the PLN leg stays inflated by the full cost of the
foreign book.

There is no single row to find. What is absent is a whole class of movement.

### 3.3 The Δ is measured against a column that is not a cash balance

Per §1.1, 143/302, 81/130 and 86/137 gap days carry **no Transakcje row at
all** — the column moved anyway. Only 5 of the 58 cash rows line up with a
clean step in their column on their own date. So `derived free-cash` vs
`column` is not a like-for-like comparison, and a Δ driven toward zero would
be chasing the column's own volatility. §63.4 fixed the recon's *basis* and
*sign*; the *quantity* is still wrong.

### 3.4 An AU flip cannot remove an already-imported cash row

`externalIdOf` (`src/transakcje-parser.ts:28-31`) hashes cols 2, 3, 4, 5, 20,
21 — **col 47 (`AU`) is not in the hash** — so a `#d` leg's `external_id` is
identical before and after a flag flip. The sync is insert-only (no deletes).
The owner's 2026-10-02 normalisation of IB's funded `Kupno` rows therefore left
the three `Buy: ASR Nederland NV` `#d` DEPOSITs in place (2 344,88 EUR), which
is why IBKR's derived is unmoved at 24 741,35. Closing that needs a wipe or a
targeted delete, never a re-sync.

A corollary: because the id is a content hash, **editing a sheet row orphans
the old imported row and inserts a new one**. Sheet edits accumulate rather
than reconcile; only a wipe is authoritative.

### 3.5 The sheet-row citations in plan §78.2 / §87 do not match the sheet

Read live from the sheet, 2026-10-03:

| cited | what the plan says it is | what row *N* actually is |
|---|---|---|
| 1565 | ASR Nederland `Kupno`, AU 1→0 | **`Wpłata "Gotówka IB"`**, 2025-07-29, col 19 `−3 141,30 zł`, AU=**1** |
| 1646 | ASR Nederland `Kupno`, AU 1→0 | `Kupno "CubeSmart"`, 2025-09-25, USD |
| 1805 | ASR Nederland `Kupno`, AU 1→0 | **`Div "AbbVie Common Stock"`**, 2026-02-17 |
| 1852 | 40-share ASRNL exit, AU 1→0 | `Kupno "Agree Realty Corp"`, 2026-04-15, qty 4, USD |

§87's *substance* holds even though the numbers do not: the AU census confirms
IB at 387 `Kupno` / 91 `Sprzedaż` / 448 `Div` / 2 `Split` with **every trade at
AU=0**, its flows coming from 41 `Wpłata` + 5 `Wypłata` at AU=1; IKE Marek
90/36/130 all AU=0; IKE Beata 158/54/180/1 all AU=0. Never edit this sheet by
a remembered row number.

## 4. Decisions (2026-10-03)

**D1 — Fix the measurement before resolving the data.** §3.2 and §3.3 mean a
Δ cannot currently tell you anything, so the sign fix (§2.2), a tested home
for the report's arithmetic (§2.3), and an honest statement of what each
tracked column is compared against all land first. Owner decision.

**D2 — Add a `CONVERT` cash-transaction type.** A conversion inside one
portfolio (PLN out, EUR in) is not expressible today: `TRANSFER` requires
`toPortfolioName` which "must exist and **differ** from the source portfolio"
(`portfoliost-contracts/contracts/openapi.yaml:2301`). `CONVERT` is a new
member of the `ImportPortfolioCashTx.type` enum, alongside
`DEPOSIT`/`WITHDRAWAL`/`TRANSFER` at `openapi.yaml:2289`, covered in the UI.

**D3 — One row, both currencies.** `CONVERT` carries `fromCurrency`,
`toCurrency`, `fromAmount`, `toAmount` and a rate on a single record, and
wallets derives both legs from it, linked as a pair like `TRANSFER` — so the
two currencies cannot disagree. Two correlated rows was the alternative and was
rejected: it puts two entries in every cash list and lets the pair drift.
`RecentCashTransaction.type` stays a plain `string` and `displayLabel` already
exists, so the read path needs no contract enum change.

**D4 — Conversions are recorded manually, in the UI.** The importer invents
nothing. This matters: §3.4 already showed that content-hash ids make inferred
or edited rows accumulate rather than reconcile, and a synthesised leg would be
exactly that. A conversion is entered by hand in the cash dialog.

**D5 — `CONVERT` is available on every portfolio**, not gated behind a
per-portfolio switch. Converting between currencies is a real operation for
any account holding more than one currency; a gate would only hide the
capability.

**D6 — Add an `ADJUSTMENT` cash-transaction type, and it counts toward
`invested`.** `ADJUSTMENT` moves the balance of one chosen currency by a signed
delta, with a mandatory reason. Because `cashBalances` is a pure replay
(§1.2), a delta is the only shape implementable without introducing a stored
balance; an absolute "set the balance to X" would be a delta at write time
anyway. Owner decision: it counts as external flow **according to its sign**,
like an inflow or an outflow — so a correction moves `invested` and therefore
TWR/XIRR. This is knowingly the opposite of the conservative choice, and
§78.6 records why that is a real cost: a flow series that is wrong in shape
distorts XIRR badly, and an adjustment that moves the denominator can mask or
amplify that. Accepted knowingly, and §89 pins the behaviour with a test so it
cannot change by accident.

**D7 — Reconstruct the history as `CONVERT` rows, not adjustments.** Both
types ship; `ADJUSTMENT` is the escape hatch when the number is known but the
story is not, and `CONVERT` is used for the IKE Marek / IKE Beata / IBKR
history where the rate is recoverable from the sheet's own col 21.
Reconstructing as `CONVERT` means more rows entered by hand against a sheet
that never recorded them; that was chosen over closing the gap with a handful
of adjustments because the reconstructed history is self-documenting.

## 5. Open work

- [ ] `scripts/gotowka-gap-report.ts:78` — normalise the `Wpłata`/`Wypłata`
      sign before summing into `flows`, and move the arithmetic into a `src/`
      module with a fixture-backed test (`vitest.config.ts` matches no
      `scripts/` file today). Owner decision D1.
- [ ] Decide and implement what each tracked column is compared against, once
      the report above can be trusted — `derived free-cash` vs a whole-account
      PLN figure is not like-for-like (§3.3).
- [ ] Land `CONVERT` (D2–D5) and `ADJUSTMENT` (D6) per `plan.md` §89.
- [ ] Reconstruct the IKE Marek / IKE Beata / IBKR conversion history as
      `CONVERT` rows (D7), then re-measure the recon and record the new Δ.
- [ ] Retire the sheet row numbers cited in plan §78.2 / §87 (§3.5); cite the
      `Typ` + date + `Aktywo` instead, which is stable under row insertion.