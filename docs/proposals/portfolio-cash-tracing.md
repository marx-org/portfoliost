# Portfolio cash tracing — investigation & reconciliation

Status: **reference doc** (created 2026-09-27). Records how portfolio cash is
traced end-to-end through the sheets → wallets → charts pipeline, how the
**Gotówka vs Transakcje gap report** is produced, and what the recon has
found. Supersedes the inline recon notes in `plan.md` §58.7 / §62.6 / §62.9b.

## 1. The data model (what is the source of truth for cash?)

Free (uninvested) cash per portfolio is **derived**, not imported as a number:

- **Transakcje sheet** (Google Sheets, sheet `Transakcje`, ~2,025 rows, 49
  cols) is the *source of truth* for cash flows. Each row is one of:
  - a **trade** (`Kupno`/`Sprzedaż`/`Div`/`Split`/`Sell Call Option`) — the
    cash effect is the row's *Przepływ gotówki (PLN)* column (0-idx col 18);
  - a **Wpłata / Wypłata** (deposit/withdrawal) — an external cash movement,
    must carry the same column filled (enforced: AU=0 Wpłata/Wypłata aborts).
- **Gotówka sheet** (sheet `Gotówka`, 332 weekly/monthly balance snapshots,
  one column per account: ING ROR, OKO wspolne, OKO Obligacje, Smart
  Saver/PKO SA/OKO Rudnik, Inteligo ROR, **IKE Marek**, **IKE Beata**, **IB**,
  Suma…) is a **reconciliation reference only** — the user's own running cash
  ledger. It never drives values; a mismatch is warn-only.
- **AU flag** (col 46): AU=1 → the row moves cash (imports a cash leg);
  AU=0 → no cash movement (pure position replay).

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

## 2. The recon: Gotówka vs Transakcje

### The design premise (and its failure)

The original premise (plan §62.6) was: *Gotówka column on day D should equal
its first value + Σ all Transakcje cash flows up to D* — i.e. the sheet's
cash flows fully explain the account balance.

**RCA (2026-09-25/26, confirmed with the user):** the premise is wrong, and
not because of a bug — the **Transakcje sheet is missing inflow/outflow
rows**. The Gotówka column is the source of truth for free cash; several
deposits/withdrawals (brokerage funding, bank↔broker moves, IKE annual
top-ups) were never recorded as Wpłata/Wypłata rows in Transakcje. The
first full-history report showed **580 gap rows, Σ +293,240.54 PLN** across
the 3 tracked accounts.

The user is **adding the missing rows to the sheet** (driven by the report,
below). Each re-run of the report shows the remaining gaps; when the report
is empty (within 1 PLN) the sheet is complete and a wipe & reimport makes the
wallets cash ledger match Gotówka exactly.

### What the report compares, per day

For each tracked column (IB→IBKR, IKE Marek, IKE Beata; bank accounts are
out of scope — they don't map to a wallet):

```
Δ Gotówka(D)    = net change of the column's balance on day D
                  (a day may hold several rows — a deposit step and a trade
                  step — so Δ is the sum of the day's row-to-row deltas)
Σ Transakcje(D) = Σ "Przepływ gotówki (PLN)" of the Transakcje rows of the
                  same wallet + day (Konto column → wallet via konto-map)
BRAKUJE(D)      = Δ Gotówka(D) − Σ Transakcje(D)
```

`|BRAKUJE| ≥ 1 PLN` is reported: the account moved by that amount on that
day but no sheet cash flow covers it → a **missing Wpłata/Wypłata row**.
The report emits, per gap, a ready-to-paste row: `Wpłata <kwota> <Konto>`
(BRAKUJE>0) or `Wypłata <kwota> <Konto>` (BRAKUJE<0), to be added in
Transakcje with the cash-flow column = |BRAKUJE| (PLN) and AU=1.

### How to generate the report

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

Output format (one section per tracked account; `data` is sortable):

```
# Brakujące wpływy/wypływy: Gotówka vs Transakcje (wszystko w PLN)
## IBKR (Konto: IB) — 301 braków (…), Σ BRAKUJE = 152 294,67 PLN
data          | Δ Gotówka     | Σ Transakcje  | BRAKUJE       | do dodania   | wiersze tego dnia
2022-04-28 |         19,13 |          0,00 |         19,13 | Wpłata 19,13 IB | balance 423,07
…
```

The **live import** also runs a lighter in-memory recon after every
wipe & reimport (`portfoliost-sheets-sync/src/gotowka-recon.ts`,
warn-only, never fails the run): it compares each tracked column's *latest*
balance against first-balance + Σ imported effects and logs
`[gotowka] <portfolio> <date>: sheet X vs recon Y (Δ …)` lines to the job
log (tolerances: IBKR ±50, IKE ±10). Use the full report above for the
row-by-row fix; the import's recon is just a health check.

## 3. Findings so far (2026-09-25 → 27)

- **580 gaps, Σ +293,240.54 PLN** (first full run, pre-fix) — the sheet
  systematically under-records inflows; biggest single gaps are multi-thousand
  PLN funding events (e.g. 2022-10-15 +41,583.93 IB, 2022-10-26 −5,780.19).
- 147 of the IBKR gaps are on days with **no Transakcje rows at all** —
  pure missing rows, not mis-attributed ones.
- Follow-up fixes that changed what the report measures (2026-09-26/27):
  - **EXPIRATION rows** (`Sell Call Option` = expired, unexecuted short call →
    new first-class tx type closing the short lot at zero; no cash effect,
    so the report is unchanged by them).
  - **Cash descriptions** (`Buy: …` / `Sell: …` / `Deposit: Gotówka IB` /
    `Option premium: …`) and **transfer direction** in descriptions
    (`(→ Target)` / `(from Source)`) — display only.
  - **§62.6 PLN-cash-flow column conversion** — the sheet's cash-flow column
    is PLN; rows are converted to the row currency before import.
  - Re-run after fixes: gap count per account is stable (the fixes don't
    create/destroy cash flow) — the report is byte-identical apart from
    sheet edits.

### Open work

- [ ] User adds the missing Wpłata/Wypłata rows (see the report's
      `do dodania` column).
- [ ] Re-run the report until empty (within 1 PLN).
- [ ] Wipe & reimport (Admin → Jobs) → `[gotowka]` import recon lines should
      drop within tolerance for all 3 tracked accounts.
