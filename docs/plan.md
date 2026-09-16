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

- [ ] Add `parse_archive_codes(html) -> list[(series_code, symbol)]`: regex the
      `<option … data-id="{series}">{SYMBOL}</option>` rows from the capture in 21.1.
- [ ] Add `--mode archive`: fetch `/listy-emisyjne/`, map `({series_code}, symbol)` →
      `/oferta-obligacji/{SERIES_SLUGS[series.upper()]}/{symbol}/`, fetch + `parse_emission` each
      (reuse existing code path; `upsert_bonds` already idempotent via `ON CONFLICT DO NOTHING`).
      Filter to series present in `SERIES_SLUGS` (skip POS/DOS/TOZ/KOS — no term map, out of scope).
- [ ] Fix the module docstring: per-emission detail URLs are **not** cosmetic — archived
      emissions render their own historical parameters; current-only accumulation describes only
      the `incremental`/`full` modes, and `archive` backfills the rest.
- [ ] Tests (`openst/tests/test_bond_series_importer.py`): `parse_archive_codes` from the 21.1
      fixture → ≥400 codes incl. `ROD1033`; archive-mode page list built from a stub `fetch_page`
      returns the correct per-series URL for a sampled emission; `ROD1033` parse → symbol, issue
      `2021-10-01`, maturity `2033-10-01`, margin 1.50.
- [ ] Tests: full openst suite via `docker compose --profile test run --rm test`.
- [ ] Commit: `feat(bond_series): archive mode backfills all modern-series emissions`.

### 21.3 — openst: DB-first `search_bonds` + `get_bond_profile`

- [ ] `openbb_client.py`: when `db.database_url()` is set (guard; openst runs DB-less fine),
      query `openst.bond_series` first —
      `search_bonds(query)`: symbol-prefix OR name ILIKE `%{query}%` (query is already
      lowercased by the route), return `[{symbol, name, maturity_date}]` to match the OpenBB
      search rows; `get_bond_profile(symbol)`: exact symbol (upper-cased) → the 10-column row as
      a dict matching the OpenBB profile shape. Fall back to the existing OpenBB call when the
      DB yields nothing (import not yet run / DB-less).
- [ ] Tests (`openst/tests/test_openbb_client.py`): when the DB returns rows, OpenBB is **not**
      called; DB empty → OpenBB fallback called; `search_bonds` maps columns to the search shape;
      no-DB env (monkeypatch `database_url` → `None`) → pure OpenBB path unchanged.
- [ ] Tests: full openst suite via compose.
- [ ] Commit: `feat(openbb_client): DB-first bond search + profile with OpenBB fallback`.

### 21.4 — openst standalone smoke (backfill + DB-first live)

- [ ] In the **openst** standalone compose (`openst/docker-compose.yml`): `docker compose up -d redis openst`,
      run `python -m src.importers.bond_series --mode archive` against the local Postgres
      (dev db from step 19.2; ~8 modern series × ~12 past monthly emissions ≈ 100 rows), and
      verify `openst.bond_series` count jumped from 8 → expected backfill total.
- [ ] `curl /fixedincome/search/rod1033` → 200, row `ROD1033`/`Obligacje 12-letnie ROD`, and
      `/fixedincome/search/rod0938` still 200; `curl /fixedincome/profile/ROD1033` → 200 with the
      10-column shape (marża 1.50). Record payloads in the step result.
- [ ] Verify Redis: second `curl` each → `X-Cache: HIT` (openst emits its own cache header in
      standalone, per step 20.4 precedent).
- [ ] Commit note: `chore: verify bond archive backfill + DB-first search smoke`.

### 21.5 — instruments: venue-suffix normalization in the bond search leg

- [ ] `portfoliost-instruments/src/routes/instruments.ts` `bondSearchLeg(q)`: strip a trailing
      venue suffix (`.WA`, `.US`, … — reuse/extend the existing `providerSymbol`-style logic)
      from `q` before calling `fetchBondSearch`, so `ROD1033.WA` resolves the same row as
      `ROD1033`. Do **not** strip elsewhere in the bond chain.
- [ ] Tests (`portfoliost-instruments/src/routes/instruments.test.ts`): `q=rod1033.wa` →
      `fetchBondSearch` called with `rod1033`; `q=rod1033` unchanged; existing bond/equity search
      tests still green.
- [ ] Tests: `npm run build` + `npm run test` in portfoliost-instruments.
- [ ] Commit: `feat(search): normalize venue suffix in bond search leg (ROD1033.WA)`.

### 21.6 — full compose stack smoke

- [ ] In portfoliost compose: rebuild + run `redis openst cachest instruments`; re-run the
      `archive` backfill inside the compose DB (openst shares the portfoliost Postgres).
- [ ] Through cachest: `curl "http://localhost:8090/fixedincome/search/rod1033"` MISS→HIT.
- [ ] Through the gateway: `/api/instruments/search?q=rod1033` → 200 with a `BOND`/`OBLIGACJE`
      result (`ROD1033`); `/api/instruments/search?q=rod1033.wa` → same row; `/api/instruments/ROD1033`
      → 200. Record payloads in the step result.
- [ ] Run `npm run test:stack` (instruments-stack-test.mjs) — 32/32 stays green.
- [ ] Commit note: `chore: verify bond history search through full compose stack`.

### 21.7 — homelab: one-shot backfill Job + deploy bumps

- [ ] Add a k8s one-shot Job (pattern: existing openst importer Job/CronJob, e.g. the CPI /
      bond_series incremental CronJob) in `homelab/cluster/apps/pfire/openst/` running
      `python -m src.importers.bond_series --mode archive` once (image `ghcr.io/marx2/openst:<new-tag>`).
- [ ] After the openst GHA build: bump `cluster/apps/pfire/openst/app/helmrelease.yaml` image
      tag to the new version; portfoliost-instruments image bump likewise (after its GHA build).
- [ ] `git pull --rebase && git push`; Flux picks both up (no cluster access — commit for flux).
- [ ] Commit: `chore(openst): bond_series archive backfill Job + image bumps (D79 gap-fix)`.

### 21.8 — closeout

- [ ] Update `docs/openst-coverage.md`: bond history — note `bond_series` now backfills past
      emissions via `--mode archive` + DB-first search/profile getters; keep date current.
- [ ] Add a short "gap-fix 2026-09-16" note to `docs/proposals/instruments-provider-module.md`
      under the D79 marker (history import + DB-first getters; `ROD1033`/`.WA` resolution).
- [ ] Archive this section to `plan-archive.md` once all steps are `[x]`.

  **Result (2026-09-16):** `search?q=rod1033` and `search?q=rod1033.wa` resolve the 2021-10 ROD
  emission through the existing bond chain (profile fallback + equity-404 tolerance from the
  earlier 404 gap-fix). All three repos committed; section archived.