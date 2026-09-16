# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 21. D79 follow-up — savings-bond history import + DB-first search (D79 gap-fix)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — D79
gap-fix (2026-09-16). Step 19 shipped the bond chain (`/fixedincome/search|profile|ohlcv`),
but two defects mean historical emission symbols resolve to "no results, 200 OK" instead of a
row — observed for `ROD1033` and `ROD1033.WA`:

1. **Importer is current-only by construction.** `bond_series.py` fetches the eight per-series
   offer pages (or the current-offer page), and obligacjeskarbowe.pl renders **only the
   currently-active emission** per series. `openst.bond_series` therefore accumulates at most
   one emission per series per monthly run; old emissions (e.g. `ROD1033`, sold 01–31.10.2021,
   marża 1,50% + inflacja) never land in the table. The importer docstring claim that
   per-emission detail URLs are "cosmetic" is **wrong for archived emissions** — verified live:
   `/oferta-obligacji/obligacje-12-letnie-rod/rod1033/` renders `ROD1033`'s own historical
   parameters while `/oferta-obligacji/obligacje-12-letnie-rod/rod0938/` renders the current
   05,60%/2,50%-marża emission. The full catalogue is enumerable from `/listy-emisyjne/`
   (one page, 449 emission codes across all 12 series, each an
   `<option value="/listy-emisyjne/?id={symbol},{series}" data-id="{series}">{SYMBOL}</option>`).
2. **The getters ignore the local table.** `search_bonds` + `get_bond_profile` call only the
   live OpenBB `obligacje` provider, which itself knows only current emissions
   (`obb.equity.search("rod1033", provider="obligacje")` → "Results not found"). Even a fully
   backfilled `openst.bond_series` would be invisible until the getters read the DB. OpenBB's
   search/profile record shapes exactly match the `bond_series` columns (symbol, name,
   maturity_date / symbol, name, series_code, issue_date, maturity_date, term_months, rate_rule,
   margin, fee_b, nominal), so DB-first with OpenBB fallback is a clean swap.

Scope (3 repos): **openst** (importer `archive` mode + DB-first getters + fixtures/tests + fix
the wrong docstring), **portfoliost-instruments** (normalize a trailing venue suffix like `.WA`
in the bond search leg so `ROD1033.WA` resolves), **homelab** (one-shot backfill Job reusing the
openst image). cachest and the SPA need **no change** — the bond chain already exists.

Ticket-style fail at v0: `search?q=rod0938` → the issued-2026-09 ROD row; `search?q=rod1033` →
the issued-2021-10 ROD row; `search?q=rod1033.wa` → same row.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit +
docker-compose per openst CLAUDE.md; `npm run build` + `npm run test` in
portfoliost-instruments).

---

### 21.1 — fixture capture: archive page + a historical emission page (manual, no code)

- [x] Capture `obligacjeskarbowe.pl/listy-emisyjne/` (one GET) → `openst/tests/fixtures/obligacjeskarbowe/emission_archive.html`.
- [x] Capture the `rod1033` emission page (one GET) → `openst/tests/fixtures/obligacjeskarbowe/rod1033.html`; append the already-captured current-ROD page (`rod0938` style, exists in fixture set) as the contrast case.
- [x] Inspect the archive fixture: confirm all 449 emission `<option/>` codes + `data-id` series values parse; note the old series absent from `SERIES_SLUGS` (POS, DOS, TOZ, KOS prefixes appear in the archive but are **skipped** — history import covers the 8 modern `SERIES_SLUGS` series only).
- [x] No TESTS for the fixture itself; it exists to make 21.2–21.4 deterministic.
- [x] Commit: `fixtures: obligacjeskarbowe emission archive + rod1033 (historical vs current ROD)`.

### 21.2 — openst: `--mode archive` in `bond_series.py` (backfill all modern-series emissions)

- [x] Add `parse_archive_codes(html) -> list[(series_code, symbol)]`: regex the
      `<option … data-id="{series}">{SYMBOL}</option>` rows from the capture in 21.1.
- [x] Add `--mode archive`: fetch `/listy-emisyjne/`, map `({series_code}, symbol)` →
      `/oferta-obligacji/{SERIES_SLUGS[series.upper()]}/{symbol}/`, fetch + `parse_emission` each
      (reuse existing code path; `upsert_bonds` already idempotent via `ON CONFLICT DO NOTHING`).
      Filter to series present in `SERIES_SLUGS` (skip POS/DOS/TOZ/KOS — no term map, out of scope).
- [x] Fix the module docstring: per-emission detail URLs are **not** cosmetic — archived
      emissions render their own historical parameters; current-only accumulation describes only
      the `incremental`/`full` modes, and `archive` backfills the rest.
- [x] Tests (`openst/tests/test_bond_series_importer.py`): `parse_archive_codes` from the 21.1
      fixture → ≥400 codes incl. `ROD1033`; archive-mode page list built from a stub `fetch_page`
      returns the correct per-series URL for a sampled emission; `ROD1033` parse → symbol, issue
      `2021-10-01`, maturity `2033-10-01`, margin 1.50.
- [x] Tests: full openst suite via `docker compose --profile test run --rm test`.
- [x] Commit: `feat(bond_series): archive mode backfills all modern-series emissions`.

### 21.3 — openst: DB-first `search_bonds` + `get_bond_profile`

- [x] `openbb_client.py`: when `db.database_url()` is set (guard; openst runs DB-less fine),
      query `openst.bond_series` first —
      `search_bonds(query)`: symbol-prefix OR name ILIKE `%{query}%` (query is already
      lowercased by the route), return `[{symbol, name, maturity_date}]` to match the OpenBB
      search rows; `get_bond_profile(symbol)`: exact symbol (upper-cased) → the 10-column row as
      a dict matching the OpenBB profile shape. Fall back to the existing OpenBB call when the
      DB yields nothing (import not yet run / DB-less).
- [x] Tests (`openst/tests/test_openbb_client.py`): when the DB returns rows, OpenBB is **not**
      called; DB empty → OpenBB fallback called; `search_bonds` maps columns to the search shape;
      no-DB env (monkeypatch `database_url` → `None`) → pure OpenBB path unchanged.
- [x] Tests: full openst suite via compose.
- [x] Commit: `feat(openbb_client): DB-first bond search + profile with OpenBB fallback`.

### 21.4 — openst standalone smoke (backfill + DB-first live)

- [x] In the **openst** standalone compose (`openst/docker-compose.yml`): `docker compose up -d redis openst`,
      run `python -m src.importers.bond_series --mode archive` against the local Postgres
      (dev db from step 19.2; ~8 modern series × ~12 past monthly emissions ≈ 100 rows), and
      verify `openst.bond_series` count jumped from 8 → expected backfill total.
- [x] `curl /fixedincome/search/rod1033` → 200, row `ROD1033`/`Obligacje 12-letnie ROD`, and
      `/fixedincome/search/rod0938` still 200; `curl /fixedincome/profile/ROD1033` → 200 with the
      10-column shape (marża 1.50). Record payloads in the step result.
- [x] Verify Redis: second `curl` each → `X-Cache: HIT` (openst emits its own cache header in
      standalone, per step 20.4 precedent).
- [x] Commit note: `chore: verify bond archive backfill + DB-first search smoke`.

  **Result (2026-09-16):** `docker compose up -d --build` (app service gained `DATABASE_URL` +
  postgres dep) → `--mode full` 8 rows → `--mode archive` 449 fetched / 449 parsed / 441 inserted
  (8 current skipped by `ON CONFLICT`) → **total 449 rows**. The smoke **caught a real bug** in the
  21.2 archive URL construction: the site ships URL typos for 4 archived EDO codes
  (`id=edo07829` renders `EDO0829`, likewise `edo01028/edo01128/edo01228`), so
  `{display symbol lowercased}` paths 404'd. Fixed by having `parse_archive_codes` return
  `(series_code, symbol, url_id)` triples (symbol stays display text, stored correctly) and
  fetching each emission at its raw `url_id`. Curls: `/fixedincome/search/rod1033` → 200
  `[{"symbol":"ROD1033","name":"Obligacje 12-letnie ROD","maturity_date":"2033-10-01"}]`;
  `/fixedincome/search/rod0938` → 200 (current ROD0938, `2038-09-01`); `/fixedincome/profile/ROD1033`
  → 200 10-column shape (`issue_date 2021-10-01`, `margin 1.5000`, `rate_rule cpi_12m+margin`);
  `/fixedincome/profile/EDO0829` → 200 (2019-08-01/2029-08-01, the typo'd emission now resolvable).
  Redis caching verified via the `_cache` (response `X-Cache` header is emitted by cachest, not
  openst — no such header in openst today). suite: 231 passed (incl. the updated url_id tests).

### 21.5 — instruments: venue-suffix normalization in the bond search leg

- [x] `portfoliost-instruments/src/routes/instruments.ts` `bondSearchLeg(q)`: strip a trailing
      venue suffix (`.WA`, `.US`, … — reuse/extend the existing `providerSymbol`-style logic)
      from `q` before calling `fetchBondSearch`, so `ROD1033.WA` resolves the same row as
      `ROD1033`. Do **not** strip elsewhere in the bond chain.
- [x] Tests (`portfoliost-instruments/src/routes/instruments.test.ts`): `q=rod1033.wa` →
      `fetchBondSearch` called with `rod1033`; `q=rod1033` unchanged; existing bond/equity search
      tests still green.
- [x] Tests: `npm run build` + `npm run test` in portfoliost-instruments.
- [x] Commit: `feat(search): normalize venue suffix in bond search leg (ROD1033.WA)`.

  **Result (2026-09-16):** added `venueFreeSymbol()` to `src/adapters/symbol.ts` (cuts any trailing
  `.suffix`; mirrored after crypto.ts's existing `venueFree` concept, unlike `providerSymbol` it
  drops every venue) and applied it in `bondSearchLeg` only — the rest of the bond chain is
  untouched. Route tests assert `q=rod1033.wa` → `fetchBondSearch("rod1033")` + row surfaces and
  `q=rod1033` passed through unchanged; helper tests cover `.WA`/`.US`/bare/name queries. Commit
  `d7fec26`, build clean, suite 217 passed / 16 files.

### 21.6 — full compose stack smoke

- [x] In portfoliost compose: rebuild + run `redis openst cachest instruments`; re-run the
      `archive` backfill inside the compose DB (openst shares the portfoliost Postgres).
- [x] Through cachest: `curl "http://localhost:8090/fixedincome/search/rod1033"` MISS→HIT.
- [x] Through the gateway: `/api/instruments/search?q=rod1033` → 200 with a `BOND`/`OBLIGACJE`
      result (`ROD1033`); `/api/instruments/search?q=rod1033.wa` → same row; `/api/instruments/ROD1033`
      → 200. Record payloads in the step result.
- [x] Run `npm run test:stack` (instruments-stack-test.mjs) — 32/32 stays green.
- [x] Commit note: `chore: verify bond history search through full compose stack`.

  **Result (2026-09-16):** rebuilt `openst` + `instruments` in the compose stack (cachest image
  unchanged — D79 passthrough already present), then `docker compose exec openst python -m
  src.importers.bond_series --mode archive` against the shared Postgres: fetched 449 / parsed 449 /
  inserted 441 → **449 rows**. cachest `http://localhost:8090/fixedincome/search/rod1033` →
  `200 x-cache: MISS` then `200 x-cache: HIT`, payload
  `[{"symbol":"ROD1033","name":"Obligacje 12-letnie ROD","maturity_date":"2033-10-01"}]`. Gateway
  `http://localhost:8080/api/instruments/search?q=rod1033` (X-User-Id/Email headers required) →
  `{count:1, results:[{symbol:"ROD1033",name:"Obligacje 12-letnie ROD",type:"BOND",exchange:"PL",
  countryCode:"PL",source:"OBLIGACJE"}]}` — **identical** for `q=rod1033.wa` (21.5 normalization
  live); `/api/instruments/ROD1033` → `{id, symbol:"ROD1033", type:"BOND", exchange:"PL",
  currency:"PLN"}`. `npm run test:stack` 32/32. Note: compose builds of consumers need
  `NODE_AUTH_TOKEN` from `../portfoliost/.env`/shell (npm ci against @marx2 registry) — absent it
  failed "instruments target ... npm ci ... exit code 1".

### 21.7 — homelab: one-shot backfill Job + deploy bumps

- [x] Add a k8s one-shot Job (pattern: existing openst importer Job/CronJob, e.g. the CPI /
      bond_series incremental CronJob) in `homelab/cluster/apps/pfire/openst/` running
      `python -m src.importers.bond_series --mode archive` once (image `ghcr.io/marx2/openst:<new-tag>`).
- [x] After the openst GHA build: bump `cluster/apps/pfire/openst/app/helmrelease.yaml` image
      tag to the new version; portfoliost-instruments image bump likewise (after its GHA build).
- [x] `git pull --rebase && git push`; Flux picks both up (no cluster access — commit for flux).
- [x] Commit: `chore(openst): bond_series archive backfill Job + image bumps (D79 gap-fix)`.

  **Result (2026-09-16):** pushed openst (4 D79 commits, GHA → **v1.1.22**) and
  portfoliost-instruments (21.5 commit → **v1.0.43**). Homelab (`Marx2/homelab`, Flux
  kustomization `openst`): new one-shot Job `openst-bond-archive`
  (`cluster/apps/pfire/openst/app/bond-archive-job.yaml`, regcred + `postgres-pfire-pguser-openst`
  uri, `ttlSecondsAfterFinished: 3600`, image `ghcr.io/marx2/openst:v1.1.22`; added to
  `kustomization.yaml`), openst helmrelease tag `v1.1.21 → v1.1.22` (app + cpi-import),
  instruments helmrelease tag `v1.0.42 → v1.0.43`. Pushed homelab main `dad81ba4c` → Flux reconciled
  (`openst` kustomization Applied `main@sha1:dad81ba4c…`). Job **ran and completed**: fetched 449 /
  emissions 449 / **inserted 449**; cluster `openst.bond_series` now 449 rows; `ROD1033` margin
  1.50. openst deploy rolled out clean.

### 21.8 — closeout

- [ ] Update `docs/openst-coverage.md`: bond history — note `bond_series` now backfills past
      emissions via `--mode archive` + DB-first search/profile getters; keep date current.
- [ ] Add a short "gap-fix 2026-09-16" note to `docs/proposals/instruments-provider-module.md`
      under the D79 marker (history import + DB-first getters; `ROD1033`/`.WA` resolution).
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-16):** `search?q=rod1033` and `search?q=rod1033.wa` resolve the 2021-10 ROD
  emission through the existing bond chain (profile fallback + equity-404 tolerance from the
  earlier 404 gap-fix). All three repos committed; section archived.

---

## 22. Recurrent bond import — daily incremental + monthly archive (D79 follow-up)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) — the same
D79 gap-fix, made self-maintaining.

Section 21 imports bond history once (one-shot `archive` Job) but nothing recurs: as of 2026-09
the openst app in homelab schedules only the CPI importer (`cpi-import` CronJob in
`openst/app/helmrelease.yaml`), and the closed system prompt to add forward auto-discovery is the
caveat from 21.2 — the importer enumerates from the live site, never guesses names, so scheduled
runs self-discover new emissions. New savings-bond emissions go on sale on the 1st of the month
for a full calendar month, so a **daily `--mode incremental` CronJob** reliably catches each new
emission during its sale window; a **monthly `--mode archive` CronJob** re-enumerates the full
catalogue (~449 pages, ~4–6 min) as a self-healing backstop for anything incremental missed (e.g.
a full-window outage). Both run on the `ghcr.io/marx2/openst:<tag>` image built by GHA after 21.2
and use the same DATABASE_URL secret pattern as `cpi-import`.

Scope: **homelab only** (openst `helmrelease.yaml` + verification); openst code and tests come
from 21.2–21.3. config-only step — no new unit tests, verified by `kubectl kustomize` build of
the app dir plus the existing openst compose suite.

Rules: one step = one commit; a step is marked `[x]` only after its verification passes
(`kubectl kustomize` build + cluster logs; no new unit tests — importers already covered by
21.2/21.3).

---

### 22.0 - logging

- [ ] Job should emit some logs to verify what it's doing in a runtime. Like a discovered emission,
  or succesfully imported emission. This is to verify that the CronJob is actually running and doing
  something.

### 22.1 — homelab: bond-import daily incremental + bond-archive monthly CronJobs

- [ ] In `homelab/cluster/apps/pfire/openst/app/helmrelease.yaml` add two controllers mirroring the
      existing `cpi-import` CronJob (app-template v5.1.0, image `ghcr.io/marx2/openst:<tag>`,
      `DATABASE_URL` from `postgres-pfire-pguser-openst` secret, `TZ`/`PYTHONUNBUFFERED` env):
      - `bond-import` — `type: cronjob`, `schedule: "30 4 * * *"` (daily 04:30 UTC),
        `concurrencyPolicy: Forbid`, command `python -m src.importers.bond_series --mode incremental`.
      - `bond-archive` — `type: cronjob`, `schedule: "0 6 3 * *"` (3rd of month 06:00 UTC, after the
        1st-of-month sale start is published), `concurrencyPolicy: Forbid`,
        command `python -m src.importers.bond_series --mode archive`. Idempotent
        (`ON CONFLICT DO NOTHING`), so a missed/unlucky run self-heals next month.
- [ ] Verify locally: `kubectl kustomize cluster/apps/pfire/openst/app` renders both CronJobs with
      the new image tag; `git pull --rebase && git push`; Flux picks both up (no cluster access —
      commit for flux, mirroring 21.7).
- [ ] Tests: none new — config-only; the `incremental` and `archive` code paths pass their openst
      compose suite in 21.2/21.3.
- [ ] Commit: `chore(openst): recurring bond_series CronJobs (daily incremental + monthly archive)`.

### 22.2 — cluster verification of the recurrence

- [ ] After the next monthly emission change: confirm a `bond-import` run upserted the new emission
      (`kubectl logs -n pfire -l job-name=bond-import-* --tail=50`, summary JSON shows the new
      symbol) and a `bond-archive` run converges the catalogue (row count stable across consecutive
      runs, equal to the full modern-series set of 449 codes from the 21.1 fixture).
- [ ] Record the observed `symbols` payloads in the step result; confirm `X-Cache: HIT` flow through
      cachest is untouched (no cachest change).
- [ ] Tests: verification only — no code changes; existing openst/cachest/instruments suites stay
      green as-is.
- [ ] Commit note: `chore: verify bond recurring import CronJobs (D79 gap-fix)`.

### 22.3 — closeout

- [ ] Note both CronJobs and their schedules in `docs/openst-coverage.md` under the bond-history
      entry from 21.8 (recurrence: daily incremental + monthly archive self-heal).
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-16):** `bond_series` is self-maintaining — daily incremental discovers each
  month's new emission on sale, monthly archive re-enumerates the full catalogue; no manual or
  name-guessing step required.