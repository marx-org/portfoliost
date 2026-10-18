# cache.md — session handoff: plan §24.9 (sheets sync) — round 2: wipe completeness, date-sort, 1 wallet ↔ 1 portfolio

> Temporary context for session compaction. **Do not commit. Delete after resuming.**
> Repos: SPA = `~/prv/pfire/portfoliost` · admin = `~/prv/pfire/portfoliost-admin` ·
> job = `~/prv/pfire/portfoliost-sheets-sync` · wallets = `~/prv/pfire/portfoliost-wallets` ·
> contracts = `~/prv/pfire/portfoliost-contracts` · homelab = `~/prv/homelab/homelab`
> Kubeconfig: `export KUBECONFIG=$HOME/.kube/homylab-tailscale` (NOT `homylab`).
> Admin panel: `https://portfoliost.k.homylab.com` — **passkey login only** (user does the
> biometric step in the MCP browser window; I can't). Direct URL loads of `/en/admin/*`
> redirect to `/en/investments` — always navigate in-app: nav "Admin" link → "Jobs" tab.

## Task — three new requirements (all NOT yet implemented)

§24.9 is deployed & working end-to-end (admin panel → jobshot Job → wallets import). One sync
ran: `inserted=2012 skipped=7 errors=4 walletOnly=1 noOp=1`. User then asked:

1. **Wipe must delete derived data too** ("…also deletes price bars and other generated stuff,
   not only transactions, so the db is clean"). "Price bars" = `value_snapshots` (EOD value
   history) + `positions` + `portfolio_transactions` + `shares` + `portfolio_backfill_metadata`.
   Design settled below; only the **contract change is done** (v1.6.22 pushed, npm publish
   unverified).
2. **Sheet is NOT fully date-ordered** (user confirmed) → SELLs before their BUYs →
   `insufficient_quantity` / `no_open_position` (the 4 errors). **Fix: stable-sort rows by
   `date` (ISO string) before the batch import** — AFTER `restateSplits` validation (it checks
   col-11 cumulative in SHEET order and must stay there).
3. **1 wallet ↔ 1 portfolio**: each Konto → wallet + its own portfolio, **same name**
   (user chose "Same as Konto"). Cash leg → Konto's wallet; position leg → Konto's portfolio.
   Replaces single "Transakcje" portfolio. After all fixes: **Wipe & re-import** from panel
   (current cluster data — 2012 rows in one portfolio — must go).

## Done + released this session (all green, all pushed)

| Repo | Tag | What |
|---|---|---|
| portfoliost-admin | v1.0.44 | `src/sheets-sync.ts`: POST /api/admin/jobs/sheets-sync/run `{wipe?}` (caller raw JWT → `WALLETS_API_TOKEN`; `WALLETS_API_URL`=`API_WALLETS_URL`; `INSTRUMENTS_DATABASE_URL`=`DATABASE_URL`; `secretName: sheets-sync-secrets`; image = `SHEETS_SYNC_IMAGE` env ?? `ghcr.io/marx2/portfoliost-sheets-sync:v1.0.1` — **bump this default to v1.0.2 in step 3**), GET .../status, GET .../log; `env?` added to `JobshotRunPayload`; jobshot/DB helpers exported from jobs.ts; 12 tests |
| portfoliost (SPA) | v1.0.165 | `adminJobs.ts`: runSheetsSync/getSheetsSyncStatus/getSheetsSyncLog; JobsView "Google Sheets" card (Run Sync + Wipe & re-import w/ window.confirm, badge, last-run line, 60 s poll, resume-on-reload). Full suite green: unit 282, mock 186, e2e 75 passed/1 skipped |
| portfoliost-wallets | v1.1.36 | pushed 2 previously-unreleased commits: `feecddd` short-option keys (direction/optionType/contractSize) + `da733d6` zero-price BUY + sell drift clamp. 299 tests pass; tree clean; local=origin=da733d6. **Next release v1.1.37** |
| portfoliost-sheets-sync | v1.0.1 | deployed & proven (fetches sheet, bootstraps, imports). **Needs v1.0.2 with sort + 1:1** |
| @marx-org/contracts | v1.6.22 (pushed) | `SourceWipeResponse.deleted` + `positions, portfolioTransactions, valueSnapshots, shares, portfolioBackfillMetadata, nulledWalletRefs` (optional ints). Commit feb262e → GHA publishes to GitHub Packages. **VERIFY publish: `gh release list --repo Marx2/portfoliost-contracts` + `npm view @marx-org/contracts version --registry https://npm.pkg.github.com`** |
| homelab | main 0f9a52728 | all pushed: `portfoliost-sheets-sync/` (ks.yaml + app/{kustomization,sheets-sync-secrets}.yaml only — no HelmRelease/ConfigMap), pfire/kustomization entry, tmpl/cluster-secrets `PORTFOLIOST_GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` lines, sops re-encrypted (user ran encode.py), tag bumps: admin v1.0.44, SPA v1.0.165, wallets v1.1.36 (2 places: app + fxsing) |

## Verified facts (live debugging this session)

- **Google OAuth**: `~/prv/pfire/portfoliost/sheets-sync.env` (gitignored) creds are VALID
  (direct curl refresh works). The `invalid_client` failure = generic `GOOGLE_CLIENT_ID`
  KeePass entry is a DIFFERENT client (`352195963391-...`) vs sheets one (`342607547624-00j6...`).
  Fixed via 3 `PORTFOLIOST_GOOGLE_*` KeePass entries (user maintains them manually; the
  bootstrap script was deleted — don't recreate it). App secret keys stay plain env names
  (`GOOGLE_CLIENT_ID` etc.), VALUES from `${PORTFOLIOST_GOOGLE_*}` postBuild placeholders.
- **Cluster wallets 422 `Unrecognized keys: optionType/direction/contractSize`** → cluster ran
  v1.1.35; fixed via wallets v1.1.36. GOTCHA: after image bumps wait for FULL rollout
  (`.status.updatedReplicas=1`) before re-triggering — one run hit the old pod (user: "you
  were too fast"). Compose-stack equivalent: nginx gateway caches upstream IPs after
  `up -d --build` → `docker compose restart gateway`.
- **Wipe route today** (wallets `src/routes/import.ts` ~L640): deletes walletTransactions →
  portfolios → wallets → syncRuns (all `externalSource+userId`). Derived rows vanish only via
  portfolioId CASCADE (baseline migration confirms ON DELETE CASCADE for
  transactions/positions/shares/value_snapshots/backfill_metadata; **NO** cascade on
  `*.wallet_id` / `wallet_transactions.to_wallet_id` — NO ACTION, so deleting a source wallet
  is BLOCKED if any non-source row references it).
- **`split_events` is GLOBAL** (no portfolio/user columns) — must NOT be wiped per source.
- **Job env**: `WALLETS_API_TOKEN` = RAW token (job prepends "Bearer " itself).
- **4 error rows** (pre-sort): RGEN (have 2.7703, sell 3), "ISHARES S&P 500 FINANCIALS SECTOR
  UCITS ETF USD A" (no open position), DTLA (have 406, sell 470), IUFS (have 24, sell 45).
  Expect all 4 fixed by date-sort; if any survives, inspect sheet rows for that symbol.
- **501 unmatched instruments** (funds like "NN Emerytura 2030") → name-as-symbol fallback,
  by design (cluster ticker_reference lacks those seed rows; job handles it).
- **Current cluster DB state** (after partial import, pre-wipe): 10 wallets
  (IBKR, Equate+, IKE Marek, IKE Beata, NN TFI PPK, NN TFI PPO, Rach. rejestrowy PKO BP, XTB,
  Crypto, Obligacje PKO SA Beata — note Konto "IB" → walletName "IBKR"), 1 portfolio
  "Transakcje" (e4f620f6-5ffd-46ec-8410-9334ec97d923) w/ 2012 imported rows + positions,
  1 sync_run. K8s job `portfoliost-sheets-sync` last = Failed (jobshot deletes+recreates on
  same-name run). Admin Jobs card shows Failed + "Last sync ... incremental".
- **E2E data gotchas (compose stack)**: price-bars spec self-poisons via openst read-through
  caching real AAPL rows into `instruments.price_bars` overlapping the sim's seed dates
  (2026-07-29/30). If it fails: `DELETE FROM instruments.price_bars WHERE symbol='AAPL' AND
  date BETWEEN '2026-07-27' AND '2026-07-31'` then rerun.

## Remaining work (order; one commit per step, tests before commit)

**Step 1 — wallets: complete wipe (v1.1.37)**
1. Verify contracts v1.6.22 published (command above). If not, wait/retry; GHA does it.
2. `~/prv/pfire/portfoliost-wallets`: `npm i @marx-org/contracts@latest` (.npmrc → GitHub
   Packages), `npm run gen:types`.
3. Rewrite `routes.delete("/source/:externalSource")` in `src/routes/import.ts` (needs
   `inArray` import; schema imports `valueSnapshots, shares, portfolioBackfillMetadata`):
   - SELECT source portfolio ids + wallet ids (externalSource+userId) FIRST.
   - Explicit deletes scoped to source portfolios (+userId): `positions`,
     `portfolioTransactions`, `valueSnapshots` (no userId col), `shares` (userId),
     `portfolioBackfillMetadata` (no userId col). Count each. Do NOT touch `split_events`.
   - Delete source `walletTransactions` (as today).
   - Null out lingering refs to source wallets from NON-source rows (count → nulledWalletRefs):
     `positions SET walletId=null`, `portfolioTransactions SET walletId=null`
     (both: walletId in sourceWalletIds AND portfolioId NOT in sourcePortfolioIds),
     `walletTransactions SET toWalletId=null` (toWalletId in sourceWalletIds — source rows
     already deleted, so only non-source remain), `portfolios SET walletId=null`
     (walletId in sourceWalletIds, id NOT in sourcePortfolioIds).
   - Delete source `portfolios`, then `wallets`, then `syncRuns` (as today).
   - Return `{ deleted: { walletTransactions, portfolios, wallets, syncRuns, positions,
     portfolioTransactions, valueSnapshots, shares, portfolioBackfillMetadata,
     nulledWalletRefs } }`.
4. Update `src/routes/import.test.ts` wipe tests: they use `toEqual` on the exact `deleted`
   object (3 places: ~L290, ~L320, ~L331) — add the new keys (0s in those cases). ADD a new
   test: source portfolio w/ position + valueSnapshot row + share + backfill metadata + a
   NON-source portfolio whose position references the source wallet → wipe → derived rows
   gone, non-source position survives with walletId nulled, response counts correct.
5. `npm run build` + `npm run test` → commit → push → v1.1.37.
6. homelab: bump wallets tag v1.1.36 → v1.1.36→**v1.1.37** in
   `cluster/apps/pfire/portfoliost-wallets/app/helmrelease.yaml` (2 places) → commit
   `chore(pfire): portfoliost-wallets v1.1.37 — complete source wipe` → `git pull --rebase
   origin main` (bot commits land often!) → push. Wait `.status.updatedReplicas=1` for deploy
   `portfoliost-wallets` (namespace pfire).

**Step 2 — sheets-sync job: date-sort + 1:1 portfolios (v1.0.2)**
- `src/sync.ts`: after `restateSplits(rows)` + instrument resolution, before the batch loop:
  `rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))` (Node sort is
  stable → ties keep sheet order). Log `sorted by date` line.
- 1:1: replace single `bootstrapPortfolio({name: "Transakcje"...})` with a loop over
  `walletRes.wallets`: `bootstrapPortfolio({ externalSource, name: w.name, currency: w.currency,
  baseCurrency: w.baseCurrency })` → `portfolioIdByWalletName: Record<string,string>`.
  Delete `PORTFOLIO_NAME`. Pass the map to `mapRow`.
- `src/transakcje-mapper.ts`: `mapRow(row, walletUuidMap, portfolioIdByWalletName)` —
  `const portfolioId = portfolioIdByWalletName[target.walletName]` (throw if missing, like
  the wallet check).
- Tests: sync/mapper tests for sort (out-of-order dates → sorted; equal dates keep order)
  and 1:1 mapping (Konto IB row → portfolio "IBKR"; unknown map entry throws).
  `npm run build` + `npm run test` → commit → push → v1.0.2.

**Step 3 — admin: pin new job image (v1.0.45)**
- `~/prv/pfire/portfoliost-admin/src/sheets-sync.ts`: default image
  `v1.0.1` → `v1.0.2` (the `SHEETS_SYNC_IMAGE` fallback in `sheetsSyncImage()`); adjust the
  test that asserts the image ref (sheets-sync.test.ts expects `...:v1.0.1`).
- build+test → commit → push → v1.0.45. homelab admin tag bump → commit
  `chore(pfire): portfoliost-admin v1.0.45` → rebase → push.

**Step 4 — Wipe & re-import E2E (user passkey in MCP browser)**
- Navigate in-app: Admin → Jobs → click **Wipe & re-import** (confirm dialog).
- Wait for K8s job (kubectl logs -n pfire job/portfoliost-sheets-sync). Expect: wipe counts
  non-zero; `bootstrapped 10 wallets (0 created)`; **10 portfolios** (created=true);
  `done: inserted≈2024 skipped=7 errors=0 walletOnly=1 noOp=1` (sheet total 2025 rows).
  If errors>0 → inspect the listed rows (sheet data issue, not code).
- Verify positions landed in per-Konto portfolios (kubectl exec postgres or SPA UI:
  portfolio "IBKR" shows IB positions, etc.).

**Step 5 — Closeout**
- `pfire-docs/docs/plan.md` §24.9: check all boxes; note (a) caller-JWT gotchas (raw token, PORTFOLIOST_
  client-ID collision), (b) wallets v1.1.36/37 releases, (c) date-sort, (d) 1:1 model,
  (e) wipe completeness. Commit `docs(plan): mark 24.9 done — ...`.
- Delete this cache.md.

## User preferences (must keep following)

- **Always use semble** (MCP) for file/code search — user reminded me twice.
- PORTFOLIOST_-prefixed unique names for sheets-sync Google creds (KeePass titles ==
  placeholders; 3 entries exist; user manages values).
- KUBECONFIG=$HOME/.kube/homylab-tailscale. One commit per step; tests before commit.
- Never push homelab before encode.py runs (only relevant if NEW secret placeholders added).
- AGENTS.md: example-service parity, skip-list (news/copilot/alerts/...), don't touch Top10 in example-service.
- User works fast & catches mistakes — verify rollout fully before triggering jobs.

## Repo states at handoff

- wallets: clean tree @ da733d6 (origin=main). contracts: clean @ feb262e (publish unverified).
  sheets-sync: clean @ v1.0.1. admin: clean @ v1.0.44. SPA: clean @ v1.0.165 (untracked
  cache.md only). homelab: clean @ 0f9a52728 (origin=main).
- Compose stack (`~/prv/pfire/portfoliost`, docker compose) is UP & green.
- KB: entry id=5 `portfoliost/sheets-sync/user-preferences-secrets-naming` (semble + naming).
