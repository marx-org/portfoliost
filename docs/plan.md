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
      > the feed discards matured instruments *and their history*. `BST0327` (matures
      > Mar 2027) has **427** bars; `BST0922` (matured Sep 2022) has **0**, though it
      > traded across 2021–22. All 8 are Polish **government** retail bonds, and
      > carrying them at cost (§72.21) is near-correct since they were redeemed.

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
      > §65.1, bar from §63.13. **Measure flow-adjusted** (`(value − net_flow)` vs the
      > prior day): on raw `value` Equate+ reads −80.2% and IBKR −20.0%, both pure
      > *withdrawals* — Equate+'s true worst day is −22.0%. IKE Marek's −76.1% and
      > IKE Beata's −34.1% are **explained** by §78.5's `unpricedValue`: each is
      > exactly the unpriceable bond purchase on that day. XTB remains, and it needs
      > §78.1.

---

## 80. Admin → Topology: the cronjob list has drifted, and the graph is unreadable (2026-10-02)

User request, two halves. Both are defects in the **D55 Topology tab** and the
**System tab** beside it, and both are in the same subsystem, so they are one
section with one ordering rule: **fix the data before the geometry** — a bigger
canvas that still shows the wrong jobs is a bigger wrong picture.

Proposal: [proposals/portfoliost-presentation.md](proposals/portfoliost-presentation.md)
— renovated 2026-10-02 to as-built; its "Known drift" section is the short
version of this one.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

### The drift, measured against the cluster on 2026-10-02

Both tabs hardcode the job list, and both are wrong. `portfoliost-admin` already
holds RBAC to list CronJobs (`cluster-read-role`, `cluster/apps/pfire/rbac.yaml`),
so this is a curation problem, not a permissions one.

The request was about last week's changes; the measured drift is older than that,
so the table carries ages rather than just names. `fundcategorysync` (25 h) and
`snapshotsync` (19 h) are the two genuinely new ones, `fxsync` is the rename
(9 d — the old name's death is what left a dead row behind), and `corpbondsync`
(12 d) plus the four openst jobs were never in the System tab at all.

| CronJob | schedule | age | System tab | Topology graph |
|---|---|---|---|---|
| `portfoliost-instruments-tickersync` | `30 4 * * 1` | 39 d | yes | yes |
| `portfoliost-instruments-fxsync` | `10 17 * * *` | 9 d | **no** | **no** (as `portfoliost-wallets-fxsync`) |
| `portfoliost-instruments-corpbondsync` | `45 4 * * *` | 12 d | **no** | **no** |
| `portfoliost-instruments-fundcategorysync` | `15 5 * * *` | 25 h | **no** | **no** |
| `portfoliost-wallets-snapshotsync` | `0 13 * * *` | 19 h | **no** | **no** |
| `openst-bond-import` | `30 4 * * *` | 15 d | **no** | yes |
| `openst-bond-archive` | `0 6 3 * *` | 15 d | **no** | yes |
| `openst-cpi-import` | `30 4 * * *` | 16 d | **no** | yes |
| `openst-cpi-seed` | `0 5 1 1 *` (**suspended**) | 15 d | **no** | yes |
| `stooq-downloader` | `0 3 * * 0` (**suspended**) | 140 d | yes | yes |
| `stooq-importer` | `@yearly` (**suspended**) | 140 d | yes | yes |

**Removed:** `portfoliost-wallets-fxsync` is gone — FX ownership moved to
instruments (§48.6a), and the cluster has `portfoliost-instruments-fxsync`
instead. The System tab still lists the dead name, so it shows a row whose image
can never resolve. **Removed:** `portfoliost-wallets-snapshotsync-postfx`, which
existed until 2026-10-01 when the two identical snapshotsync objects were merged
into one (k3s v1.36.2 rejects a comma-separated `schedule`, so one object could
not hold both windows — the reasoning is in the wallets HelmRelease comment).
Neither tab listed it, so nothing to delete in code; it is recorded here because
"the post-FX pass is gone" is a real behavioural change: day-end converted values
now settle on the next morning's run instead of the same evening.

**Three suspended jobs** (`openst-cpi-seed`, `stooq-downloader`,
`stooq-importer`) currently render as ordinary scheduled work. The graph already
carries `suspended` metadata for the openst four; the other two do not, and the
System tab has no column for it at all.

Not ours, and must stay out of both tabs: `pgdb` (flyway),
`postgres-pfire-repo1-{diff,full,incr}` (CrunchyData pgBackRest, operator-owned),
`scanst` / `scanst-override` / `scanst-test`, `stooq` (`stooq-daily`), plus the
non-portfoliost deployments sharing the namespace (grist, pgadmin, pgweb,
swaggerui, investbrain, …). The ownership line is **the homelab manifests**, not
`kubectl get cronjobs` — the namespace is shared.

### 80.1 — System tab: resync the hardcoded CronJob list

`src/jobs-version.ts` `CRONJOBS` is a four-element array
(`portfoliost-wallets-fxsync`, `portfoliost-instruments-tickersync`,
`stooq-downloader`, `stooq-importer`) read against a live
`listNamespacedCronJob` result. Entries absent from the cluster are skipped, so
the dead `fxsync` name degrades to *silently missing* rather than to an error —
which is why nobody noticed.

- [x] **Replace the array with the eleven portfoliost-owned CronJobs**, in the
      table above, and export it so a test can assert on it.
      > Names are the rendered object names, not the app-template keys:
      > `fxsync` under the instruments HelmRelease renders as
      > `portfoliost-instruments-fxsync`. Take them from
      > `~/prv/homelab/homelab` `origin/main`
      > (`cluster/apps/pfire/{openst,portfoliost-instruments,stooq-downloader,stooq-importer}/app/`),
      > which is the source of truth — **not** from the cluster listing, which
      > also carries the shared-namespace jobs that are not ours. Note the local
      > homelab checkout lags `origin/main`; read it via
      > `git show origin/main:<path>` after a fetch. `jobshot` (a Deployment) and
      > `portfoliost-sheets-sync` (an on-demand jobshot Job, no CronJob) stay out
      > of this array — `index.ts` already appends sheets-sync separately.
- [x] **Add `schedule` and `suspended` to `JobVersion`**, read from
      `cj.spec.schedule` / `cj.spec.suspend`, so the System tab can render
      `impl: "job"` rows as *Job · Scheduled* / *Job · Suspended* instead of a
      single green "Job" badge that reads as "running".
      > `SystemInfoView.vue:42` maps `impl === "job"` to one badge. The endpoint
      > shape is `ServiceVersion` in `src/api/admin.ts` and in the contracts
      > spec — check whether `ServiceVersion` already tolerates the extra fields
      > before widening it, and add them there if it does not.
      > It does not, and it is hand-written: `ServiceVersion` is a local
      > interface in `src/api/admin.ts`, **not** in the contracts
      > `openapi.yaml` (`grep ServiceVersion ../portfoliost-contracts` finds
      > nothing), so the two extra optional fields were added there and nowhere
      > else. `index.ts:55` was spreading the job rows field-by-field and would
      > have dropped them silently.
- [x] **New test file** `src/jobs-version.test.ts` — there is none today. Assert
      that `CRONJOBS` equals the eleven names above, and that
      `listJobVersions()` against a stubbed `listNamespacedCronJob` returns a row
      per name that exists, skips a name that does not, and never invents one.
      > The "skips a name that does not exist" case is the behaviour that hid
      > the dead `fxsync` entry: it is correct and it is also why the array can
      > rot unnoticed. Lock it deliberately rather than by accident.
- [x] **Tests**: `npm run test` green in `portfoliost-admin`; `npm run build`
      green in `portfoliost` (the `ServiceVersion` type change flows into
      `SystemInfoView.vue`).
- [x] **Commit** `fix(admin): resync the System tab CronJob list and show suspension`

### 80.2 — A guard, so the next drift is a failing test and not an eyeball

The decision recorded for this section is **keep the list hardcoded and resync
it** — discovery was considered and rejected for now, because the namespace is
shared and every discovered CronJob would need an ownership rule that is itself
a hardcoded list. The cost of that choice is drift, so the list needs a
tripwire.

- [x] **Add a captured fixture** of the portfoliost-owned CronJobs — name,
      schedule, suspend flag, image tag, capture date — as
      `src/cronjobs.fixture.json`, and a test asserting `CRONJOBS` matches it.
- [x] **Add `scripts/check-cronjobs.mjs`** that reads the live namespace with
      `kubectl get cronjobs -n pfire -o json`, filters to the fixture's names,
      and exits non-zero on any difference in name / schedule / suspend; with
      `--refresh` it rewrites the fixture instead.
      > Its honest limit: **an offline test cannot fail on its own.** The fixture
      > only changes when someone runs `--refresh`, so this catches a job edited
      > in the HelmRelease without a resync, and nothing more. Saying so here is
      > the point — a guard that needs the same manual act it is guarding against
      > is a tripwire, not automation. Wiring it into CI against the live cluster
      > is the follow-up that would make it self-firing, and it needs a
      > kubeconfig in CI.
- [x] **Tests**: `npm run test` green; `node scripts/check-cronjobs.mjs` run
      against the live cluster exits 0 with the fixture as captured on 2026-10-02
      (i.e. the filter does not drag the shared-namespace jobs in).
      > Verified both directions: exits 0 on the capture, and exits 1 on an
      > injected `fxsync` schedule change, a `stooq-importer` suspend flip, and a
      > fixture name that is no longer in the namespace. `npm run check:cronjobs`
      > is a script alias for it.
- [x] **Commit** `test(admin): guard the CronJob list against cluster drift`

### 80.3 — Topology graph: same drift, plus an edge that points at the wrong owner

`topology/graph-definition.ts` carries the job nodes as static data with
hand-written `job: { schedule, suspended, purpose }` metadata — no live probe,
by design: kube-state-metrics exposes no "last run succeeded" signal for a
CronJob, so the honest wording is "what the manifest declares".

- [x] **Replace the `portfoliost-wallets-fxsync` node with
      `portfoliost-instruments-fxsync`** and re-point its edge at
      `portfoliost-instruments` (`Updates FX rates`, `10 17 * * *`, not
      suspended).
      > Also `TopologyDetailsPanel.vue:75` keyed its admin-currencies quick-link
      > on the dead node id, so the Currency Rates link died with it.
- [x] **Add three job nodes** with schedule / suspend / purpose metadata:
      `portfoliost-instruments-corpbondsync` (`45 4 * * *` → instruments, the
      D80 corp-bond catalogue upsert deployed in §35),
      `portfoliost-instruments-fundcategorysync` (`15 5 * * *` → instruments,
      the analizy.pl fund-category upsert that §72.39's classification depends
      on — with no `ANALIZY::` row a fund routes as a stock and silently
      returns zero bars),
      `portfoliost-wallets-snapshotsync` (`0 13 * * *` → wallets, the only
      writer of `positions.market_value` in the scheduled pipeline since §76.1 —
      say so in the `purpose` text, it is the most consequential job in the
      namespace).
- [x] **Fix the FX edge owner**: `portfoliost-wallets → ecb` is labelled "FX
      rates (via fxsync CronJob)", but wallets no longer owns FX. Move the edge
      to `portfoliost-instruments → ecb` (`fx_rates` lives there since §48.6a).
- [x] **Add `suspended: true` to `stooq-downloader` and `stooq-importer`**, both
      suspended in the cluster. Give all twelve job nodes a `purpose` string —
      the details panel renders it, and the three new ones have none.
      > **Thirteen, not twelve.** The step's arithmetic dropped the renamed node:
      > a rename is one out *and* one in, so `10 − 1 (wallets-fxsync) + 1
      > (instruments-fxsync) + 3 = 13`. `areaNodes("jobs")` measures 13.
      > The three that had no `purpose` at all — `portfoliost-sheets-sync`,
      > `stooq-downloader`, `stooq-importer`, `jobshot` — got one too, with
      > `schedule: ""` for the two that are not CronJobs (sheets-sync is an
      > on-demand jobshot Job, jobshot is a Deployment), so the details panel has
      > no empty field.
- [x] **Update `tests/unit/modules/admin/topology-graph-definition.test.ts`** —
      `EXPECTED_NODE_IDS` (**39 → 42**), `EXPECTED_EDGE_PAIRS` (**47 → 50**),
      `areaNodes("jobs")` count (10 → **13**), the vitest snapshot, and the
      "maps verified OpenST CronJobs" case.
      > Same slip as above: 39 + 3 new nodes + 1 for the rename = 42, and the ECB
      > edge changes source without changing the count.
      > `loadTopologyLayout` applies a stored layout only on an exact id-set
      > match, so adding and removing node ids invalidates every saved
      > `pfire.topology-layout.v1` position and users get the fresh dagre pass on
      > first load. That is the intended behaviour, not something to work around.
- [x] **Tests**: `npm run test` and `npm run test:e2e` green
      (`tests/e2e/topology.spec.ts:112` asserts the OpenST job nodes are mapped
      and inspectable — check whether it enumerates ids).
      > It enumerates ids, and it does not — it only covers the openst four, which
      > did not change. What the three extra nodes *did* break is
      > `topology.spec.ts:348` and `:373`: a taller graph pushes the
      > external-services lane header to y≈821, below the 720px viewport, so
      > `mouse.down()` at the measured coordinates landed outside the window and
      > the drag silently never started. `laneBox()` now parks the element at a
      > fixed viewport spot (`scrollIntoView({ block: "center" })`) before
      > measuring, which also makes before/after measurements comparable after a
      > click that scrolled on its own. The underlying "canvas taller than the
      > window" problem is §80.5's `mission-canvas` height.
- [x] **Commit** `fix(spa): resync topology job nodes with the cluster`

### 80.4 — Nodes sized to be read

`NODE_SIZES` in `topology-layout.ts:41` (internal 200×40, storage 150×40, jobs
160×40, external 160×36, providers 120×28) is dagre's idea of each box, and it
doubles as the geometry the lane-bounds and persistence tests assert against. The
rendered box is whatever the node component's Tailwind padding makes it, so the
two are maintained by hand and can disagree.

- [x] **Enlarge the five node components**: `InternalNode`, `StorageNode`,
      `JobNode` from `px-3 py-2` / `text-sm` to `px-4 py-2.5` / `text-base`;
      `ExternalNode` likewise; `ProviderNode` from `px-2.5 py-1` / `text-xs` to
      `px-3 py-1.5` / `text-sm`, with the quota badge `text-[10px]` → `text-xs`.
- [x] **Update `NODE_SIZES` to the rendered sizes**, and raise `LANE_PADDING`
      from 24 so a lane still frames its contents.
      > Measure, do not guess: `getBoundingClientRect()` on a rendered node in
      > the browser is the number `NODE_SIZES` has to match, because
      > `extent: "parent"` clamps children to the lane and dagre spaces by this
      > constant. A lane smaller than its contents clips them.
- [x] **Assert the two agree**: a test that every area's `NODE_SIZES` entry is at
      least the component's minimum rendered box, so the constant cannot silently
      drift from the markup again.
      > `MIN_RENDERED_SIZES` holds the measured minimum per area and
      > `topology-layout.test.ts` asserts `NODE_SIZES >=` it. It is deliberately
      > the *minimum*: widths are label-driven, so one constant per area cannot
      > equal all of them, and `NODE_SIZES` is set to the widest measured node
      > (the value that stops a lane clipping a long label) — which satisfies the
      > minimum as a side effect.
      > The stronger half of the guard is an **e2e** test: it measures every
      > painted node against its lane, where `:311` only sampled five ids. That is
      > the invariant that actually matters — a node wider than the lane that
      > reserved room for it is clipped — and it is only observable in a browser.
- [x] **Tests**: `npm run test` green (layout snapshot updates), `npm run build`
      green, plus a Playwright pass on `tests/e2e/topology.spec.ts` — the lane
      tests at `:311` and `:348` assert boxes render and drag together, which is
      exactly what a size mismatch breaks.
      > Measured in the browser, as the step demands — `getBoundingClientRect()`
      > on every rendered node divided by the vue-flow zoom, with the zoom read
      > off a lane whose graph-unit width is in its inline style (reading the
      > matrix on `.vue-flow__viewport` returns identity here and silently
      > reports CSS pixels): internal 166.8…230.3 × 46, storage 99.0…146.6 × 46,
      > jobs 118.3…208.5 × 46, external-services 107.0…179.8 × 46,
      > data-providers 53.5…197.2 × 34. Reserved before: 200×40, 150×40, 160×40,
      > 160×36, 120×28 — i.e. the providers lane reserved 120 for a box that
      > renders up to 197 wide.
- [x] **Commit** `fix(spa): enlarge topology nodes to a readable size`

### 80.5 — Pack lanes sideways, so a wide screen is used

The graph reads left-to-right (`rankdir: "RL"`, D55-9) but `packAreas` pushes
overlapping lanes **downward**, so five areas stack into a tall column and
`fitView` — which fits both axes — zooms out to satisfy the height. That is the
mechanism behind "boxes are very small and unreadable"; §80.4 alone makes the
boxes bigger and the zoom-out worse.

- [x] **Flip the pack axis**: in `packAreas`, advance `x` instead of `y` when a
      lane must clear an already-placed one, and order the pass by raw `x` then
      definition order.
      > Keep the guarantee the same — pairwise-disjoint lanes — and keep
      > `nearOverlap` as the single overlap predicate. `clampLaneMotion` is
      > already axis-symmetric (binary search over the displacement vector), so
      > lane dragging needs no change.
- [x] **Fix the tests that encode the old axis.**
      > `topology-layout.test.ts:48` asserts lane *left edges* ascend in the
      > order data-providers → storage → internal → external-services; that
      > ordering came from the rank columns, and horizontal packing re-orders it.
      > Either relax it to "no two lanes overlap and every node is inside its
      > lane" (`:83`, `:103`) or pin the new left-to-right lane order
      > deliberately — but do not leave it asserting the old geometry.
      > It kept passing, and that is the problem: with the pass ordered by raw
      > `x`, a left-edge ordering *is* the comparator's output, so the test
      > asserted the sort. Replaced with the axis guarantee — lanes move right,
      > never down: `lane.y + LANE_PADDING` equals the area's first member's `y` —
      > and `packAreas`' own test now asserts `y` is untouched while `x` moves.
- [x] **Shorten the canvas** in `mission-control.css`: `.mission-canvas` is
      `clamp(540px, calc(100vh - 430px), 1000px)`. A wide layout wants a shorter
      stage, and `fitView` has more width to spend on the zoom that §80.4 needs.
      Check the `≤720px` media block at `:115` still collapses sensibly.
      > `clamp(380px, calc(100vh - 430px), 760px)`.
      > **The step's reasoning is wrong**, and the change is smaller than it looks:
      > a shorter canvas adds no width. It pays off only because after the flip
      > *height stops being the binding axis* — measured on 1280×720, height alone
      > allows 0.310 and width only 0.223 — so the extra 160px was pure scroll. The
      > `≤720px` block overrides only `.mission-control--focus .mission-canvas`, so
      > it needed no change; the 380px floor keeps the graph usable there.
- [x] **Raise `max-zoom`** from 1.5 (`TopologyView.vue:459`) only if §80.4 and
      §80.5 together still leave the default view short of 1:1 — measure on a
      real viewport before changing it.
      > Measured, and **not** raised. 1280×720, canvas 1006×540 after the shorter
      > height: vertical pack was extent 2104×3682 at zoom **0.128** (height-bound
      > 0.147); horizontal pack is 4507×1226 at zoom **0.194** (width-bound 0.223).
      > A 1.5× bigger default view, still far short of 1:1.
      > A floor was tried and reverted. `fitView` clamps its computed zoom into
      > `[minZoom, maxZoom]`, so the lever is a **floor** — `maxZoom: 0.6` would
      > leave 0.194 untouched — and `fit-view-on-init` takes only a boolean in
      > @vue-flow/core 1.48, so it needs a `@nodes-initialized` refit. At 0.6 the
      > graph is 3× more legible and **11 of 17 topology tests fail**: the default
      > view shows a 40%-width slice and every node click lands off-canvas. 42
      > labelled nodes cannot be both fully visible and readable in a ~1000px
      > canvas; the toolbar zooms 0.05…1.5 and focus mode widens the stage, so
      > legibility is reachable on demand. Making the *default* legible means
      > shipping a pannable-by-default view — a product decision about which to
      > give up, not a layout tweak.
- [x] **Tests**: `npm run test` green; `npm run test:e2e` green — `:311` asserts
      lanes never overlap, `:373` that Re-layout restores the canonical
      arrangement, `:394` that moved lanes survive a reload.
      > `:394` compared *screen* pixels across a reload and broke once the wider
      > layout let a drag push a lane far enough sideways that the next measurement
      > scrolled. A persisted position is a graph-space fact, so it now reads
      > vue-flow's inline `transform: translate(x, y)`.
- [x] **Commit** `feat(spa): pack topology lanes horizontally for wide screens`

### 80.6 — `cachestProviders` is permanently empty (found while renovating the proposal)

Not requested. Recorded because it was found, it is in the same subsystem, and
it is a two-line fix next to `LABEL_PREF`. Drop this step if the section is
already long enough.

`CACHEST_P99_Q` filters `service_name="cachest"`, but the OTel exporter in this
cluster emits `job` and `service` and **no `service_name`**. Verified against
the live Prometheus on 2026-10-02:
`count(http_client_request_duration_seconds_bucket{service_name="cachest"})` →
empty. So `cachestProviders` is always `[]`, and
`TopologyDetailsPanel.vue:192` (`v-if="… && cachestProviders.length"`) never
renders the per-upstream latency table. The service rows next to it are fine —
they go through `queryMapByLabel`, which is why this one query was missed.

- [ ] **Resolve the cachest identity through `LABEL_PREF`** the same way the
      service rows do, instead of hardcoding `service_name`.
- [ ] **Test** that the generated PromQL carries no unresolvable label filter,
      and that a stubbed series keyed on `job` yields a populated
      `cachestProviders`.
      > Extend `portfoliost-admin/src/topology.test.ts` — the ingress/OTel
      > fallback paths are already covered there, so this is an added case, not
      > a new file.
- [ ] **Tests**: `npm run test` green in `portfoliost-admin`; confirm against the
      live cluster that the endpoint returns a non-empty `cachestProviders`.
- [ ] **Commit** `fix(admin): resolve cachest provider latency through the label fallback`


## 81. Drawdowns and annualization both ignore cash flows (2026-10-02)

Three defects in portfolio performance measurement, all live in PROD — two in
`portfoliost-wallets`, one in the `portfoliost` SPA. Found while choosing which
performance metrics to display; none is a speculative improvement, and each one
makes a number on screen wrong today. §81.1 is the serious one: it is also a
deviation from our own spec (`docs/proposals/portfolios-module.md:386` says
`annualizedReturn` comes *from TWR*, and the code never sees a TWR). §81.3 is the
same root cause as §81.1, reproduced in the frontend, on the Performance tab's
own Drawdown card.

`GET /api/portfolios/:id/risk-metrics` (`src/routes/portfolios.ts:1453`) selects
`snapshotDate`, `value`, `cumulativeTwr`, `cumulativeMwr`, then hands
`computeRiskMetrics` the **raw `value`** column (`src/routes/portfolios.ts:1484`
→ `:1491`). `computeRiskMetrics` derives every daily return from that series via
`dailyLogReturns` (`src/services/riskMetrics.ts:21-31`), which takes
`log(values[i] / values[i-1])` and knows nothing about `net_flow` — even though
`net_flow` sits in the same table and is selected two lines away for the TWR
column. Note that the two metrics on this route that *are* correct
(`moneyWeightedReturn` at `:1488`, and the monthly bars from `buildMonthlyReturns`
at `:156`) read the pre-computed `cumulative_twr`/`cumulative_mwr` columns. The
split is what makes this look plausible in the UI.

### 81.1 — `computeRiskMetrics` is fed raw `value`, so every deposit counts as a return

One deposit day moves `value` with no market move behind it, and
`dailyLogReturns` books the whole jump as a portfolio return. A €50k deposit into
a €50k portfolio with flat prices logs `log(100/50) = 69.3%` for that day. From
there:

| Metric | Source | How the flow contaminates it |
| --- | --- | --- |
| `volatility` | `riskMetrics.ts:53` | The 69.3% observation is fed through `√252`, so deposits dominate σ |
| `sharpeRatio` | `riskMetrics.ts:81` | Numerator (mean daily return) inflated by flow days, denominator by the same |
| `sortinoRatio` | `riskMetrics.ts:101` | Same, and the deposit lands in `Math.min(r - dailyRf, 0)` as 0 — never counted as downside |
| `winRate` | `riskMetrics.ts:131` | Every deposit day is a "win"; reads high |
| `maxDrawdown` | `riskMetrics.ts:63` | A deposit **during** a drawdown resets the peak, so real drawdowns are truncated — 100 → 50 → deposit 100 → 150 → 75 is a true −75% flow-neutral drawdown but reports −50% |
| `calmarRatio` | `riskMetrics.ts:119` | Inherits both: `annualizedReturn / abs(maxDrawdown)` |
| `periodReturnPercent` | `riskMetrics.ts:155` | `(last/first − 1)` on raw values — reads deposited capital as profit |

The fix is to stop deriving returns from `value` and instead build the
**flow-neutral daily sub-period return series** the snapshots already support:

```
HPR_t = V_t / (V_{t-1} + netFlow_t) − 1        // t = 1 … n−1
```

This is the same expression `buildTwr` uses (`returnColumns.ts:35`) — reuse it
rather than re-deriving it, so the risk metrics and the chart cannot drift apart.
Chain the `HPR`s into an index (start 1.0) and feed **that** to `maxDrawdown`;
feed the `HPR` array itself to `annualizedVolatility`, `sharpeRatio`,
`sortinoRatio` and `winRate` (they currently re-derive log returns internally,
so they should take returns, not values). `periodReturnPercent` becomes
`index_last − 1`. Do **not** read the stored `cumulative_twr` column as the
index: it is rounded to 2 dp (`returnColumns.ts:38`), which is ~1 bp of
quantisation per day and far too coarse for a daily σ.

- [ ] **Export the daily flow-neutral return series** as a single named function
      in `src/services/returnColumns.ts` (next to `buildTwr`, sharing its
      per-day expression), and have `buildTwr` consume it so there is one
      implementation of the sub-period return.
- [ ] **Change the risk-metric functions to take the prepared series**:
      `maxDrawdown(index)` / `annualizedVolatility(returns)` /
      `sharpeRatio(returns)` / `sortinoRatio(returns)` / `winRate(returns)` /
      `periodReturnPercent(index)`, and `computeRiskMetrics` to select `netFlow`
      alongside `value` at `src/routes/portfolios.ts:1470-1475` and prepare both
      series once.
      > Every existing case in `src/services/riskMetrics.test.ts` (40 `it()`s
      > across 10 describes) passes a *value* array with no flows. A signature
      > change means they all need rewriting to the new input shape, which is the
      > bulk of this step — do it as one mechanical pass, then add the flow cases
      > below. `src/routes/risk-metrics.test.ts` (9 cases) seeds `netFlow: "0"`
      > and will keep passing unchanged.
- [ ] **Add the flow tests that would have caught this** — for each of
      `volatility`, `sharpe`, `sortino`, `winRate`, `maxDrawdown`,
      `periodReturnPercent`: a portfolio that receives one large deposit
      mid-window with **flat** prices must return the *same* metric as the same
      series with the deposit removed (this is the invariant that was violated),
      and a `calmar` case where a deposit during a drawdown no longer truncates
      it.
- [ ] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
- [ ] **Commit** `fix(wallets): derive risk metrics from flow-neutral returns, not raw value`

### 81.2 — `annualizedReturn` annualizes calendar days with a trading-day exponent

Independent of §81.1 and wrong even for a portfolio with no flows at all.

`annualizedReturn` (`riskMetrics.ts:143-151`) computes
`(V_last / V_first) ** (TRADING_DAYS / n) − 1` where `n = values.length − 1`.
`TRADING_DAYS` is `252` (`riskMetrics.ts:14`), but `n` counts **calendar** days:
the snapshot series is built from `calendarDays(from, to)`
(`src/services/backfill.ts:1079` → `:471-481`), which emits every day including
weekends and holidays. So the exponent is wrong by a factor of 365/252 ≈ 1.45
wherever the window is measured in days rather than years.

The error is largest exactly where it does the most damage — a one-year window
gives `n ≈ 365`, exponent `252/365 = 0.690`, so a genuine **+10.0%** year is
reported as **+6.8%**. It inverts at short windows: a quarter gives `n ≈ 91`,
exponent `252/91 = 2.77`, so **+5.0%** in three months is reported as **+14.5%
annualized**. That last one is the "small profit inflated into a large
percentage" failure in its purest form, and it needs no deposits at all —
any portfolio with a flat three months of returns is being annualized this way.

The basis is also the wrong construct even once the exponent is corrected:
annualizing `V_last / V_first` measures the growth of the *value*, which grows
when you deposit. Per `portfolios-module.md:386` it must come from TWR over
**elapsed years**, i.e. from the flow-neutral index §81.1 builds:

```
annualized = (index_last / index_first) ** (365 / calendarDays) − 1
```

using calendar days in both the exponent numerator and the step count, which is
the only self-consistent pairing given the series is calendar-daily.

- [ ] **Rewrite `annualizedReturn`** to take the flow-neutral index and the dates,
      annualizing over `365 / calendarDays` instead of `252 / n`.
- [ ] **Add the regression test for the exponent**: a 365-point series rising
      exactly 10% must annualize to ~10%, not ~6.8%. Plus a 91-point series to
      pin the quarterly case (+5% in 91 days must read ~+14.5%, not ~+5%), and a
      case with one mid-window deposit asserting the annualized figure is
      unchanged by it.
- [ ] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
- [ ] **Commit** `fix(wallets): annualize over elapsed calendar years from TWR`

### 81.3 — `currentDrawdownPercent` in the SPA takes its peak over raw `value`

The same defect as §81.1, in the SPA, on the Performance tab's own Drawdown card.
Found while working out how to extend that tab; it is on screen today.

`currentDrawdownPercent` (`src/modules/portfolios/PortfolioPerformanceTab.vue:176-182`)
is computed client-side from `seriesValues` (`:174`), which is
`performance.timeSeries[].value` — the **raw portfolio value**, with no flow
adjustment:

```
const max = Math.max(...values)
return (values[values.length - 1] / max - 1) * 100
```

Every external cash flow raises the running maximum, so the denominator is
"peak including money that was never at risk". A deposit made during a drawdown
therefore **shrinks the reported Current Drawdown**, and the amount it shrinks it
by is the deposit: 100 → 50 → deposit 100 → 150 → 75 is a true −75% flow-neutral
drawdown and reports −50% here. The card's Max Drawdown tile
(`:184-190`) reads `riskMetrics.maxDrawdown` from the backend, so after §81.1
both tiles on that card become correct and consistent — but until then the two
tiles disagree with each other, which is visible on one screen.

The fix uses data the SPA already has: `timeSeries[]` also carries
`cumulativeTwr` (`src/routes/portfolios.ts:1277`), which is exactly the
flow-neutral index this peak should be taken over. Prefer that over recomputing a
TWR chain in the SPA — the index is pre-computed and rounded to 2 dp
(`returnColumns.ts:38`), which is ample for a peak lookup and not ample for a
daily σ. Do **not** import the backend's TWR builder into the SPA; if a future
card needs the daily return series rather than the index, add it to the
`analytics` payload instead.

- [ ] **Recompute `currentDrawdownPercent` over `cumulativeTwr`**, falling back to
      the existing raw-`value` path when the series has no TWR column (a
      pre-migration snapshot row), so the card still renders rather than blanking.
- [ ] **Add the component test** that pins the defect: a `timeSeries` of
      `[{value:100, cumulativeTwr:100},{value:50, cumulativeTwr:50},{value:150, cumulativeTwr:50},{value:75, cumulativeTwr:25}]`
      must report **−50%**, not −75% — and a no-flow series must report the same
      number as before, so the fallback and the TWR path agree.
      > `currentDrawdownPercent` is a module-local `computed` in a `<script setup>`
      > SFC, so it is not directly testable today. Extract the arithmetic to a
      > named export alongside the other shared maths (`docs/COMPONENTS.md`) and
      > import it back, which is the same treatment §79.1 gave `cell()`.
- [ ] **Tests**: `npm run test` green in `portfoliost` (vitest unit) and
      `npm run build` (includes `vue-tsc --noEmit`) green. Add the tile to the
      existing Performance tab e2e rather than a new spec — one assertion that a
      seeded flow-bearing portfolio's Current Drawdown matches its Max Drawdown's
      peak-to-trough is enough to catch a regression.
- [ ] **Commit** `fix(spa): take the current-drawdown peak over the TWR index`

## 82. Performance tab: overview tiles & per-year returns (D82)

Proposal: [performance.md](proposals/performance.md) — make the Performance tab
answer "how much more cash than I put in?" and "how efficiently is it invested,
per year and overall".

One new card above the Performance Chart (five tiles) and a `Monthly | Yearly`
toggle on the existing Returns Chart. Touches `portfoliost` and
`portfoliost-wallets` only — **no contract change**, because every field the
proposal needs is already declared in `openapi.yaml` and three of them are
already computed by the route and returned to a UI that displays none of them
(`portfolios.ts:1345-1359`). Risk ratios stay on the Risk tab.

The provider-tier ordering (openst → cachest → instruments) does not apply: no
new data source, no scraping, no route in `config.yaml`. Steps run
backend → SPA tiles → per-year table → benchmark column → parity + full suite.

**Dependency:** TWR p.a. must be annualised over *elapsed calendar years from
the flow-neutral index*. §81.2 is where that number gets built correctly; this
section consumes it and must not re-derive annualization independently.

---

### 82.1 — Populate `performance.annualizedReturn` with the flow-neutral annualised rate

The only backend change in this section. `annualizedReturn` and
`annualizedReturnWithheldReason` are declared in the contract
(`openapi.yaml:1447`, `:1449`) and the analytics route returns **neither** — the
`performance` object it builds ends at `simpleReturnPercent`
(`portfolios.ts:1343-1360`). The SPA therefore has nothing to render a TWR p.a.
tile from.

- [ ] **Compute the TWR p.a. in the analytics route** from the already-selected
      `cumulativeTwr` column, annualising over elapsed calendar days:
      `(twr_last / 100) ** (365 / calendarDays(first, last)) − 1`, expressed as a
      **percentage** to match every sibling in `performance.*`
      (`totalReturnPercent`, `moneyWeightedReturn`, `timeWeightedReturn` are all
      percents). Use the existing `daysBetween` helper in
      `src/services/returnColumns.ts` rather than a second date-difference
      implementation.
      > Reuse §81.2's `annualizedReturn(values, dates)` if it accepts the TWR
      > index by then — one implementation, and this step becomes a two-line
      > call. Do not add a third annualizer if it does not.
- [ ] **Return `annualizedReturn: null` plus a reason** when the span is under a
      full year, rather than annualising a partial window. Reuse the existing
      `annualizedReturnWithheldReason` (`src/services/riskMetrics.ts:176-188`)
      as the single source of truth for the predicate so the Risk tab and this
      tile cannot disagree about the same window. The reason string travels in
      the already-declared `annualizedReturnWithheldReason` field — **no new
      vocabulary, no `openapi.yaml` edit.**
- [ ] **Test the arithmetic in the route test** (`src/routes/analytics.test.ts`):
      a 365-point series with `cumulativeTwr` rising 100 → 110 must return
      `annualizedReturn: 10`, and a 91-point series must return `null` with the
      reason set, not a larger number.
- [ ] **Tests**: `npm run test` green in `portfoliost-wallets`; `npm run build`
      (tsc) green.
- [ ] **Commit** `feat(wallets): return the flow-neutral annualized return in analytics`

### 82.2 — Overview tiles card

A new `card` **above the Performance Chart card** in
`src/modules/portfolios/PortfolioPerformanceTab.vue`, four tiles plus one
full-width Timing line: Net gain, Net invested, XIRR, TWR p.a., Timing =
`XIRR − TWR p.a.` with a plain-language reading ("adding money helped" / "adding
money hurt").

- [ ] **Add the card** reading `store.analytics.performance` only —
      `totalReturn`, `totalInvested`, `moneyWeightedReturn`, `annualizedReturn`,
      `annualizedReturnWithheldReason`. **No new API call**: all five are on the
      payload the tab already holds. Absent or `null` renders `—`, never `0`.
- [ ] **Convert the money tiles through the existing display-currency path** —
      reuse the `useDisplayConversion` / `chartRate` pair already built at
      `:251-264` rather than adding a sixth conversion copy, so switching the
      display currency re-converts the tiles in place without a re-mount.
- [ ] **Render the Timing line defensively**: it is a difference of two rates,
      so it is only meaningful when both are present. Hide the whole line when
      either input is withheld, and never print a difference against `null`.
- [ ] **Reuse the Drawdown card's tile markup** (`:334-343`) for the four tiles
      so the tab does not grow a second visual dialect, and give the card the
      `data-testid="perf-overview"` prefix with `-net-gain`, `-net-invested`,
      `-xirr`, `-twr-pa`, `-timing` on the tiles.
- [ ] **Tests**: extend
      `tests/unit/modules/portfolios/PortfolioPerformanceTab.test.ts` — assert
      the tiles render the payload values, that `annualizedReturn: null` with a
      reason renders `—` and hides the Timing line, and that a display-currency
      switch re-renders the money tiles without remount (mirroring the existing
      §48.6e B3 cases at `:113`). `npm run build` (includes `vue-tsc --noEmit`)
      green.
- [ ] **Commit** `feat(spa): add the performance overview tiles`

### 82.3 — `Monthly | Yearly` toggle on the Returns Chart, with TWR % and Gain

Per proposal §3. The toggle sits in the Returns Chart card header; Monthly is
today's bar chart unchanged, Yearly renders the four-column table.

- [ ] **Extract the per-year derivation as a named export** next to the component
      (`docs/COMPONENTS.md` — shared pure logic exported from a component file),
      taking `performance.timeSeries[]` and returning one row per calendar year:
      `year`, `twrPercent`, `gain`, `isYtd`. Two formulas, both exact: year TWR
      = `cumulativeTwr(last of y) / cumulativeTwr(last of y−1) − 1`; year gain
      = `[value − invested](end of y) − [value − invested](start of y)`. The
      first year uses the series' own first point as its base.
      > Do **not** re-chain TWR from monthly bars — `cumulativeTwr` is already the
      > exact chain, and differencing it introduces rounding. Do **not** sum or
      > average the monthly percentages.
- [ ] **Render Yearly as a table** with a `Σ` footer row: the % cell shows the
      compounded product (`× 1.7044`), the Gain cell the sum. Mark the current
      calendar year `YTD` and never annualise it.
- [ ] **Gate Yearly to `ALL`** (proposal §3): `analytics` is timeframe-filtered
      server-side, so a 3M window holds no year. Selecting any other timeframe
      forces Monthly and disables the toggle with a visible hint. Do not issue a
      second `ALL` fetch.
- [ ] **Convert the Gain column** with the same `chartRate` used by the tiles, so
      the Σ footer equals the Net gain tile on screen.
- [ ] **Tests**: unit-test the exported derivation against the worked example in
      the proposal — four years at +24.1 / +18.2 / +11.4 / +4.3 % with gains
      5,300 / 4,100 / 2,950 / 890 must yield a compounded product of `1.7044`
      (±0.0001 on the stored 2 dp index) and a gain sum of `13,240`; plus the
      reconciliation assertions (`Σ gains` equals `performance.totalReturn`, and
      `Π(1 + twr)` equals `cumulativeTwr` at the last point) which are the whole
      point of the two columns and must fail loudly if either drifts. Add
      component cases for the toggle state and the YTD label.
- [ ] **Commit** `feat(spa): add yearly TWR and gain to the returns chart`

### 82.4 — Excess TWR per year against the benchmark

The fourth column. `benchmarks[].timeSeries[]` already carries the
transaction-mirrored series, so this is the same year-boundary ratio applied to
the benchmark's own index.

- [ ] **Compute excess per year** as `portfolio year TWR − benchmark year TWR` for
      the **first selected benchmark only**, and render the column header with
      that symbol (`vs SPY`). With no benchmark selected, omit the column
      entirely rather than rendering an empty one.
      > Benchmarks are a list, so "excess vs all of them" is not a single number.
      > One column for the first is a deliberate cap; widening it is a separate
      > decision.
- [ ] **Render no total in that column** and say so — excess returns compound
      but do not sum, and a Σ row that looked additive would be wrong.
- [ ] **Tests**: component case with one benchmark selected asserting the column
      appears with the right symbol and that the per-year excess matches a
      hand-computed fixture; and a no-benchmark case asserting the column is
      absent.
- [ ] **Commit** `feat(spa): add per-year excess return against the benchmark`

### 82.5 — Example service parity check and the full suite

`AGENTS.md` makes `app.example-service.ai` the source of truth for UI and a Playwright
side-by-side comparison the preferred way to find gaps. This section adds a card
and a toggle that example-service does not have in this shape, so the comparison is about
layout, tile styling and wording — not about whether the tiles exist.

- [ ] **Compare before/after with Playwright** against both apps: the Performance
      tab at the same viewport, plus the a11y tree, and diff the two cards this
      section touched. Record any example-service wording for a money or return tile and
      adopt it verbatim where it does not contradict the proposal's semantics.
- [ ] **Run the whole suite**: `npm run build` (includes `vue-tsc --noEmit`),
      `npm run test`, `npm run test:mock`, `npm run test:e2e` against
      `docker compose up -d --build`. Rebuild the `portfoliost` container after
      the frontend changes and **restart the gateway** afterwards, or only
      wallets-routed e2e paths will 404 for the wrong reason (see `AGENTS.md`).
- [ ] **Extend `tests/e2e/performance-display-currency.spec.ts`** with one case
      that switches the display currency and asserts both the Net gain tile and
      the Gain column re-convert together — they share a rate, so a regression in
      either is one assertion away.
- [ ] **Commit** `test(spa): cover the performance overview and yearly returns in e2e`
