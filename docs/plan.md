# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

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

- [x] Job should emit some logs to verify what it's doing in a runtime. Like a discovered emission,
  or succesfully imported emission. This is to verify that the CronJob is actually running and doing
  something. — openst `51f7fc3` (GHA v1.1.23): one INFO line per enumerated page, per emission
  parsed and per symbol inserted (duplicates at DEBUG), plus a `done` line with
  fetched/parsed/inserted + elapsed. 4 new tests; openst compose suite 236 passed.

### 22.1 — homelab: bond-import daily incremental + bond-archive monthly CronJobs

- [x] In `homelab/cluster/apps/pfire/openst/app/helmrelease.yaml` add two controllers mirroring the
      existing `cpi-import` CronJob (app-template v5.1.0, image `ghcr.io/marx2/openst:<tag>`,
      `DATABASE_URL` from `postgres-pfire-pguser-openst` secret, `TZ`/`PYTHONUNBUFFERED` env):
      - `bond-import` — `type: cronjob`, `schedule: "30 4 * * *"` (daily 04:30 UTC),
        `concurrencyPolicy: Forbid`, command `python -m src.importers.bond_series --mode incremental`.
      - `bond-archive` — `type: cronjob`, `schedule: "0 6 3 * *"` (3rd of month 06:00 UTC, after the
        1st-of-month sale start is published), `concurrencyPolicy: Forbid`,
        command `python -m src.importers.bond_series --mode archive`. Idempotent
        (`ON CONFLICT DO NOTHING`), so a missed/unlucky run self-heals next month.
- [x] Verify locally: `kubectl kustomize cluster/apps/pfire/openst/app` renders both CronJobs with
      the new image tag; `git pull --rebase && git push`; Flux picks both up.
      Homelab `6d7fb480d`: both CronJobs render on `ghcr.io/marx2/openst:v1.1.23`
      (`helm template` against the pulled app-template 5.1.0 chart) and Flux reconciled
      (`pfire/openst.v45`). The two raw one-shot Job manifests went away with them —
      kustomize re-applied them every 30m sync, so a TTL self-deleted Job came back and
      re-ran (the archive backfill was scraping 449 pages per sync); everything openst runs
      is now a HelmRelease controller, and the CPI full-history seed survives as a suspended
      `cpi-seed` CronJob for manual runs.
- [x] Tests: none new — config-only; the `incremental` and `archive` code paths pass their openst
      compose suite in 21.2/21.3.
- [x] Commit: `chore(openst): recurring bond_series CronJobs (daily incremental + monthly archive)`
      (homelab `6d7fb480d`).

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