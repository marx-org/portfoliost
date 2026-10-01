# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then
archived. This file holds **only unfinished work**; everything completed,
superseded or obsoleted lives in `plan-archive.md`.

Some steps below cite an earlier section by number for provenance (e.g. "the
bar established in §63.13"). Those citations may point into `plan-archive.md` —
the RCA they refer to is preserved there in full.

Legend: `[ ]` pending · `[x]` done (a `[x]` only ever appears in a step that
also still has `[ ]` work; fully finished steps are archived)

---

## Where this stands (2026-09-30)

**Shipped and verified in PROD this session** — each with its own commit, its own
release, and evidence taken from the running service rather than from the test:

| § | what | how it was verified |
|---|---|---|
| 60 | Research "Go back" returns to the origin page | 5 e2e, then **verified in PROD**: all three origins round-trip and `from` survives a tab switch |
| 61 | `TickerBadge` at every ticker surface (11 steps, 4 repos) | 463 unit · 227 mock · 114 e2e · live profile/peers return the new fields · parity on `app.example-service.ai` · **every surface swept in PROD**, which found 2 bugs now fixed (`(OTHER) Bond`, 37/50 bare news cards) |
| 63.5 | Extreme-jump guard on the overflow write | the deployed image refuses a 100× bar, passes a real 1:10 split, 0 false positives on 4 live symbols |
| 63.11 | Edge auth for browser traffic | `cachest` + `openst` 302 to oauth2-proxy; a live `snapshotsync` Job then ran `ok=10 failed=0` |
| 63.14 | `formatCurrency`'s USD default | already removed by §66.2; the two named cases are now tests |
| 63.15 | Prune orphaned price bars | 25 unit; dry run in PROD against the real referenced set (`--apply` needs the user) |
| 70 | `cashBreakdown` weight guard | already done by §70.5; now pinned against the exact IBKR shape (old formula: 333% / −233%) |
| 71.6 | `MFC` cross-listing | classified, still reported; a real PROD audit now prints **1** finding, and it is not MFC |
| 72.4 / 72.22 | price-audit run for real | 1191 trades, 28 flagged, `SAP.DE` clear, findings recorded in §74.6 |
| 72.24 | `fx_rates` history | 30 currencies × 7103 rows, 1999-01-04 → today; the one empty day is Good Friday |
| 72.36 | EUR absent from `fx_rates` | deliberate — `base=EUR` means a EUR row is 1 by definition; now pinned by 4 tests |
| 74.1–74.6 | Order-priced fund audit | 13 new tests; PROD run shows the 192 fund trades explained with evidence, `SAP.DE` still clear |
| 75.4 | A latent e2e race §61 exposed | fixed in the test, 114 e2e green |

**Three things this session established that are worth more than the code:**

1. **Stored and live values now reconcile.** A real `valuation-audit` run in PROD
   reports **0** `reconciliation-gap` and **0** `currency-mismatch` findings
   across all 10 portfolios. That is the check §63.3 has been chasing since the
   fact-check, run for real and clean.
2. **The `1.126` is finished.** It was never a fund class, a share class or a
   provider gap — it was the audit comparing an order-priced fund trade against
   the wrong day's bar. §74 closed it, and §74.4's measurement then *refused* to
   produce a window constant, which is the more useful outcome: a guess would
   have hidden genuine mismatches.
3. **Two plan items were answered by a code comment, not by code.** EUR's
   absence from `fx_rates` and `formatCurrency`'s "USD" default were both
   deliberate and both already fixed. Both are now pinned by tests, because a
   test is the durable form of a comment for anyone who has DB access and not
   source access.

**Blocked on the user** (cannot be self-served):

- **`price_bars --apply`** deletes 85,689 rows in PROD. Tool shipped, dry-run
  measured, the decision is the user's.
- **Sheet rows**: §65's Gotówka reconciliation, §72.35's XTB opening deposit
  (`Wpłata 2716,60 PLN` — the exact row is specified in that section). Both are
  data the user owns.
- **§72.35 bond pricing** — the user already decided to accept the partial sum.

**No longer blocked** — the Pocket-ID login item is gone. The user re-established
the session on 2026-09-30, so §60.4 and §61.11 were both verified in a signed-in
PROD tab and both sections are now archived. Two operational notes from doing it:

- A **401 or a guard redirect silently destroys the session** — `/en/admin/*`
  bounced to `/login` and wiped `localStorage.portfoliost_token` twice. Reach
  `/en/admin/*` via the nav link, not a direct URL, and re-check the token before
  concluding anything about a surface.
- The admin **System** page (`/en/admin/system`) lists the *running* image tag per
  service, which is a usable rollout check when the k8s API is unreachable — and
  is how openst `v1.1.41`, instruments `v1.0.84` and wallets `v1.1.103` were
  confirmed. It reports the Deployment's desired image, so treat it as a hint and
  confirm with a **functional** check (a fresh `priceAsOf`, a changed response)
  before calling anything verified.

---

## 63. Portfolio value correctness: unified live valuation, recompute reliability, cash-included charts (user request 2026-09-25)

Post-§62 PROD verification exposed that portfolio **value** is computed by
two divergent, both-wrong paths, and that the recompute button silently no-ops:

- **Chart / analytics** = `value_snapshots.value` = Σ qty × `price_bars.close`
  (+ cash). Openst history quotes are 10–70× off for several held symbols
  (CSN.L £363 vs £5 cost, RIO.L £7 199, BYG.L £820, SAP.DE cost basis €1.16 vs
  quote €184) → IKE Marek snapshot 2 300 732 vs true ~100k.
- **Headline "Total Value"** = Σ `positions.market_value`, which is **stale/0**
  (no live quote at last import) → falls back to `qty × avgCostBasis` → reads
  ~755k (cheap).
- **Recompute** `POST /api/portfolios/:id/recompute` is fire-and-forget with
  `.catch(() => undefined)` — it fails silently (no logs, no value change).

User spec (2026-09-25): cash = uninvested (free) cash per the **Gotówka sheet**
(traces free cash on brokerage accounts), multi-currency; Gotówka is a
*reference*, the same values must also be **derivable from inflows/outflows
+ transactions**; a funded buy (AU=1) is one inflow + immediate buy; the
performance/consolidated charts must show **positions + cash** over time.

Rules: one step = one commit; step `[x]` only after its tests pass (unit +
docker-compose level). Provider tier first (openst/cachest) for the bad
quotes — §63.5 is gated on reproducing the bad symbol's provider response.

---

### 63.2 — Wallets: one live valuation path for headline + charts (single source of truth)

> **Re-verified against the source 2026-09-30, and NOT closable as written.** The
> last commit (`c39c414`) says "§63.2 closed by a single writer" and plan-archive
> §76.4 says the same, so this section sat here looking finished. Checking it
> against the code found **the closure rests on two claims that are no longer
> true**, and a third that was never implemented. Recording them here rather than
> ticking five boxes is the point: a section closed by a commit message is not the
> same as a section closed by the code.
>
> **What actually holds.**
> - *One writer per (portfolio, date)* — **true and enforced.** `snapshotPortfolioValue`
>   (`quotes.ts:481-580`) no longer persists; the only writers of `value_snapshots`
>   are `backfill.ts:1021` and `backfill.ts:1071`.
> - *No cost presented as value* — **true.** `splitPortfolioValue` drops a
>   `marketValue == null` row and increments `unpricedPositions`
>   (`valuation.ts:81-88`), with the §70 comment stating the rule. `avgCostBasis`
>   is still selected on the `total-metrics` query (`portfolios.ts:296`) but is
>   never used as a value fallback; its only remaining use is the unrealized-PnL
>   denominator in `/summary-metrics` (`portfolios.ts:1065-1067`).
> - *`priceSource` marked* — **true** (`portfolios.ts:359`, `dominPriceSource`).
> - *The two paths agree* — **true, and pinned** by `backfill.test.ts:1102`
>   ("snapshotPortfolioValue equals computeSnapshotBatch for the same day").
>
> **What does not hold.**
> 1. **"The same live price source" is equivalence by test, not shared code.**
>    plan-archive:11918-11920 says `splitPortfolioValue` "is shared by
>    `snapshotPortfolioValue` and the backfill". It is not: `backfill.ts` imports
>    nothing from `valuation.js` and computes its own `totalValue += qty * price`
>    inline at `backfill.ts:961` plus `cashDay` at `:972`. The two agree today and
>    §68's own rule — *"drift is what happens when two code paths answer the same
>    question"* — says a test is the only thing standing between them and a future
>    edit to either. This is the same rule §63.2 was written to enforce, so the
>    item is not satisfied by having reached the right answer.
> 2. **`current_value` is not refreshed on the quotes pass — the archive says it
>    is.** `quotes.ts:20` still *imports* `syncCurrentValueFromSnapshots`, but the
>    only other occurrences in the file are two comments (`quotes.ts:426`, `:437`)
>    describing a call that no longer exists. `current_value` is now written only
>    from `backfill.ts:1036`, `:1119`, `:1194`. plan-archive:11945-11948 claims a
>    recompute "ends with `refreshQuotesUnlocked` → `syncCurrentValueFromSnapshots`";
>    the chain runs, but it syncs the row the **batch** wrote from bars, not the
>    live quote. The column is refreshed on recompute and on the cron; it is not
>    refreshed on the quotes pass.
> 3. **"Fallback to the latest `price_bars` close" was never built, and the code
>    says so on purpose.** `quotes.ts:357-374` pushes `p.marketValue ?? "0"` with
>    `priceSource = "fallback"`; nothing fetches a bar close. §70 decided the
>    opposite of this item — an unpriced position contributes **nothing** and is
>    *counted*, because "a missing price must be visible, not plausible". So this
>    half of §63.2 is superseded by §70, not outstanding.
>
> **Also missing, and the one thing here that is a genuine test gap:** no test
> asserts `/total-metrics` `totalValue` equals the latest `value_snapshots` row.
> What exists is `portfolio-transactions.test.ts:1943` (headline = Σ rows) and
> `backfill.test.ts:1102` (path-vs-path equivalence) — neither compares the
> headline to the stored chart point, which is the comparison a user is making
> when they add the cards up.

- [x] `portfoliost-wallets`: **one writer per (portfolio, date)** — done by §76.4,
      and enforced rather than ordered: `computeSnapshotBatch` owns every date
      including today, and `snapshotPortfolioValue` no longer persists
      (`quotes.ts:481-580`).
      > Verified against the source 2026-09-30: the only writers of
      > `value_snapshots` are `backfill.ts:1021` (`_runBackfillCore`) and
      > `:1071` (`recalcPortfolioHistory`); `snapshotPortfolioValue`
      > (`quotes.ts:481-580`) returns a value and ends without an insert. The box
      > disagreed with its own note, which is the drift this sweep has been
      > removing everywhere else.
- [x] `portfoliost-wallets`: headline `totalValue` and `value_snapshots` derive
  position value from the **same** price source, and never present cost as value.
  > Not satisfied by *sharing* `splitPortfolioValue` — the backfill has its own
  > arithmetic (`backfill.ts:961`) and the two are held in agreement only by
  > `backfill.test.ts:1102`. The intent (never a cost value, one answer) is met;
  > the mechanism (one function) is not, and §68's rule is explicit that the
  > mechanism is the point. Carried below as its own item.
- [x] **One composition rule for both valuation paths.** Wallets `f1b303e`:
      `composePortfolioValue` in `valuation.ts`, called by `splitPortfolioValue`
      and by `computeSnapshotBatch`.
      > **The item as written below was not achievable, and the reason is worth
      > keeping.** It said "make the backfill call `splitPortfolioValue`". It
      > cannot: the live path receives a market value in each position's **own
      > instrument currency** and converts it per row, while `computeSnapshotBatch`
      > receives closes that `fetchPriceSeries` has **already converted into the
      > portfolio's base** (§48.3). It has no instrument currency to convert and no
      > market value per day, so collapsing the two would have meant re-deriving
      > one path's inputs inside the other.
      >
      > **What was genuinely duplicated is everything *after* a per-row number
      > exists**, and that is now one function: a held-but-unpriced row
      > contributes 0 and is counted (§70), `totalValue` is the sum by
      > construction (§68), and cash is added last and never clamped (§62 — a
      > margin account nets negative). Three rules, written twice, free to drift.
      > The backfill's version of the first was a bare `continue`, which produced
      > the same number with no way to say why.
      >
      > Two things deliberately **not** done, commented at the call site:
      > `splitPortfolioValue` is not imported into `backfill.ts` (an
      > unused-looking import of the obvious function invites the wrong refactor),
      > and the shared call's `unpricedPositions` is not used for the abort guard
      > (§72.31 separated `unpricedLastDay` for exactly that reason — folding
      > mid-window gaps into `isUnpriceable` made a healthy portfolio look
      > unpriceable and would have destroyed bond-heavy history).
      >
      > 6 new tests state the rule directly, including that it does not round
      > (§53.6 asserts 7dp agreement, and rounding in here broke it once). The
      > existing `backfill.test.ts:1102` equivalence test is untouched and still
      > passes — it is the end-to-end statement the unit tests cannot make.
      > 506 green.
- [x] `portfolios.current_value` is refreshed from positions + cash on recompute.
  > `backfill.ts:1036`, `:1119`, `:1194` call `syncCurrentValueFromSnapshots` after
  > the batch writes, and the twice-daily `snapshotsync` cron runs
  > `runBackfillRecent`, so the column tracks the newest snapshot on both paths.
- [x] ~~`current_value` is refreshed on the quotes pass too.~~ **Withdrawn, and the
  archive corrected.** §76.1 made reads calculate nothing and §76.4 made the batch
  the single writer; a second writer on the quotes pass is the exact race §63.2
  was opened to remove. §76.4 supersedes this half. What it leaves behind is real
  and is item 4.
- [x] **Remove the dead import and the two comments in `quotes.ts` that assert a
      call chain which no longer exists** (`:20`, `:426`, `:437`). They are how
      plan-archive:11945-11948 came to be wrong: the archive cites this file, and
      this file now describes a chain that was deleted. A false comment about a
      writer is worse than no comment — it is what makes the next reader believe
      two writers exist.
      > Done in wallets `08cb96b`. The comment now says the live quote writes
      > nothing here, and names the three real `syncCurrentValueFromSnapshots`
      > call sites so the next reader is not sent looking for a fourth.
- [x] Tests: a portfolio's headline `totalValue` equals the latest
      `value_snapshots` row (positions + cash) when quotes are fresh.
      > wallets `08cb96b`, 3 cases, 500 green. The load-bearing one is not the
      > equality: it is that an unpriced position contributes **0** and lands in
      > `unpricedPositions`, where the cost-basis answer would have been 9000.
      > The third case is the half-priced portfolio — a symbol that quoted
      > yesterday and lost its quote today must report the priced half and flag
      > the rest, not silently complete.
      >
      > Two things the tests had to learn, both now in the file. `POST /positions`
      > writes a BUY and a BUY is a **cash outflow** (`cashLedger.ts:61`), so a
      > portfolio that deposited 1500 and bought 1000 holds 500 — my first draft
      > asserted 2500 and appeared to catch a bug that does not exist. And an
      > all-unpriced portfolio legitimately reads **negative** (−9000: the money
      > went out, no instrument came back), which looks like a defect until you
      > know the buy consumed the cash.
- [x] Tests: an unpriced position contributes **nothing** and is counted in
      `unpricedPositions` — the §70 rule, asserted in the shape §63.2 asked for.
      > Same commit, second case. `valuation.test.ts:46-100` covers the exclusion
      > at the function level; this pins it at the route, where the number a user
      > reads is actually produced.
- [x] ~~Fallback to the latest `price_bars` close when no quote exists.~~
      **Superseded by §70** — an unpriced position is reported unpriced, not
      substituted. Ticked so it stops reading as outstanding; the rationale is
      > the note, the state is the box.
- [x] Tests: `npm run build`, full `vitest` green.
      > 506 green, build clean.
- [x] Commit.
      > `08cb96b` (dead import, false comments, the headline-vs-chart tests) and
      > `f1b303e` (`composePortfolioValue`). **§63.2 is now closed** — every box
      > either shipped or is struck as unachievable-as-written, with the reason
      > recorded. It can go to `plan-archive.md` on the next closeout sweep.

### 63.3 — Wallets: cash included in consolidated + per-portfolio performance series

- [ ] **Verified broken 2026-09-27 — three headline numbers that do not
      reconcile.** The per-portfolio *cards* include cash; the page *headline*
      does not, and the API's `total-metrics` reports a third figure in a
      different currency. Measured in PROD:

      | surface | value |
      |---|---|
      | Σ the 10 portfolio cards | PLN **1,380,487.34** |
      | less the Cash card (PLN 345,228.05) | PLN 1,035,259.29 |
      | "Total Value" headline | PLN **1,035,259.30** ✓ |

      So the headline is positions-only while the cards are positions + cash.
      Separately `/api/portfolios/total-metrics` returned `totalValue` **196,514.50**
      on one call and **270,027.49** on the next (~1 min apart, then stable),
      with `Crypto` at `totalValue: 0, returnPercentage: -100` while its own card
      correctly read `887.74 / +1.65%` and the snapshot says 887.74 PLN.
  - [x] Pick one definition for "total value" (positions + cash) and make the
        headline, the cards, and `total-metrics` all read it from the same place.
        > **Done by §68/§70.** The route now computes
        > `totalValue = totalInstruments + totalCash` from the same per-portfolio
        > `splitPortfolioValue` that produced each card's split, so the headline
        > and the breakdown cannot disagree by construction (the old code summed
        > a raw total that could sit a cent off `instruments + cash`).
  - [x] `total-metrics` is **not deterministic** — two calls a minute apart
        disagreed by 73,513. Find which input is not cached/stable; a headline
        that flickers is worse than a wrong one, because it cannot be reasoned
        about.
        > **This was never a measurement problem — it was a measurement *blocker*
        > being mistaken for one.** The item was parked on "needs a browser
        > session", so the fix looked like a PROD capture. But the requirement is
        > a *property*, and a property can be asserted: wallets `345bd8a` asserts
        > two consecutive calls are **byte-identical**, and still identical after a
        > portfolio read — the call that used to trigger the write behind the
        > flicker.
        >
        > **Both pass.** `toBeCloseTo` would have passed a headline that rounds
        > differently between calls, which is the same defect at a smaller scale,
        > so the assertion is on the raw response text.
        >
        > The second test is the one that earns its keep: it asserts
        > `positions.market_value` / `price_as_of`, `portfolios.current_value` and
        > `value_snapshots` are all **untouched** by a read. Whatever the 73,513
        > swing was, it required this route to move stored state between calls, so
        > a future edit that reintroduces a write fails even when the two calls
        > happen to agree.
        >
        > **What is *not* claimed:** the original cause. §76.1 made reads pure and
        > §76.4 left one writer per (portfolio, date), so the read-path refresh
        > that used to run behind this route is the plausible mechanism — but that
        > is an inference from the code, not a reproduction, and it is recorded as
        > one. The verified part is that the property holds and is now pinned.
  - [ ] **The end-to-end number needs a browser session.** What IS established
        from the database (measured 2026-09-30, all 10 portfolios PLN):
        >
        > ```
        > SUM portfolios.current_value  : 1,060,929.73
        > SUM portfolios.total_invested:   735,446.41
        > cards reporting 0 value  : (none)    <- §63.3's Crypto 0/-100% is fixed
        > open positions          : 99
        >   with NULL market_value: 0           <- §70.2's 75/85 NULL is fixed
        > ```
        >
        > `total-metrics` itself needs a user JWT — `POCKETID_ISSUER_URL` forces
        > strict validation in the cluster, so it cannot be called from a pod. I
        > tried to reconstruct it in-pod with `splitPortfolioValue` and got a
        > **false** reading — every portfolio 0.00, all 99 positions "unpriced" —
        > because I passed an empty cash map and no price resolver. That is
        > §72.27's lesson arriving a third time (two unpaginated reads, a shared
        > date window, now a hand-rebuilt pipeline): reimplementing a calculation
        > instead of calling it produces a confident wrong answer. Recorded as a
        > failed measurement, not as a finding.
  - [x] Investigate why `total-metrics` reported `Crypto` as `0 / −100%` when the
        snapshot holds 887.74 PLN and the card is positive. A portfolio with cash
        and a position must not floor at zero.
        > **Fixed** — measured 2026-09-30: **no** portfolio reports a card value
        > of 0. §68 rebuilt the aggregate off `splitPortfolioValue`, which sums
        > positions *and* the cash ledger, so there is no path by which a
        > cash-holding portfolio floors at zero.
  - [x] Verify/fix the consolidated (all-portfolio) performance chart and each
        portfolio chart show **Σ positions + cash** per day (cash per §62 base-
        currency balance already added in backfill — confirm it is in the
        consolidated merge path `getMergedAnalytics` too, and that negative cash
        doesn't hide).
        > **Confirmed — it already did, and nothing needed fixing.** The merged
        > series sums `value_snapshots.value`, and `computeSnapshotBatch` already
        > adds cash to that (§62.4, `totalValue += cashDay`). So cash is in the
        > stored rows and therefore in the merge. There is no `getMergedAnalytics`
        > — the merge is `sumSnapshotsByDateForwardFilled`
        > (`services/mergedAnalytics.ts`), called from `GET /merged`
        > (`routes/portfolios.ts:818`).
        >
        > **The verification gap was the interesting part.** The merged unit tests
        > could never have made this claim: `sumSnapshotsByDate*` takes `value` as
        > an opaque number and has no idea cash exists. Cash enters one layer up.
        > So the honest test crosses the real chain — cash ledger → batch → merge —
        > which is what wallets `f303440` adds.
        >
        > That gap is precisely why the headline and the chart could disagree for a
        > session: `/total-metrics` adds the **live** cash balance, the chart reads
        > **stored** rows, and if cash were missing from the stored rows the two
        > would differ by exactly the cash balance — the 345,228.04 this plan kept
        > re-measuring. It was never missing; nobody had checked.
  - [x] Tests: consolidated series = Σ per-portfolio (positions + cash); a
        deposit moves the consolidated line up on that day; `total-metrics` is
        byte-identical across two consecutive calls; headline total == Σ cards.
        > **All four, in two commits.** `f303440` — the first two, plus negative
        > cash (XTB and IKE Beata are margin accounts; a clamp would report a
        > solvent fleet). `345bd8a` — the third, byte-identical on the raw response
        > text plus a read-writes-nothing assertion. The fourth, headline total ==
        > Σ cards, was already pinned by the §68 block above it
        > (`portfolio-transactions.test.ts`, exact equality not `toBeCloseTo` —
        > PROD caught a cent of drift there).
        >
        > One detail worth keeping: the Σ-per-portfolio test seeds a deposit on
        > each of three days rather than one, so it accumulates to 10500. A merge
        > that read only the last row per portfolio would pass a single-deposit
        > test.
  - [x] Tests: `npm run build`, full `vitest` green.
        > 515 green, build clean.
  - [ ] Playwright: re-check `/en/investments` headline vs the card sum.
        > The only §63.3 item left. Note the unit-level reconciliation is now
        > pinned from both sides (headline == Σ cards, and merged last point ==
        > headline), so this is a visual confirmation of what the tests assert —
        > worth doing once, not as a gate.
  - [x] Commit.
        > `f303440`, `345bd8a`.

### 63.4 — Sheets-sync: derive free-cash from flows+trades; Gotówka as reconciliation reference (multi-currency)

- [ ] Model "uninvested/free cash" per account as the §62 per-currency cash
  ledger (external flows + derived trade effects) — this already nets a funded
  buy (inflow + immediate buy) to ~0 net cash and is multi-currency. Keep
  Gotówka as a **reconciliation reference** (warn-only), not the source of the
  cash value. Re-scope the §62.6 Gotówka recon to compare the *derived* free-
  cash total against the Gotówka snapshot on the right basis/currency (resolve
  the IB=USD vs column=PLN basis) so the 3 tracked accounts give a meaningful
  Δ instead of the current full-history mismatch.
      > **Two of the three clauses hold; the one the item is actually about has
      > not been started.**
      >
      > - *Warn-only* — done. `gotowka-recon.ts:9-10` states the recon never
      >   changes the exit code, and `sync.ts:277-302` sets `process.exitCode`
      >   from `totalErrors` alone.
      > - *Per-currency ledger* — done, but **in wallets, not sheets-sync**:
      >   `cashLedger.ts` (`tradeCashEffects:51`, `cashBalances:78`,
      >   `cashBalanceSeries:153`, `dailyExternalFlows:255`), surfaced at
      >   `routes/portfolio-cash.ts:129`. It is not per-currency on the wire —
      >   `openapi.yaml:1185` is one aggregate base-currency `cash` — and the SPA
      >   never calls it.
      > - *Compare DERIVED cash to the Gotówka snapshot* — **not started, and the
      >   recon cannot currently do it.** `gotowka-recon.ts:36-40` builds each
      >   effect from the **Transakcje sheet's own** signed PLN `cashFlow`
      >   (col 19, else col 12), and `base` is the **Gotówka column's own** first
      >   non-blank balance (`:106-114`); `recon = base + Σ effects` (`:136`) and
      >   `diff = lastSheet − recon` (`:137`). **Both sides of the comparison are
      >   the user's own workbook** — it checks the sheet against itself, which is
      >   how a sheet with missing rows can agree with itself and still be wrong.
      >   And sheets-sync never reads wallets back: `wallets-api-client.ts` posts
      >   import endpoints only (`:202, 208, 217`), so the derived ledger is not
      >   reachable from the process that would need it.
      >
      > **The basis problem is knowingly left open**, in a comment rather than in
      > code: `gotowka-recon.ts:140-143` says *"IBKR diffs are compared at the
      > latest row rate, approximated here by the raw diff — the IBKR column is
      > USD but the tolerance is loose."* `recon` is PLN (`:136`), the IB column is
      > USD, and `GOTOWKA_TOL.IB` (`:23`) declares the tolerance in USD — so
      > `diff` subtracts across units. It passes only because the tolerance is
      > loose and the line is warn-only, which is the worst combination: a check
      > that cannot fail.
      >
      > **Consequence for the sequencing.** Doing this properly means the recon
      > needs the *derived* per-currency balance, which lives behind a wallets API
      > that does not currently expose the per-currency split. So this is a
      > contracts + wallets change before it is a sheets-sync change — narrower
      > than it looks, and it should not be started as a sheets-sync edit.
- [ ] Tests: derived free-cash for a funded-buy round-trip (inflow + buy) ≈ 0
  net; Gotówka recon warn-line compares derived vs snapshot within tolerance.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.5 — Provider tier: root-cause the mispriced symbols (openst/cachest) — GATED

**RCA (confirmed 2026-09-25, PROD):** the 4.5M chart comes from `price_bars`
rows with `source: 'openst'` that are **100× too high for LSE `.L` tickers** — yfinance (the first
OHLCV provider in `PRICE_PROVIDERS`) quotes London tickers in **GBX (pence)**: BYG.L price_bars 820
vs live quote £8.20 (exactly ×100); CSN.L 363 vs £3.525, RIO.L 7199 vs £70.89 (~×100, offset by a
3-day price move). Non-LSE symbols are fine (VRC.WA/SNT.WA/AMD/TSM price_bars == live quote). The
quote path (a different provider) returns **GBP**, so headline (cheap, cost- basis fallback) and
chart (×100) diverge. stooq UK data is stale (max date 2026-08-28) so it doesn't override the bad
openst overflow rows.

- [x] Reproduce the provider response: fetch raw yfinance OHLCV for CSN.L / BYG.L / RIO.L and
  confirm the close is in pence (vs the GBP quote). (GATE — blocked here: can't reach yfinance from
  this environment; do where openst has keys.)
  - **Confirmed via PROD data + unit tests (2026-09-26)**: every `.L` series is uniform
    (0 discontinuities ≥10×, median consecutive ratio 1.000–1.002 per symbol — single unit
    throughout, i.e. all fetched via yfinance in pence); BYG.L 820 → £8.20, LGEN.L 318.4 →
    £3.18, CSN.L 363 → £3.525 all match live GBP quotes after ÷100.
- [x] Fix at the owning tier: in `openst/src/openbb_client.py` `get_ohlcv_history`
  (and `get_price_history`) normalize yfinance LSE/GBX closes ÷100 to GBP — or route LSE history off
  yfinance. Add a unit test with a pence fixture.
  - **Done (openst `355c6c5`, v1.1.35 deployed to PROD 2/2)**: `_needs_gbx_normalization`
    (yfinance + `.L`) divides open/high/low/close by 100 on both paths; 4 new unit tests
    (pence fixture, non-LSE untouched, non-yfinance untouched); full suite green in the Docker
    test stage (111 passed).
- [x] Backfill/correct the existing bad `price_bars` overflow rows (delete
  `source='openst'` rows for the affected `.L` symbols so they re-fetch, or divide by 100), then
  recompute affected portfolios.
  - **Done (2026-09-26)**: `UPDATE price_bars SET close = close/100 WHERE symbol LIKE
    '%.L' AND source='openst'` — 69,247 rows across all 16 `.L` symbols (uniform 100×, safe;
    `price_bars_all` is a read-only UNION view that reads `price_bars`, so it follows). Verified:
    BYG.L latest bar £8.20, CSN.L £3.76, LGEN.L £3.18. **Recomputes done too** (user session):
    POST /recompute on IKE Marek + IKE Beata → `backfillStatus: complete`; snapshot series now sane
    (IKE Marek max £75,521 / latest 69,220 vs the pre-fix ~2.3M artifact; IKE Beata max £157,254 /
    latest 155,635; 1,796–1,800 daily snapshots each through 2026-09-25).
- [x] Add a sanity guard: an extreme quote-vs-last-close jump (≳10×) on the overflow write
  flags/logs instead of silently valuing 70×.
  > **DONE 2026-09-30** (instruments `40fd821`, **v1.0.81** deployed, homelab
  > `723bb43d0`). This landed in **instruments**, not openst: the guard belongs on
  > the *write*, and `upsertOverflowBars` is the only place a 100x bar can enter
  > `price_bars`. `classifyJump(prev, close)` refuses anything ≥10x or ≤0.1x and
  > returns the jump with its ratio; the write is skipped, so the bar becomes a
  > gap the existing gap-detection already reports.
  > **Splits are exempt, and the threshold is 10x for that reason.** Only
  > 1:10, 1:20, 10:1 and 20:1 land inside the band — every other factor is
  > under 10x, so a 2x threshold would have to classify a 1:4 split as a defect.
  > A jump with a known split factor is written and left for
  > `checkSplitBoundary`.
  > A refused bar sets a new `price_bar_metadata.fetch_status` of
  > **`sanity_failed`**, not `ok`: the fetch half-succeeded and every downstream
  > reader takes `ok` as "priced". `recentlyFailed()` now cools down on *any*
  > non-`ok` status, so one bad symbol cannot re-fetch its whole history on every
  > sweep. That also fixes a latent hole — a brand-new symbol with no metadata
  > row previously bypassed the breaker entirely.
  > **Verified in PROD against the deployed image** (instruments v1.0.81, via
  > its own `dist/services/price-bars.js`), scratch symbol, deleted afterwards
  > (0 rows left):
  > ```
  > 1) first write, no prior close:            {"written":1,"rejected":[]}
  > 2) a 1.7% move:                            {"written":1,"rejected":[]}
  > 3) the §63.5 pence overflow 8.34 -> 834:  {"written":0,"rejected":[{"d":"2026-01-04","ratio":100,"split":null}]}
  > 4) a real 1:10 forward split 8.34 -> 0.834:{"written":1,"rejected":[]}
  > ```
  > And zero false positives on four live symbols (`SAP.DE`, `VRC.WA`, `AMZN`,
  > `NTO.F` all returned their full series, nothing refused).
- [x] Tests: openst suite green; fixed symbols' price_bars match the GBP quote.
- [x] GATE: this step fixes the *data*; §63.1–63.4 fix the *pipeline*. "Chart == true value" is not
  achievable until this ships.
  - **Lifted 2026-09-26** (openst v1.1.35 + data backfill + recomputes; only the ≳10× sanity
    guard remains as hardening).
- [x] Commit.

### 63.8 — Data-gap handling: fill/repair price history + surface incomplete backfills + gray-out during recompute (2026-09-27)

Follow-on from the §63.6 RCA: the "sudden growth"/fake-inflow spike on IKE Beata
looked like **missing price-bar history** — the backfill values only the symbols
it has a bar for (18/23 → 155k) while the live-quote snapshot values all 23
(→ 205k). Three coupled changes so the two valuation paths agree and the UI never
shows a silently-wrong value.

> **Superseded in part (2026-09-27).** The missing history was real and is fixed
> (item 2 → §63.9), but it was *not* the spike: the spike was the sweep pricing
> **nothing at all** (§63.10). The three changes here stand on their own merit —
> the gap signal, the gray-out, the fill — they are simply not what fixed the
> chart. The `18 of 23` figure was also an exact-date count; `buildPriceMap` carries
> prices forward, so the real number of unpriced symbols was smaller.

- [x] **Backfill must not silently drop a held symbol with no price bar.**
      (wallets `09f48c2` + `bcdf8e3`, 348 green; contracts v1.6.44.)
      `computeSnapshotBatch` now returns `{ rows, gapSymbols }` — the held
      (qty>0 on the window's last day) symbols with NO price bar. Both backfill
      paths persist it to `portfolio_backfill_metadata.gap_symbols` (migration
      0009; the force path writes it atomically inside the delete+rebuild tx;
      `persistGapSymbols` coerces []→null). `GET /:id/analytics` returns a
      top-level `gapSymbols` via `getGapSymbols`. +4 tests (gap detected / gap
      cleared / API present / API absent). The SPA renders an amber
      partial-sum warning (see item 3).
- [x] ~~**Instruments: fill/repair missing history — GATED on the provider tier
      (§63.5).**~~ **RESOLVED (wrong premise — see §63.9).** The diagnosis recorded
      here was wrong: `providerSymbol()` is not the problem, and this was never a
      provider-coverage gap. Probed in PROD on 2026-09-27: openst serves
      `/price/ohlcv/XTB.WA` (2637 bars), `EMIM.AS` (3152 bars) and `RBOE.AS` in
      0.3–2.1 s, **including with `start=1900-01-01`**. The symbols were always
      sourceable; nothing ever asked. Superseded by §63.9.
- [x] **UI: gray out + block every recomputing chart until done** (user
      request). (SPA `296343e` + `fe4c0e5`, 397 green.) `PortfolioPerformanceChart`
      gained a `recomputing` prop: the chart is dimmed (opacity-50) +
      pointer-events disabled with an in-progress overlay, and the Recompute
      button is disabled (no re-trigger) while a pass is in flight. Wired on the
      per-portfolio Performance tab (`recomputeBusy || backfillPending`) and the
      combined chart (`mergedBusy || mergedBackfillPending`); PortfolioCard
      already gates its timeframe buttons during recompute. A `gapSymbols` prop
      shows the amber partial-sum warning (Performance tab + card). +2 chart
      unit tests (gray-out blocks re-trigger; gap warning renders).

**Deployed 2026-09-27** — wallets **v1.1.65** + SPA **v1.0.239** pinned in
`cluster/apps/pfire/*/app/helmrelease.yaml` (homelab commit `f2be27648`), 1/1
both, migration 0009 (`gap_symbols`) applied in PROD.

**What's still missing (continue here next session):**
- [ ] **Item #2 — the actual price history** (GATED, provider tier / §63.5).
      Until the `.WA`/`.AS` symbols get bars, the value is *flagged* partial,
      not *corrected*. The 5 missing IKE Beata symbols (≈ 50k): **XTB.WA,
      EMIM.AS, RBOE.AS** (`fetch_status='failed'`, 0 bars) and **AMZN, SP20.L**
      (bars exist but a gap on the snapshot date). Concretely: (a) figure out
      why cachest/OpenBB `/ohlcv/XTB.WA` returns nothing (symbol mapping for
      WSE/ASX venues, or no provider coverage — check what openst/stooq could
      supply), (b) once sourceable, seed the history (instruments fill / stooq
      import) and re-run a backfill so `gap_symbols` clears to null and the
      value matches the live path. Also still open on the instruments side:
      log the provider error into `fetch_status`/`last_error` (diagnosability)
      and add a scheduled "fill gaps for held symbols" pass.
- [ ] **Confirm in UI** (needs a fresh PROD login — Playwright session closed
      mid-verification): on IKE Beata → Performance, verify (a) the amber
      "Value excludes 5 positions without price history" banner shows after one
      recompute, and (b) the chart grays out + Recompute is disabled during a
      Recompute and re-renders fresh when done.
- [x] ~~**Turn RECALC_DEBUG off**~~ — done in §63.10.5 (now `RECALC_DEBUG: "0"`).

### 63.9 — cachest's rate limiter caps upstream concurrency at 3 (RCA of the IKE Beata spike, 2026-09-27)

Continues §63.8 item 2, whose premise was wrong. Everything below is measured
against PROD (cluster reachable via `KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`),
not inferred.

**The spike, end to end.** The 09-26 `IKE Beata` snapshot is written by two
different valuation paths. The **live-quote** path (`snapshotPortfolioValue`, fired
on a detail-page read) values *all 23* open positions from one live quote → 205,470.
The **price-bars** backfill (`computeSnapshotBatch`) values only the symbols it has a
bar for. Measured position-by-position in PROD, exactly **3 of 23** have zero bars:

| symbol | qty | bars | `price_bars_all` last | `fetch_status` |
| --- | --- | --- | --- | --- |
| `EMIM.AS` | 80 | **0** | — | `failed` 2026-09-22 06:31 |
| `RBOE.AS` | 53 | **0** | — | `failed` 2026-09-22 06:31 |
| `XTB.WA` | 84 | **0** | — | `failed` 2026-09-27 14:24:59 |

The other 20 have bars, so the earlier "18 of 23 / 5 missing" count was an
**exact-date** check and wrong: `buildPriceMap` (`portfoliost-wallets/src/services/backfill.ts:256`)
**carries prices forward**, so a symbol with a 09-25 bar *is* valued on 09-26/27
(09-26 was a Saturday). `AMZN` (last 09-21) and `SP20.L` (last 09-24) are stale but
never dropped. The ≈50k delta is the 3 zero-bar symbols' weight, full stop.

**Root cause: `cachest`'s `RateLimiter`.** `cachest/rate_limiter.py:22` claims the
slot with `self._last_fetch = time.monotonic() + sleep`, so with N waiters the
requested sleep *grows* — 2s, 3.9s, 5.8s, 7.7s … With `fetch_interval: 2` /
`fetch_max_wait: 4` on `OPENST_OHLCV` (`cachest/config.yaml:88-99`), the moment
`sleep > max_wait` the waiter is **rejected**: instant `503`, *no upstream call*
(`cachest/main.py:84-92`). Effective queue depth is `floor(max_wait/interval) + 1`
= **3**. Reproduced in PROD with 8 concurrent `forceRefresh` calls:

```
req0 -> 200 X-Cache=MISS 0.45s     req4 -> 503 X-Cache=None 0.04s 'rate limit exceeded…'
req1 -> 200 X-Cache=MISS 2.07s     req5 -> 503 X-Cache=None 0.04s
req2 -> 200 X-Cache=MISS 4.06s     req6 -> 503 X-Cache=None 0.04s
req3 -> 503 X-Cache=None 0.06s     req7 -> 503 X-Cache=None 0.03s
```

The same limiter serves `OPENST_QUOTE` (65 rejections in the last 5 h), `logo` (21)
and `OPENST_OHLCV_FUNDS`. So this is **not** IKE-Beata-specific: 175 symbols carry
`fetch_status='failed'` in PROD, and the `.WA` family is hit as a block — `SNT.WA`
and `ETFSP500.WA` are stuck at **09-18**, `PLW.WA`/`ELT.WA`/`KRU.WA` at 09-21,
`CBF.WA`/`DNP.WA` at 09-22 — because they lost the race, not because they delisted.

**Why the loser stays a loser.** `portfoliost-instruments/src/services/price-bars.ts:395`
catches the 503 in a **bare** `catch {}`, records `fetch_status='failed'`, and
`recentlyFailed` (`price-bars.ts:181-187`) then suppresses upstream for
`COOLDOWN_MS = 1 h`. The sweep runs 1–2×/day
(`portfoliost-wallets-snapshotsync` 13:00 UTC + `…-postfx` 17:20 UTC), so a symbol
that loses one race waits ≥1 h and typically loses the next one too. There is no
`last_error` column (`src/db/schema.ts:85-89`), so a transient 503 is recorded
identically to a genuine 404 "no such symbol" — which is why this took a day to pin.

**What the provider is NOT.** Both earlier hypotheses are dead, and it is worth
recording so they are not re-tried:
- *"`start=1900-01-01` for a zero-history symbol is too wide"* (`price-bars.ts:374`
  does send that) — **false**. openst answers `XTB.WA` with 2637 bars in 2.1 s and
  `EMIM.AS` with 3152 bars in 0.9 s *with that exact 126-year window*; yfinance
  clamps to the listing date. It is visible in the cache key
  (`ohlcv:VOX0224:1900-01-01:2026-09-26`) and looks alarming, but it is not the
  cause and needs no clamp.
- *"`providerSymbol()` doesn't strip `.WA`/`.AS`"* — **false**. The suffix is the
  correct Yahoo form; `.WA`/`.AS`/`.DE`/`.L` are handled identically, and
  `EMIM.AS`/`RBOE.AS` are Euronext-Amsterdam iShares ETFs (plan-archive §43) whose
  *quotes* already work — which is precisely why the live path values them and the
  backfill cannot.

**Design decision (resolved):** fix it in `cachest`, the owning tier. `fetch_interval`
is a *politeness spacing* toward upstream; for the routes that point at **our own**
`openst` service it is far too coarse, and openst already bounds real concurrency
itself (`UPSTREAM_MAX_INFLIGHT = 8`). So: drop the interval to `0.2` and raise
`fetch_max_wait` so the queue absorbs a whole portfolio sweep (≥175 symbols), for
every `openst.*` route. Genuinely external routes keep their spacing and only get
`fetch_max_wait` raised. Separately, `portfoliost-instruments` must stop converting
a *transient* 503 into a 1-hour `failed` — a 503/504/429 is retryable and must be
recorded as such, distinct from a 404.

### 63.9.3 — heal PROD and prove the spike is gone

- [x] **Deployed 2026-09-27** (cachest v1.0.44 + instruments v1.0.70 pinned in
      `cluster/apps/pfire/{cachest,portfoliost-instruments}/app/helmrelease.yaml`,
      homelab `b9c2a9eff`; migration 0003 applied). The cachest ConfigMap landed
      first and Flux's reloader restarted the pod on it, so the limiter fix was
      live before the images.
      Verified in PROD: 16 concurrent `forceRefresh` `/ohlcv/SNT.WA` → **16 × 200,
      0 × 503** in 3.08 s (the same burst gave 3 × 200 / 13 × 503 before). Cachest
      now logs `queue_depth` per route at boot. Drove the instruments gap-fill
      directly from the pod for the starved symbols: `XTB.WA` 2637 bars,
      `EMIM.AS` 1258, `RBOE.AS` 1230, and `SNT.WA`/`ETFSP500.WA` off 09-18 onto
      09-25. `fetch_status='failed'` symbols: **175 → 166**.
- [x] All 23 IKE Beata positions now have a price bar; the amber partial-sum
      signal is no longer needed for the missing-history case. The next sweep
      pass then exposed a **much larger, unrelated** problem — see §63.10.
- [ ] `logo` route: the 21 rejections came from the same depth-3 wall and are fixed
      by §63.9.1's config (depth 600), but the SPA still fans out ~80 logos per
      page, so re-check its rejection count after the next full page load.
  - **Superseded in practice by §63.15 (2026-09-27).** The `logo` route is not
      the thing to re-check any more: `instruments.price_bar_metadata` now shows
      133 `failed` of 377 symbols, but only **13** are referenced by a live
      transaction (all genuine delistings — `MPW`, `WBA`, `TOR`, … — correctly
      404ing upstream) and 120 are orphans from the resolver's unmatched-name
      fallback. Prune them, then read the failure count.

### 63.11 — Edge auth for browser traffic (follow-on)

> **CLOSED 2026-09-30** (homelab `530492814`). The decision was **not** to
> enable `global-auth-url`, and the reason is now written into the file so it
> does not read as an obvious-looking win someone re-tries:
>
> 1. **The commented path is wrong.** Every ingress in this cluster that
>    actually authenticates uses `https://auth.…/oauth2/auth` + `/oauth2/start`
>    (pgweb, scanst-ui, scanst-otp, stooq, jobshot). The value commented on the
>    ingress-nginx HelmRelease is `/api/verify` + bare `/` — a *different
>    endpoint*. Uncommenting it as written would 302 every browser request in
>    every namespace to a URL that does not answer.
> 2. **The blast radius is the whole cluster.** It is a controller-wide default,
>    so it lands on `default`, `home` and `media` at once — including the KEDA
>    scale-to-zero apps in `default` and every service that legitimately has no
>    browser login.
>
> **What was done instead, and it is the part the section was actually after.**
> Only three pfire services have an ingress at all: `portfoliost` (which already
> authenticates through Pocket-ID OIDC), `cachest` and `openst`. The latter two
> are the internal tiers — `openst` holds the provider API keys — and neither had
> any auth whatsoever, so a browser could read them directly. Both now carry the
> same `auth-url`/`auth-signin` pair as pgweb/scanst/stooq/jobshot.

- [x] Decide and implement: enable nginx `global-auth-url`, or record a decision
      not to. → **Not enabled**; the two internal tiers opt in individually.
- [x] Tests: an unauthenticated browser request to a `pfire` ingress is
      redirected.
      > **Verified in PROD**, both tiers, on a data path and not just health:
      > ```
      > cachest  /api/config  HTTP 302 -> https://auth.k.homylab.com/oauth2/start?rd=…
      > openst   /__mem       HTTP 302 -> https://auth.k.homylab.com/oauth2/start?rd=…
      > ```
- [x] Tests: the scheduled sweep is unaffected.
      > **Verified in PROD, twice.** Every in-cluster caller uses the
      > **ClusterIP**, which nginx never sees: from the instruments pod,
      > `cachest:8080/health` 200, `openst:8080/health` 200, and a real
      > `cachest /ohlcv/CSN.L?start=…&end=…` 200 with a payload. Then a live
      > `snapshotsync` Job launched **after** the change ran the whole chain:
      > `[snapshotsync] done: ok=10 failed=0`.
- [x] Commit.

Still open. Recorded as a deliberate non-fix during the sweep work: the cluster has a working global nginx
auth subrequest that is switched off
(`cluster/apps/networking/ingress-nginx/helm-release.yaml:51`,
`# global-auth-url: "https://auth.${SECRET_DOMAIN}/api/verify"`), and nothing in
`apps/pfire/*` uses oauth2-proxy or `auth-url`. So every access control in pfire is
per-service application-level JWT validation, and the instruments → cachest →
openst → provider-keys chain has exactly one check at its front. Worth turning on
as defence in depth — it hardens *browser* traffic and changes nothing for the
scheduled job, which is why it was not treated as urgent.

---

### The chain

1. **The sheet contradicts itself.** The live Podsumowanie row for
   `Nintendo Co Ltd` (fixture row `[106]`) carries `Symbol giełdowy`=`NTO`,
   `Giełda`=`FRA`, currency=`EUR` — i.e. the Frankfurt line — but its
   `Symbol Yahoo` column says **`7974.T`**, the Tokyo line. The DIVIDEND rows on
   the same holding say `JPY` while the BUY/SELL rows say `EUR`.
2. **The resolver faithfully follows the stale column.** `resolveInstrument`'s
   order is `byNameOverride` → catalog-by-name → catalog-by-(symbol, venue) →
   `ticker_reference`, and the catalog entry's `yahooSymbol` *is* that Yahoo
   column. A name override was already supposed to shield this, and for `EMIM`
   (`§38.3`) and `RBOE` (`§43.1`) it does — but the `nintendo co ltd` entry itself
   pointed at `7974.T` with `country: "JP"`, so the override *enshrined* the wrong
   listing. It carried no provenance comment, unlike its `allianz se` neighbour.
3. **The currency resolver could not object.** `ticker_reference` has no `7974`
   row at all, and `exchange_reference`'s `TSE` row has an **empty
   `yahoo_suffix`**, so `resolveInstrumentCurrency` is silent and falls back to
   the caller-declared base — which is the trade row's `EUR`.
4. **Valuation then priced the wrong series.** The stored `instrument_currency` is
   `EUR`, so the ¥12,695 Tokyo close of 2025-09-23 became
   `20 × 12,695 × 4.25 ≈ 1,080,421 PLN`.

#

### The evidence that the intended series is `NTO.F`

The stored transaction prices were *already* the Frankfurt ones — the import only
mislabelled the symbol. `NTO.F` closes reproduce them to within a day's spread,
while `7974.T` is a different series entirely (probed 2026-09-27 via openst):

| date | stored transaction price | `NTO.F` close | `7974.T` close |
|---|---|---|---|
| 2023-04-12 (BUY 5) | 37.50 EUR | **37.02** | 5,466 JPY |
| 2024-08-05 (BUY 5) | 42.72 EUR | **43.89** | 6,607 JPY |
| 2025-09-23 | — | **73.22** | 12,695 JPY |
| 2025-09-24 (SELL 20) | 74.70 EUR | — | — |

`NTO.DE`, `NTOG.UK` and `7974.TO` all 404; `NTO.F` is the only live line. It also
has the deeper history of the two (2,983 bars from 2015-01-02 vs 2,886 from
2015-01-05), so the reimport heals the whole holding rather than opening a gap.
Correct value of the 20 shares on 2025-09-23 is `20 × 73.22 ≈ 1,464 EUR ≈ 6,200 PLN`,
not 1,080,421 PLN — the cliff is **entirely** the phantom, and the recomputed
series should be flat across 2025-09-24.

#

### Fix

`NAME_VENUE_OVERRIDES["nintendo co ltd"]` → `ticker: "NTO"`, `yahooSymbol: "NTO.F"`,
`country: "DE"` (`portfoliost-sheets-sync` `db04359`, shipped `v1.0.22`, pinned in
`portfoliost-admin`'s `SHEETS_SYNC_IMAGE`). EUR now matches the row's own currency
column, so the position needs **no conversion at all** — which also answers "why JPY
if we only use EUR": we do not; JPY was only ever the stale Tokyo line bleeding in.

Tests: `instrument-resolver.test.ts` asserts the override holds for `FRA` *and* for
a stale `TYO` row (it is name-keyed, so the venue column cannot filter it out);
`podsumowanie-parser.test.ts` keeps asserting `7974.T`/`JP` to pin the fact that the
parser reads the sheet verbatim and the correction lives in the resolver. 138 green.

#

### Healed in PROD (2026-09-27)

Wipe & reimport + full recompute of all 10 portfolios, verified:

| check | before | after |
|---|---|---|
| stored Nintendo symbol | `7974.T` (9 rows) | **`NTO.F`** (9 rows) |
| IBKR value 2025-09-23 | 1,528,346 | **453,217** |
| IBKR value 2025-09-24 | 454,644 (−52.1%) | **454,644 (+0.3%)** |
| merged series 2025-09-24 | −52.1% | **+0.1%** |
| `NTO.F` price bars | none | 6,830 |
| backfill status (10/10) | complete | **complete**, `gap_symbols` empty |

Phantom removed: **1,075,129 PLN** from IBKR's 2023-04-12..2025-09-23 window —
which reconciles with the predicted 1.07M from the table above. Headline values are
**unchanged** (IBKR 585,319.22, IKE Beata 196,827.12, IKE Marek 90,962.72) because
the position was sold in Sept 2025 and contributes nothing to today's figures; only
the historical window moved. The merged chart's worst remaining single-day move is
−24.1% on 2022-05-26, a real drawdown.

#

### Left open

- **The DIVIDEND rows will still be `JPY`** after the reimport: `currency` comes
  from the sheet, and the override only changes the symbol. Financially
  immaterial (~10 PLN total across four rows) but it is a residual label
  inconsistency, now confirmed to have survived the reimport as predicted.
- **The fleet-wide stale-symbol audit is unresolved.** The obvious check —
  compare each row's Yahoo column against `symbol + exchange_reference.yahoo_suffix`
  — does not work, because the sheet uses **Polish venue codes** (`ETR`, `LON`,
  `FRA`, `AMS`, `BIT`, `SWX`) while `exchange_reference` carries MIC-style ones
  (`XETRA`, `XLON`, `XFRA`, `XAMS`, `FSX`). 35 of 226 rows come back "unknown
  venue" and the naive comparison also flags legitimate local-ticker ≠ Yahoo-ticker
  cases (`V` → `HUBS`). Nintendo is the one case proven wrong by the data.
  Two real reference gaps surfaced while attempting it: `TSE` has an **empty**
  `yahoo_suffix` (which is why the currency resolver was silent), and there is
  **no TSX row**, so `CSU` (Constellation Software, `CSU.TO`) has no venue to
  resolve against. Adding the sheet's venue-code vocabulary to
  `exchange_reference` is the prerequisite for making that audit real.

### Two audits, and why the first one was wrong

**Attempt 1 (discarded).** Probed the provider's `/equity/quote` for all 220
distinct stored symbols at concurrency 6 and compared the result with each
symbol's `instrument_currency`. It reported "80 currency mismatches / 92
unpriceable", including `NTO.F` — which had just been backfilled with 6,830 bars
and verified at 43.01 EUR. Two tell-tales gave it away: `NTO.F` came back `ERR`,
and `0M6S.IL` and `CSN.L` reported an identical 1,701 bars. openst was throwing
and rate-limiting, so the harness was measuring its own failures. **Discarded
whole.** The trustworthy signal at the time was the independent one: all 10
portfolios were `complete` with empty `gap_symbols`.

**Attempt 2 (kept).** Two changes made it sound:

1. *Structural check, no network.* Compare each live Podsumowanie row's Yahoo
   column against its own `Symbol giełdowy` + `Giełda`. The sheet's venue codes
   map to fixed Yahoo suffixes (`ETR`→`.DE`, `FRA`→`.F`, `LON`→`.L`, `AMS`→`.AS`,
   `BIT`→`.MI`), so the expected symbol is derivable. This needs the *stored*
   symbol joined by name to see what the resolver actually produced.
2. *Currency check, gently.* Probe `/equity/quote` at concurrency 3 with
   retries, comparing the provider's currency against the **catalog's**
   `Oryginalna waluta` (col 37) — not the transaction's `instrument_currency`,
   which is legitimately different (§ below).

#

### What the ETR/FRA/LON/AMS/BIT sweep found (40 rows)

14 of 40 diverged, and the classes are very different:

| class | n | detail |
|---|---|---|
| cosmetic | 8 | German `.F` vs `.DE` sibling lines. Measured: AHOG +0.19%, VNA +0.17%, BAS +0.08%, SRT +0.73%, FRE −0.29%, MUV2 +0.16%; plus `XDEW.SW`/`XMBR.DE` on a `BIT` row. Same company, same currency, tracks within 0.75%. Not worth touching. |
| intentional | 1 | `Allianz SE` → `0M6S.IL`, the §34.7 override. |
| **wrong** | 4 | `CSKR.L`, `EXS1`, `LTAM`, `EX10.VI` — shipped in `v1.0.23`. |

`EX10.VI` was the notable one: the provider identifies it as **iShares MDAX
UCITS ETF (DE)** — a different issuer (BlackRock, not Invesco) — whose history
starts 2026-04-28, *after* the holding closed in Oct 2025, so it could never have
priced it. The real fund is ISIN **IE00BHJYDV33**, Borsa Italiana ticker `MDAX`,
and the Xetra/gettex line is `DEAM.DE` (1,938 bars from 2019-02-11 inception vs
`MDAX.MI`'s 351 from 2025-05-08 — hence `DEAM.DE`).

**`openst`'s search endpoint cannot help here**: `/equity/search` is US-only
(SEC CIK index), so "MDAX" and "Invesco MDAX" both 404. The ISIN had to come
from the open web, then be confirmed against the provider's profile name and the
sheet's own trade prices.

#

### The pence bug (§63.5's fix was half-wrong)

`_needs_gbx_normalization` fired on **any** yfinance `.L` ticker, so every
USD-quoted LSE line had its history divided by 100 as if it were pence. Measured
in PROD:

| symbol | bars before | truth | bars after |
|---|---|---|---|
| `CNYA.L` | 0.0447 | ~4.46 | **4.468** |
| `DEAM.L` | 0.583 | ~58.3 | **58.78** |
| `IWDA.L` | 1.4691 | ~146.9 | — |
| `EMQQ.L` | 0.0933 | ~9.33 | — |
| `BYG.L` | 8.20 | £8.20 ✓ | 8.24 ✓ |
| `CSN.L` | 3.525 | 352.5 GBp ✓ | ✓ |

The quote path was never wrong — only the two history paths divided — and
instruments already applies its own `PENCE_UNIT` rule to quotes, so this was the
sole incorrect side. Fixed in `openst` `9348560` / **v1.1.37**: the decision now
comes from the provider-declared currency via a memoised `get_quote` lookup.
Successful lookups are cached, failures deliberately are **not** (so they retry),
and when the currency can't be determined openst does **not** scale — missing a
pence line is a bounded error instruments flags, while scaling a USD line is
unbounded across a whole class of ETFs. No USD `.L` position is open, so nothing
live changed; the stored bars are corrected by the next recompute.

This is also why `CNYAN.MX` → `CNYA.L` was **held back** from v1.0.23: before the
fix `CNYA.L` came back as 0.0447, so applying it then would have swapped a 20×
error for a 100× one.

#

### Full 220-symbol sweep — 3 more real defects

| stored | resolved to | was | evidence |
|---|---|---|---|
| `CNYAN.MX` | **`CNYA.L`** | the **Mexican** line, for a `LON`/USD row | `CNYAN.MX` closed **90.11 MXN** where the sheet records 4.46 USD; `CNYA.L` gives 4.468/4.436 vs sheet 4.46/4.395 |
| `FRO` | **`FRO.WA`** | bare `FRO` is **Frontline plc**, a USD tanker company | 11.89 USD vs a real 25.10 PLN; `FRO.WA` = "FERRO S.A.", PLN, 25.60/23.60 vs 25.10/23.00 |
| `XDEW.SW` | **`XDEW.MI`** | the CHF SIX line, for a `BIT`/EUR row | 4–8% off; `XDEW.MI` matches all four trades within 0.5% |

`FRO` is the same shape as Nintendo: a Polish holding priced off an unrelated
US-listed company that happens to share the ticker.

`CNYAN.MX` had already done measurable damage — IKE Beata's value series steps
**+27,669 PLN** on 2025-01-23 (82 units) for a position genuinely worth ~1,485 PLN.

#

### Currency labels that are NOT bugs

A stored `instrument_currency` that differs from the quote currency is **normal**:
the broker transacts in a local currency and converts to the instrument's original
currency with its own rate, which the pipeline already stores. Confirmed on
`ASML`, which is Nasdaq/USD but has EUR rows in IKE Marek — every row carries
`rate_source='manual'` with correct historical rates (4.74 for 2022-08-26, 4.35
for 2023-12-29). So these were deliberately **not** overridden, only checked that
the *symbol* fits its venue: `SHOP` (sheet CAD, transacted USD at IBKR),
`NVO` (sheet DKK, transacted USD), `BTEC.SW` / `EMQQ.L` / `IUCD.L` / `MLPD.L`
(sheet says GBp/EUR, all transacted USD with manual rates, provider quotes USD),
`CSN.L` / `RIO.L` (PLN transactions on GBP-quoted London lines). Their catalog
currency labels are annotations, not valuation inputs.

#

### False alarms worth recording

- **The 33 Polish bond codes** (`EDO*`, `ROD*`, `ARH*`, `KIN*`, `KRI*`, `INS*`,
  `BST*`, `NVA*`, `VOX*`) 404 on `/equity/quote` **by design** — they're bonds.
  They are served in PLN by the bond endpoints (`EDO1233` 115.57 PLN,
  `ROD0935` 121.60 PLN; `ARH0722`/`VOX0224`/`KIN1025` return corp-bond profiles
  with ISINs but no quote). Not defects. Note the 41 `venue='-'` rows are 35 of
  these bonds plus 6 Goldman Sachs TFI funds already handled by §38.3.
- **`CRWD` / `GOOGL`** returned no `currency` field — the provider simply omits it
  on those two quotes. Both are NASDAQ/USD and priced normally.

#

### Method note

Every override in this section was validated against **your stored transaction
prices** before being accepted, not against the sheet's symbol column. That is
what makes the difference between a real fix and a plausible one: `EX10.VI` looks
like a reasonable ticker until you ask what fund it actually is, and `FRO` looks
right until you notice the bare ticker belongs to a shipping company.

Six overrides total across §63.12–§63.13: `7974.T`→`NTO.F`, `CSKR.L`→`IKOR.L`,
`EXS1`→`EXS1.DE`, `LTAM`→`LTAM.MI`, `EX10.VI`→`DEAM.DE`, `CNYAN.MX`→`CNYA.L`,
`FRO`→`FRO.WA`, `XDEW.SW`→`XDEW.MI` — seven in all.

#

### Healed in PROD (2026-09-27)

Wipe & reimport (`sheets-sync` v1.0.24) + full recompute of all 10 portfolios:

| check | before | after |
|---|---|---|
| bad symbols in `transactions` | 8 kinds | **none** — all 7 overridden |
| `NTO.F` / `IKOR.L` / `EXS1.DE` / `LTAM.MI` / `DEAM.DE` / `CNYA.L` / `FRO.WA` / `XDEW.MI` | — | present, 31 rows |
| IKE Beata 2025-01-22 → 01-23 (`CNYA.L`) | 115,606 → 143,275 (**+27,669**) | 115,606 → **115,208 (−398)** |
| IKE Beata around 2022-08-26 (`FRO.WA`) | Frontline's USD line | smooth, ~22,000, no step |
| merged series 2025-09-24 | −52.1% | **+0.1%** |
| worst single day, whole 2019–2026 series | −52.1% (phantom) | **−24.1%** (2022-05-26, a real drawdown) |
| days worse than −25% | 1 (the phantom) | **0** |
| backfill status (10/10) | complete | **complete**, `gap_symbols` empty |

The 2025-01-23 step is the clearest single confirmation: +27,669 PLN became −398,
and the position that caused it is worth ~1,485 PLN.

---

### 63.14 — Portfolio cards render the wrong currency symbol

Found 2026-09-27 during the §63 fact-check. `PortfolioCard.vue:358,362` call
`formatCurrency(portfolio.currentValue)` / `(portfolio.totalInvested)` with
**no currency argument**, and `formatCurrency`'s second parameter defaults to
`"USD"` (`src/utils/format.ts:1`). The values are in the portfolio's base
currency, so every card's Value and Invested lines are PLN amounts printed
with a `$`. The cash line three lines below (`:382`) gets this right —
`formatCurrency(portfolio.cash.total, portfolio.cash.baseCurrency)` — which is
what makes the asymmetry easy to miss.

Verified in PROD 2026-09-27: IBKR renders `$585,428.89` where the snapshot is
585,319.22 **PLN**.

- [x] **Already done, by later work — verified 2026-09-29.** `PortfolioCard.vue`
      now reads `formatCurrency(convert(portfolio.currentValue), displayCurrencyOr())`
      (and the same for `totalInvested`): it passes the currency AND converts from
      the portfolio's base. §66.2 made `currency` a REQUIRED parameter, which is
      what guarantees it — a call without one cannot compile. Grepped every
      `formatCurrency(` call site in `src/`; none is missing its second argument.
- [x] Decide whether `formatCurrency`'s `"USD"` default should exist at all.
      > **It does not, and it already did not — §66.2 removed it.** The
      > parameter is now *required* (no default value) and the internal
      > re-guess (`: "USD"`) is gone, which is the half that actually mattered:
      > the old code relabelled an explicitly passed `""`/`null`/`"zł"` back to
      > USD, defeating the caller's own care. `formatAmount` is now a
      > delegation to `formatCurrency`, so the no-guess rule lives in exactly
      > one place. Nothing to decide — the decision §63.14 was asking for was
      > made and shipped under §66.2, and §63.14's "aligning them" is done.
- [x] Tests: unit — a PLN portfolio renders `zł`, not `$`; a null-currency
      portfolio renders without a symbol. `npm run build` + `npm run test` green.
      > Added as two named cases in `tests/unit/format.test.ts`. One honest
      > correction to the step's wording: under `en-US` locale `Intl` renders
      > PLN as the **code** (`PLN 119,250.00`), not `zł`. The `zł` glyph is the
      > currency registry's `symbol` (`useCurrenciesStore`), which is what the
      > PROD screenshot showed. The test asserts what the code actually does —
      > a PLN label, never a `$`.
- [x] Playwright: re-check the cards on `/en/investments`.
      > **done 2026-09-29 — PROD renders `PLN 119,250.00`, not `$`**
- [x] Commit.
      > **no code change needed; §63.14 closed by verifying §66.2's work**

### 63.15 — Prune orphaned price-bar metadata

Found 2026-09-27. `instruments.price_bar_metadata` holds 377 symbols: 244 `ok`
and **133 `failed`**, but only **13** of the failures are still referenced by a
live transaction — those are genuinely delisted (`MPW`, `WBA`, `TOR`, …) and
correctly 404 upstream. The other **120** are orphans left by earlier import
rounds, when the resolver's "unmatched keeps the sheet name as symbol" fallback
wrote company *names* into the symbol column: `ALLIANZ SE`, `NINTENDO CO LTD`,
`AMUNDI CORE S&P 500 SWAP UCITS EUR DIST ETF`, plus bare tickers from superseded
resolutions (`ADYEN`, `CSU`, `JNJ`, `PKN`, `RIO`, `SNT`, `XTB`). 157 metadata
rows in total have no referencing transaction.

These are harmless to valuation (all 10 backfills are `complete` with empty
`gap_symbols`) but they make the next audit read as if ~35% of the fleet is
broken, which is exactly the false signal that made my first §63.13 sweep
unreliable.

> **Shipped 2026-09-30** (instruments `a7e0a06` + `3850fa5`, **v1.0.83**
> deployed, homelab `f08d245ad`). **The `--apply` is deliberately NOT run** —
> see "why it is not applied" below.

- [x] Decide the retention rule: delete `price_bar_metadata` + `price_bars_all`
      rows whose symbol no transaction references, or keep them as a warm cache.
      Deleting is cheaper to reason about; keeping needs a documented TTL.
      > **Delete, and no warm cache.** A search for an unheld symbol refetches
      > on demand — one bounded upstream call. A cache needs a *second* sweeper
      > plus a TTL to expire what the first sweeper declined to delete, which is
      > two mechanisms to reason about instead of one. And the retention value is
      > negative here: the metadata table exists to be *read*, and 51% orphans is
      > what made `failed` read as a third of the fleet being broken.
- [x] If deleting: the sweep must never remove a symbol a *held* position needs,
      so gate on "no referencing transaction **and** not in the live fetch set".
      > A symbol is protected by ANY of: a transaction (open **or** closed — a
      > closed holding still needs its history to value the period it was held),
      > an open position (covers a position whose opening transaction is not
      > written yet), or the caller's explicit `--keep` list.
      > **The referenced set is passed in, not queried.** It lives in wallets'
      > `portfolios.transactions` / `portfolios.positions`, which instruments does
      > not own; a sweep deriving "referenced" from instruments' own schemas
      > would see an empty world and delete the entire price history. `--all` is
      > refused outright, `--referenced` is required, dry run is the default.
- [x] Add the resolver's unmatched-name fallback to the plan's radar: when it
      fires, the sheet row's symbol is a company name, which no provider will
      ever serve. Consider making that case loud at import time instead of
      silent.
      > Confirmed in prod, and it is visible in the orphan list: `ALLIANZ SE`,
      > `AMUNDI CORE S&P 500 SWAP UCITS EUR DIST ETF`, `BASF SE`,
      > `BRITISH AMERICAN TOBACCO PLC ADS COMMON STOCK`, `EMERGING MARKETS
      > INTERNET UCITS ETF ACC`, `CHESNARA PLC`, `ASML HOLDING NV` — all
      > company names in the `symbol` column, exactly as this item predicted.
      > They are safe to delete (nothing references them) but the *cause* is in
      > `sheets-sync`'s resolver, not here. **Left open** — a `sheets-sync`
      > change, out of this section's scope.
- [x] Tests: a symbol with a live position is never removed.
      > 12 tests. The load-bearing one: wallets stores `KEEP1.US`, `price_bars`
      > keys `KEEP1`, and a raw string comparison would have deleted a live
      > holding's entire history — so both sides are compared venue-free. Also
      > covered: dry run writes nothing, bars with no metadata row are removed,
      > venue-suffixed bars are removed, the bar-row count is reported.
- [x] Commit.

#### Applied 2026-09-30 — closed on the user's instruction

> **VERIFIED 2026-09-30, after the fact** (cluster access returned later, so the
> closure above was closed-on-instruction for ~2h before any of this was checkable):
> - `instruments.price_bar_metadata`: **377 → 319 rows** (58 removed).
>   `fetch_status` split: **`failed` 133 → 81** (−52), `ok` 244 → 238 (−6).
>   The false signal this was meant to kill dropped from **35% of the fleet to
>   25%** — the intended benefit, measured rather than assumed.
> - **The `--keep` split worked for `EDO*` and failed for `ROD*`.** Surviving
>   metadata by series: `EDO` 37, `ROD` 20, `BST` 2, `INS` 1, `NVA` 1, `VOX` 1.
>   `ROD0129`, `ROD0134`, `ROD0232`, `ROD0333`, `ROD0437` are **gone** — the
>   prefixes my grep matched were built for them, and the transcript it read was
>   cut short. The 20 `ROD*` that remain are referenced (held), so the loss is
>   5 unheld bonds' history, and per §66.2 a bond bar is likely unrecoverable
>   because there is no fixedincome quote path. Root cause of the miss, now
>   that it can be looked at: the keep list came from a human-readable log line
>   split on spaces, so (a) `^INS` also matched `INSTRUMENTS`, shredded out of
>   `CREOTECH INSTRUMENTS SA`, and (b) whatever the terminal truncated was never
>   seen. A keep-list must be a `SELECT`, not a transcript.
> - **Side finding, unrelated but real:** `instruments.price_bars_all` has **no
>   indexes at all** (`pg_indexes` returns 0 rows for it). A
>   `WHERE date >= current_date - 4` count exceeded a 30s statement timeout. The
>   prune itself ran, but it is doing sequential scans over the whole table, and
>   so is anything else that filters that table by date.
>
> **CLOSED 2026-09-30.** The user reviewed the split (delete the ~20
> company-name/crypto orphans, `--keep` the ~37 Polish savings bonds) and
> instructed: *"lets assume prune worked and close it."* **`--apply` ran:
> 56,774 bar rows removed.** The verification queries were not run, so the
> post-state (`failed` count, retained `EDO*`, missing `ROD*`) is **unverified** —
> closed on the user's explicit assumption, not on measurement, and the `ROD*`
> miss below is therefore unquantified. The text that follows is the original
> pre-apply rationale, kept because the retention reasoning still stands.
>
> **What was applied** (full record, including the self-inflicted `ROD*` miss and
> the `INS`→`INSTRUMENTS` false positive, and the five-times-repeated lesson about
> convenient-but-wrong parameters) is in the git history at `efa443e`.

The decision as taken before applying:

The dry run against the real referenced set (220 symbols, every
`transactions.instrument_symbol` and every `positions.symbol`):

```
[instruments] prune-orphan-bars DRY RUN: considered 379 metadata symbols,
50 orphaned symbol(s), 85689 bar row(s) would be removed.
```

To apply, from the instruments pod, with the referenced set read from the two
wallets tables (the query is in this section's git history — do not hand-copy a
stale list, because the referenced set changes on every import):

```bash
kubectl exec -n pfire <instruments-pod> -c app --   node /app/dist/scripts/prune-orphan-bars.js --referenced "$(<symbols>)" --apply
```

**One measurement correction worth keeping.** My first orphan count said
401,288 orphan bar rows; the script says 85,689. The count was wrong, not the
script: the SQL compared `upper(p.symbol)` against an already venue-free set, so
`ASML.AS` never matched `ASML` and every venue-suffixed symbol was counted as
an orphan. The script normalises **both** sides. That is the fourth time in this
plan a convenient-but-wrong parameter made data look different from what it
was — and the first time the tool caught it rather than the reasoning.

---

## 65. Gotówka reconciliation: the sheet is missing cash rows (2026-09-27)

This is **user-driven** and the only remaining loop from the cash-native work:
it closes when the sheet stops disagreeing with the import, not when code
changes. The import side is done — `Transakcje!AU` is fetched and parsed, the
`#d` funding leg and the Equate+ → IBKR `#t` transfer are emitted, and the
warn-only reconciliation exists.

Context: §62 made cash portfolio-native and §62.6 added a warn-only `Gotówka`
reconciliation that prints a line per gap (Δ per day, suggested Wpłata/Wypłata
row per Konto, in PLN). It never fails the run.

  - **RCA done 2026-09-26**: the recon's premise was wrong — the Gotówka
    columns do NOT equal the running sum of Transakcje cash flows (matched
    dates: IBKR 2/161, IKE Marek 2/71); user confirmed the sheet **missed
    inflow/outflow rows** (the Gotówka column is the source of truth). Report
    generated with every gap (Δ per day, suggested Wpłata/Wypłata row per
    Konto, PLN): 586 rows, Σ +293 242,29 PLN (IB 311 / IKE Marek 126 /
    IKE Beata 139) — user is adding them to the sheet step by step; re-run the
    comparison as they land, then wipe & reimport when ~empty.

### 65.1 — Re-run the comparison as the rows land, then wipe & reimport

- [ ] Re-run the `Gotówka` recon (Admin → Jobs → dry sync, no `--wipe`) and
      confirm the report is shrinking toward empty.
- [ ] When it is ~empty: Wipe & Reimport, then a full recompute of all 10
      portfolios.
- [ ] Assert: 0 row errors; the synthetic `#d`/`#t` legs still dedupe on a
      second run; all 10 `portfolio_backfill_metadata.status = complete` with
      empty `gap_symbols`.
- [ ] Tests: `backfillStatus: complete` on `/api/portfolios/merged`; no
      single-day move worse than −25% in the ALL series (the bar established in
      §63.13 — the series' worst legitimate day is −24.1% on 2022-05-26).
- [ ] Commit (plan closeout) + archive §65.

---

## 67. Follow-ups from the currency work — the aggregate base and a duplicated helper (2026-09-27)

Two things §66 deliberately did not do, both left over from the rollout.

### 67.1 — the aggregate still denominates in USD, so §63.3 cannot reconcile

`total-metrics` no longer *hardcodes* USD (§66.4) — it uses
`preferredBaseCurrency`, and falls back to the user's own most common portfolio
base when the preference service is unreadable. In PROD that preference is
genuinely **unset**, so the honest default applies and the response still reports
`baseCurrency: "USD"`, while every portfolio is PLN and the cards render PLN.

Measured after the §66 rollout:

| surface | value |
|---|---|
| Σ the 10 cards (Value) | PLN **1,380,487.34** |
| "Total Value" headline | PLN **1,035,259.30** |
| difference | PLN **345,228.04** ≈ the Cash card (PLN 345,228.05) |

So the residual gap is cash, not FX: the cards include cash and the headline
does not. That is §63.3's item, but it is blocked on this: the aggregate needs a
base currency that means something to the user.

- [x] Make the Display-currency selector write through to the user's
      `baseCurrency` preference, so the backend can see it at all
      (`portfoliost` `1d1dd65`, 402 green, **committed but deliberately not
      deployed** — flipping the aggregate base USD → PLN moves the headline, and
      it ships with §68 so the numbers move once, for one reason).
- [x] On deploy (with §68): confirm the aggregate base is now the user's chosen
      currency rather than the USD default.
- [x] Then close §63.3's reconciliation item: headline total == Σ cards, and
      decide whether the headline includes cash (the cards do).
- [x] Also still open there: `Crypto` reports `totalValue: 0,
      returnPercentage: -100` in the breakdown while holding 887.74 PLN and its
      card reads +1.65%. A portfolio with cash and a position must not floor at
      zero.
- [x] Tests: `total-metrics.baseCurrency` is a real base; headline == Σ cards;
      no portfolio in the breakdown reports 0 while holding a position.
- [x] Commit.
      > `1d1dd65` "feat(spa): the Display-currency selector IS the base-currency
      > preference (§67.1)". The commit landed; this box was simply never ticked
      > because the step that followed it (§68) absorbed the closeout.

#### Pre-existing e2e failures found while verifying (not caused by §67.2)

Baseline-checked by stashing the change and re-running: **5 e2e tests already
fail on unmodified `main`** — all of them "chart element not found"
(`chart-recompute.spec.ts:13`, `combined-chart.spec.ts:11` and `:19`,
`performance-display-currency.spec.ts:39`, `parity-portfolios.spec.ts:53`). The
mock backend appears not to serve the charting series these specs wait on.
`portfolios.spec.ts` is separately **flaky** (a different test in it failed on
each of three consecutive runs; 17/17 green on the fourth). Recorded here rather
than fixed, since both predate §67.2 and neither is caused by it — but the
mock's charting data needs a look, and until then "e2e green" cannot be used as
a release gate for chart work.

---

## 68. Cash as a first-class citizen in the headline: Cash / Instruments / Total / Invested (2026-09-27)

Follows §66 (never guess a currency) and unblocks §63.3, whose reconciliation item
has been open since the fact-check. The four headline figures the user asked for:

- **Cash value** — the cash balance
- **Instruments Value** — positions only
- **Total Value** — cash + instruments (**confirmed by the user**: cash is a
  first-class citizen, so Total includes it)
- **Total Invested** — the value of cash inflow / outflow / **transfer**
  (confirmed by the user: transfers are part of the definition, not excluded)

### 68.1 — What the numbers are today, measured (not inferred)

PROD, 2026-09-27, all 10 portfolios PLN:

| figure | PLN | where it comes from |
|---|---|---|
| Σ `portfolio.currentValue` | **1,380,487** | **includes cash** — Crypto's 887.74 value *is* its 887.74 cash; Rach. rej. 47,956 positions + 8,500 cash = 56,456 |
| Σ cash | **345,228** | `totalCash` = 90,046.10 in the aggregate base (USD) |
| headline "Total Value" | **1,035,259** | 1,380,487 − 345,228 → **today's headline is really Instruments Value** |
| Σ `totalInvested` | 1,040,416 | net external flow |

So the ambiguity is precise: **`total-metrics.totalValue` excludes cash while
`portfolio.currentValue` includes it.** The cards and the headline are summing
different things, which is the whole of §63.3's 345,228.04 discrepancy — the
figure is exactly the Cash card (PLN 345,228.05).

`totalCash` and `cashBreakdown` already exist on the response (`openapi.yaml`
`PortfolioTotalMetrics`) and are correct. `instrumentsValue` does not exist
anywhere, and there is no per-portfolio cash/instruments split on the card either.

### Design decisions (resolved 2026-09-27)

- **Total includes cash, everywhere** — tiles *and* the chart value line. There is
  no longer a question of whether the headline includes cash; the only remaining
  freedom is how prominently the cash *component* is shown (its own tile and its
  own series), which is a display choice, not a definitional one.
- **Total Invested includes transfers** — verified that
  `externalCashInvested` already sums every cash row with no type filter, so no
  code change is needed; only the description and the per-portfolio caveat in
  §68.2.

---

## 69. The sudden raise in return: a backdated deposit, a duplicate cash row, and a backfill that only looks 2 days back (2026-09-28)

Found by the §68.5 PROD verification, not by a test. Three separate defects, one
visible symptom.

### 69.1 — the symptom, and the proof

Three portfolios showed a step on **2026-09-27** with `net_flow = 0.00`:

| portfolio | 09-26 value | 09-27 value | Δ | Δ invested |
|---|---|---|---|---|
| IKE Marek | 90,962.72 | 107,059.39 | +16,096.67 (+17.7%) | **+15,777.00** |
| IKE Beata | 196,827.12 | 205,628.21 | +8,801.09 (+4.5%) | **+15,777.00** |
| Equate+ | 3,946.55 | 8,632.99 | +4,686.44 (+118.7%) | 0 |

The identical `+15,777.00` in two unrelated accounts is the whole diagnosis: one
omitted deposit, in both. `/api/portfolios/:id/cash/transactions` closes it exactly —

- IKE Beata `DEPOSIT 15,777 PLN` dated **2021-10-25**
- IKE Marek `DEPOSIT 15,777 PLN` dated **2021-10-18**

| | Σ deposits | 09-26 invested | 09-27 invested |
|---|---|---|---|
| IKE Beata | **132,099** | 116,322 = 132,099 − 15,777 | **132,099** |
| IKE Marek | **54,548** | 38,771 = 54,548 − 15,777 | **54,548** |

The 2026-09-27 21:14 re-import inserted it (all 100 cash rows in the system carry
that timestamp, and every one is backdated). `externalCashInvested` replays the
whole ledger, so cumulative invested rose — but the `snapshotsync` cronjob only
re-values **the last two days**, so the entire five-year correction was stamped
onto the next snapshot written. The data is now *more* correct; the presentation
is what is broken.

Equate+ is the same mechanism: its value rose because SAP SE went from ~0 to
4,684 PLN of instruments value once the ticker fix landed. `invested` unmoved.

**The data was right; the history was never recomputed behind it.**

- [x] Diagnose (§69.1).
- [x] **§69.2 importer dedup** — see below.
- [ ] Re-import (wipe & reimport) with the dedup, then ONE full backfill of all
      10 portfolios so the 15,777 and the SAP SE value land on their proper
      dates. **User-approved**, deliberately deferred until after §69.2 so the
      backfill runs once over final data rather than twice.
      > **Superseded as a manual step — §69.3 does this automatically now.** The
      > import route re-backfills every portfolio it touched (`6015170`), and
      > every pass rebuilds from the first trade because `computeSnapshotBatch`
      > derives the window start rather than accepting one. So a wipe & re-import
      > now places the 15,777 deposit and the SAP SE value on their proper dates
      > with nobody pressing Recompute. **This still needs running once against
      > PROD** — it is a data event, not a code one — and the 2026-09-27 snapshot
      > rows that already absorbed the correction have to be rebuilt over, which
      > means the *destructive* `forcePortfolioRecalc` (`portfolios.ts:1187`) or a
      > `recalcPortfolioHistory`, not the additive pass. **Needs cluster access
      > and the user's go-ahead**, since it rewrites PROD history.

### 69.3 — the systemic gap (still open)

**An import that adds backdated rows must trigger a full re-backfill for the
portfolios it touched.** Today the only automatic revaluation is the twice-daily
`snapshotsync`, which re-values the last two days, so *any* historical correction
lands as a visible cliff on the next snapshot written. This will recur on every
future re-import. Options: have the import job call `forcePortfolioRecalc` /
`runBackfill` for the portfolios whose rows changed, or record the earliest
changed `transaction_date` and re-backfill from there.

- [x] Decide and implement.
      > **Done — and by the first of the two options, not the second.** Wallets
      > `6015170` "fix(wallets): a bulk import re-backfills what it touched
      > (§69.3)". `POST /api/import/transactions` tracks `affectedPortfolios`
      > (`import.ts:500`) and calls `notifyTransactionsChanged` once per touched
      > portfolio after the batches commit (`import.ts:638-640`), which lands in
      > `recalc-queue.ts:64-66` → `enqueueBackfill(portfolioId, …recalcPortfolioSeries)`.
      >
      > Two details in that commit are the substance, and both are load-bearing:
      > **the bulk route was the one that was missing** — the six single-transaction
      > routes in `portfolio-transactions.ts` all called the hook, but the route
      > *sheets-sync actually uses* did not, which is why a wipe & re-import left
      > history unrebuilt. And it is **one notify per portfolio, not per row**:
      > the queue holds one slot per portfolio and the runner is serialized, so
      > ten portfolios cost ten sequential rebuilds (~2 min measured) where a
      > per-row notify would thrash that queue for nothing.
      >
      > §76.3 then changed the pass from destructive `recalcPortfolioHistory` to
      > the **additive** `recalcPortfolioSeries`, which is the right variant for
      > this: a bulk import changes history, it does not invalidate it.
- [ ] **The second option was never needed, and that is worth knowing rather than
      assuming.** `computeSnapshotBatch` has no `fromOverride` — the window start
      is always `min(BUY/SELL executedAt)`, falling back to the earliest cash row
      (`backfill.ts:691-717`). So **every pass already re-values the whole history
      from the first trade**, not just the last two days. The cliff this section
      was opened for is therefore structurally impossible: a backdated row cannot
      land on "the next snapshot written" because there is no next-snapshot-only
      path left in the write flow.
      > **So a "re-backfill from date X" capability would be a performance
      > optimisation, not a correctness fix** — it would shorten each import's
      > rebuild, at the cost of a threaded `fromOverride` through
      > `computeSnapshotBatch` → `_runBackfillCore` → `recalcPortfolioSeries` /
      > `recalcPortfolioHistory`, a query param on the recompute route
      > (`portfolios.ts:1146-1190`, which currently declares none in the contract
      > — `openapi.yaml:3501-3519`), and a contracts bump. Do not build it as a
      > correctness fix; if it is wanted, it should be costed against the measured
      > ~2 min per 10 portfolios, which is not currently a problem.
- [ ] **One real gap the implementation leaves, and it is in reporting not in
      behaviour.** The import response cannot say what it changed:
      `ImportTransactionsResponse` (`openapi.yaml:2111-2127`) is
      `{inserted, skipped, errors, syncRun}`, `SyncRun` carries three counters and
      no portfolio ids, no dates, and `sync_runs` has no date columns
      (`schema.ts:32-52`). `affectedPortfolios` is computed inside the handler and
      **discarded**. So the operator gets `[import] §69.3: re-backfill queued for
      N touched portfolio/plfolios` on stderr and nothing queryable afterwards —
      which is the same defect §72.22 found in the price audit, where the feature's
      entire value is its output and the output did not persist.
      > If this is picked up: return `affectedPortfolios` (ids + row counts) from
      > the import route, add it to the contract, regenerate, and mirror it in
      > sheets-sync's hand-written `ImportTransactionsResponse`
      > (`wallets-api-client.ts:149-154`) — the two repos are version-coupled.
      > **Not urgent:** the rebuild does happen, which is the correctness half.

---

## 70. "Total value" is wrong: cost is being reported as market value (2026-09-28)

Found while closing §69, and it outranks everything still open. Reported by the
user from the dashboard; the cause is measured, not inferred.

### 70.1 — the symptom

The ten cards sum to **PLN 1,057,924**; the headline says **PLN 797,190**. The
aggregate is the smaller of the two, which is the opposite of a rounding or FX
artefact.

### 70.2 — the cause

**75 of 85 open positions have `positions.market_value` NULL** (PROD, measured):

| portfolio | null / open | stored `market_value` | Σ cost | card | live |
|---|---|---|---|---|---|
| IBKR | 35/35 | — | 55,665.33 | 283,973.35 | 235,433.41 |
| Rach. rejestrowy PKO BP | 23/23 | — | 36,500.00 | 56,451.80 | 45,000.00 |
| IKE Marek | 13/13 | — | 25,814.13 | 91,072.72 | 65,867.46 |
| Obligacje PKO SA Beata | 2/2 | — | 115,000.00 | 119,240 | **115,000** |
| NN TFI PPK | 1/1 | — | 76,337.99 | 123,722.33 | **76,337.99** |
| Equate+ | 1/1 | — | 913.01 | 3,946.55 | 3,991.49 |
| NN TFI PPO | 0/1 | 173,445.64 | 96,440.71 | 173,445.64 | 96,440.71 |
| IKE Beata | 0/23 | 154,825.70 | 115,037.32 | 205,208.09 | 154,308.64 |

`services/valuation.ts` `splitPortfolioValue`:

```ts
const mv = p.marketValue != null ? Number(p.marketValue) : Number(p.quantity ?? 0) * Number(p.averageCostBasis ?? 0)
```

The fallback is the position's COST, and it is then reported as market value.
Obligacje's live instruments equal its cost to the złoty (115,000) and NN TFI
PPK's equal theirs exactly (76,337.99) — PLN funds with no reason to sit on cost.
For a fund that has grown from ~456 to ~820 per unit, reporting 96k instead of
173k understates net worth by 77k on that holding alone, and every derived
figure (return, gain/loss, the §68 headline, the card) inherits it.

### 70.3 — and the mirror-image defect in the snapshot path

Equate+ is the opposite: its card holds 3,946.55 = **cash only, zero instruments**,
while the live path sees 3,991.49 of SAP SE. The backfill resolved no price at
all there. So the card can omit a holding the headline counts, and neither
number is trustworthy alone. This asymmetry is why §63.3's reconciliation has
never closed.

### 70.4 — what is proven, and what is not

Proven: the fallback exists in code, and it is being taken (two portfolios equal
their cost exactly). NOT yet proven: **why** `market_value` is NULL for 75
positions. `refreshQuotes` is the only writer of that column and apparently does
not reach these symbols; unverified. Fixing the aggregate first would treat the
symptom, so the upstream question is the first task.

- [x] Find why `positions.market_value` is NULL for 75/85 — which writer should
      populate it, and why it is not reaching IBKR / Rach / IKE Marek / Obligacje
      / NN TFI PPK / Equate+.
- [x] Make both paths resolve market value identically, from prices. One
      function, one answer (the §68 lesson: drift is what happens when two code
      paths answer the same question).
- [x] **Never present cost as value.** With no price, render unresolved per
      §66.2 rather than silently substituting cost. A missing price must be
      visible, not plausible. → unpriced positions contribute NOTHING and are
      counted; the routes log them and the SPA states them.
- [x] Decide the contract: does `instrumentsValue` require a resolved price, and
      is a partially-priced portfolio reported at all or flagged? → **Flagged, not
      hidden.** A partial portfolio is reported with `unpricedPositions` and a
      visible note, rather than suppressed or silently completed. Suppressing it
      would make a broken pipeline look like an empty portfolio.
- [x] Tests: a position with NULL `market_value` and no resolvable price must NOT
      contribute its cost basis; both paths agree to the cent on a mixed
      price/no-price portfolio.
- [x] Then re-run the single backfill and assert Σ cards == Total tile — the §63.3
      reconciliation, still unproven after all of §66–§69.
- [x] Separately: the §68 `cashBreakdown` weight formula divided by a net total
      that can approach zero (EUR +64,898 against USD −45,434 in IBKR), producing
      weights from −398% to +648%. The user confirms the sign split is real — IBKR
      converts currency repeatedly without registering it in the sheet — so the fix
      is a guard on the denominator, not a change to the data.
      > **Already done by §70.5**, and the reasoning in the code is the right
      > one: the weight is a share of **GROSS** exposure (`Σ|converted|`), which
      > is well defined whatever the signs do and always sums to 100%, while the
      > signed `balance` is still reported unchanged. A guard on the net would
      > have had to invent a fallback for "net ≈ 0" and every fallback is
      > arbitrary; a change of denominator is not.
      > **Now pinned by two tests** (`469` green) against the exact IBKR shape.
      > They assert the signed balances survive, every weight lands in `[0,100]`,
      > and the weights sum to 100 — under the old net denominator this fixture
      > printed **333% and −233%**. The second test covers the zero-cash case
      > (weight `0`, never `NaN`).
      > One thing the test had to learn: the sign of a cash row lives on
      > `amount`, not on `type` — a `WITHDRAWAL` row is stored negative.

## 71. A currency is a label that multiplies a number (2026-09-28)

Shipped. Recorded here because §71 is stamped in the code of three repos
(`portfoliost-instruments`, `portfoliost-wallets`, `portfoliost-sheets-sync`)
and the numbering must not be reused. Ready to archive to `plan-archive.md`.

Started as a follow-on from §70: the user asked to carry old prices forward,
recalculate when a close arrives, and *flag serious problems* rather than invent
a value. The investigation of "why is the chart wrong" turned up four defects
that all produced plausible numbers instead of errors.

### 71.6 — the data patch, and what is still open

- [x] `CRI.WA` CAD → **PLN**, `SRT.F` GBP → **EUR** (one transaction, 2 rows;
      `MFC` deliberately untouched — CAD is correct, its trades are USD only
      because the US variant was bought).
- [x] `recalcPortfolioHistory` on IKE Marek. It rebuilds through *yesterday* and
      deletes first, so it dropped the corrupt `09-28` row rather than rewriting
      it with fallback prices. Series ends `91,072.72`, invested flat `54,548`,
      and IKE Marek's reconciliation finding closed.
- [x] `SRT.F` vs `SRT3.DE`: **two share classes ~25% apart**, not two lines of
      one stock. The stored trades split 2–1, and FIFO leaves the surviving lot
      as the one `SRT3.DE` reproduces within 0.8% while `SRT.F` misses by 16.4%.
      Bare `SRT` in the reference is **SRT Marine Systems plc** (LSE), an
      unrelated company. Override added to `NAME_VENUE_OVERRIDES`; `sheets-sync`
      v1.0.28 (`7c0290d`).
- [x] **`Equate+` +118.7%** (stored 3,947.57 vs live 8,635.30). Not a currency
      > **§72.14 — root-caused: option premium legs entering the historical quantity
      > grid via their `EXPIRATION` sibling. Fixed and verified in prod in §72.7.**
      finding. It is a margin account, which is a plausible innocent explanation,
      but that is a hypothesis and has not been tested.
- [x] `MFC` was a **known false positive** in `valuation-audit`: a dual-listed
      ticker bought on the other line. The rule cannot distinguish it from
      corruption, and leaving it as a permanent red line trains people to skim
      past real findings.
      > **DONE 2026-09-30** (wallets `05bec46`, **v1.1.99** deployed, homelab
      > `084812374`). §72.4's question was "narrow the rule, or record the
      > exception" — the answer is **neither on its own**:
      >
      > *Narrowing* is impossible: a wrong symbol produces the identical
      > signature (a stored value that no longer matches the live one), so no
      > threshold, ratio or shape test separates "bought on the other listing"
      > from "the resolver picked the wrong line". Any narrowing either eats
      > real findings or guesses at provider conventions.
      > *Suppressing* is worse than the disease: §71.6's complaint is that a
      > permanent red line trains people to skim past the report, and deleting
      > the evidence does not fix that — it removes the basis for ever
      > challenging the rule.
      >
      > So `CROSS_LISTINGS` is a **curated, reasoned list** (each entry justified
      > against the STORED TRANSACTION PRICES, never a threshold), the finding is
      > still **emitted** with `classification` + `classificationReason`, and only
      > `isDefect()` findings fail the run. 6 tests, including that the finding is
      > not dropped, that `MFCX` does **not** inherit the pass, and that a reason
      > shorter than 40 characters fails (an unexplained entry is a mistake).
      >
      > **Verified by running the real audit in PROD** (`node
      > dist/scripts/valuation-audit.js` in the wallets pod). It now reports
      > **exactly one finding**, and it is not MFC:
      > ```
      > [valuation-audit] UNFUNDED pf=XTB: 22 trades but no DEPOSIT/TRANSFER
      > anywhere in the import, and the cash ledger bottoms out at -6.22. …
      > [valuation-audit] 1 finding(s). Nothing was modified.
      > ```
      > That same run is the **first direct evidence that stored and live values
      > now reconcile**: **zero** `reconciliation-gap` and **zero**
      > `currency-mismatch` findings across all 10 portfolios at the 2% tolerance
      > — the check §63.3's reconciliation has been chasing since the fact-check,
      > run for real and clean. The one remaining finding is §72.32/§72.35's XTB
      > data gap, which needs a row added to the user's sheet.
- [x] Pin `instruments` to the `f01e639` comment commit's release (a code comment
      that records a trap should not sit unpinned).
      > **Already pinned, and the trap is live in the source, not reverted.**
      > `homelab/cluster/apps/pfire/portfoliost-instruments/app/helmrelease.yaml:50`
      > pins **v1.0.84**; `f01e639` is tagged v1.0.77 and is an ancestor of the
      > commit v1.0.84 was built from, so the comment ships. The trap it warns
      > about is still live: `price-bars.ts:504-519`, where
      > `const baseCcy = resolvedBase ?? declared` is the line a future edit could
      > invert.
      > **Repo path worth fixing:** the live repo is `~/prv/homelab/homelab/`, not
      > `~/prv/pfire/homelab/` — the latter is an empty skeleton with no
      > `cluster/apps/pfire/`. An audit pointed at the wrong path would have
      > concluded this pin did not exist.

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
      > **Partly done, partly open, and the split is honest.** The **fund** family
      > is closed: §74 classified all 192 with evidence instead of a threshold
      > bump. The remaining 28 are **all one new class** — a 10-15% residual on a
      > *converted* cross-currency comparison — and they are NOT triaged, because
      > triage needs one more measurement (does the residual track the stored
      > `exchange_rate` or the date-shifted rate?). Naming the class is the
      > triage; picking a fix without the measurement is the thing §72.36/§72.37
      > retracted twice.
- [x] Decide whether the `MFC` false positive from §71.6 is fixed by narrowing
      the rule or by recording the exception.
      > **Neither — classified instead**, §71.6. Recorded, still reported, and
      > excluded from the exit code.
- [ ] Re-run and assert the flagged count only goes down.
      > **Cannot be asserted yet**: this is the first run since the log route
      > shipped (§72.22), so there is no prior count in the same place to compare.
      > The next run gives the baseline. Recorded rather than claimed.
- [x] Commit.

### 72.5 — close out §71.6

- [x] Resolve or record the **`Equate+` +118.7%** reconciliation gap.
      > **§72.14 / §72.7 — root-caused and fixed in prod; history is a curve again.**
- [ ] Archive §71 and §72 to `plan-archive.md`.

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

> **DONE 2026-09-30.** The answer is: **nothing is retained.** Two of my own
> hypotheses were measured and falsified on the way, which is the part worth
> keeping. `MEM_DEBUG=1` was enabled in PROD (homelab `8497a46de`) because
> without it the split the whole section turns on does not exist.

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
- [ ] **The actual fix is a burst-width or peak-shape fix, and it is not openst's
      alone** — it needs the number of concurrent walks openst is asked to serve.
      §73.5.
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
   This is the mechanism §73.4 landed on: a successful walk is ~0.3 MiB and
   free thereafter, while a *failing* walk allocates the most and is paid once
   per newly-unresolvable symbol. The negative cache already exists and already
   covers this route — it just does not help on first contact, which is the only
   contact a per-symbol sweep ever has. The fix is to make "cannot resolve" a
   **cheap** answer rather than an expensive one: check the local ticker
   reference / bond catalogue before falling through to a provider chain, and
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
- [ ] Re-run §73.4's measurement and show working set flat across the same
      workload. → Already flat, and now measured rather than assumed. The
      screenshot-of-the-curve deliverable is replaced by the two tables above,
      which are the same thing with numbers attached.
- [ ] Then reconsider the limit downward once the curve is flat — 2Gi is
      headroom for bursts, not a target to keep.
      > **CORRECTION, and it is against my own measurement from two
      > paragraphs up.** I wrote that "2 Gi is far more than the measurement
      > needs". That is wrong, and the way it is wrong is instructive: my
      > per-symbol figures came from batches that *started* at different RSS, so
      > "0.0 MiB per symbol" and "+84.5 MiB for 16 symbols" are not comparable
      > numbers — the second was measuring the first run's high-water being
      > established, and the third was measuring it being reused.
      >
      > openst **already** bounds the width: `UPSTREAM_MAX_INFLIGHT = 8`
      > (`src/main.py:81`), a semaphore introduced for the 2026-09-20 OOM and
      > still there. So option (1) above is **not available as a new change** —
      > the bound exists; what changed in §63.9 is how much work cachest asks it
      > to have in flight, and the honest statement is that the burst *width* is
      > capped and the *cost per walk* is what sets the peak.
      >
      > **What this means for the limit, stated with the confidence I actually
      > have:** 2 Gi is not obviously over-provisioned. floor ~380 MiB plus the
      > peak of up to 8 concurrent provider walks is in the same order of
      > magnitude as the 700 MiB that killed both pods, which is the whole
      > reason 2 Gi stopped the bleeding. Lowering it again needs one clean
      > experiment this session did not get to: **measure a single cold walk
      > from a freshly-started pod**, so the per-walk peak is a number rather
      > than a difference between two already-elevated baselines. Until that
      > exists, leave the limit alone.
- [ ] Add an alert on `container_memory_working_set_bytes` growth rate, so the
      next leak is caught by a trend rather than by an OOMKill.
      > **Now clearly worth having, and for a different reason than §73
      > assumed.** The failure mode is a *peak*, so a growth-rate alert is the
      > wrong shape — it would fire on the sweep and not on the OOMKill. What
      > would catch this is an alert on working set approaching the limit
      > (say 80%), which on the current curve would have fired hours before
      > both OOMKills instead of at the moment they happened.

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

**Open question, deliberately not guessed:** whether the trades are in the class the
symbol names. The decisive check is ING01's published NAV for 2023-04-07 — if it is
~382 PLN the bar is the wrong series; if ~339 then we paid 12.6% above NAV on all
79 trades, which would point at the purchase prices in the sheet instead.

- [x] Resolve the open question with ING01's published NAV for 2023-04-07 (and one
      later date) before building anything.
      > Answered, and not in this section's terms. §72.36 ran the raw-row check;
      > the NAV identification was §72.39 step 1, which also **reverses §72.20's
      > dismissal of class W**. The measurement and its working are in §72.38's
      > copy of that step, which owns it.
- [x] If the class is wrong: add an openbb provider in `openst` for that specific
      ING Akcji class, following the provider-tier order in the planner contract —
      capture the provider's response into `tests/fixtures/` first, then the plugin
      with mocked I/O, then openst standalone smoke, then `cachest` route, then the
      `portfoliost-instruments` adapter, then the full compose stack.
      > **§72.39 step 2 owns the work**, and the identification is what unblocked
      > it: the class is **W**, and analizy.pl publishes W's NAV daily, so there is
      > a series for a provider to fetch. Still gated on two date-matched W
      > readings — 1.15% is not zero, and a provider written against an inferred
      > class is the expensive way to be wrong. Order unchanged: the planner
      > contract's provider-tier order.
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
- [ ] §72.15 (below): reconcile the residual −0.5% last-day FX seam

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
- [ ] Add `unconvertedDates` (or a count) to the `/price-bars` response so a
      caller can see what was dropped instead of inferring it. Needs a contracts
      change + `npm run gen:types` in `portfoliost-contracts/contracts/`, then
      the SPA mocks in `mocks/` that assert the response shape.
      > **Spec half done (contracts `2a28d83`), mocks half done (`d75e13f`); the
      > release + regen is what remains.** `unconvertedDates` is now on both
      > `PriceHistory` and `PriceBarSeries`, declaring behaviour that already
      > shipped — `convertSeries` returns `convertedMask` (`fx-convert.ts:60-71`)
      > and both routes slice through it (`instruments.ts:646-659`); it simply
      > never left the service.
      >
      > **The instruction is wrong about where `gen:types` runs.** There is no
      > such script in `portfoliost-contracts/contracts/` — only `build`, `test`,
      > `lint`. It lives in each **consumer**
      > (`portfoliost-wallets/package.json`: `openapi-typescript
      > node_modules/@marx2/contracts/openapi.yaml -o src/generated/api-types.d.ts`)
      > and reads the **published** package, not the working copy. So the real
      > sequence is: spec → release → `gen:types` in all three consumers →
      > instrument routes emit the field → mock emits the field. Two of those
      > five are done and the release is the gate — a gate on a registry, not on
      > a decision.
      >
      > **A related contract statement was false and is now fixed in the same
      > pass — that was the more urgent half.** `fxFrom` on both schemas said
      > *"bars before it are unconverted (native baseCurrency)"*, which is
      > precisely the rule this section's own DONE note marks superseded. A
      > caller reading the spec would have reimplemented the defect §72.17 fixed
      > in prod. Corrected to say an unconvertible bar is **absent**, and why.
      >
      > **Bookkeeping to fix before the next release:** the local contracts
      > checkout sits at **1.6.52** with an unreleased `assetType` commit on top,
      > while the `@marx2/contracts` every consumer installs resolves to
      > **1.6.53**. The local repo is behind what is published, so a release cut
      > from this checkout would omit whatever 1.6.53 added. Reconcile it before
      > cutting, not after a confusing release.
      >
      > **This release also unblocks §72.21's remaining half**, which the plan had
      > listed as independent. Surfacing the FX-coverage boundary on
      > `GET /:id/analytics` needs to say *why* a bar is absent, and only
      > instruments knows that — so the same field serves both. **One release, two
      > items.**
- [x] Re-check the other `?currency=` consumers now that the response is
      shorter than requested: wallets grid (covered), `buildBenchmarkSeries`,
      the SPA history/compare charts, and `mocks/`. A consumer that assumed a
      returned series spanned its whole window will now see gaps.
      > **Audited; the premise does not hold for any of the named consumers, and
      > one was never a `?currency=` consumer at all.**
      >
      > - **`buildBenchmarkSeries` does not use `?currency=`.** It calls
      >   `fetchPriceBars(symbol, from, to, authToken)` with no currency
      >   (`backfill.ts:268`) and converts client-side with one static resolved
      >   rate (`:275-276`), so §72.17's producer change cannot reach it. It is
      >   also **date-keyed, not index-keyed** — `calendarDays` → `buildPriceMap`
      >   carry-forward → `closeMap.get(day)` (`:279-283`) — and re-bases at the
      >   first available point (`:291`). A short series is safe by construction.
      > - **The SPA history/compare charts** slice with a shared index
      >   (`PriceChart.vue:355-393`), which is safe only because instruments keeps
      >   `compare` parallel by construction (`instruments.ts:688-698` derives
      >   `closePrices` from the same already-masked `dates`).
      > - **`mocks/`** was the one that *did* assume spanning, and it was wrong
      >   about the SERVICE, not the other way round — see below.
      >
      > **Residual, real and small:** `dropUnconvertedPrefix`
      > (`backfill.ts:117-123`, doc `:102-116`) is now a **no-op** — `fxFrom` is
      > `min()` over the already-filtered rows (`price-bars.ts:160`), so it equals
      > the first returned date, `findIndex` returns 0 and nothing is dropped. Its
      > doc describes the pre-§72.17 world. And the SPA caveat string is
      > **factually wrong**: `priceChartFx.ts:7-8, 28-34, 43` still says "earlier
      > bars in BASE", rendered at `PriceChart.vue:236, 422-424, 895, 906`. The
      > earlier bars are *absent*. §75.3 confirmed the string no longer renders,
      > which is why this went unnoticed — dead and wrong, in that order.
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

- [ ] Re-run the full suite in CI and check whether it ever goes red; if it does,
      capture the name rather than re-running until green.
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
      > **The premise behind this item was wrong, which is why it stayed open.**
      > Both halves it named were already satisfied: `listingCurrency` is in
      > `openapi.yaml:2078-2088` (commit `a2097cb`), it is in wallets'
      > generated types (`import.ts:116` validates it from there), and the
      > *published* package resolves to **1.6.53**, whose `openapi.yaml` carries
      > the field. Nothing needed releasing or regenerating.
      >
      > The shim existed for a reason the plan never named: **sheets-sync does not
      > depend on `@marx2/contracts` at all.** Its `ImportPortfolioTx` is a
      > hand-written interface (`wallets-api-client.ts:62-98`), so the field was
      > genuinely missing *there* — but regenerating types in a package the repo
      > does not use could never have fixed it, which is why the item sat open
      > across sessions while looking like a release chore.
      >
      > Done: the field added to the local interface, the
      > `ImportPortfolioTxWithListing` widening deleted, and the comment that
      > asserted "not yet in the published @marx2/contracts" removed. 157 green.

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
      > **The conclusion here was retracted, and the retraction is §72.38.** "The
      > provider is right" was inferred from our bars matching class A's published
      > NAV — which only proves the bars *are* class A, not that class A is the
      > class orders execute against. §72.39 step 1 then measured the class
      > independently and found it is **W** (1.13996 against a 1.12703 target),
      > which is what §72.38 called "the premise for building the class provider".
      > The tick stands as *this section's work being done and then overturned*;
      > the provider step is live again under §72.39 step 2, and is no longer
      > blocked on whether a provider is needed at all.
- [x] Compare the raw sheet columns for one flagged trade against the stored row to
      find which column produces 1.126. Needs cluster access.
      > **Done — §72.36**, once the cluster was reachable. Row 604 dumped: price
      > `382,05 zł`, value `2 498,07 zł` (= 6.538594 × 382.05, internally
      > consistent), `split` empty, quantity math consistent. The 1.126 was
      > `382.05 / 339.47` — this row's price against the close the audit picked,
      > and 2023-04-07 was Good Friday. §72.37 then showed 382,05 is what was
      > actually paid, so the column is not the problem and **the cell must not be
      > edited**.
- [x] If it turns out to be a distinct unit category, THEN reconsider a provider —
      and check first whether the sheet even records which category a row is, since
      without that no provider could disambiguate it either.
      > **It did turn out to be a distinct unit category, and the provider was
      > reconsidered** — §72.39 step 1 identified **W** and step 2 is the live
      > build step. The caveat in this item was the right question to ask and it
      > still gates the build: the sheet says "Goldman Sachs Akcji" and predates
      > the GS→NN→ING rename, so it records no category at all. The class comes
      > from the ratio measurement, not from the sheet.

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
      > **It is identified, and the build is §72.39 step 2.** Class **W** — the
      > only one of the nine that can be 1.0856 in 2023-04 and 1.1270 in 2026-08;
      > §72.20 dismissed it on a cross-date comparison and that is corrected
      > there. `§72.38 — the false premise was never established; name lineage is
      > not price series` still holds and is why the provider came back. Still
      > gated on the two date-matched W readings.
- [x] Map the class explicitly in `ticker_reference` (`INGAKC.TFI` → category), so
      the class stops being implicit. `ticker_reference` currently knows **zero**
      `.TFI` symbols, which is why nothing cross-checks them.
      > **§72.39 step 3**, and it can be mapped now rather than "once the class is
      > identified" — the class is W. The entry must not be written as
      > `INGAKC.TFI`→W until the two date-matched readings land, because until
      > then W is the best-supported class, not a measured one.
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
- [ ] Re-run the price audit (§72.18 shipped but the audit has not been re-run) and
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
      > **§72.39 step 2.** The gate this box names — the ING01 check — is done, and
      > it identified class **W** rather than clearing the field. Order unchanged:
      > fixtures → plugin with mocked I/O → openst smoke → cachest route →
      > instruments adapter → compose stack.
- [x] Record the identifier in `ticker_reference` whatever it turns out to be:
      `INGAKC.TFI` carries no category letter, and `ticker_reference` knows zero
      `.TFI` symbols, so nothing cross-checks these rows today.
      > **§72.39 step 3.** `§72.38 — the identifier to record is exactly what the
      > ING01 check determines; do not assume INGAKC.TFI is right` still binds: the
      > check says the *class* is W, it does not say the *symbol* is right. Two
      > separate questions, and only one is answered.

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
- [ ] Make the coverage boundary visible rather than leaving it to look like a
      market move — the same job `gapSymbols` does for missing bars, extended to FX.
      > **Half done (wallets `1211777`), and the measurement it needed is now
      > proven rather than argued.** `fxCoverageHoles` is computed against
      > `series.dates` — what instruments actually returned — *before*
      > `buildPriceMap` runs, because that is the only point where the difference
      > exists. Measured afterwards it would be structurally incapable of being
      > non-zero for the scattered case.
      >
      > The blind spot is now demonstrated, not suspected. With a hole on 07-02 and
      > bars either side, the new test asserts **both** halves:
      > `fxCoverageHoles.get("AAA") === ["2026-07-02"]` **and**
      > `gapSymbols === []`. That second assertion is the point — a prefix hole
      > always reached `gapSymbols` and looked like a symbol with no history; a
      > scattered one never did, and §72.17's damage was that shape.
      >
      > **It is a count, deliberately not a diagnosis, and that limit is in the
      > type.** At this layer "no bar returned" and "bar dropped for want of an FX
      > rate" are the same absence. `unconvertedDates` (§72.10) is what separates
      > them; the field is now on wallets' local `PriceBarSeries` but arrives
      > `null` until the contracts release, so the reason is genuinely unavailable
      > today. Recording the count without the cause is the honest half — a
      > plausible-looking cause for a number that does not have one is how §72.36
      > happened.
      >
      > **Remaining half:** surface `fxCoverageHoles` on `GET /:id/analytics` and
      > persist it alongside `gapSymbols` (`persistGapSymbols`, `backfill.ts:652`),
      > so it survives the pod and is queryable. **Blocked on the same contracts
      > release as §72.10** — the two items are not independent, which the plan did
      > not previously record. One release unblocks both.
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
      > **Done 2026-09-30**, run in the PROD pod on wallets v1.1.100. The full
      > findings are in §74.6. **`SAP.DE` does not appear** — §72.18's
      > option-premium-leg skip still holds (the run reports "5 option premium
      > leg(s) skipped"). What did appear is a new, uniform class of
      > cross-currency residual, recorded in §74.6 and left open.

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
      > **Done — §72.36**, and it eliminated all three candidates. Row 604: price
      > `382,05 zł`, value `2 498,07 zł` (= 6.538594 × 382.05, internally
      > consistent), `split` empty, quantity math consistent. No second price
      > column, no restatement multiplier, no currency restatement.
      >
      > What it produced instead was a **conclusion that was then retracted**:
      > §72.36 read the arithmetic as "one wrong cell", and §72.37 proved that
      > false — 382,05 is what the broker charged, priced at the *valuation* date
      > (2023-04-13), and 2023-04-07 was Good Friday. So the `1.126` is the audit
      > comparing an order-priced fund trade against the bar on `executed_at`,
      > which §74 fixed. The sheet is right; **the cell must not be edited.**
- [x] If it is a restatement multiplier, check how many of the 79 rows carry a
      > **Sheet access via the cluster makes this possible now. The answer was
      > zero: the `split` column is empty on the flagged row, consistent with
      > `instruments.split_adjustments` holding 0 rows and the user confirming no
      > splits in this fund.**
      `Split` marker; 29 restated and 50 not would explain the split exactly.
- [x] Keep `INGAKC.TFI` mapped to `ING Akcji` — it is the right fund and the right
      class, whatever the price column turns out to say.
      > **`§72.38 — my "confirmed" was false` was right, and the check has now been
      > run.** Our bar is class **A** — 819.44 on 2026-09-25 against analizy.pl's
      > 819.44, to the cent, and 816.76 on 2026-09-29 from a second source. The
      > *fund* is ING Akcji; the *class the bar carries* is A while the broker
      > executes against **W** (1.13996 against a 1.12703 target). So the symbol
      > stays mapped and the class does not: that gap is §72.39 steps 2 and 3.
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
      > **Measured 2026-09-30.** FX history is complete:
      > ```
      > currencies 30 · total rows 209,092 · earliest 1999-01-04 · latest 2026-09-29
      > 2022-02-11  30 currencies      <- was the §72.17 gap
      > 2022-02-14  30 currencies
      > 2022-06-13  30 currencies
      > 2023-04-13  30 currencies
      > 2023-04-07   0 currencies      <- Good Friday. A holiday, not a gap.
      > ```
      > The one empty day is **2023-04-07 — the very date §74 is about** — and it
      > is empty because the ECB published no reference rate on Good Friday.
      > Worth stating plainly, because "0 rows for 2023-04-07" is exactly the kind
      > of fact that gets filed as a coverage gap and sends someone off to fix
      > something that is correct. It is also a tidy closure of §72.17: the reason
      > the 1.126 investigation ran so long is that the flagged trade landed on the
      > one date in the dataset with no bar *and* no FX rate *and* a two-day
      > market closure.
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
- [ ] **Bond pricing is a data problem, not a code one.** Six PL bonds 404 upstream.
      Either find a source that carries them, or accept the partial sum and make the
      UI say so. Until then these portfolios' pre-sale history is understated by a
      known-unknown amount.
- [ ] Propagate the window-wide gap into the UI: `GET /:id/analytics` can flag the
      value as partial, but "partial on which days" is not currently represented.
      > **Half of this is already shipped — the item reads as if nothing
      > propagated, and the flag propagates end to end.** `gapSymbols` is
      > window-wide (`backfill.ts:925-948`), persisted (`persistGapSymbols`
      > `:652-666`), returned by `GET /:id/analytics` (`routes/portfolios.ts:1312,
      > 1317`), contracted (`openapi.yaml:1490`) and rendered in three places
      > (`PortfolioPerformanceTab.vue:314`, `PortfolioCard.vue:111, 126`,
      > `PortfolioPerformanceChart.vue:43-45, 59-64`) with a test.
      >
      > **What is genuinely missing is only the day axis**, plus one field:
      > - `unpricedLastDay` is **never persisted and never exposed**. It exists
      >   only in-process (`backfill.ts:611, 615, 644, 927, 939, 999`) as an input
      >   to `isUnpriceable`, and it appears nowhere in `openapi.yaml` or on any
      >   route — grep finds it in this plan file and in `backfill.ts`, nowhere
      >   else. It is the number §72.31's own table reports (`unpricedLastDay = 1`
      >   with `gapSymbols` of 6), and it is the one that distinguishes "cheap" from
      >   "at the ceiling".
      > - "Partial on which days" has no representation: no `gapDays` /
      >   `partialDays` / `unpricedDays` field exists in wallets or the contract,
      >   and the chart message is window-agnostic
      >   (`PortfolioPerformanceChart.vue:62`).
      >
      > So the real deliverable is a persisted per-day (or per-range) gap set, one
      > openapi field, and chart wording that can say *when*.

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
- [ ] XTB: add the opening deposit to the source sheet and re-import. Until then its
      value history is offset and its TWR/MWR is meaningless.
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
      > **Done (instruments `ad9ea3e` + `a4c25fa`), and the item's framing was
      > wrong in a way that changed the answer.** `fetchStatus` is now a
      > classification rather than `ok`/`failed`:
      >
      > ```
      > ok               fetched; the symbol has bars
      > no_data          fetched, upstream returned nothing, nothing is stored
      > failed_transient 429/5xx/network/DB — retry in minutes
      > failed_permanent 404 — nothing to fetch upstream
      > sanity_failed    fetched, bars refused as impossible (§63.5)
      > ```
      >
      > Three findings behind that, none of which the item anticipated:
      >
      > 1. **The conflation was on the `ok` side, and worse.** `ok` was written
      >    whenever the fetch did not throw, so "upstream answered with nothing"
      >    was recorded as **priced**. `hadNewBars` was already computed for the
      >    split-boundary check and never consulted. The item asked to separate two
      >    kinds of *failure*; the bigger hole was that one kind of *success* was
      >    not success.
      > 2. **Permanence was decided by substring match on error prose** —
      >    `lastError.includes("HTTP 404")`, re-derived at every read. A reworded
      >    404 silently became transient and a non-existent symbol was re-probed
      >    every few minutes for a day. It is now decided once, at write time,
      >    where the error is in hand, and `lastError` is human-readable only.
      > 3. **`TOR` is no longer the example it was.** Nothing in the price path
      >    fetches a profile any more (`fetchProfile` is only used by the
      >    instrument-*detail* routes, `instruments.ts:340, 393, 505, 1202, 1382`),
      >    so a profile 404 cannot be what marks a symbol failed. The distinction
      >    actually needed is *fetched-but-empty* vs *does-not-exist*, which is
      >    what `no_data` vs `failed_permanent` is.
      >
      > **Two things the tests caught that would otherwise have shipped quiet.**
      > My first `no_data` condition used `hadRowsBefore`, which reads the
      > **overflow** table only — so every stooq-backed symbol would have been
      > recorded as having nothing to price with, a false alarm on most of the
      > fleet. It asks `price_bars_all` now. And changing `cooldownFor`'s
      > parameter silently disabled the 404 breaker, because the one call site
      > still passed `lastError`; two pre-existing breaker tests failed. The
      > `cooldownFor("HTTP 404 …")` case now asserts the TRANSIENT cooldown so the
      > old shape fails loudly.
      >
      > **What this did NOT do, stated plainly:** there is still no *reporting*
      > surface. The only consumer of this table in any repo is `recentlyFailed`
      > — wallets and the SPA read nothing from it — so `no_data` vs
      > `failed_permanent` is correct bookkeeping, not visible insight. The two
      > comments claiming "`ok` is what every downstream reader takes as priced"
      > were simply false, and are corrected. **A human-readable report is a
      > separate step and needs a consumer to justify it**; if you want one, the
      > shape is already settled and it belongs on the admin Data-quality card
      > next to the price-audit log route (§72.22).

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
- [ ] Add the `Wpłata` row above, re-import, confirm the unfunded-portfolio finding
      clears and `invested` stops being 0

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
      > **DO NOT DO THIS. It is the instruction §72.37 retracted, and it is
      > struck here rather than left as an open box.** §72.36 concluded the cell
      > was wrong; §72.37 proved that conclusion false against the broker's own
      > detail:
      >
      > ```
      > Data zlecenia:  07.04.2023        (Good Friday)
      > Data wyceny:   13.04.2023        <- a different date
      > Cena Jednostki Uczestnictwa z dnia wyceny: 382,05 PLN
      > Wartość rejestru po transakcji: 40 264,92 PLN = 105,391757 × 382,05
      > ```
      >
      > 382,05 is what was **actually paid** — a PPO/PPI order is priced at the
      > valuation date's NAV, and the register total confirms it. Editing the cell
      > would falsify a correct trade. Kept as a box, and ticked, precisely
      > because an open box reads as work to do and this is the one piece of work
      > in the whole ING cluster that must never be done. The audit-side
      > consequence — comparing an order-priced fund trade against the bar on
      > `executed_at` — is §74, and it is fixed.
- [x] Why is EUR absent from `fx_rates` while every other currency is stored?
      > **By design, and the answer was a code comment the whole time.** Both
      > `importHistory` and `syncDaily` fetch with **`base=EUR`**, so every stored
      > row means *"1 EUR = N &lt;currency&gt;"* and a EUR row is 1 by definition
      > — frankfurter returns none, and adding EUR to `TRACKED_CURRENCIES` would
      > fetch a constant. EUR→PLN is cross-derived at read time, which is exactly
      > why it "works, so it is not broken" (§72.36's own words).
      > Measured in PROD 2026-09-30: **31 currencies, 7103 rows each, from
      > 1999-01-04 to 2026-09-29, and no EUR among them** (BRL/INR/CNY start
      > 2000-01-13, BGN stops at 2025-12-31 — euro adoption, not an importer
      > bug).
      > **Now pinned by 4 tests** (instruments `9ad8d28`, 411 green), because a
      > test is the durable form of a comment: the person asking this had DB
      > access and not source access, which is the only reason the question
      > survived three sections. One of them asserts the *semantics*, not just
      > the list — the written rows really are `1 EUR = N`, so PLN lands at ~4.3
      > and not ~0.23, so a future change to the base cannot pass silently.

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
      > **§74.2/§74.3 shipped exactly this**, and the PROD run in §74.6 confirms
      > it: 192 order-priced fund trades across 12 symbols are now *evidence* rather
      > than findings, including the exact row this item is about. `isOrderPriced`
      > keys on `asset_type === 'FUND'` (`price-audit.ts:121`) and
      > `pickOrderPricedBar` searches ±`ORDER_PRICED_WINDOW_DAYS` = 21 in **both**
      > directions (`price-audit.ts:209-212`). This box stayed open because §74 was
      > written as a new section rather than as the completion of §72.37.
- [x] **Still open, and genuinely open:** `INGAKC.TFI` does not reproduce the
      executed NAVs — 351.93 on the 2023-04-13 valuation date against 382.05 paid,
      and 819.44 today against the sheet's own `aktualny kurs` 876,94. Either the
      TFI feed is a different series/class from the one orders execute against, or
      the sheet's manually-maintained `aktualny kurs` column is simply stale. Not
      resolved; do not assume the symbol mapping is right.
      > **Half resolved, and this box is a duplicate of §74.5's — the same item
      > written twice, which is how it survived a session.** §72.39 step 1
      > measured it:
      >
      > - *The feed is a different class than the one executed against* — **true,
      >   and the class is W.** Our bar is class A to the cent (819.44 = 819.44 on
      >   2026-09-25; 816.76 on 2026-09-29 from bankier.pl). The broker executes
      >   ~12.7% above class A, growing ~1.2%/yr, which is W's signature
      >   (1.13996). §72.38 predicted "two series, provider is the right fix" —
      >   confirmed, and §72.39 step 2 is the build.
      > - *`aktualny kurs` 876,94 is stale* — **true, and it is neither class.** It
      >   is 7% above even class W today (931.03), so it is a hand-maintained
      >   column carrying a wrong number, which is a different finding from a wrong
      >   class and should be reported as one. Nothing in the pipeline consumes it.
      >
      > The `aktualny kurs` correction is the one loose end here, and it is a
      > **sheet-data** fix, not a code one.

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
      > **Answered 2026-09-30 — and it did not say what the step expected.**
      > Measured three published readings, two of them independent of each other:
      >
      > | what | date | value | source |
      > |---|---|---|---|
      > | our bar (`INGAKC.TFI`) | 2026-09-25 | **819.44** | provider |
      > | ING01 category **A** | 2026-09-25 | **819.44** | analizy.pl |
      > | ING01 category **A** | 2026-09-29 | **816.76** | bankier.pl (Analizy Online) |
      > | ING01 category **W** | 2026-09-29 | **931.03** | analizy.pl |
      >
      > The first two rows are the same number to the cent, so **our bar IS class
      > A** — established, not assumed. The third row confirms the series from a
      > second source.
      >
      > So the target is `896.00 / 795.02` = **1.12703** on 2026-08-19, and class
      > W is `931.03 / 816.76` = **1.13996** on 2026-09-29. **1.15% apart, 41 days
      > apart.**
      >
      > **This reverses §72.20, which dismissed W.** It called the 1.22% gap
      > "outside any tolerance that would make it a match" — and it compared a
      > ratio derived from **2026-08-19** against a category measured on
      > **2026-09-25**, 68 days later, for a ratio the plan had itself measured
      > growing at ~1.2%/yr. That is the plan's own recurring error in a new guise:
      > a convenient parameter (one date) making a match look absent. Same shape as
      > §72.27's unpaginated reads, §72.33's shared date window and §74.4's
      > every-bar-instead-of-best-bar histogram.
      >
      > **W is the only candidate that can fit, and it is forced rather than
      > merely closest.** From §72.20's own table the nine categories sit at
      > I 1.0039 · A 1.0000 · U 1.0509 · K 1.0702 · **W 1.1397** · S 1.1654 ·
      > T 1.2953 · F 1.3016 · E 1.5329, and the observed ratio must be **1.0856
      > in 2023-04 rising to 1.1270 in 2026-08**. Only W brackets that trajectory:
      > - **W** needs +3.8% over 3.4y (1.1%/yr) and is already there — it is the
      >   only category on the correct side of the 2026 target *and* moving at the
      >   right rate.
      > - **K** (1.0702) sits *below* the 2026 target today and would have to
      >   accelerate to +5.3%, twice the observed rate.
      > - **S** (1.1654) sits *above* it and would have to **fall** 3.5% over
      >   3.4 years. No fee-driven category does that.
      > - Everything else is further away still.
      >
      > **Consequence, and it is the useful part: step 2 is buildable.** The
      > question step 1 was asked to answer was whether a *published* series
      > exists for the class the broker executes against. One does — analizy.pl
      > carries W's NAV daily, verified at 931.03 for 2026-09-29. So the "class
      > with no series at all" branch is ruled out, and an openst provider has
      > something to fetch.
      >
      > **What is NOT yet closed, stated plainly.** 1.15% is not zero. To call W
      > confirmed rather than best-supported I still want **W's NAV on 2026-08-19
      > and 2023-04-13** — the two date-matched readings. The analizy.pl fund page
      > serves only the current value (the `?period=` parameter is ignored; I
      > checked), so the history has to come from the chart endpoint behind it.
      > Until then: treat W as the identified class for planning, and do not let a
      > provider be written against a symbol whose class is still an inference.
- [x] Build the openst provider for that class, in the planner contract's provider-tier
      order: fixture → plugin with mocked I/O → openst smoke → cachest route →
      instruments adapter → compose.
      > **§72.39 step 2**, which is the single live box for this work now. The
      > identification is what made it buildable — analizy.pl publishes W's NAV
      > daily, so the "class with no series at all" branch is ruled out and there
      > is something to fetch. Gated on the two date-matched W readings above.
- [x] `ticker_reference` knows zero `.TFI` symbols, so nothing cross-checks them.
      > **§72.39 step 3.**
- [x] `positions.company_name` still shows the stale "Goldman Sachs Akcji".
      > **§72.39 step 4.** A `sheets-sync` resolver mapping, deliberately left until
      > the class is confirmed — §72.38 is right that the symbol mapping is itself
      > what is in question.

### 72.40 — what §72.39 left open

§72.39 is archived to `plan-archive.md` (archived 2026-10-01): steps 1, 1b, 2, 3
and the audit are complete and shipped — the provider serves `ING01W`, the three
gate readings reproduce through the full tier, and sheets-sync resolves the Akcji
row to it. The archive carries the measurements and the reasoning; this section
carries only what is still pending, so pending work is never buried in an
archive.

- [ ] Step 4 — `positions.company_name` off the stale sheet name
      > A `sheets-sync` resolver mapping. Now unblocked in the sense that matters:
      > the class is confirmed, so the symbol is no longer in question — which was
      > the only reason this was deliberately left until last. **Cheapest item here
      > and the one that keeps causing misdiagnosis**: a stale brand is what made
      > this look like a wrong-fund problem for three sections.
- [x] Audit: date window / order-priced exemption for fund trades
      > §74.3, verified in the §74.6 PROD run. Note this was needed *because* the
      > symbol was wrong: the audit compared order-priced fund trades against
      > category A's bars, and the 10% tolerance happened to be wide enough that
      > only the gap, not the class, showed up as a finding. So the audit fix and
      > this provider are **complementary, not alternatives** — the exemption stops
      > the valuation-date false positive, and neither of them corrects the class.
- [ ] **The sheet's `aktualny kurs` column is wrong and is its own finding.** It
      reads `876,94` against a class-A bar of 819.44 and a class-W reading of
      931.03 — 7% above *both*, so it is neither category. It is a hand-maintained
      column, nothing in the pipeline consumes it for valuation, and it is what
      §72.36 used as "evidence" that the feed was the wrong fund (§72.37: *I never
      ran that query*). Record it as **stale sheet data**, separately from the class
      question, so the next reader does not treat it as a third data point.
      > It is also the reason the sheet is worth re-reading before any of steps 2–4:
      > a hand-maintained price column that has drifted 7% is a reason to distrust
      > the sheet's other manual columns in the same block, and §72.36 already found
      > one of them (`382,05`) being read as a defect when it was correct.

- [ ] **PROD reimport not yet run — the one shipped-but-unverified item.**
      > `59af0f6` resolves the sheet's `"goldman sachs akcji"` row to `ING01W`,
      > and all three repos' suites are green, but nothing has run against PROD.
      > The user runs the Wipe & Reimport (Admin → Jobs), which is the step that
      > actually re-prices the holding.
      >
      > What to check afterwards, so "done" is not taken from a status code:
      >
      > 1. `portfolios.transactions.instrument_symbol` for the 79 ING Akcji trades
      >    reads `ING01W`, not `INGAKC.TFI` — the override writes it on every row.
      > 2. `instruments.price_bars` holds W bars: 382.05 on 2023-04-13, 904.80 on
      >    2026-08-19, 931.03 on 2026-09-29.
      > 3. **The price audit's ING Akcji findings drop**, because
      >    `price-audit.ts:427` keys on the transaction's own symbol and now
      >    compares paid against W (ratio 1.0000) instead of class A (~1.127).
      >    This is the check that proves the data was corrected rather than the
      >    tolerance widened — and it is the same false positive §72.37 chased for
      >    three sections.
      > 4. The portfolio's market value moves up ~12.7% against the last
      >    class-A valuation. A change in the *other* direction means the W series
      >    is not being served in PROD, and the first thing to suspect is the
      >    gateway's cached upstream IPs (AGENTS.md).
      >
      > Until (3) is observed, the §72.37/§74.6 audit findings should be treated
      > as **still open** rather than fixed — the exemption is the only thing
      > currently holding them down.
      >
      > **UNBLOCKED 2026-10-01.** The provider tier is deployed and proven in PROD
      > (§78 step 6's deploy note): openst v1.1.43 serves the W series, and
      > `ING01W` resolves in PROD's `ticker_reference` as `fund` /
      > `fund_category` — 872 bars, with 382.05 / 904.80 / 931.03. The prerequisite
      > that made this unsafe earlier, no `ANALYZY` row and therefore
      > `ING01W → stock → equity walk → 200 / bars=0`, no longer applies. Go
      > ahead with the Wipe & Reimport; the four checks above still stand.

## 74. `price-audit` compares order-priced fund trades against the wrong day's bar (2026-09-29)

Promoted out of §72.36, which reached a conclusion and was then retracted (§72.37);
what survived is a real defect in the audit itself, and it deserves a main section
rather than a footnote on a wrong theory.

A PPO/PPI fund order is priced at the **NAV of the valuation date**, not the order
date. The broker's own detail for the flagged row says so in its field names:

```
Data zlecenia:  07.04.2023   (Good Friday — the market was shut)
Data wyceny:   13.04.2023
Cena Jednostki Uczestnictwa z dnia wyceny: 382,05 PLN
Wartość rejestru po transakcji: 40 264,92 PLN = 105,391757 × 382,05
```

`price-audit.ts:119` `pickBar()` takes the exact day, else the most recent **prior**
close within `MAX_CARRY_DAYS` (7). For 2023-04-07 that is 2023-04-06 = 339.47, so
the audit computes `382.05 / 339.47 = 1.1254`, exceeds `DEFAULT_TOLERANCE` (0.1), and
reports a mismatch on a trade that reconciled exactly. Carrying *backward* is right
for an exchange-traded holiday; it is wrong for a fund order priced forward.

This is the `1.126` that §72.19 and §72.20 chased across nine ING Akcji categories
before §72.23 kept deferring the check. It was never a fund class, a share class, or
a provider gap. The number is an artefact of the comparison, and every NN TFI trade
in the dataset is a false positive of the same shape.

The price is correct. **Row 604 of the sheet must not be edited** — two earlier
sections said to, and both were wrong.

Repos touched: `portfoliost-wallets` only. No provider-tier ordering: this changes
how the audit reads bars it already has, not how any bar is fetched.

---

### 74.1 — Pin the defect with a failing test before changing anything

> **DONE 2026-09-30** (`f838a71`, wallets **v1.1.100** deployed, homelab
> `8cbc9563f`). 13 new tests in `price-audit.test.ts`, 483 green.

- [x] `price-audit.test.ts`: a fund trade dated on a non-trading day whose
      executed price matches a **later** bar must not be reported as a mismatch.
      The test asserts the defect first, in the audit's own terms:
      `pickBar` returns `2023-04-06 = 339.47`, and
      `382.05 / 339.47 = 1.1254` — over the 10% tolerance. Then it asserts the
      rule: `deviation === null`, `unreconciled === 0`, `orderPriced === 1`.
- [x] The same trade against a **prior** bar (the current behaviour) is kept as a
      control, so the fix cannot be satisfied by simply widening every tolerance.
      → A `SAP.DE` **STOCK** trade at the identical numbers is still reported at
      +12.5%. Also a mixed-symbol test: one +50% STOCK trade is flagged while a
      +50% FUND trade on the same symbol is not.
- [x] Tests: `npx vitest run src/scripts/price-audit.test.ts`.
      > **13 tests, and one of them earned its keep immediately.** I first
      > expected `orderPricedNext` to be the bar the price *matches*
      > (`2023-04-13 = 382.05`). It is the **nearest** bar on each side
      > (`2023-04-10 = 340.2`). The test was wrong and the code was right:
      > the audit reports the local range and must **not** claim to know the
      > valuation date — that is §74.5's open question, and asserting it here
      > would have been the audit inventing an answer.

### 74.2 — Decide how an order-priced instrument is identified

> **Answered by measurement, which is what the step demanded.** The column is
> populated:
>
> ```
> asset_type over the whole fleet:
>   STOCK 1644 · FUND 194 · BOND 107 · OPTION 10 · CRYPTO 5      (no <null> at all)
> asset_type on *.TFI transactions: FUND 174   (of 174)
> positions.asset_type for *.TFI:   FUND 6
> ```

- [x] `price-audit.ts` selects `t.asset_type`; `TradeRow` carries it, so the rule
      has something to key on rather than inferring from the symbol.
- [x] **Open question, answered:** `asset_type` **is** `FUND` for every one of
      the 174 `*.TFI` BUY/SELL rows, and for 1960/1960 rows overall. So the rule
      is `isOrderPriced(row) => asset_type === 'FUND'`.
- [x] The `*.TFI` ticker-shape fallback is **not written**, and the reason is
      worth recording: a fallback that is never exercised is a rule nobody can
      tell is dead, and a ticker-shape rule is a claim about provider naming
      conventions dressed up as a classification. A test asserts an unpopulated
      `asset_type` is *not* treated as order-priced, so the day the column does
      go sparse the audit stays strict rather than silently going quiet.

### 74.3 — Compare against the valuation-date window, not `executed_at`

- [x] Add `pickOrderPricedBar(bars, date, windowDays)`: the nearest bar within
      ±`windowDays` in **either** direction, each with its signed offset.
- [x] Keep `pickBar()` unchanged for exchange-traded instruments. Two functions,
      one per pricing model, chosen by §74.2 — not one widened tolerance.
      → Asserted directly: `pickBar(new Map([["2023-04-06", 339.47]]),
      "2023-04-07")` still returns `{ close: 339.47, carriedDays: 1 }`, and still
      refuses a bar that is only *after* the trade.
- [x] The window is a new constant alongside `MAX_CARRY_DAYS`. **It is not a
      tolerance**, and that is the design decision §74.4 forced: see 74.4.
- [x] Report the pair as `order-priced` with its date offset, so a human can see
      *why* a bar was chosen rather than being handed a ratio with no provenance.
      → A dedicated report block prints, per trade, the executed price and both
      bracketing bars with their offsets.

### 74.4 — Measure the window instead of guessing it

> **Measured 2026-09-30. The measurement REFUSES to produce a number, and that
> is the finding.** PROD, every `*.TFI` BUY/SELL, best-matching bar in ±21 days:

```
trades: 174 · best bar reconciles within 10%: 164
signed offset:  min -21   p50 3   p90 19   p95 21   max 21
forward 102 / backward 26 / same-day 36
```

> **So an order-priced trade is not deviation-judged at all**, and
> `ORDER_PRICED_WINDOW_DAYS` is an **evidence radius** (21 days) for printing the
> bracketing bars — not a reconciliation window. Three reasons, in order:
>
> 1. **The offsets reach the edge of the search.** 13 trades sit at exactly +21
>    and several at −21/−20. A pile-up at the boundary means the true offsets
>    extend beyond it, so the distribution is not bounded where I measured it.
> 2. **A constant would be a guess about a distribution that is not there.** 21
>    silences the false positives; anything wider starts pairing a trade with an
>    unrelated price. The plan's own bar — *"a window that silences the false
>    positives but also hides a genuine mismatch is worse than the defect"* —
>    is a statement that this shape of fix is not available here.
> 3. **"Order-priced" is a fact, not a guess.** A PPO/PPI order is priced at the
>    valuation date's NAV; the broker's detail says so in its field names
>    ("Data zlecenia" / "Data wyceny" / "Cena Jednostki Uczestnictwa z dnia
>    wyceny"). Saying so is a statement about the instrument. A ±N window is a
>    statement about a calendar we have not pinned down.

> **A measurement I got wrong first, because it is the same mistake the plan
> warns about three times.** The first version took *every* candidate bar rather
> than the best one per trade. A fund's NAV is smooth, so many nearby bars match
> within 10% and the histogram came out flat across the entire ±21 range
> (4259 rows, uniform) — a clean-looking, completely meaningless answer. Same
> shape as §72.27's two unpaginated reads and §72.33's shared date window:
> **a convenient parameter made absent data look present.**

- [x] In prod, for every `*.TFI` BUY/SELL, find the nearest bar to `executed_at`
      and record the signed day offset.
- [x] Record the measurement in this step, including the outliers and how many
      trades fall outside the chosen window.
      → Recorded above. Outliers: **10 of 174** do not reconcile to any bar
      within ±21 days at the 10% tolerance. Those are *not* silenced — they are
      simply not order-priced trades, and if they were misclassified the
      bracketing bars would make it obvious.

### 74.5 — The two facts that are still genuinely unresolved

- [x] **`INGAKC.TFI` reproduces neither price the broker quotes.** 351.93 on the
      2023-04-13 valuation date against 382.05 paid; 819.44 on 2026-09-25 against
      the sheet's own `aktualny kurs` of 876,94. Either the TFI feed is a different
      series from the one orders execute against, or that manually-maintained column
      is stale. Until this is answered, do not assume the symbol mapping is correct
      and do not treat §74.3 as fixing valuation — it fixes the *audit*.
      > **Half answered, and the first half is settled.** The provider's bar is
      > **category A, to the cent** — 819.44 on 2026-09-25 against analizy.pl's
      > 819.44, and 816.76 on 2026-09-29 from bankier.pl. So the TFI feed is *not*
      > an unknown series; it is a known one, and it is not the one the broker
      > executes against. The broker is ~12.7% above class A and the gap grows
      > ~1.2%/yr, which is category **W**'s signature (1.13996 on 2026-09-29).
      >
      > The open half is the `aktualny kurs` **876,94**: that column is 7% above
      > even class W today (931.03), so it is not class A and not class W. It is
      > a hand-maintained sheet column and it is simply wrong, which is a different
      > finding from "the feed is the wrong class" and should be reported as one.
      > **§72.39 owns this one**, in step 1 (done: class A, to the cent) and step 1b
      > (the two date-matched W readings, still to do). Restating it here as a second
      > checkbox is what let it drift from §72.38's copy and §72.6's — the same
      > question in six sections is how it survived three contradictory retractions.
      > §72.39 step 4 also carries the `aktualny kurs` fix itself, so nothing is
      > tracked in two places.
- [x] **Why is `EUR` absent from `instruments.fx_rates`** while 20+ other currencies
      are stored directly with history to 1999-01-04? EUR→PLN resolves, so it is
      cross-derived and not broken — but EUR is the most-used transaction currency
      in this dataset, and it is the one currency not stored. Establish whether
      that is deliberate (PLN base + a deliberately reduced currency set) or an
      oversight in the FX importer's currency list.
      > **This is §72.36's question, already answered and pinned** — the answer
      > is *deliberate*, and re-asking it here is what let a settled item sit open
      > for a session. `TRACKED_CURRENCIES` (`fx-import.ts:10-14`) lists 30
      > currencies and no EUR, because `importHistory` and `syncDaily` both fetch
      > with `base=EUR`: a stored row means "1 EUR = N ccy", so a EUR row would be
      > the constant 1. Pinned by four tests in `fx-import.test.ts:94-130`, one of
      > which asserts the *semantics* (no EUR row is ever written, and PLN lands
      > at ~4.3, not ~0.23) so a future change of base cannot pass silently.
      > Commit `9ad8d28`. The lesson: a question answered in one section and
      > restated in another is two items, and the second one drifts.

### 74.6 — Close the loop in prod

> **RUN FOR REAL 2026-09-30** on `wallets v1.1.100`, in the PROD pod.

- [x] `price-audit` re-run; confirm the NN TFI false positives are gone.
      > **Gone.** The run reports **192 order-priced fund trades across 12
      > symbols** as evidence rather than findings — and among them the exact row
      > this section is about, printed with the bars that produced the 1.126:
      > ```
      > INGAKC.TFI 2023-04-07 NN TFI PPO: 382.05 PLN
      >   · prior bar 2023-04-06 339.47 (-1d)
      >   · next bar 2023-04-11 344.32 (+4d)
      > ```
      > The whole NN TFI family is in that block — `INGAKC.TFI`, `INGOBL.TFI`,
      > `NNEP25/30/60/65.TFI` — i.e. the false positives the plan says were
      > "every NN TFI trade" are 192 trades that are now explained rather than
      > reported.
- [x] Confirm no previously-clean symbol is now flagged, and that the `SAP.DE`
      finding §72.18 shipped against is still resolved.
      > **`SAP.DE` is not in the flagged list.** §72.18's option-premium-leg skip
      > still works (the run reports "5 option premium leg(s) skipped").
- [x] Then close §72.37's audit item, §72.22's re-read item, §72.23's decisive
      check, and §72.4's "run it for real" — they are the same outstanding run.
      > **The run is done**, and its output is now readable in the pod without
      > kubectl (§72.22's log route shipped in §72.22 itself). §72.4's
      > "run it for real and record the findings" is satisfied by the transcript
      > below; §72.23's decisive check is *answered* in §74.5's terms — the
      > executed price is right, and what is unexplained is the series, not the
      > cell.
- [x] `positions.company_name` still reads "Goldman Sachs Akcji", inherited from the
      stale sheet name. Cosmetic, and it is what made this look like a wrong-fund
      problem for several passes. Fix with §72.39 step 4.
      > **Still open** — a `sheets-sync` resolver mapping, and §72.38 says the
      > mapping itself is "exactly what is in question". Left alone deliberately.
- [x] Commit.

#### What the run found that §74 did not predict

The remaining **28 flagged symbols** are now **100% cross-currency comparisons**,
and every one of them has the same shape — 10–15%, with the audit's own
conversion noted in brackets:

```
ASML    4/6 off · worst -14.4% · bar ccy EUR vs position USD
  2022-03-18 IBKR: trade 660.96 USD vs bar 679.86 (-14.4%)  [660.96 USD → EUR at that day's rate]
DTLA.L  3/3 off · worst -12.9% · bar ccy EUR vs position USD
IUFS.L  4/4 off · worst -12.6% · bar ccy EUR vs position USD
MLPD.L  2/2 off · worst -12.3% · bar ccy EUR vs position USD
YUMC    2/2 off · worst  13.5% · bar ccy USD vs position EUR
```

A trade paid in USD on a EUR- or GBP-quoted instrument, converted **at the trade
date's rate** by the audit, still lands 10–15% out — and consistently in the same
direction per symbol. A single day's FX move cannot be 12%, so this is a
**systematic** residual in the conversion, not market noise.

**This is a new finding and it is NOT diagnosed here.** §72.4's standard for a
flagged symbol is that it gets an override, a currency fix, or a recorded false
positive with the reason — never a threshold bump — and picking among those needs
one more measurement (whether the residual tracks the stored `exchange_rate` the
import applied, or the date-shifted rate). Recorded as open work rather than
guessed at, because a 12% number with four plausible explanations and no
measurement between them is exactly the kind of thing this plan has already
retracted twice (§72.36, §72.37).

Also measured by the same run: **23 symbols have no bars at all** and are
reported as *unverified, not clean* — the 8 Polish government bonds §72.33
identified, plus `MPW`/`WBA` (delisted, correctly), plus the `.TFI`/ETF symbols
whose bars the grid could not serve.

---

## 75. Six chart e2e specs fail: the seed's `value_snapshots` insert has been a no-op since §46.4 (found 2026-09-29)

Proposal: — (found while running §57's gate; no proposal doc).

`npm run test:e2e` fails 6 specs, all of them charts, and all of them for one
reason. Reproduced identically on a clean tree (stash + rebuild + full run), so
it is **not** a §57 regression — but it is a red suite and it gets fixed here
rather than written off.

The six: `chart-currency.spec.ts:135`, `chart-recompute.spec.ts:13`,
`combined-chart.spec.ts:11` and `:19`, `parity-portfolios.spec.ts:53`,
`performance-display-currency.spec.ts:39`.

### 75.1 — The cause, measured

`mocks/db-seed/portfolios.mjs:127` inserts the seeded value snapshots through

```js
for (const s of snapshots.length ? [] : []) {
```

which iterates an empty array — **zero rows are ever inserted**. `seededSnapshots()`
sits right above it, generating 48 rows, and the completion log printed
`48 snapshots` (the *generated* count, not the inserted one), so the no-op was
invisible in the seed output. `git log -S` dates the line to `68de01c`
(2026-09-21, §46.4) — it has never worked.

Measured on the compose stack: `portfolios.value_snapshots` holds **1** row for
the seeded Top10 portfolio, dated today, written by an e2e test's recompute —
not by the seed. And wallets answers

```
GET /api/portfolios/3cb589d8…/analytics?timeframe=ALL
  → {"backfillStatus":"pending","performance":{"timeSeries":[], …}}
```

`portfolios.ts:740–746` marks a portfolio pending when it has `< 2` snapshots
**and** `hasBackfillableHistory()`; a pending portfolio makes the whole
`/api/portfolios/merged` response an empty series (`portfolios.ts:767–779`), so
the combined chart block never renders (`InvestmentsView.vue:373` is
`v-if`'d on a non-empty `timeSeries`).

**Why it passed before and broke now.** §72.7 (wallets, 2026-09-28) removed the
`runBackfill` that these GET routes used to fire — deliberately, because a GET
was mutating state and was downgrading queued recalcs. That call was papering
over the broken seed: loading the dashboard used to backfill Top10 and populate
the snapshots, so the charts worked. With the GET-side self-healing gone, the
fixture is the only thing that can supply the series, and it supplies nothing.
`performance-display-currency.spec.ts:66` ("Top10 has a populated 1Y series")
was already the regression guard; it had nothing to assert against.

Not a gateway problem, though it looks like one: the same request against the
example-service mock on `:4010` returns 11 points, but `/api/portfolios*` is routed to
the real `wallets` service (gateway `default.conf`) — and wallets is the service
with the empty series.

The six are **not** all this one cause. Five are. `chart-currency.spec.ts:135`
is a stale test: once the series existed it got past the empty chart and failed
on `usd.closes[native.length - 1]` = `undefined`. That one is §75.3.

### 75.2 — Fix the fixture, and make it impossible to no-op again

- [x] `mocks/db-seed/portfolios.mjs`: insert what `seededSnapshots()` produced —
  the `for…of` iterates `snapshots`. Snapshot columns stay
  `(portfolio_id, snapshot_date, value, invested, net_flow)`.
- [x] Anchor the window to **today** instead of the hardcoded
  `2026-08-01…2026-09-18`: 48 daily rows ending today (49 inserted, measured
  `2026-08-12…2026-09-29`). The hardcoded window was already 11 days stale when
  found, and it silently expires out of the `1Y` timeframe the specs query —
  the same class of rot `reset-mock-state.sh` already calls out for
  `pricebars-sim`. The seeded transactions stay at `2026-08-02`; a snapshot
  history that starts after the funding date is consistent, and it is what makes
  `n >= 2` resolve `complete`.
- [x] Log the **inserted** row count with its date range, not the generated one,
  and throw if `snapshots.length === 0` — a fixture that silently seeds nothing
  must not be able to report success again.
- [x] Tests: `docker compose build mock-db-seed` first — **`reset-mock-state.sh`
  does not build it**, and `docker compose run --rm mock-db-seed` silently reuses
  the old image, so the first attempt after this fix still seeded zero rows. Then
  `bash scripts/reset-mock-state.sh`, then
  `SELECT count(*) … FROM portfolios.value_snapshots` = 49, and
  `combined-chart` / `chart-recompute` / `parity-portfolios` /
  `performance-display-currency` green.
- [x] Full gate: `npm run build`, `npm run test` (431), `npm run test:mock` (227),
  `npm run test:e2e` — **106 passed, 0 failed, 1 skipped**: the first fully green
  e2e run of this stack.
- [x] Commit; then continue §57.2.

### 75.3 — `chart-currency.spec.ts:135` asserted a response shape §72.17 deleted

- [x] The test indexed both series at one index
  (`usd.closes[native.length - 1]`), expected an unconverted head
  (`firstConverted > 0`) and expected the §48.5a caveat line to render.
  Measured on the same window: native `?from=2015-09-29&to=2026-09-29` →
  **5664** bars; the same window plus `&currency=USD` → **44**. `undefined` in,
  `NaN` out.
- [x] The service is right; the test is stale. `conversionJoinSql`
  (`portfoliost-instruments/src/services/price-bars.ts:152`) filters on
  `hasRates`: *"§72.17 — when a conversion was actually asked for, a bar that
  cannot be converted is dropped rather than passed through in the source
  currency."* plan-archive §72.10 is titled "a converted series must not contain
  another currency". The SPA already matches — `windowStartIso` is the first
  **visible** bar, so with nothing unconverted left `fxCaveat()` returns null and
  no caveat renders (verified live: the string is absent from the page). Making
  the service emit an unconverted head again would reintroduce the defect §72.17
  closed.
- [x] Test rewritten to the current contract: the converted series is a strict
  subset of the native dates; **every** returned bar equals the native close for
  the same date × `DEMO_FX.USD / DEMO_FX.PLN` (matched by date, not index — the
  arrays differ in length and `price_bars_all` can carry two sources per date);
  `fxFrom` is the first row of the response; the first converted date is later
  than the first native date; and the "earlier bars in …" caveat is absent.

**Not in scope:** the `merged` route's all-or-nothing pending rule (one
mid-backfill portfolio blanks the whole dashboard series) and the
`E2E …`-named portfolios that tests leave behind with a single snapshot. Both
are wallets-side design questions, not fixture bugs; recorded here so they are
not rediscovered from scratch.

### 75.4 — A latent e2e race that §61 exposed (found 2026-09-30)

**Recorded because I nearly got this backwards, and the wrong answer was the
one I was about to write down.**

After §61's final `test:e2e`, one test failed:
`portfolios.spec.ts:226 edit position opens a transaction list editor with rows
and add row` — expected 2 `tbody tr`, got 3.

My first move was to call it the `portfolios.spec.ts` flakiness §67.1 already
documents. Then I checked, and found my "baseline" run was not a baseline:
`git stash -u` had **nothing to stash** (the tree was already clean, everything
committed), so I had re-run my own commits and concluded "reproduces on the
unmodified tree". Checked out the real pre-session commit `e85a241` instead:
**18/18 green**, so it *was* mine. Nearly filed a pre-existing-flake note over a
regression.

**The cause.** The dialog renders its `Loading...` row *inside the same
`<tbody>`* as the real rows. The test counted `tbody tr` to get `rowsBefore`,
and the assertion immediately above it —
`expect(dialog.getByRole("columnheader", { name: "Total Cost" })).toBeVisible()`
— is on the `<thead>`, which is always visible and waits for nothing. It looked
like a readiness check and was not one. So `rowsBefore` could be the placeholder.

**Why §61 exposed it and not a bug in §61.** §61.9's `TickerBadge` adds one
`/api/logos/…` image request inside each form dialog, which shifted the dialog's
first paint far enough for the count to land before the body loaded. The
application was correct throughout.

**Fixed in the test, not by widening anything** — an explicit
`await expect(dialog.getByText("Loading...")).toHaveCount(0)` before counting.
114 e2e green afterwards.

**The lesson, which is the reason this is in the plan:** *verify the baseline
before blaming the fixture.* A clean tree is not a baseline, and "this spec is
known flaky" is a conclusion, not a starting point. §67.1 recorded the
flakiness, which made the wrong answer feel available and attractive.

## 78. Funds are served but not discoverable — no search path exists for them (2026-10-01)

Raised after §72.39 stages 1–6 were done and proven. The provider work is
complete: `ING01W` is served, cached and routed, and the three gate readings
reproduce through the whole tier. **None of that makes a fund findable.** The
search path was never in scope and is entirely absent.

**The gap, measured rather than assumed:**

| layer | what exists | funds? |
|---|---|---|
| openst | `/equity/search`, `/crypto/search`, `/fixedincome/search` | **no fund route** |
| cachest | proxies all three | **no fund route** |
| instruments | `searchTickerReference` → `ticker_reference` | **0 fund rows** (PROD) |
| SPA | `InstrumentSearchModal` → `/api/instruments/search` | returns nothing for any fund |

### 78.1 — Two precedents exist, and funds need both halves of one dataset

The trap is assuming bonds are searchable the way stocks are. They are not, and
the two mechanisms are different:

- **Corp bonds** are rows in `ticker_reference` (`WSE::{SYMBOL}`, 941 of them),
  written by `corp-bond-catalogue-sync.ts` from cachest `/corp-bond/catalogue`.
  They are searchable *because they are table rows*.
- **Savings bonds (ROD/EDO) are not in `ticker_reference` at all** — PROD returns
  0 rows with `asset_type='bond'`. They are searchable because
  `src/routes/instruments.ts:293` merges an **additive `bondSearchLeg`** that
  calls openst `/fixedincome/search`.

So there are two routes to searchability: a table row, or a provider leg. Funds
should get **one dataset that yields both** — because the same rows also settle
the routing question §72.39 stage 5 had to answer with a hardcoded `Set`.

**Which is why this section also deletes `FUND_CATEGORY_CODES`.** Stage 5's
membership-gated list exists only because `upstreamFor()` is pure and cannot ask
the database what a symbol's venue is. If the catalogue lands in
`ticker_reference`, the tier is readable from those rows' `exchange` column and
the `Set` — provider knowledge sitting in a service module — becomes deletable.
Decision taken: **delete it, derive the tier from data.**

### 78.2 — The catalogue source is the hard part, and it is not a listing page

The bond catalogue scrapes one server-rendered listing. **analizy.pl has no
equivalent**, verified 2026-10-01:

- `fundusze-inwestycyjne-otwarte/notowania` renders **11** fund links; the page
  claims ~400 funds.
- `?strona=`, `?page=`, `?p=` are **all ignored** — 11 links for every value.
- The table is JS-rendered. The only fund endpoints in `fundCatalogAsync.js` are
  `/api/fund-observed/` and `/api/fund-in-wallet/` — the observation UI, not a
  catalogue.
- Site search (`/wyszukiwarka`, `/szukaj`) is **404**.

So a catalogue scrape is not available and this is **not** a "find the right
listing page" problem.

**What does work is enumeration by code sweep**, because the codes are cheap to
probe — one JSON GET each, no auth, and a miss is a clean `404`. Proven twice:
`ING01`–`ING99` returned every ING category (that sweep is how `ING81`/`82`/`88`
were found), and a 20-prefix × 2-probe discovery pass resolved
`ING01 PZU01 PZU50 AXA01 ARK01 ARK50 PCS50 QRS01 SKR01 VIG01`.

**The sweep is bounded and that is a stated limit, not a hidden one:** the prefix
list is *data* in the repo, and each prefix is probed `01`–`99`. It is blind to
managers outside the listed prefixes, and it is a refresh job, not a per-request
call. Sweeping every plausible 3-letter prefix × 99 would be ~100k requests and
is not proposed.

### 78.3 — Steps, in the planner contract's provider-tier order

- [ ] **Step 1 — catalogue capture.** Manual sweep, one request per code, raw
      responses saved to `openst/tests/fixtures/analizy/catalogue/`. No
      automation beyond the loop. Emit the catalogue as CSV in the shape
      `/corp-bond/catalogue` already serves, so the consumer is precedented.
      Gate: the catalogue contains the 7 codes §72.39 verified, each with its
      label, currency and first/last valuation. Tests: none yet — config-only.
      Record the prefix list as data, with the discovery evidence above.
- [x] **Step 2 — openst routes.** `GET /fund/catalogue` (CSV) and
      `GET /fund/search/{query}`, both over the captured catalogue.
      > **DONE** — `3747f0c`, **31 new tests**, full compose suite green
      > **447 + 104 + 53 + 21**.
      >
      > **The catalogue is a snapshot, not a scrape, and that is the one way this
      > route differs from `/corp-bond/catalogue`.** That one reads a single
      > server-rendered page; this corpus is 734 codes across two enumeration
      > passes (~960 requests), so a request-path scrape is impossible. A refresh
      > job rewrites `data/fund-catalogue.csv` and the route serves the file.
      >
      > **A missing or empty snapshot is a 503, never an empty CSV.** An empty
      > catalogue would make every fund unsearchable and every fund code a 404 —
      > indistinguishable from "this source has no funds", the silent shape this
      > work exists to avoid. A search **miss** is likewise 404, never an empty
      > 200. Both asserted.
      >
      > Search matches code, alias **or** name, substring and case-insensitive,
      > so the class-W symbol is reachable without knowing its code: `ING01`
      > returns `ING01W` alongside its siblings, and `akcji` finds it by name. The
      > tickerref CSV carries the bare fund code in `aliases` for the same reason.
      >
      > Two details pinned by tests because they are easy to get wrong:
      > `_base_fund_code` strips **exactly one** trailing letter (`SKR117B` is a
      > category, `SKR120` is a fund — "strip trailing alpha" would fold
      > `SKR117B` onto `SKR117` and lose it); and categories outnumber funds
      > (475 vs 259), so "the row count looks right" is **not** evidence the
      > lettered codes were captured.
- [x] **Step 3 — openst standalone smoke.** `docker compose up -d`, curl
      `/fund/catalogue` and a search, confirm the Redis cache **HITs** on the
      second identical call.
      > **PASSED.** Stack rebuilt, healthy in 7 s.
      >
      > | check | result |
      > |---|---|
      > | `/fund/catalogue` | 200, **734 rows**, 60,586 b, tickerref header |
      > | `ANALIZY::ING01W` in the served CSV | present, `aliases=ING01` |
      > | `/fund/search/ING01W` | 200, 1 hit — ING Akcji W |
      > | `/fund/search/ING01` | 200, 5 hits (fund + F/T/U/W) |
      > | `/fund/search/akcji` | 200, 50 hits |
      > | `/fund/search/emerytura` | 200, 36 hits |
      > | `/fund/search/nosuchfund` | **404** (negative-cached) |
      >
      > **Redis HIT confirmed, and confirmed to be Redis.** After deleting only the
      > fund keys: catalogue 15.8 ms → 4.7 ms → 5.2 ms; search 7.2 ms → 4.5 ms;
      > the 404 6.5 ms → 4.3 ms. Keys are genuinely in Redis — `fund_catalogue`
      > (TTL 86378) plus one `fund_search:*` per query including the
      > negative-cached miss.
      >
      > **Regression check:** the §72.39 W route still returns 382.05 / 904.80 /
      > 931.03 after the catalogue work.
      >
      > **One real defect the smoke caught, which the unit tests could not:** the
      > snapshot was missing from the runtime image, so `/fund/catalogue` returned
      > **503** in the container while every test passed — the Dockerfile copies
      > `src/`, `tests/`, `migrations/` and `plugins/` but not `data/`. Fixed by
      > adding `COPY data/ ./data/`. Worth recording because a green suite proved
      > nothing here: the failure was purely packaging, and only a real container
      > could surface it. The 503 behaved exactly as designed, naming the missing
      > path instead of serving an empty catalogue.
      >
      > Stack torn down afterwards. No test file added: smoke only, justified by
      > step 2's 31 tests.
- [ ] **Step 4 — cachest routes.** Both routes in `config.yaml` with TTLs matching
      their openst peers (a catalogue is slow-moving; a search is per-query), plus
      `test_real_config_has_fund_catalogue_route` and
      `test_real_config_has_fund_search_route`. Full cachest suite green (211).
      Never swap 3 and 4.
- [x] **Step 5 — instruments: the part that earns its keep.**
      > **DONE** — `207b981`, tsc clean, **447 tests green** (was 431).
      >
      > **`FUND_CATEGORY_CODES` and `isFundCategory` are deleted**, along with the
      > `assetTypeForSymbol` early return that went with them. Both the asset class
      > and the price tier now come from **one catalogue row**: the sync writes
      > `ANALIZY::{CODE}` with `asset_type=fund`, `assetTypeForSymbol` finds it
      > like any other instrument, and `priceTierForSymbol` reads the venue column.
      > Two sources of truth for one fact became one, and the routing code carries
      > no provider knowledge.
      >
      > `upstreamFor` gains a `tier` argument rather than sniffing symbols, because
      > it is pure and cannot query the database — the caller resolves the tier and
      > passes it down. It **defaults to `standard`**, so a `.TFI` fund cannot be
      > diverted by an omitted argument, and the tier is **ignored for non-fund
      > asset classes**, so a mislabelled row cannot move a crypto pair or a bond
      > onto the fund feed. Both pinned.
      >
      > `fund-category-catalogue-sync.ts` mirrors `corp-bond-catalogue-sync.ts`:
      > fetch, count, refuse a truncated body, upsert. **The row floor is 400 of
      > 734 (~54%), matching the corp-bond gate's 53%.** My first draft used 200,
      > which would have accepted a 300-row truncation and silently dropped 400
      > funds from search — writing the boundary test is what caught it, so the
      > floor is now probed behaviourally (500 syncs; 150/12/0 refuse).
      >
      > `fundSearchLeg` is additive beside `bondSearchLeg`. The catalogue reaches
      > search through the reference table as well; the leg exists for rows the
      > table has not caught up with, not to replace it.
      >
      > Tests worth naming: a dotless corp bond (`ABE0227`) stays `standard`
      > despite the exact shape of a category; `ING01W` is `standard` without a
      > catalogue row and `fund_category` with one; a category code on the
      > `standard` tier goes to biznesradar; and the §72.39 test asserting the
      > deleted early return is **replaced** with the data-driven expectation.
- [x] **Step 6 — full stack + the UI.** `docker compose up -d`, curl through
      cachest, `npm run test:stack` green, then confirm in
      `InstrumentSearchModal` that typing `ING01W` / `Akcji` returns the
      fund and renders as a fund. The SPA needs no change if the response
      shape is unchanged — verify, do not assume.
      > **PASSED, including the UI.** Stack rebuilt, gateway restarted per
      > AGENTS.md (openst/cachest/instruments were all recreated).
      >
      > | check | result |
      > |---|---|
      > | `/fund/catalogue` via cachest | 200, **734 rows**, `ANALIZY::ING01W` present |
      > | `/fund/search/ING01W` via cachest | 200, 1 hit |
      > | `/fund/search/nosuchfund` via cachest | 404 |
      > | W price bars through the tier | **382.05 / 904.80 / 931.03** — no regression |
      > | `.TFI` funds still on biznesradar | `NNEP65.TFI` 18,172 b, `INGAKC.TFI` 18,920 b |
      > | `test:stack` | **32/32** |
      > | `test:mock` | **230** |
      >
      > **The sync ran and is the load-bearing part:** `upserted 734 fund rows into
      > ticker_reference`, and the local table now holds 734 `ANALYZY`/`fund` rows
      > with `ING01W → aliases ING01`. Without that row `ING01W` classifies as
      > `null`, i.e. stock — so the tier, the asset class and search all depend on
      > this job having run.
      >
      > **In the browser** (`localhost:3000`, mock IdP login, Add Position →
      > search): `ING01W` renders as **`ING01W (PL) Fund ING Akcji W`**, and
      > `emerytura` returns the families across all four managers — `AXA24`–`AXA40`,
      > `ING81`–`ING98`, `PCS74`–`PCS96`, `SKR117`–`SKR119` — **each alongside its
      > own `B` category** (`SKR117B`, `SKR118B`, `SKR119B`), which is the
      > category/parent relationship working end to end.
      >
      > **No SPA change was needed, and that is verified rather than assumed:**
      > `InstrumentSearchModal` applies no type filter, and `TickerBadge` already
      > maps `FUND` → "Fund". The pre-existing `.TFI` symbols (`NNEP25.TFI`,
      > `NNEP30.TFI`, `NNEP60.TFI`, `NNEP65.TFI`) still appear in the same results,
      > so both worlds coexist rather than one replacing the other.
      >
      > **Still owed before this is true in PROD:** the catalogue sync needs a
      > scheduled job there, exactly as `corp-bond-catalogue-sync` has one. Run by
      > hand in the compose stack it is a one-liner, but PROD has no
      > `ANALYZY` rows until a job exists — and until it does, `ING01W` resolves
      > to nothing and the W bars are unreachable.
      >
      > ### Deployed 2026-10-01 — and the last box was not a formality
      >
      > `d2d16c7d1` (images) + `e7eb171a0` (the fix below). Images:
      > openst **v1.1.43**, cachest **v1.0.48**, instruments **v1.0.86**,
      > sheets-sync **v1.0.31**. All four CI runs green — cachest's first run
      > failed on a `files.pythonhosted.org` read timeout while `pip install`ing,
      > not on code or tests, and a `--failed` rerun passed.
      >
      > **The tag bump alone did nothing, and this is worth keeping.** cachest's
      > config is generated into a ConfigMap from
      > `cluster/apps/pfire/cachest/app/config/config.yaml` — **a separate copy in
      > the homelab repo** — mounted over `/app/config.yaml`. So a route added to
      > `cachest/config.yaml` is invisible to the cluster until it is added here
      > too. Verified rather than assumed: `ghcr.io/marx2/cachest:v1.0.48` *does*
      > contain all three routes, while the mounted ConfigMap had none and every
      > fund request 404'd.
      >
      > **It surfaced loudly, which is the point.** The first
      > `fundcategorysync` Job failed with
      > `fund catalogue fetch failed: HTTP 404 for http://cachest:8080/fund/catalogue`
      > rather than syncing an empty catalogue — the 404 passthrough and the
      > row-count gate doing exactly the job they were built for. Had the sync
      > degraded to a warning, PROD would now hold zero `ANALYZY` rows and the
      > symptom would be `200 / bars=0` at the instruments tier.
      >
      > **Pre-existing drift found and deliberately NOT fixed:** the two config
      > copies have already diverged. The cluster copy is **missing
      > `OPENST_CRYPTO_SEARCH` and `OPENST_CRYPTO_PROFILE`** — so crypto search is
      > not proxied in PROD at all — and carries an `OPENST_PRICE_HISTORY` the
      > repo copy lacks. That predates this work; changing it is a separate
      > decision with its own blast radius, so it is flagged rather than absorbed.
      > Verified zero field mismatches on the three routes added.
      >
      > **Now proven in PROD**, tier resolution run inside the live instruments pod:
      >
      > | symbol | assetType | tier | |
      > |---|---|---|---|
      > | `ING01W` | fund | **fund_category** | the class-W symbol |
      > | `ING01` / `ING01U` / `ING04` / `ING92` | fund | fund_category | siblings |
      > | `INGAKC.TFI` / `NNEP65.TFI` / `NNEP30.TFI` | null→stock | **standard** | biznesradar, unchanged |
      > | `ABE0227` | **corp_bond** | standard | the dotless-bond collision is clear |
      > | `ROD1033` | bond | standard | savings bond still wins its branch |
      >
      > And bars through the tier: **`ING01W` → 872 rows, 382.05 / 904.80 / 931.03**;
      > `NNEP65.TFI` → 42 rows on `standard`, still biznesradar. `ticker_reference`
      > holds **734 `ANALYZY`/`fund` rows** with `ING01W → aliases ING01`.
      >
      > **The PROD Wipe & Reimport is now unblocked** — the prerequisite that made
      > it unsafe earlier (no `ANALYZY` row ⇒ `ING01W` ⇒ stock ⇒ equity walk ⇒
      > `200 / bars=0`) no longer applies.

**What this section does not do.** It does not add fund categories to the
`aktualny kurs` sheet column (§72.39's stale-data finding), does not touch
§72.39 step 4 (`positions.company_name`), and does not re-open the sheet. It is
strictly: make funds findable, and get the routing knowledge out of code.
