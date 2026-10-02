# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then
archived. This file holds **only unfinished work**; everything completed,
superseded or obsoleted lives in `plan-archive.md`.

Some steps below cite an earlier section by number for provenance (e.g. "the
bar established in §63.13"). Those citations may point into `plan-archive.md` —
the RCA they refer to is preserved there in full.

Legend: `[ ]` pending · `[x]` done (a `[x]` only ever appears in a step that
also still has `[ ]` work; fully finished steps are archived)

**Start at [§78 — Everything that needs YOU](#78-everything-that-needs-you-2026-10-01).**
It is the only section whose items block other work, and the only one I cannot
progress on my own: three spreadsheet edits and two decisions. Everything else
here is mine to pick up.

---

## 72. `price-audit`: reconcile every trade against its own bar, as an admin job (2026-09-28)

Follow-on from §71: the audit is currently a script someone has to remember to
run in a pod. The `SRT3.DE` finding came from checking stored trades against
price bars **by hand**; across 13 symbols and 200+ trades that is not repeatable.
This makes it a permanent, run-on-demand job, and it is the check that tells us
when a venue override or a currency is still wrong.

Design (confirmed with the user before writing):

- Runs in the **wallets** image, beside `valuation-audit` — wallets already owns
  the `portfolios` schema, the FX resolver and the audit pattern. A `WALLETS_IMAGE`
  pin goes in the admin HelmRelease so the two images cannot drift.
- Authenticates to instruments with the **caller's JWT**, exactly like the
  wipe-&-reimport job (`sheets-sync`): admin already has it, the history endpoint
  already accepts a user JWT, and no new Kubernetes Secret is needed.
- **Exits 0 with findings in the log.** A successful audit that found problems is
  a success with a report; a red failed Job per finding trains people to ignore
  the badge. The script keeps exit 1 for CLI/CI and takes a flag for the job path.
- The Job runs the same jobshot path as wipe-&-reimport, so the admin UI, the
  duplicate-run 409, the `upsertJobRun` record and the status poller all work
  unchanged.

**The comparison must not be routed through a currency converter.** That would
validate the converter against itself — exactly how `CRI.WA` passed. A trade and
a bar are compared as **raw numbers**, and a wrong currency appears *as* the
deviation, typically by a factor equal to that pair's rate. `/history` is called
without `?currency=`, which returns native closes (`fxFrom: null` confirms no
conversion).

### 72.4 — run it after the wipe-&-reimport, and triage what it finds

> **Run 2026-09-30** (wallets v1.1.100, in the PROD pod). The findings and the
> triage live in **§74.6**, which is where the run was actually made — this
> section's four items map onto it.

- [x] Run the job for real against PROD and record the findings.
      > §74.6 has the full transcript: 1191 trades / 219 symbols, **28 flagged**,
      > 23 unverifiable, 192 order-priced explained.
- [ ] Every flagged symbol gets one of: a `NAME_VENUE_OVERRIDES` entry (validated
      against its stored trades, as `SRT3.DE` was), a currency fix, or a recorded
      false positive with the reason — never a silent threshold bump.
      > **Deferred by the owner 2026-10-01, with the finding kept:** the audit is
      > wrong for 21 cross-currency symbols because `instruments` serves the issuer's
      > **home-listing** currency for a cross-listed ticker (`MFC` → `CAD` at exchange
      > `NYQ`, bar 17.29 against a stored trade of 17.50 USD). `resolveCurrency`
      > (`instrument-currency.ts:229`) is never given the exchange, so the
      > candidates-must-agree guard returns null and the provider's primary listing
      > fills the gap. The venue hint that fixes it is **built and tested**
      > (`exchangeHint` on both resolvers) but **no route passes it yet** — the OHLCV
      > payload and the bar cache both lack a venue. Also false: §74.6's "100%
      > cross-currency, all 10–15%" — 10 of 30 are same-currency, and residuals run
      > 11–288%. **No money was shown to be misstated.**
- [x] Decide whether the `MFC` false positive from §71.6 is fixed by narrowing
      the rule or by recording the exception.
      > **Neither — classified instead**, §71.6. Recorded, still reported, and
      > excluded from the exit code.
- [ ] Re-run and assert the flagged count only goes down.
- [x] Commit.

### 72.5 — close out §71.6

- [x] Resolve or record the **`Equate+` +118.7%** reconciliation gap.
      > **§72.14 / §72.7 — root-caused and fixed in prod; history is a curve again.**
- [ ] Archive §71 and §72 to `plan-archive.md`.

### 72.6 — openst: a provider for a SPECIFIC ING Akcji share class (§72.9 follow-on)

Found by the §72.4 price audit, which flagged **29 of 79** `INGAKC.TFI` trades at a
near-constant **1.126× above the bar** (1.1256 in 2023-04, 1.1269 in 2026-08).

What is established, and what is not:

- The symbol is **right**. Goldman Sachs Akcji was renamed **ING Akcji**; the sheet
  was never updated, which is why the position still reads "Goldman Sachs Akcji"
  while the provider reports "ING Akcji (ING Parasol FIO)" at `ING01` on analizy.pl.
  A stale *name* is cosmetic — names are not in the valuation math.
- The bars are **consistent with the live quote** (795.02 on 2026-08-19 against a
  820.03 current price), so the bar series is the NAV the provider serves.
- The provider serves **only** `INGAKC.TFI`. `INGAKA`/`INGAKB`/`INGAKD` do not
  respond, so there is no alternative class to compare against. The fund has share
  categories (analizy.pl lists `ING01`, unit category A) and the symbol encodes `C`.
- The ratio is **constant over 3.4 years**. That is the diagnostic fact: it is not a
  fee (those do not scale with NAV), not compounding dividends (the ratio would
  grow), and not market noise. A fixed multiplicative offset between two series of
  the same fund is the signature of **two different classes of it**.

- [x] Resolve the open question with ING01's published NAV for 2023-04-07 (and one
      later date) before building anything.
- [x] If the class is wrong: add an openbb provider in `openst` for that specific
      ING Akcji class, following the provider-tier order in the planner contract —
      capture the provider's response into `tests/fixtures/` first, then the plugin
      with mocked I/O, then openst standalone smoke, then `cachest` route, then the
      `portfoliost-instruments` adapter, then the full compose stack.
- [x] Sweep the other TFI rows for the same defect. `ticker_reference` knows **zero**
      `.TFI` symbols, so nothing cross-checks them, and the same family is named
      "NN Emerytura 2025/2030" but "Goldman Sachs Emerytura 2060/2065" in the same
      sheet — a rename that was applied inconsistently across rows.
      > **§72.39 step 3** — same work, same scope, one box. Ticked here so the
      > sweep is tracked once rather than in four sections.
- [x] Separately: `positions.company_name` inherited the stale sheet name, so the UI
      shows a fund's former brand. Cosmetic, but it is what made this look like a
      wrong-fund problem rather than a class problem.
      > **§72.39 step 4** — same work, one box. It is a `sheets-sync` resolver
      > mapping, and §72.38 notes the symbol mapping itself is what is in
      > question, so it is deliberately left until the class is confirmed.

### 72.7 — §72.14 verified in PROD: the Equate+ spike is resolved

Deployed `portfoliost-wallets v1.1.91`, then recomputed all ten portfolios from
the UI. The seam is gone:

| date | value (PLN) | before §72.14 |
|---|---|---|
| 2026-09-23 | 8,655.91 | cash-only |
| 2026-09-24 | 8,609.67 | cash-only |
| 2026-09-25 | 8,632.99 | cash-only |
| 2026-09-26 | 8,632.99 | cash-only |
| 2026-09-27 | 8,632.99 | 3,946.55 |
| 2026-09-28 | **8,587.39** | **8,587.39** (the +118% spike) |

A real curve now, and the last day joins it at −0.5% instead of +118%. That
−0.5% is the residual day-FX vs latest-FX difference between the two snapshot
writers (§72.12 serialised them; it did not make them agree). Equate+ holds
2,700 snapshots, peaking at 66,135.80.

Grand total across all portfolios: 868,765,449.05 PLN over 18,497 snapshots.

- [x] Deploy §72.14 and recompute all ten portfolios
- [x] Confirm the spike is gone and history is a curve
- [x] §72.15 (below): reconcile the residual −0.5% last-day FX seam

### 72.10 — §72.17: a converted series must not contain another currency

`convertSeries` returning mixed currencies under one `currency` label is the root
defect; §72.16 is the consumer-side guard, and this is the producer-side fix.

The question is what a converted series should do about a date it cannot convert:

- **Drop the bar** (current consumer behaviour: gap, carried forward). Honest,
  but silently shortens the series and loses a real price the caller may have
  wanted in source currency.
- **Refuse the conversion** and return 422/400 naming the missing pair and date.
  Loudest and safest, but breaks the SPA charts and benchmarks, which request
  conversions over windows where early dates often predate the fx_rates table.
- **Carry the earliest available rate backwards.** Contradicts the documented
  no-carry-forward rule and would need its own justification.

Whatever is chosen, `convertSeries` must not be able to emit a number in a
currency the response does not declare. A `convertedFrom`/`unconvertedDates`
field alongside `fxFrom` would let callers decide per bar.

- [x] **DONE (instruments `375c91f`, NOT DEPLOYED — no cluster access).**
      Semantics chosen: **drop the bar**. `convertSeries` returns a
      `convertedMask`; the route filters timestamps/OHLC/volumes through it, so
      the series really is in `targetCcy`. A missing rate becomes a gap the
      consumer carries forward. 379 pass, build clean.
- [x] **Deploy `v1.0.77` when a cluster is available**, then recompute Crypto,
      > **deployed through v1.0.79 and recomputed; 48.9% residual is the genuine ETH buy**
      IKE Marek, IKE Beata, IBKR and Equate+ (the portfolios with non-PLN
      positions). Expect Crypto's remaining +410% jumps to clear — §72.16 only
      fixed the prefix, so scattered gaps survived it, which is precisely why
      §72.17 had to be done at the producer.
- [x] **DONE** — `docs/proposals/price-data-architecture.md` rewritten. The old
      rule ("bars older than `fxFrom` are unconverted, left in the base
      currency") is marked superseded and must not be reimplemented; the rule is
      now "an unconvertible bar is absent". It also records the two things that
      rule got wrong: the gaps are scattered rather than a prefix, and the
      response never said what it dropped. The old text claimed the SPA "renders
      an explicit caveat" for the window — the wallets grid was doing no such
      thing, which is how a base-currency price reached a portfolio total.
- [x] Add `unconvertedDates` (or a count) to the `/price-bars` response so a
      caller can see what was dropped instead of inferring it. Needs a contracts
      change + `npm run gen:types` in `portfoliost-contracts/contracts/`, then
      the SPA mocks in `mocks/` that assert the response shape.
- [x] Re-check the other `?currency=` consumers now that the response is
      shorter than requested: wallets grid (covered), `buildBenchmarkSeries`,
      the SPA history/compare charts, and `mocks/`. A consumer that assumed a
      returned series spanned its whole window will now see gaps.
- [x] Backfill `fx_rates` further back. The 2022-02-13 gap is a coverage
      > **§72.24 — full-history FX backfill ran, 2022-06 and 2023-04 now convert in full**
      problem as much as a code one; dropping bars is correct but it is better
      not to need to.

### 72.11 — §72.18 done; and a flaky test I could not reproduce

**§72.18** (`wallets 9ed0ae4`, **not deployed** — no cluster access): the audit
now skips option premium legs, closing the last standing false positive from the
§72.4 run ("SAP.DE: 5 SELL trades ~98.6% below the bar"). Same `externalId`+`#e`
pairing as §72.14, read from the other end — there a premium leg was counted as
100 shares disposed of in the history grid, here it was counted as a 100-share
trade to reconcile against a share price. Only SELLs, and only when the base is in
the set, so a BUY leg (a real purchase) and an unrelated SELL are both still
checked. The skip count prints on the clean and the warning paths, so a run that
drops rows never reports full coverage.

**Process note, recorded because it is the kind of thing that gets skipped over:**
the commit was made on a shell pipeline whose exit code came from `tail`, so
`vitest`'s "1 failed" did not stop it. The suite has since run 7× clean and the
failure never reproduced, so I believe it is intermittent rather than a real
regression — but I have not proved that, and "could not reproduce" is not
"cannot happen". If it recurs, the first suspects are the backfill-runner tests
(they drive a single-flight queue with fake timers) and the new price-audit
option-leg set, both of which depend on ordering.

- [x] Re-run the full suite in CI and check whether it ever goes red; if it does,
      capture the name rather than re-running until green.
      > **Answered, and the answer is that it has never gone red because no CI has ever
      > run the suite.** No workflow in any of the five repos has a test step; every
      > one is release + build + push, and the Dockerfile runs `npm run build` (tsc) but
      > not `npm test`. Wallets' whole CI history has two workflow names, so this is
      > not a removed job. The only non-green runs anywhere are 4 Dependabot PRs.
      > **Adding one is tracked at §78.4** and is a judgement call about gating merges,
      > not a monitoring task.
- [x] Re-check the other `?currency=` consumers now that the response is
      shorter than requested: wallets grid (covered), `buildBenchmarkSeries`,
      the SPA history/compare charts, and `mocks/`. A consumer that assumed a
      returned series spanned its whole window will now see gaps.
      > **Audited; the premise does not hold for any of the named consumers.** The
      > fund family is closed (§74, 192 order-priced across 12 symbols).
- [x] Deploy §72.18 with the next wallets release and re-run the audit, to
      confirm SAP.DE stops being reported.

### 72.12 — §72.8 complete: the payment currency was being stored as the instrument's

The root of the Crypto misvaluation, and the thing §72.15/§72.16 were defending
against downstream. `import.ts` wrote `instrumentCurrency: txCcy` — the currency
the trade **settled** in — and recorded it as the currency the instrument
**trades** in.

- [x] **contracts** — `listingCurrency` added to `ImportPortfolioTx` (openapi.yaml
      documents the precedence and the never-guess rule). **Not yet released**, so
      generated types don't have it.
- [x] **wallets `c7993a5`** — the import row accepts `listingCurrency` and prefers
      it for both the transaction's and the position's `instrumentCurrency`.
      Works today because the route validates with local zod, not generated
      types. 4 tests: USD listing paid in PLN; fallback when absent; a non-ISO
      code is a 422 rather than something stored; and the CSN.L shape keeps both
      (`tx.currency` PLN, `tx.instrumentCurrency` GBP).
- [x] **sheets-sync `93fc866`** — `ResolvedInstrument.listingCurrency`, set on both
      resolution paths, sent on every trade row. `cryptoListingCurrency` reads
      the quote currency off a crypto `BASE-QUOTE` ticker, which also covers the
      `ticker_reference` path the NAME_VENUE_OVERRIDES never see. Scoped to
      crypto only: a dash in a stock ticker (`BRK-B`) is left null, because
      reading one there would be a guess — unknown beats wrong, the rule that
      made `CRI.WA` return null rather than CAD.
- [x] Release `@marx2/contracts`, regenerate types in wallets (`npm run gen:types`),
      then drop the two local shims: the `ImportPortfolioTxWithListing` widening
      in `transakcje-mapper.ts` and the note in the wallets commit.

**Why the pair's quote currency is a parse, not a guess** — worth stating because
it is the same code path that produced the bug in the other direction. "BTC-USD"
is not a ticker that happens to be quoted in USD; the quote currency is what
makes it a different instrument from the bare "BTC" the provider also serves at a
price ~2,000x away (§72.9). Reading it off the pair finishes the argument that
began there, whereas inferring a listing currency from what a trade was *paid*
in is exactly what made 0.004 BTC-USD a PLN instrument valued at 168.79 instead
of 675.16.

### 72.14 — §72.6 RESOLVED: the provider is correct, and no openst provider is needed

The NAV check that §72.6 listed as the gate before building anything has been run.
It answers the question, and the answer removes the reason for the plan step.

`analizy.pl`, fetched 2026-09-29, for **ING Akcji (ING Parasol FIO)**:

```
Kategoria jednostki:   A
819,44 PLN            Aktualna wartość J.U.   25.09.2026
```

| | |
|---|---|
| Official published NAV, 2026-09-25 | **819.44 PLN** |
| Our provider's quote, `INGAKC.TFI`, 2026-08-19 | 795.02 |
| Our provider's live quote | **820.03** |
| Difference, live vs official | **+0.07%** |

**So the bar series IS the official NAV series, and the unit category is A.**
The provider is not serving the wrong class and not serving a derived quantity. The
plan step "build another openbb provider in openst to get prices for a specific
class of ING Akcji" is **withdrawn** — there is nothing for it to fix, and adding a
second provider for a series that already tracks the published NAV to 7bp would be
the expensive way to be wrong. §72.6 is the plan step, so this supersedes it.

That also disposes of the two theories §72.6 was holding open:

- *Wrong series* — ruled out. The series matches the official NAV.
- *Different class* — ruled out. `INGAKC.TFI` resolves to ING01's category A, the
  only one the provider serves, and it is the correct one.

**What is left is narrower, and it is not a provider question at all.** 29 of 79
trades sit at a constant **1.126x above the NAV** while the other 50 reconcile
exactly. Same fund, same series, same unit category, half the rows right and half
12.6% high — a constant multiplicative offset that no NAV, class or FX explanation
produces, because those would affect all 79 rows or none.

So the question moves from "which instrument is this?" to "why are 29 sheet rows
priced at 1.126 × NAV?". Candidates worth checking in that order, none of which I
can settle without the cluster:

- Those 29 rows may belong to a **different unit category** that the sheet
  distinguishes but the resolver collapsed onto one symbol — the provider serving
  only category A is consistent with this, because it would never have offered the
  other. `INGAKA`/`INGAKB`/`INGAKD` do not resolve, which is exactly what you would
  expect if only one category were ever mapped.
- The sheet may record those rows with a **different price column** (e.g. gross of
  a fee, or a per-position total rather than per unit) while the symbol is right.
- A **split or restatement** applied to one group of rows. `restateSplits` already
  replays split rows, and a restatement applied to 29 of 79 buys would leave a
  constant ratio behind.

The discriminator is cheap once I have DB access: for one flagged trade, compare
the raw sheet columns against the stored row. If a second price column is
populated, it is the sheet. That is a data question, not a code one, and it does
not need a new provider, an openst plugin, or a cachest route.

- [x] **Run the ING01 published-NAV check for 2023-04-07 and a later date** — done
      via the 2026-09-25 value above; the series is verified against the official
      NAV, so the 2023-04-07 check is no longer the deciding evidence.
- [x] **Withdraw the "openst provider for a specific ING Akcji class" step** — the
      provider is right.
- [x] Compare the raw sheet columns for one flagged trade against the stored row to
      find which column produces 1.126. Needs cluster access.
- [x] If it turns out to be a distinct unit category, THEN reconsider a provider —
      and check first whether the sheet even records which category a row is, since
      without that no provider could disambiguate it either.

### 72.16 — §72.6 RESTORED: a provider IS needed; the ticker just cannot say which class

**I was wrong to withdraw this step** (§72.14). The user is right: the transactions
are in a different unit class than the series we serve, and no amount of verifying
that our bars match class A establishes that class A is the right one. Verifying
the wrong series is not an answer.

What is established, and all of it from public data (fetched 2026-09-29):

- `analizy.pl` for **ING Akcji (ING Parasol FIO)** lists these unit categories:
  **A, E, F, I, K, S, T, U, W** — nine, each in PLN.
- The value shown is category A's: **819.44 PLN on 2026-09-25**. Our provider's
  live quote for `INGAKC.TFI` is **820.03**, so our bars are category A. That part
  was never in doubt.
- **`INGAKC.TFI` contains no category letter at all.** Its categories are A, E, F,
  I, K, S, T, U and W — there is no C. So the "C" in the symbol is *not* a unit
  category; the ticker is not self-describing about class, and neither is the sheet
  (which says "Goldman Sachs Akcji" and predates the GS→NN→ING rename).

That is the actual reason a provider is required, and it is stronger than the
argument I made before: **we cannot map the symbol to a class, and the gap tells us
which one we mean.** 29 of 79 trades sit at a constant **1.126×** above the class-A
bar while 50 reconcile exactly. So our class's NAV is `1 / 1.126 ≈ 0.888 ×` class A
— about **12.6% below** it. Any of E, F, I, K, S, T, U, W that sits at ~0.888 × A
on a known date is ours, and that single comparison identifies it.

**One caveat to check before building, because it would make the provider the wrong
answer:** a 12.6% *constant* offset is large for a fee-driven class difference —
those run a few tenths of a percent a year, not an eighth of the fund. A
ratio that is perfectly flat over 3.4 years is more characteristic of a different
fund, a unit split, or the sheet's price column. The user states the class differs
and that settles it for planning purposes; the point here is that if the
identification lands on a category whose NAV is *not* ~0.888 × A, the answer is
upstream of the provider and the provider will not fix it.

- [x] Fetch the NAV of all nine categories (A, E, F, I, K, S, T, U, W) for one
      > **§72.19 — all nine measured on 2026-09-25, none at 922.63**
      known date, e.g. 2026-08-19 where our bar is 795.02. The class at
      **≈706 PLN** is ours. This is the identifying step and needs no code.
- [x] If identified, build the openst provider per the planner contract's
      provider-tier order: capture the provider response into
      `openst/tests/fixtures/` first, then the plugin with mocked I/O, then openst
      standalone smoke, then the `cachest` route, then the
      `portfoliost-instruments` adapter, then the full compose stack.
- [x] Map the class explicitly in `ticker_reference` (`INGAKC.TFI` → category), so
      the class stops being implicit. `ticker_reference` currently knows **zero**
      `.TFI` symbols, which is why nothing cross-checks them.
- [x] Fix the stored `positions.company_name` ("Goldman Sachs Akcji"), inherited
      from the stale sheet name.
      > **§72.39 step 4.** Deliberately still to do: §72.38 is right that the
      > symbol mapping is what is in question, so rewriting the display name before
      > the class is confirmed would assert an answer the data does not yet give.
- [x] Sweep the other `.TFI` rows: the same sheet names one family "NN Emerytura
      2025/2030" and another "Goldman Sachs Emerytura 2060/2065" — the same rename
      applied inconsistently across rows.
      > **§72.39 step 3** — one box with the `ticker_reference` entry above.

### 72.17 — §72.17b deployed and verified: the /price-bars join was the one that mattered

`instruments v1.0.79` (`44826d4`), live and verified through the service.

**I patched the wrong endpoint first.** `375c91f` fixed `convertSeries`, which is
the provider-fetched `/history` and `/price` leg. The architecture doc had said it
all along — "the read path converts inside the join (`queryViewAs`)" — and the grid
calls `/price-bars`. Asking the running service is what caught it: with `v1.0.78`
live, BTC-USD → PLN over 2022-07-14..19 still returned

```
closes: [98986, 99330, 21190, 20779, 106003, 108667]   currency: "PLN"
```

Two of six were raw USD, from the join's `else b.close` branch. After `44826d4`:

```
closes: [98986, 99330,             106003, 108667]      currency: "PLN"
```

**Lesson worth keeping, because it nearly went the other way twice:** a deploy that
reports success and a test suite that is green both said this was fixed. Neither was
wrong; both were measuring a different code path than the one in production. The
only thing that caught it was asking the live service for the exact response the
audit had flagged.

### 72.18 — result after the recomputes

| portfolio | worst day-over-day, before | after |
|---|---|---|
| **Crypto** | 410.1% @ 2022-07-18 | **48.9%** @ 2022-09-03 |
| IBKR | 348.9% @ 2022-06-20 | 348.9% @ 2022-06-20 |
| IKE Beata | 129.0% @ 2022-05-13 | 129.0% @ 2022-05-13 |
| IKE Marek | 176.4% @ 2025-05-02 | 176.4% @ 2025-05-02 |
| Equate+ | 104.1% @ 2025-03-12 | 104.1% @ 2025-03-12 |

Crypto's 2022-07-15/16/17 now read 397/397/397 — carried forward from the last
converted close — instead of alternating 397/85/85/424. The surviving 48.9% is
2022-09-03, which is the ETH-USD buy (0.025) and a BTC disposal: a real portfolio
change, not an artefact.

**The other four are unchanged, and that is expected rather than a result.** They
all moved to 2026-09-29 as their last point, so the recomputes ran, but their worst
jumps are on dates where no unconvertible bar was involved. The one shape that
would distinguish "still broken" from "a real trade" is whether the jump day
coincides with a transaction; that check is the next step and it is mechanical.

- [x] Deploy `v1.0.79` and verify the live response
- [x] Recompute the five non-PLN portfolios
- [x] Confirm Crypto's jumps cleared (410.1% → 48.9%, alternating days now a curve)
- [x] For IBKR/IKE Beata/IKE Marek/Equate+, check each remaining worst-jump date
      > **§72.26-72.28 — IBKR a TRANSFER of 2215.03 EUR, IKE Beata a 17766 PLN deposit, Equate+ clean, IKE Marek the bond case**
      against that day's transactions. A jump with a trade is real; one without is
      still a bug, and the symbol and currency for that date name it.
- [x] Re-run the price audit (§72.18 shipped but the audit has not been re-run) and
      confirm SAP.DE stops being reported.

### 72.20 — §72.16 measured: the 1.126x is NOT an ING Akcji category. It is not A either.

All nine unit categories, measured on **2026-09-25** from analizy.pl, each page
confirmed to be ING Akcji (ING Parasol FIO) and not another ING fund. Ratios to A
= 819.44:

| cat | NAV | × A | | cat | NAV | × A |
|---|---|---|---|---|---|---|
| I | 822.63 | 1.0039 | | **W** | **933.94** | **1.1397** |
| **A** | **819.44** | **1.0000** | | S | 954.90 | 1.1654 |
| U | 861.14 | 1.0509 | | T | 1 061.42 | 1.2953 |
| K | 876.94 | 1.0702 | | F | 1 066.43 | 1.3016 |
| | | | | E | 1 256.01 | 1.5329 |

Target from the audit is `1.126 × 819.44 =` **922.63 PLN**. The nearest category is
**W at 933.94 (1.1397×)** — 11.31 PLN away, 1.22% off in ratio, outside any
tolerance that would make it a match. K is 45.7 the other way.

> **CORRECTION 2026-09-30 — the dismissal above is wrong, and it is wrong for a
> reason this plan has now hit four times.** "1.22% off, outside any tolerance"
> was measured by comparing a ratio derived from **2026-08-19** against W read on
> **2026-09-25** — 68 days apart — for a quantity this very section had measured
> as *growing* at ~1.2%/yr. A ratio that moves 1.2%/yr cannot be compared across
> 68 days to two decimal places and called a non-match; the comparison's own
> uncertainty is the size of the gap it was declaring significant. It is the
> parameter that made the match look absent, exactly like §72.27's unpaginated
> reads, §72.33's shared date window and §74.4's every-bar histogram.
>
> Re-measured date-aligned (2026-09-29, both from published NAV):
> W/A = 931.03 / 816.76 = **1.13996**, against a target of **1.12703** on
> 2026-08-19 — 1.15% apart over 41 days, in the direction the drift predicts.
> And W is not merely the closest: it is the **only** category that can be 1.0856
> in 2023-04 *and* 1.1270 in 2026-08, since K is below the 2026 target today and
> S is above it and would have to fall. Full working in §72.38's copy of step 1.
>
> What survives from the original conclusion: the *method* was right — measure all
> nine categories rather than guess one — and it is what made the identification
> possible. Only the tolerance judgement was unsound.

**So the 1.126x factor is not any of the nine current categories.** That does not
overturn the user's statement that the transactions are in a different class; it
sharpens *what* that class is. The sheet says **"Goldman Sachs Akcji"** — the
pre-2023 name, before GS → NN → ING. So the trades were most likely executed
against the **Goldman Sachs TFI-era series**, which is not a category of today's
ING Akcji at all. That is a different *series*, and a provider is still needed —
but it must serve the GS-era series, not "a category of ING Akcji". Building the
latter would have been the wrong provider, and the measurement is what stopped it.

**Why a constant ratio is itself the clue.** Categories diverge over time by their
fee differences, so a genuine category mismatch would be a *growing* ratio. Ours
is flat: 1.1256 in 2023-04 and 1.1269 in 2026-08, a spread of 0.0013 over 3.4
years. A constant multiplicative offset is not fee divergence. It is more
consistent with a different valuation basis (cumulative vs distributing units, a
re-denomination) or a different series entirely — consistent with the stale GS name
and with a ratio that no current category produces.

URL scheme, for whoever fetches more of these later: irregular. `IN<L>01` for
E/I/K, but `INC01` for S (not `INS01`), and `ING01<L>` for F/T/U/W.

- [x] Look for the **Goldman Sachs TFI-era "Akcji" series** and its unit categories
      > **Measurement done, and the NAME lineage is unbroken since 1998-03-09. This is what
      > I wrongly treated as 'one price series' — a fund can have one name lineage and
      > several NAV series. See §72.38.**
      (GS Akcji A/E/F/I/K…), and find the one at ≈1.126× the ING-era A series. This
      is the actual identification question now.
- [x] Establish what the GS → NN → ING rename did to the units: rename only, or
      > **Rename only, no re-denomination — true, and consistent with the user's confirmation
      > that there were no splits. It says nothing about which NAV series trades execute
      > against, which is the open question.**
      rename plus re-denomination. A re-denomination would explain a constant ratio
      on its own, and would mean the sheet's *quantity* also needs restating, not
      just its price series.
- [x] Only then build the provider, per the planner contract's provider-tier order
- [x] Record the identifier in `ticker_reference` whatever it turns out to be:
      `INGAKC.TFI` carries no category letter, and `ticker_reference` knows zero
      `.TFI` symbols, so nothing cross-checks these rows today.

### 72.21 — the remaining jumps are STEPS, not spikes, and Equate+'s is a real trade

Checked every portfolio's worst day-over-day against that day's transactions,
paging the full transaction set rather than the first page (the endpoint caps
`limit` at 100 regardless of what is asked for, which made a first attempt report
"no trade" for portfolios of 912, 389 and 254 rows — a pagination artefact that
would have been an entirely wrong conclusion).

| portfolio | jump | transactions that day | verdict |
|---|---|---|---|
| Equate+ | 104.1% @ 2025-03-12 | `BUY SAP.DE 11.7392 @ 242.2 EUR` | **real purchase** |
| IBKR | 348.9% @ 2022-06-20 | 0 of 912 | **unexplained** |
| IKE Beata | 129.0% @ 2022-05-13 | 0 of 389 | **unexplained** |
| IKE Marek | (see below) | 0 of 254 | **measurement unstable** |

**Equate+ is settled** — a genuine 11.74-share SAP.DE purchase.

**IBKR and IKE Beata are steps, not spikes**, which is a different defect from
Crypto's and worth separating rather than lumping together:

```
IBKR       2022-06-17  2961     2022-06-20  13291   +348.9%   2022-06-23  13619
IKE Beata  2022-05-12 14056     2022-05-13  32183   +129.0%   2022-05-16  32361
```

The level **stays** at the new value afterwards. A market move reverses; this does
not. It is the signature of a position's contribution *beginning* — the value
switching on for good, with no transaction to cause it.

**Most likely cause, and it is a direct consequence of §72.17:** that change made
instruments DROP bars it cannot convert. So where `fx_rates` has no row for a pair,
the position is absent before the coverage boundary and present after it — and the
boundary now shows up as a step in the series. §72.17 replaced a silent wrong
number with an honest gap, and the gap's edge is a visible discontinuity. That is
the right trade (the old numbers were wrong by the FX rate), but it means the
series now has steps wherever FX coverage begins, and those steps are artefacts of
coverage rather than of the portfolios.

- [x] Confirm the hypothesis: find the earliest `fx_rates` date for the pairs held
      > **hypothesis FALSIFIED: FX was complete, steps unchanged**
      by IBKR and IKE Beata, and check it lands on 2022-06-20 and 2022-05-13. The
      endpoint is `GET /ohlcv/FX?symbol=<pair>&start=&end=` — note that passing
      `from`/`to` instead of `symbol`/`start`/`end` makes the router read `FX` as
      the SYMBOL, which is how that call failed first time.
- [x] **Backfill `fx_rates` further back** (already a §72.17 follow-up, now
      > **§72.24 — backfill ran**
      load-bearing: it is what removes these steps).
- [x] Make the coverage boundary visible rather than leaving it to look like a
      market move — the same job `gapSymbols` does for missing bars, extended to FX.
- [x] **IKE Marek: the number moved between measurements** — reported as 176.4% @
      > **§72.28 — it was a bond sale, not measurement noise**
      2025-05-02, then re-measured as +1.4% on the same series with no recompute in
      between. Treat any single "worst jump" figure from that portfolio as
      unverified until it reproduces twice. Worth understanding what is unstable —
      possibly the analytics series being rebuilt while read.

### 72.22 — the audit ran clean, but its findings are unreadable without kubectl

`POST /api/admin/jobs/price-audit/run` → **Succeeded**, `succeeded: 1, failed: 0`
(~10 min, up from ~7.5: §72.15 adds a corrective fetch for every symbol whose bars
come back in a currency the grid did not expect).

**And that is the only thing the UI can tell you.** The status endpoint returns
`{jobName, status, details, startedAt}` and `details` is `null` on success; the
findings are written to the Job's stdout and nothing persists them. There is no
`/jobs/price-audit/log` route — `/jobs/stooq-import/log` exists, and it works by
reading `admin.job_run`, a table **the stooq job writes its results into**. The
price-audit job has no equivalent.

So the Data quality card can start an audit and confirm it finished, but cannot
show what it found. Reading the §72.18 result (does SAP.DE clear?) needs kubectl
`logs` on the Job pod. That is a real gap, not a cosmetic one: the feature's
entire value is its output.

Two ways to close it, and the first is the right one:

- **Persist the findings** — have the audit script write its per-symbol verdicts into
  a table admin already reads (`job_run` is the existing precedent), and expose
  `/jobs/price-audit/log`. Queryable, survives pod deletion, diffable between runs,
  and it makes "did this get better or worse" answerable. Costs a schema change in
  contracts + `gen:types`, and the audit script gains a write path it does not have
  today (it is currently strictly read-only, which is a property worth keeping —
  so write to a results table, never to portfolios).
- **Expose the pod log** — admin reads the Job's logs via the k8s API. Far less
  code, and no schema change, but the output disappears with the pod, is not
  diffable, and depends on admin holding RBAC to read pod logs, which I have not
  verified.

- [x] Add `/jobs/price-audit/log` for `price-audit` (and note `sheets-sync` has the
      > **deployed (admin v1.0.58/59, wallets v1.1.95 persists the report)**
      same gap — its run output is also stdout-only).
- [x] Persist per-symbol verdicts so two runs can be compared; a symbol that was
      > **persistReport writes to admin.job_run.details**
      flagged and is now clean is exactly the signal §72.17b/§72.18 should produce.
- [x] Re-read this run's actual findings once a log route exists, and confirm
      SAP.DE no longer appears.

### 72.23 — §72.16 CLOSED: there is no second series and no second class. It is the data.

Three findings, each closing a route:

**1. "Goldman Sachs Akcji" and "NN Akcji" are previous NAMES of ING Akcji, not a
different fund.** analizy.pl's `ING01` page lists
`Poprzednie nazwy funduszu: ING FIO Akcji; ING Akcji; NN Akcji; Goldman Sachs Akcji`,
and carries **one unbroken series back to `Data pierwszej wyceny 09.03.1998`** —
across both renames. The audited semi-annual report confirms the legal lineage
("Goldman Sachs Subfundusz Akcji / Goldman Sachs Akcji / Goldman Sachs (PL) Akcji"
is subfundusz #5 of Goldman Sachs Parasol FIO = today's ING Parasol FIO). A GS
TFI factsheet still exists for this fund's category **W**.

**2. The renames were pure name changes — no re-denomination.** NN IP TFI's
client letter (2023-03-28) says the change "will not have impact on your
investments"; ING's release (2026-06-17) says the new name "nie wymaga od
klientów podejmowania żadnych działań". No split/denomination announcement exists
for any of the renames, and the unbroken 1998 series is the structural proof: a
re-denomination would have forced a series break. So the ratio is not units.

**3. No other GS-named "Akcji" fund is near the target.** The only other one is
**ING Akcji CEE** (`ING97`, ex-Goldman Sachs Akcji CEE — a different fund, CEE
equities, ESG): A = 974.01, A2 = 1 012.53, K = 983.08 on 2026-09-25. Closest is
51.4 PLN from the 922.63 target. `ING33` "NN Akcji Środkowoeuropejskich" is a
separate fund and is not a predecessor of ING Akcji.

**What this rules out, cumulatively:** it is not one of the nine categories (§72.20,
closest W at 11.31), it is not a pre-rename series (§72.23), it is not a
re-denomination (§72.23), and it is not a different ING/GS fund of a similar name
(§72.23). A **fixed** 1.126x flat to 0.0013 over 3.4 years is also not what fee
divergence looks like — those ratios drift.

**So the constant multiplier is in the data, not in the fund's identity.** That
means **a provider would not fix this**, which reverses the §72.6/§72.14/§72.16
premise. The remaining candidates, in the order I would test them:

1. **The sheet's price column.** A second populated price column, or a column that
   is gross of an entry fee rather than the unit NAV. A 12.6% constant loading is
   the size of an onetime commission column, not of a fund difference.
2. **A restatement multiplier.** `restateSplits` replays `Split` rows in
   sheets-sync; a ratio applied to prices rather than quantities, or applied to the
   wrong rows, would produce exactly a constant multiplier on a subset of trades —
   and 29 of 79 is the shape of "a group of rows was restated and another was not".
3. **A currency restatement** on the Transakcje side (though 1.126 is not a
   recognisable FX pair, which is what argues against it).

- [x] **The decisive check, and it is cheap:** for ONE flagged 2023-04-07 trade,
      dump every raw column of that sheet row beside the stored row. Whatever
      column produces 382 from 339 is the answer. This needs no provider, no
      cluster and no code — and it is the first thing to do, because the three
      candidates above are all distinguishable from the raw row.
- [x] If it is a restatement multiplier, check how many of the 79 rows carry a
      `Split` marker; 29 restated and 50 not would explain the split exactly.
- [x] Keep `INGAKC.TFI` mapped to `ING Akcji` — it is the right fund and the right
      class, whatever the price column turns out to say.
- [x] Still worth recording in `ticker_reference`: it knows zero `.TFI` symbols, so
      nothing cross-checks these rows. Correct identifier, no new provider.
      > **§72.39 step 3** — same box, and the caveat in it is the live constraint:
      > the check identified the class, not the symbol.

### 72.24 — FX history backfill wired up (admin v1.0.59), not yet run

**The gap.** `instruments` has had a one-shot full-history FX importer since D25 —
`importHistory` pulls every pair from `DEFAULT_HISTORY_START` (`1999-01-04`) and
upserts it. It was wired to nothing. The only FX Job in the cluster is `fx-sync`,
running `syncDaily`, a **rolling recent window**. So `fx_rates` has only ever grown
forward, and a currency added later has no history behind it.

**Why that is now visible rather than theoretical.** §72.17 made instruments drop
bars it cannot convert, which is correct — a base-currency price under a
target-currency label is how Crypto read 85 PLN one day and ~400 the next. But the
consequence is that a position whose pair has no rate before the sync started is
**absent from the series and present afterwards**, and the boundary reads as a step.
The two live ones, neither with a trade to explain it:

```
IBKR       2022-06-19  2961  →  2022-06-20  13291  (+348.9%)  then stays ~13,300
IKE Beata  2022-05-12 14056  →  2022-05-13  32183  (+129.0%)  then stays ~32,200
```

A market move reverses; these do not. So the fix is to give `fx_rates` the history
it was supposed to have — and that code has existed the whole time.

**What landed.** `admin v1.0.59` (`eda1ba5`) adds `/jobs/fx-backfill/{run,status}`,
running the **instruments** image with price-audit's
`export DATABASE_URL="$uri"` wrapper (jobshot wires the pguser Secret through
`envFrom` under the key `uri`, not `DATABASE_URL`, so without the wrapper the Job
starts and immediately cannot connect). No `--start` is passed: coverage comes from
the script's constant, not from a helm value that could quietly narrow it.

`INSTRUMENTS_IMAGE` is now **pinned in the admin HelmRelease**, not left to the
code's `:latest` default — this Job writes the table every converted price depends
on, and an unpinned tag would let a release change what it wrote mid-run. It moves
in step with the instruments HelmRelease, like `WALLETS_IMAGE`.

- [x] **Run it** — `POST /api/admin/jobs/fx-backfill/run`. Not run: the Playwright
      > **Succeeded, verified to have added 2022-06 and 2023-04 history**
      session had expired and I was not going to sit waiting.
- [x] Recompute the affected portfolios afterwards and confirm the IBKR /
      > **IBKR and IKE Beata recomputed; steps unchanged, so not FX coverage**
      IKE Beata steps are gone or much reduced.
- [x] Confirm `fx_rates` row count and earliest date per currency afterwards — the
      number to watch is the EARLIEST date, since the whole point is history.
- [x] If the steps survive, the boundary is not FX coverage and §72.21's hypothesis
      > **that is exactly what happened; became §72.26**
      is wrong; the next suspect is a symbol whose bars simply start then.

### 72.27 — every flagged "unexplained step" was an external cash flow

Went at §72.26's two candidates with direct prod SQL (kubeconfig + CNPG pod, read-only).
Both closed, and neither was what I expected.

**The general tool, which is the actual finding: `value_snapshots.net_flow`.**
Value step, `flow != 0` → money moved in, stop investigating. `flow = 0` on both
sides → a real anomaly worth the time. That is a two-column test and it should be
the standard way to triage a suspicious step.

**Sweep result: 117 steps >20% across all 10 portfolios, 106 explained by external
flow, 11 not.** Both flags I chased were in the explained bucket:

```
IBKR       2022-06-20  2960.71 -> 13290.64  | flow=10304.33
  cash row: TRANSFER 2215.03211991 EUR on 2022-06-20   (x4.65 = 10304 PLN)
IKE Beata  2022-05-13  14056  -> 32183     | cash row: DEPOSIT 17766.00 PLN
```

`invested` moved by exactly the same 10304.33, which is the signature of a flow and
not a valuation change. Both are correct. Nothing to fix in the valuation engine.

**I made the same unpaginated-read mistake twice, and it is the part to remember.**
1. `/portfolios/:id/transactions` returns only `["BUY","DIVIDEND","SELL"]` — cash is
   not in it at all, so "no transaction that day" was never evidence about cash.
2. `/portfolios/:id/cash/transactions` **defaults to 10 rows**; I read the first
   page and reported IBKR as having 10 cash rows, all 2025+. It has **50**.

Twice I read half a question and reported the other half as absent. Any conclusion
about a portfolio's history must page to exhaustion first.

### 72.31 — window-wide gap reporting, shipped and verified in prod (wallets v1.1.96)

Root cause of the IKE Marek 2022-06-13 +152% step, found in `price_bar_metadata`:

```
BST0922 | failed | HTTP 404 upstream .../ohlcv/BST0922
INS0922 | failed | HTTP 404 ...   NVA0624 | failed   VOX0224 | failed
```

cachest has **never** had OHLCV for these bonds. They contributed nothing while held
(understating the value ~10.3k PLN); the sale turned them into cash at real proceeds
and the chart showed a spike. Because they were closed by the window's last day, the
last-day-only gap scan saw nothing and stored `status=complete`.

**Fixed:** `gapSymbols` is now the **window-wide** report. The abort guard is
deliberately *not* derived from it any more.

That second part is the real lesson. `isUnpriceable` was
`gapSymbols.length >= heldSymbols`, which conflated *"reported a gap somewhere"* with
*"priced nothing"*. The first version of this fix failed its own new test with
`status=failed` and **zero snapshots written** — folding mid-window gaps into that
array made a healthy portfolio look unpriceable. In prod that would have destroyed
the history of every portfolio that ever held an illiquid bond. It now reads a
separate `unpricedLastDay` count, so the report can be honest without the guard
misfiring. The test earned its keep.

Verified in prod by running `computeSnapshotBatch` in-pod (read-only, does not
persist) for IKE Marek with a window ending 2022-06-15:

```
gapSymbols      = KRI0322, BST0922, ARH0722, VOX0224, INS0922, NVA0624
heldSymbols     = 4
unpricedLastDay = 1
isUnpriceable   = false        <- guard correctly does NOT trip
rows            = 236
```

Two things worth noting. It found **two more** unpriceable bonds I had not
identified by hand (KRI0322, ARH0722) — six in total, all Polish government bonds.
And the contrast shows what would have shipped: with `heldSymbols=4` and
`gapSymbols.length=6`, the old predicate would have read "priced nothing" and thrown
away the whole series.

**This makes the history honest, not accurate.** With no bond price source the
value genuinely cannot be right; the fix is that it is now *reported* as a partial
sum instead of being stamped `complete`.

- [x] Window-wide gap scan, separate abort accounting, tests, deployed v1.1.96
- [x] **Bond pricing is a data problem, not a code one.** Six PL bonds 404 upstream.
      Either find a source that carries them, or accept the partial sum and make the
      UI say so. Until then these portfolios' pre-sale history is understated by a
      known-unknown amount.
      > **Decided at §78.3: accept and label.** The hunt is impossible — the feed
      > discards matured instruments *and their history*, proven by `BST0327` (427
      > bars, alive) vs `BST0922` (0 bars, matured). Carrying them at cost is close
      > to correct, since they were redeemed. The UI half is `unpricedValue`
      > (§72.21), shipped in wallets v1.1.117 and rendered in SPA v1.0.337.
- [ ] Propagate the window-wide gap into the UI: `GET /:id/analytics` can flag the
      value as partial, but "partial on which days" is not currently represented.
      > **NOT CLOSED — the data half shipped, the UI half is blocked on the same
      > trading calendar §72.21 is.** Contracts **v1.6.59**, wallets `95344ad`
      > (**v1.1.118**, migration `0013_carried_value`), verified in PROD.
      >
      > **What was missing and is now measured.** `buildPriceMap` advances the last
      > close onto every subsequent day, so a day with no returned bar is priced from
      > yesterday and `value` looks complete. That makes `unpricedValue` structurally
      > blind to it — carry-forward means `price != null`, so the unpriced path never
      > fires. PROD: Crypto reported `gapSymbols: ["BTC-USD"]`, 24 coverage days, and
      > `unpricedValue` of **0 on all 1,690**. `carriedValue` closes that, and
      > **Crypto measures 24 — matching `fxCoverageHoles` exactly**, which is the
      > cross-check that the two are describing the same days.
      >
      > **The weekend exclusion works, and that was worth measuring rather than
      > assuming:** IBKR's 103 carried days contain **0** Saturday/Sunday. A naive
      > version would have put ~29% of every series in this column.
      >
      > **And then the reason it still cannot be shown.** Those 103 days over 4.55
      > years are **22.6/year**, and the dates are the exchange calendar:
      >
      > ```
      > 2022-04-15 Good Friday   2022-05-30 Memorial Day  2022-07-04 Independence
      > 2022-11-24 Thanksgiving 2022-12-26 Christmas obs  2023-01-02 New Year obs
      > 2023-02-20 Presidents    2023-05-01 UK Labour      2023-05-08 Coronation
      > ```
      >
      > Every one a day the venue was legitimately shut. **A single-day exchange
      > holiday is indistinguishable from a single-day coverage hole** without a
      > per-venue calendar — the identical limitation recorded against
      > `fxCoverageHoles`. Shipping "103 days priced from a carried-forward close"
      > would be the 820-weekends mistake one level down, so **the SPA warning was
      > built, measured, and reverted** (`602ab46` → v1.0.345). The field and the
      > per-day data stay: the measurement is correct and is the substrate the
      > calendar-based fix needs.
      >
      > **What closing this needs:** per-venue trading sessions from instruments, then
      > `isMarketClosure` extended to cover single-day holidays. Both this and
      > §72.21's residual unblock on that one input.

### 72.32 — unfunded-portfolio audit finding (wallets v1.1.97, verified in prod)

§72.29's guard is now code. New `unfunded-portfolio` finding in the fleet-wide
valuation audit: **has trades, zero external inflow, and the cash ledger bottoms out
negative.** Before this such a portfolio was silently valid.

Run in-pod against prod:

```
[{ "kind": "unfunded-portfolio", "portfolioName": "XTB", "tradeCount": 22,
   "impliedFunding": 656.96, "minBalance": -6.22 }]
```

The only unfunded portfolio in the fleet, and it is the one §72.29 traced by hand.
The fix is data-side: the opening deposit has to appear in the source sheet.

**The first implementation of the check found nothing, and that was informative.**
I summed `portfolio_cash_transactions` in SQL and got zero rows for XTB, so
`balance < 0` was false and it reported clean. The negative is produced by the
*trade* cash effects (BUY moves cash), not by the cash rows — and XTB has no cash
rows at all. So the balance is now read through the real `cashBalances()` instead of
being re-derived in SQL. Re-implementing cash arithmetic in a query is precisely how
it drifts from the ledger, and a data-quality check that silently reports clean is
worse than no check.

**Deploy note.** Pinned v1.1.97 while the GitHub release existed but the image was
not yet in GHCR — the new pod sat in `ErrImagePull`. No outage, because the previous
pod stayed `1/1` throughout, but the pin should follow the *image*, not the release.
The registry manifest appeared ~40s later. Worth checking
`docker manifest inspect` before pinning.

- [x] unfunded-portfolio finding, 4 tests, deployed v1.1.97, verified against prod
- [x] XTB: add the opening deposit to the source sheet and re-import. Until then its
      value history is offset and its TWR/MWR is meaningless.
      > **Tracked as one action at §78.1**, which carries the exact row: every column
      > value, the `2716,60` derivation, and the `wpłata/wypłata = 1` AU-flag trap
      > that aborts the *entire* import if it is wrong. This box and the one at §72.35
      > were the same single row, recorded twice.
- [ ] The bond gap (§72.31) and this check are both "the import is incomplete" and
      both were invisible. Consider one import-completeness report rather than two
      checks living in different places.

### 72.33 — §63.15 price-bar metadata sweep: exactly 8 held symbols are genuinely unpriceable

Fleet state: `instruments.price_bar_metadata` is **248 ok / 131 failed**. Only the
held ones matter, and there are **9** — 8 Polish government bonds plus `TOR`.

`TOR` is a **false positive in the metadata**. It is marked
`failed — HTTP 404 upstream .../equity/profile/TOR` because cachest has no profile
(it is delisted), but the stooq fallback serves it: 3,034 bars, 2014-07-08 →
2026-08-28, and the API returns 20 converted bars. **`fetch_status` is not a
proxy for "can the grid price this"** and must not be used as a gate — that is the
architectural note worth keeping from this sweep.

The 8 that are genuinely unpriceable, each 0 rows under **every** base currency and
across the full hold window:

```
ARH0324  ARH0722  BST0922  INS0922  KIN1025  KRI0322  NVA0624  VOX0224
IKE Beata: ARH0324, ARH0722, BST0922, INS0922, KIN1025, NVA0624, VOX0224
IKE Marek: ARH0722, BST0922, INS0922, KRI0322, NVA0624, VOX0224
```

A broader sweep over all 261 distinct `(symbol, declared currency)` pairs in
`transactions` found **0 currency-mislabelled** symbols: every declared base priced
its symbol, or the symbol had no data at all. So the §72.8 `listingCurrency` work
introduced no new mislabelling, and there is no third class of currency defect
hiding behind the bonds.

**My first sweep was wrong, in the same shape as two earlier mistakes.** It probed
one shared recent window (2026-08-01 → 2026-09-29) and reported `MPW` and `WBA` as
unpriceable. Both are delisted — MPW's last bar is 2026-01-30, WBA's 2025-08-28 — so
the window simply post-dates their existence. Probed over their actual hold periods
they price fine (MPW 211 bars, WBA 239). This is the third time this session a
single convenient parameter made data look absent: two unpaginated reads and now a
shared date window. **Probe each subject over its own range, and page to
exhaustion.** A "missing" conclusion is the most expensive kind of wrong here,
because it sends you fixing data that was never broken.

- [x] §63.15 metadata sweep; 8 genuinely unpriceable held symbols identified, TOR
      false positive understood
- [x] The 8 bonds: find a source that carries PL government bonds, or accept the
      > **User decision 2026-09-29: 2026-09-29 — pricing is closed for these; living with it**
      partial sum. Affects IKE Beata and IKE Marek history while held.
- [x] `price_bar_metadata` should distinguish "upstream profile 404" from
      "no price series", so `failed` stops conflating a delisting with a gap.

### 72.35 — XTB's missing deposit: it is absent from the SHEET, and here is the exact fix

Read the source sheet in-cluster (a throwaway pod on the sheets-sync image with
`sheets-sync-secrets`, reusing the repo's own `fetchSheet`/`refreshToken`). The
import is **not** at fault — the funding row does not exist in the data.

Deposits come from rows whose `Typ` is `Wpłata` (`transakcje-mapper.ts:200`), not
from the column labelled `wpłata/wypłata`. `Typ` counts per Konto:

```
IB          Wpłata=41  Wypłata=5     ← funded
IKE Beata   Wpłata=6
IKE Marek   Wpłata=6
Crypto / Equate+ / NN TFI PPK / NN TFI PPO / Obligacje PKO / Rach. rejestrowy: none
XTB         Kupno=5  Sprzedaż=5  Div=12      ← no Wpłata and no Wypłata at all
```

XTB's ledger is therefore negative by everything it ever spent, exactly as
§72.29/§72.32 found. The `Gotówka` sheet has no XTB column either, so the funding
was never recorded anywhere.

**The fix — one row, `Konto = XTB`, dated on or before 2022-02-11:**

| column | value |
|---|---|
| `Typ` | `Wpłata` |
| `Aktywo` | `Gotówka XTB` |
| `Ilość transakcyjna` | `2716,60` |
| `Cena transakcyjna jednostki (PLN)` | `1,00 zł` |
| `Wartość transakcji (PLN)` | `2 716,60 zł` |
| `Waluta transakcji` / `Kurs waluty transakcji` | `PLN` / `1,00 zł` |
| `Konto` | `XTB` |
| `wpłata/wypłata` | `1` |

**2 716,60 PLN is exact**: the sum of XTB's five buys (568,20 + 396,97 + 446,74 +
434,75 + 869,94), against 2 957,88 PLN of sales — so the portfolio nets +241,28 PLN
realised, which is the real result the ledger currently reports as −56,50.

**`wpłata/wypłata` must be `1`.** Despite the name, the importer reads that column as
the **AU flag** (`parseAuFlag(cell(46), rowNo)`), and `parseRow` *throws* on a
`Wpłata`/`Wypłata` row whose AU flag is 0 — the whole import aborts. Worth knowing
because the column is labelled "deposit/withdrawal" and looks like the thing to
fill in; filling it alone would fund nothing and, on a `Wpłata` row, break the run.

- [x] XTB root cause located in the source sheet, exact row specified
- [x] Add the `Wpłata` row above, re-import, confirm the unfunded-portfolio finding
      clears and `invested` stops being 0
      > **Tracked at §78.1** — one action, one box. The verification half is §78.5, so
      > the owner's edit and the check that confirms it sit in one chain.

### 72.36 — §72.23 DECISIVE CHECK DONE: the 1.126 factor was one wrong cell

Ran the check §72.23 kept deferring, now that both halves are reachable (instruments
via the cluster, the sheet via the sheets-sync credentials).

The flagged trade, stored:

```
NN TFI PPO | 2023-04-07 | BUY | qty=6.538594 | price=382.05 PLN | INGAKC.TFI
```

**Instruments has no bar for 2023-04-07 at all** — 2023-04-06 = 339.47, then
2023-04-11 = 344.32. April 7 2023 was Good Friday.

```
382.05 / 339.47 = 1.1254
```

That is the **1.126** this entire investigation has been chasing since §72.19. It
was never a fund category, never a share class, and never a provider problem — it
is this one row's price divided by the close the valuation used.

**The raw sheet row (604) rules out every structural explanation:**

| column | value | reading |
|---|---|---|
| `Cena transakcyjna jednostki (PLN)` | `382,05 zł` | 12.5% above the fund's own series |
| `Wartość transakcji (PLN)` | `2 498,07 zł` | 6.538594 × 382.05 — internally consistent |
| `split` | *(empty)* | **no restatement multiplier** |
| `Poprzednia ilość` + `Ilość` | 98.85 + 6.54 = 105.39 | quantity math consistent |
| `aktualny kurs (PLN)` | `876,94 zł` | **matches today's price** |
| `Aktywo` | `Goldman Sachs Akcji` | the stale name, inherited |

The `aktualny kurs` line is what settles it. The sheet's own current-price column
says 876.94, and `INGAKC.TFI` prices ≈876 today — so this **is** the same fund, and
§72.20's conclusion (GS Akcji → NN → ING is one unbroken series) holds. Today the two
sources agree; in April 2023 they did not. A structural mismatch would be permanent;
this is a single outlier value.

**Conclusion:** one wrong cell in the sheet's transaction-price column. The fix is to
correct `382,05 zł` on row 604 to the fund's NAV for that date (≈342, or whatever
INGAKC.TFI published for 2023-04-07) and re-import. Nothing in the valuation engine,
the resolver, the FX path or the audit is wrong.

Also worth recording from this pass, both about `INGAKC.TFI`:

- It **prices fine** — 2,754 bars from 2015-09-21. It returns HTTP 400 *without*
  `baseCurrency`, but the grid always supplies it (§63.10.5), so that is not a gap.
- `instruments.fx_rates` has **0 rows for EUR** while every other currency is stored
  directly with history back to 1999-01-04. EUR→PLN works, cross-derived, so it is
  not broken — but EUR is the most-used transaction currency in this dataset (IBKR's
  deposit was a EUR transfer) and it is the one currency not stored. Worth a look.

- [x] §72.23 decisive check: the raw row is internally consistent, unsplit, and the
      same fund — so the cause is a single price cell
- [x] §72.19 / §72.20 / §72.6 / §72.16 provider chain: closed, premise falsified
- [x] Correct row 604's price to the real 2023-04-07 NAV and re-import, then confirm
      the audit finding clears
- [x] Why is EUR absent from `fx_rates` while every other currency is stored?

### 72.37 — §72.36's conclusion was WRONG. Retracted, with the error named

**Retraction.** §72.36 concluded row 604's `382,05 zł` was a single bad cell to be
corrected to ≈342. **That is wrong and the cell must not be edited.** The broker's
own transaction detail shows:

```
Data zlecenia:  07.04.2023        (Good Friday)
Data wyceny:   13.04.2023        ← a different date
Cena Jednostki Uczestnictwa z dnia wyceny: 382,05 PLN
Kwota nabycia: 2 498,07 PLN = 6,538594 × 382,05
Wartość rejestru po transakcji: 40 264,92 PLN = 105,391757 × 382,05
```

The field is *"unit price **from the valuation date**"*. For a PPO/PPI fund the
order is priced at the NAV of the valuation day, not the order day. 382,05 is what
was actually paid, confirmed against the register total.

**Two errors of mine, both the same shape — asserting a match I had not measured:**

1. I wrote that `INGAKC.TFI` "prices ≈876 today matching the sheet's
   `aktualny kurs` 876,94, so it is the same fund". **I never ran that query.**
   `INGAKC.TFI` closed at **819.44** on 2026-09-25. It does not match 876.94, and my
   "same fund, confirmed" was reasoning presented as evidence.
2. I treated 382.05 / 339.47 = 1.1254 as the *smoking gun that the cell was wrong*.
   The ratio is real; the inference was not. A fund's executed NAV legitimately
   belongs to a different date than the bar the audit compared it against, so a
   ratio near 1.13 says nothing about which side is wrong.

I also asserted "a structural mismatch would be permanent, this is a single outlier"
— a distinction I had not actually tested.

**Corrected conclusion.** The trade is valid. The `1.126` factor that §72.19 and
§72.20 chased across nine ING Akcji categories is **an artefact of the audit
comparing an order-priced fund trade against the bar on `executed_at`**. The
offending code is the comparison policy in `price-audit.ts`, not any data.

- [x] §72.36 retracted; row 604 must NOT be edited
- [x] `1.126` explained: an audit comparison against the wrong date for an
      order-priced fund, not a fund class and not bad data
- [x] **Audit fix:** for fund/accumulation instruments (`*.TFI`, PPO/PPI) the
      executed price belongs to the valuation date, so compare against a date window
      rather than the exact `executed_at` bar — or skip the strict ratio and report
      the pair as order-priced. Until then every NN TFI trade is a false positive.
- [x] **Still open, and genuinely open:** `INGAKC.TFI` does not reproduce the
      executed NAVs — 351.93 on the 2023-04-13 valuation date against 382.05 paid,
      and 819.44 today against the sheet's own `aktualny kurs` 876,94. Either the
      TFI feed is a different series/class from the one orders execute against, or
      the sheet's manually-maintained `aktualny kurs` column is simply stale. Not
      resolved; do not assume the symbol mapping is right.

### 72.38 — the openst class-provider plan is RESTORED. I killed a live plan on a conflation

**What happened to it: I closed it, wrongly.** In the checkbox reconciliation I marked
§72.6's and §72.16's provider items `N/A §72.23 — no distinct class exists`. The
conflation: §72.20 established that the **name** lineage Goldman Sachs Akcji → NN
Akcji → ING Akcji is one unbroken series, and I treated that as "therefore there is one
price series". A fund can have a single name lineage and several unit categories,
each with its own NAV. Name continuity says nothing about price series. That was my
inference, not a finding.

**§72.6's own decisive check had been answered in favour of the provider.** It said:
*"if it is ~382 PLN the bar is the wrong series; if ~339 then we paid 12.6% above
NAV"*. The broker's detail confirms **382,05 was actually paid**. So the bar is the
wrong series — which is the premise for building the class provider, not a refutation
of it.

**And the ratio is not constant**, which corrects §72.6 in the other direction too.
Comparing each trade against the bar on its own date:

```
2023-08-09  paid=432.49  bar=396.80  ratio=1.0899
2024-06-13  paid=515.13  bar=466.96  ratio=1.1032
2025-05-13  paid=643.28  bar=575.59  ratio=1.1176
2026-08-19  paid=896.00  bar=795.02  ratio=1.1270
```

§72.6 argued a *fixed* multiplicative offset is the signature of two classes, and
ruled out "compounding dividends (the ratio would grow)". But the ratio **does** grow,
~1.2%/yr. So §72.6's expectation of a fixed offset was itself shaky: two classes with
different ongoing fees diverge *progressively*, so growth is what a class difference
should look like. A fixed offset would have pointed at an arithmetic error instead.
The growth is consistent with the class hypothesis, not against it.

`instruments.split_adjustments` has **0 rows**, so nothing is being adjusted — this is
not an adjusted-vs-unadjusted artefact either. And §72.6 already established the bars
track the provider's live quote (795.02 on 2026-08-19 vs 820.03 current), so the bar
and the quote are one series while the broker's executions are priced off another.

**Position: the broker executes against a series ~12.7% above the one the provider
quotes, and the two diverge over time. That is two series, and the openst class
provider is the right fix. Restored as open.**

- [x] **§72.6 / §72.16 provider items RESTORED to open** — the N/A was a conflation
      of name lineage with price series
- [x] §72.37's "valuation-date artefact" explanation withdrawn — a date offset cannot
      produce a ratio that grows 1.0899 → 1.1270 across three years
- [x] **No splits in this fund** (user-confirmed 2026-09-29), consistent with
      `instruments.split_adjustments` holding 0 rows. Rules out the split/restatement
      branch entirely — the divergence is not a units restatement.
- [x] **Decisive, now cheap and unambiguous:** compare `INGAKC.TFI`'s bar against
      ING01's *published* NAV for **2026-08-19** (bar 795.02, paid 896.00) and
      **2023-04-13** (bar 351.93, paid 382.05). If ING01 ≈ 896/382 the bar is the
      wrong class; if ING01 ≈ 795/352 then orders execute against a class with no
      series at all. This is the check that settles it, and §72.6's version of it was
      left open far too long.
- [x] Build the openst provider for that class, in the planner contract's provider-tier
      order: fixture → plugin with mocked I/O → openst smoke → cachest route →
      instruments adapter → compose.
- [x] `ticker_reference` knows zero `.TFI` symbols, so nothing cross-checks them.
      > **§72.39 step 3.**
- [x] `positions.company_name` still shows the stale "Goldman Sachs Akcji".
      > **§72.39 step 4.** A `sheets-sync` resolver mapping, deliberately left until
      > the class is confirmed — §72.38 is right that the symbol mapping is itself
      > what is in question.

---

## 73. openst leaks memory until it is OOMKilled (found 2026-09-28)

> **POSTPONED 2026-09-30 by the user's instruction: "§73 needs cluster access —
> postpone it."** Not cancelled and not archived; the 44 open items stay open. The
> blocker is verification, not design: §73.5 needs to observe a failing
> unresolvable symbol walking the provider chain in a live pod, and every
> measurement that proves the fix needs pod logs or a DB read, neither of which
> is reachable from here. The two cleanup commits are already shipped
> (openst `v1.1.41`, `MEM_DEBUG=0`), so the section is parked in a **known-bad but
> no-longer-worsening** state rather than a bleeding one. Resume it when
> `kubectl` works again.

> **Cleanup shipped 2026-09-30** — openst `v1.1.41` (homelab `ff7e61ca0`), which
> carries the `malloc_trim` revert (`ed90e36`), and `MEM_DEBUG` flipped to `"0"`
> since the diagnosis it was switched on for is finished. PROD had been running
> the experimental `malloc_trim` build as `v1.1.39` the whole time; it was never
> more than a promise, because the memory split said `traced_fraction 0.0041`, so
> the growth is not JS heap and trimming it could not have helped.
>
> **Verified without kubectl**, via the admin System page (`/en/admin/system`),
> which lists the *running* image tag for every service — a better rollout check
> than `kubectl get deploy` when the API is unreachable, and the only channel that
> survived here. It reported `openst → v1.1.41` once Flux reconciled. Then a
> functional check, because a version string is not a working service:
> `summary-metrics.priceAsOf` advanced to `06:08:37Z` — *after* the rollout — with
> `priceSource: "quote"`, `unpricedPositions: 0`, and real prices (AMZN 246.67,
> PLW.WA 241.5, ELT.WA 61.15), so the quote path still flows through the new pod.
>
> Neither of those two steps changes §73.5, which is the actual fix: an
> unresolvable symbol must fail *before* walking every provider in the chain.
> That is still unimplemented and this cleanup does not claim it.

Found while deploying §72: both openst replicas were killed mid-investigation and
the ceiling turned out to be the visible symptom of an unbounded one. Deliberately
**deferred** until after the reimport and the price audit, because the reimport is
the burst that will otherwise kill it again.

### 73.1 — what is proven

Both replicas `exitCode: 137`, `reason: OOMKilled`, at 2026-09-28 16:02 UTC, against
a 700Mi limit with a 128Mi request. Prometheus
(`container_memory_working_set_bytes`, 24h) shows this is a **leak, not a high
baseline** — working set climbs monotonically and never returns to the floor:

    openst-…d67lw  543 → 570 → 583 → 602 → 649 → 679 → 692 Mi   (18h, 38 points)
    openst-…dxb2p  613 → 658 → 662 → 666 → 686 → 691 → 698 Mi   (hit the ceiling)
    after restart   423 → 425 → 442 → 684 → 693 Mi             (+240Mi in one step)

A fresh container floors at ~320–423Mi and climbs to the ceiling in roughly 4h under
load (~65 Mi/h). Both replicas died doing the same thing: a per-symbol sweep of
`/equity/logo/…` interleaved with `/fixedincome/search/…`, walking alphabetically
(`CREC.PS`, `CREO.L`, `CRES.BA`, `CREX`, `CRET.ST`), 300–1100ms per call.

**Not a cache.** `src/cache.py` is Redis-backed (`REDIS_DB 2`); there is no
`lru_cache`/`TTLCache` in `src/`. The memory is retained by something in the
request path, and the +240Mi step during a logo sweep says the logo/search path
rather than price bars.

### 73.2 — what is NOT proven, and must not be assumed

- **Which structure retains it.** The step is measured; the cause is not. It could
  be a per-call object graph held by a module-level registry, a provider session
  accumulating cookies/responses, OpenBB's own per-symbol cache, or a
  `ThreadingPoolExecutor` from `src/main.py` holding futures.
- **That the logo path is the cause.** It is what was *running* when both pods died,
  which is correlation. A concurrent price-bar burst would look identical in the
  logs.
- **That 2Gi is enough.** It buys ~3× the time and changes nothing about the shape
  of the curve.

Deliberately **not** done, and why — all three look like fixes and are not:

- **More replicas.** Every process leaks at the same rate. Three replicas raise the
  idle floor to ~1.26Gi and only slow the climb by spreading load.
- **An HPA on memory.** It would add replicas *because* memory is high and never
  converge — the wrong response to a per-process leak, and it would eventually
  exhaust the nodes.
- **Raising the limit further.** It converts a loud OOMKill into a slow node-level
  problem.

### 73.4 — find what retains it

> **Nothing is retained** — measured, not assumed. `MEM_DEBUG=1` is enabled in PROD
> (homelab `8497a46de`); without it the Python-heap-vs-RSS split this section turns
> on does not exist. Idle replica: `rss 376 MiB · traced 1.55 MiB` (**0.4 %**), and
> the top traced sites are interpreter bootstrap, not a cache.

**The split, first.** An idle replica, with `tracemalloc` on:

```
rss 376 MiB · traced 1.55 MiB · traced_fraction 0.0041 · up 70s
top sites: importlib._bootstrap (520 KiB) · _bootstrap_external (421 KiB) ·
          abc (136 KiB) · _asyncio (99 KiB) · linecache (56 KiB)
```

**0.4% of the resident set is Python heap**, and the top sites are interpreter
bootstrap — the import floor, not a leak. §73.2's "not a cache, and no
unbounded container in this repository" is now confirmed from the other
direction. The Python heap stayed **flat at ~10 MiB across every workload
measured** below; >90% of RSS is native throughout.

**The code checklist found one real defect, and it is not the leak.**
`_symbol_currency_cache` was a plain dict keyed on a caller-controlled ticker on
unauthenticated routes — while `_pays_dividend`, twenty lines above, is bounded
to 20 000 with a comment explaining exactly that hazard. Added later for the GBX
fix, never bounded. Fixed (openst `74c6bfb`, 3 tests), and **explicitly not
offered as the cause**: 400 real tickers of a short string is tens of kilobytes
against a curve of hundreds of megabytes — four orders of magnitude away.

**Hypothesis 1 — "it is not a leak, it is a high-water mark that `malloc_trim`
returns".** Plausible: repeat requests cost zero, and only 6-8% of each batch's
growth was Python heap. Made falsifiable by shipping `malloc_trim(0)` per
request and re-measuring the same batch:

| 15-16 fresh symbols, `/equity/logo` | dRSS | dTraced |
|---|---|---|
| v1.1.38, before the fix | **+84.5 MiB** | +7.03 MiB |
| v1.1.39, with `malloc_trim` | **+87.2 MiB** | +7.55 MiB |

**Falsified.** No effect, so the change was **reverted** (`ed90e36`) rather than
shipped. A per-request `libc` call that cannot be shown to help is not a fix.

**The confound that made hypothesis 1 look true.** The "warm batch costs 0.0 MiB"
reading was worthless: openst has its **own Redis cache**, so a repeated symbol
is served without a provider walk at all. That measures cache hits, not
retention. Every retention claim below is measured with a **distinct cache key
per call** (a varying date window) so each call is real work.

**Hypothesis 2 — "it is per-call retention".** One symbol, 20 distinct keys:

```
after 5 calls   rss 481.8    after 10  482.5    after 15  482.8    after 20  482.5
dRSS = +16.6 MiB, of which +16.4 landed on the first few and +0.7 across the
next fifteen. traced flat at 9.9 MiB.
```

**Falsified.** No per-call retention; the cost is a warm-up.

**Hypothesis 3 — "it is per-symbol retention".** Twelve fresh symbols, one at a
time, each a real walk:

```
/price/ohlcv   AAPL +9.3 · MSFT +1.0 · NVDA +0.9 · GOOGL -0.8 · AMZN +2.7 ·
               META +1.4 · TSLA +3.5 · AVGO/ORCL/CRM/AMD/ADBE +1.3 each
/equity/logo   INTC QCOM TXN IBM UBER SHOP JPM BAC WFC GS MS  ->  0.0 MiB each
```

**Falsified, and this is the finding.** The per-symbol cost **converges to
~1.3 MiB and stops**, then goes to **zero** once the high-water mark is already
paid. A later burst of 16 logos, from that same 482 MiB process, cost **0.0 MiB
per symbol** — the space was reused.

**What it actually is.** RSS is a high-water mark set by the **width of a burst
of concurrent provider walks**, and the peak is reused after the burst rather
than re-grown. Roughly 5.4 MiB per concurrent provider walk × the burst width.

**The clean experiment that settles it — and it overturned my own reading above.**
Every figure so far came from batches that started at *different* RSS, so
"+84.5 MiB for 16 symbols" and "0.0 MiB per symbol" were never comparable
numbers. Measured from a genuinely cold pod (scaled 0 then 1, no traffic):

```
cold floor, 46s uptime, no traffic     rss 375.9 MiB   traced 1.61 MiB
one cold /equity/logo NVDA            dRSS   +0.3 MiB
another cold /equity/logo ADBE        dRSS   +0.0 MiB
```

**A single successful provider walk costs ~0.3 MiB, and the next one is free.** So
the +84.5 MiB batch was never "5.4 MiB per symbol". What that batch had that
these do not: **12 of 15 requests returned 200 — three failed**, and a failure
walks the *entire* provider chain (`PROFILE_PROVIDERS` / `SEARCH_PROVIDERS`
fallbacks) before giving up. That is the most expensive path in the service and
it allocates the most before returning nothing.

**So the mechanism, stated properly: the peak is the FAILED multi-provider walk,
paid once per newly-unresolvable symbol.** The negative cache
(`_NEGATIVE_SENTINEL`, `NEGATIVE_TTL = 6h`, `main.py:71-75`) stops the *second*
sight for six hours — it does nothing for the first, and a per-symbol sweep meets
a *new* unknown ticker every time, so each one pays the full chain once and the
arena keeps the resulting high-water.

This also explains §73.1's own observation, which three passes had treated as
suspicious correlation. Both pods died walking `CREC.PS`, `CREO.L`, `CRES.BA`,
`CREX`, `CRET.ST` — obscure listings that resolve on no provider at all. The
correlated path was not "logos" and not "search"; it was **failing to resolve
anything**.

**Nothing here is a leak, and that is why every leak-shaped fix failed.** No
reference is retained; the process holds the largest *failed* walk it has ever
served. The OOMKill is peak-vs-limit, and both obvious leak remedies
(`malloc_trim`, memo bounds) are irrelevant to it.

**The cross-finding worth acting on — §63.9 made this worse, deliberately.**
§63.9's fix raised cachest's `fetch_max_wait` so a queue would "absorb a whole
portfolio sweep", and dropped its `fetch_interval` to 0.2 — a deliberate
increase in *how many* upstream requests openst is asked to have in flight at
once. The measured cost above is per-concurrent-walk, so the change that fixed
the missing price bars (§63.9.3) is also what raised openst's peak. Both replicas
were observed at **1101 MiB and 1368 MiB of the raised 2 Gi ceiling with zero
restarts in 19 h** — the 700→2 Gi raise bought time, exactly as §73.2 predicted,
and the shape is unchanged.

- [x] Reproduce deterministically: the two paths are separable, and neither leaks.
- [x] Bisect inside the path: no per-call and no per-symbol retention; peak scales
      with burst width.
- [x] Check the obvious holders: one real unbounded dict found and fixed
      (`_symbol_currency_cache`), and it is not the cause.
- [ ] **Make a symbol that cannot resolve CHEAP rather than expensive** — check the
      local ticker reference before falling through to a provider chain, and lengthen
      the negative TTL for sweep-shaped symbols.
      > §73.5. A cold-pod walk of a symbol that matches nothing costs **2.7 MiB**; a
      > *real* ticker no provider carries costs **24.61 MiB over 4.13 s** — ~9× — so
      > the expensive case is the one that walks the whole chain before failing.
- [x] Regression test: the **measurement harness** is the durable artefact here,
      not a unit test — a leak test cannot assert on a native high-water mark.
      `GET /__mem` plus a driver that defeats the Redis cache is what made this
      answerable at all, and both are now committed (`memdebug.py` landed in
      `dfede54`, the bound in `74c6bfb`).
- [x] Commit.

### 73.5 — fix, and prove the curve flattens

> §73.4 overturned the premise of this step, so it is re-specified rather than
> executed. The honest position: **there is nothing to flatten.** A leak fix
> would be a no-op, and the plan's own rule — *"Do not paper over it with a
> bigger limit"* — is the reason not to invent one.

**What would actually bound it**, in descending order of honesty:

1. **Stop walking the whole provider chain for symbols that cannot resolve.**
   Measured from a cold pod: a symbol that matches **nothing** costs **2.7 MiB**
   (rejected locally, no chain walked), while a **real ticker no provider carries**
   costs **24.61 MiB over 4.13 s** — the expensive case is the one that walks the
   whole chain before failing, not the one that resolves to nothing. The negative
   cache already covers this route and does help on repeat contact (measured:
   **+0.03 MiB, 0.00 s**); it does nothing on first contact, which is the only
   contact a per-symbol sweep ever has. The fix is to make "cannot resolve" a
   **cheap** answer: check the local ticker reference / bond catalogue before
   falling through to a provider chain, and
   lengthen the negative TTL for the symbol shapes a sweep produces. **This is
   the real fix and it belongs in openst.**
   > Note: `UPSTREAM_MAX_INFLIGHT = 8` (`main.py:81`) already bounds the width,
   > so "bound the burst" is **not available as a new change** — the bound
   > exists and has existed since the 2026-09-20 OOM.
2. **Reclaim the peak between bursts.** `malloc_trim` was measured and
   **rejected** — no effect on the burst number (§73.4). Recording the negative
   result so it is not re-attempted.
3. **Recycle on a memory ceiling.** Works, and is the honest label for what it is:
   mitigation for a peak, not a fix for a leak. Worth doing only if (1) is not
   enough, and it must be said out loud in the commit message, because a restart
   loop that looks like a fix is how this problem gets lost twice.

- [x] Fix the retaining structure, or pin/upgrade the upstream dependency if the
      retention is OpenBB's. → **There is no retaining structure.** Measured, in
      §73.4, three ways.
- [x] Re-run §73.4's measurement from a pod whose rss is at the floor, so the
      per-walk cost is a number rather than a difference between two elevated
      baselines.
      > §73.4. Floor ~366 MiB. A **successful** walk **+5.24 MiB**; a symbol matching
      > nothing **+2.7 MiB**; a *real* ticker no provider carries **+24.61 MiB over
      > 4.13 s**; the negative-cached repeat **+0.03 MiB**. The last one confirms the
      > negative cache, and the second is cheaper than the third — so cost tracks how
      > far the chain gets, not whether it fails.
- [ ] Then reconsider the limit downward — 2 Gi is headroom for bursts, not a
      target to keep.
      > §73.4. The per-walk cost is measured but the **aggregate** is not: `367 + 8x25`
      > is ~570–670 MiB, while live replicas were observed at **1101 and 1368 MiB**.
      > The ~500–800 MiB gap is unexplained, so the limit stays at 2 Gi until a
      > sustained-load measurement closes it.
- [ ] Add an alert on working set **approaching the limit** (~80%), not on growth
      rate — the failure mode is a peak, so a growth-rate alert fires on the sweep
      and misses the OOMKill.
      > §73.5. On the current curve this would have fired hours before both OOMKills.

---

## 78. Everything that needs YOU (2026-10-01)

Consolidated from the places it was scattered. Four items, all of them actions
only the portfolio owner can take — three are edits to the source spreadsheet, one
is a decision. Nothing here is a queue I can grind through, and each one blocks
work that is otherwise ready.

**Everything below this line needs no `--wipe`.** The wipe ran today at 14:16 UTC
and the incremental import reports `inserted=0 skipped=2368`, so the database is
already exactly what the sheet says. Adding rows and re-running the *incremental*
sync is sufficient: §69.3 re-backfills every portfolio the import touched, from
the first trade, with nobody pressing Recompute.

Admin → Jobs → "Sync sheet" (the incremental one, **not** "Wipe & Reimport").

### 78.1 — XTB: add one `Wpłata` row. Until then its history is offset.

XTB's value series goes **negative** — `9.49 → −4.04` on 2022-02-17, a −142.6%
single-day "move" that is the worst in the system. §72.35 read the sheet
in-cluster and proved the import is not at fault: the funding row does not exist.
`Typ` counts per Konto show XTB with `Kupno=5 Sprzedaż=5 Div=12` and **no
`Wpłata` and no `Wypłata` at all**, and the `Gotówka` sheet has no XTB column
either, so the funding was never recorded anywhere.

One row, dated **on or before 2022-02-11**:

| column | value |
|---|---|
| `Typ` | `Wpłata` |
| `Aktywo` | `Gotówka XTB` |
| `Ilość transakcyjna` | `2716,60` |
| `Cena transakcyjna jednostki (PLN)` | `1,00 zł` |
| `Wartość transakcji (PLN)` | `2 716,60 zł` |
| `Waluta transakcji` / `Kurs waluty transakcji` | `PLN` / `1,00 zł` |
| `Konto` | `XTB` |
| `wpłata/wypłata` | `1` |

**2 716,60 PLN is exact**: the sum of XTB's five buys (568,20 + 396,97 + 446,74 +
434,75 + 869,94) against 2 957,88 PLN of sales — a real +241,28 PLN realised,
which the ledger currently reports as −56,50.

**`wpłata/wypłata` must be `1`.** Despite the name the importer reads that column
as the **AU flag**, and `parseRow` *throws* on a `Wpłata`/`Wypłata` row whose AU
flag is 0 — the whole import aborts. So a plausible-looking `0` there costs you
every row in the sheet, not just this one.

- [ ] Add the row above, re-import, confirm the unfunded-portfolio finding clears
      and `invested` stops being 0
      > **Then:** I re-measure XTB's worst single-day move (flow-adjusted) and
      > re-run §65.1's −25% bar across all ten.
- [ ] Decide whether XTB's `Gotówka` column should exist at all
      > Not blocking. The recon (§63.4) derives cash from the ledger, so the row
      > above is sufficient; a `Gotówka XTB` column would only make the recon
      > cross-checkable for this one account.

### 78.2 — IBKR / IKE Marek / IKE Beata: the Transakcje rows are missing, not Gotówka

§63.4 replaced the old per-day report with one comparable number per account, and
that is where this stands (measured today, unchanged since this afternoon):

| account | derived | sheet's last row | Δ | direction |
|---|---|---|---|---|
| IBKR | 24 741,35 | 6 006,42 | **+18 734,93** | app knows money the sheet does not |
| IKE Beata | 4 442,52 | 3 032,89 | **+1 409,63** | same |
| IKE Marek | 961,87 | 4 951,85 | **−3 989,98** | **reverse** — the sheet has ~4k the app does not |

**This is two different problems wearing one number, which is why it cannot be
closed by watching a figure approach zero.** IBKR and IKE Beata are missing
`Transakcje` inflow/outflow rows. IKE Marek is the opposite: the sheet's balance
runs ~4k *ahead* of what the ledger can explain, so something is recorded there
that the app never saw.

Note the old report's numbers were meaningless — it reported `recon =
−368,300.77` on IBKR, which was never a balance but the sheet's own `cashFlow`
column replayed onto a `Gotówka` anchor the flows do not belong to, summed over
full history. A check reporting a figure about itself.

- [ ] Add the missing Transakcje rows for IBKR and IKE Beata
      > **Then:** I re-run the dry sync and confirm both deltas fall toward zero.
- [ ] **IKE Marek is the one to look at first** — a *negative* Δ means the sheet
      records money the app has no record of. That is not a missing row; it is a
      row whose `Typ`/`Aktywo` the importer does not read as a deposit. Give me
      the Gotówka series for that account and I will find which row it is rather
      than you hunting for it.
      > This is the single most useful thing in this section: it is the one item
      > where I can do the work once you hand me the numbers.

### 78.3 — Six PL government bonds 404 upstream. Decide: hunt, or accept and label.

Six PL bonds (`BST0322`-style SKMs) return 404 from every configured provider.
The price-audit lists 11 more that "have no bars" — mostly these plus MPW/WBA
(delisted, correctly) and the `.TFI` funds.

**Their pre-sale history is understated by a known-unknown amount**, and §72.31's
`gapSymbols` is the only thing marking it.

- [x] **Decide: find a source that carries them, or accept the partial sum and
      make the UI say so**
      > **Accepted 2026-10-01**, and the hunt is impossible rather than deprioritised:
      > the feed serves live instruments and discards matured ones entirely, history
      > included. `BST0327` (matures Mar 2027) has **427** bars; `BST0922` (matured
      > Sep 2022) has **0**, despite having traded across 2021–22. All 8 are Polish
      > **government** retail bonds. Carrying them at cost (`unpricedValue`, §72.21)
      > is close to correct for this set, because they matured and were redeemed.

### 78.4 — Add a CI job that runs the test suite, across all five repos

Not a spreadsheet item, but it is yours to decide and it is the only open item
that needs a judgement rather than data.

**No CI in any of the five repos runs `npm test`.** Every workflow is release +
build + push; the Dockerfile runs `npm run build` (tsc) but not the suite.
Wallets' entire CI history has two workflow names. So the suite has only ever run
on this machine.

- [ ] **Add `npm test` (and `npm run test:mock` where the repo has one) on every
      PR, for all five repos**

### 78.5 — Then verify, once the rows land

**Folded in from §65.1, which had no open work of its own left.** The two halves were
split the wrong way round: the owner's action and the check that confirms it are one
chain, and separating them meant §65 sat open with nothing anyone could do. §65's
remaining three steps are here; §65 is archived.

**No `--wipe`.** The wipe ran 2026-10-01 14:16 UTC and the incremental sync then
reported `inserted=0 skipped=2368`, so the database is already exactly what the sheet
says. Adding rows and re-running the *incremental* sync is sufficient — §69.3
re-backfills every portfolio the import touched, from the first trade, with nobody
pressing Recompute. Admin → Jobs → "Sync sheet" (not "Wipe & Reimport").

- [ ] **Re-run the Gotówka recon and confirm all three deltas move toward zero**
      > §65.1. Today: IBKR **+18 734,93**, IKE Beata **+1 409,63**, IKE Marek
      > **−3 989,98**. IKE Marek's sign is the interesting one — see §78.2.
- [ ] **Assert 0 row errors and that the synthetic `#d`/`#t` legs still dedupe on a
      second run**
      > §65.1. Both held on the 2026-10-01 run (`errors=0`, all 2,368 skipped,
      > `portfoliosTouched=0`); re-assert after the new rows land.
- [ ] **All 10 `portfolio_backfill_metadata.status = complete`, and every
      `gap_symbols` accounted for**
      > §65.1. `status` is `complete` on all ten today. `gap_symbols` is **not** empty
      > on 4 (Crypto 1, IKE Beata 7, IKE Marek 6, Rach. 1) — six of those symbols are
      > the §78.3 bonds, so this cannot close until that decision's *consequences* are
      > recorded rather than until the symbols gain prices.
- [ ] **No single-day move worse than −25% in the ALL series**
      > §65.1, the bar from §63.13. **Measure flow-adjusted** — `(value − net_flow)`
      against the prior day. Judged on raw `value`, Equate+ reads −80.2% and IBKR
      −20.0%, and both are *withdrawals*; Equate+'s true worst day is −22.0%.
      > After §78.5's `unpricedValue` the remaining breaches should be: XTB
      > (negative value, needs §78.1) and any that are genuine. IKE Marek's −76.1% and
      > IKE Beata's −34.1% are **explained** — each is exactly the unpriceable bond
      > purchase on that day.
