# Admin Jobs Tab — Stooq Zip Upload & Import

Date: 2026-08-29  
Last updated: 2026-08-30  
Status: **Implemented and deployed** (portfoliost-admin v1.0.19, jobshot 1.6.1)

---

## Problem

The `stooq-importer` CronJob that loads stooq bulk-download zip files into Postgres currently
requires manual cluster-level intervention to run with a different source file. The existing
job is configured to read from a fixed NFS path (`/home/stooq/data/usa_daily.zip`) and targets
only the USA daily dataset. To import other zip types (UK, Japan, hourly data, etc.), an
operator must SSH in, copy the file to NFS, patch the ConfigMap, and manually trigger the
CronJob — a multi-step, error-prone process inaccessible from the admin UI.

The Jobs tab defined in `price-data-architecture.md` already exists as a design stub but has
only disabled "Run" buttons and no file upload capability. This proposal closes the gap: add
a working stooq import flow where an admin can upload a zip downloaded from stooq.pl and
trigger a Kubernetes Job that ingests it into the `stooq` database.

---

## Scope

| In scope | Out of scope |
|---|---|
| Admin Jobs tab UI with upload + trigger per dataset | Scheduling / CronJob automation |
| Temporary file upload to shared PVC (1 GB max) | Permanent NFS storage of uploaded zips |
| Kubernetes Job creation via jobshot backend | Modifying the stooq-downloader CronJob |
| All stooq dataset types (daily, hourly, 5-min; all regions) | Incremental / append import mode |
| Import status polling in the UI | Email/push notifications on job completion |
| Cleanup of the temp file after import | Broker import, news, alerts (per AGENTS.md exclusions) |
| Contracts-first: new endpoints defined in openapi.yaml first | — |

---

## Stooq zip file types and target tables

Stooq publishes bulk-download archives for multiple regions and timeframes. Each zip maps to
a separate table in the `stooq` database:

| Region | Timeframe | Stooq folder | Expected zip name | Target table | Approx. size |
|---|---|---|---|---|---|
| World | Daily | `world` | `d_world_txt.zip` | `daily_world` | ~183 MB |
| World | Hourly | `world` | `h_world_txt.zip` | `hourly_world` | ~245 MB |
| World | 5-min | `world` | `5_world_txt.zip` | `5min_world` | ~450 MB |
| U.S. | Daily | `us` | `d_us_txt.zip` | `daily_us` | ~517 MB |
| U.S. | Hourly | `us` | `h_us_txt.zip` | `hourly_us` | ~437 MB |
| U.S. | 5-min | `us` | `5_us_txt.zip` | `5min_us` | ~595 MB |
| U.K. | Daily | `uk` | `d_uk_txt.zip` | `daily_uk` | ~157 MB |
| U.K. | Hourly | `uk` | `h_uk_txt.zip` | `hourly_uk` | ~171 MB |
| U.K. | 5-min | `uk` | `5_uk_txt.zip` | `5min_uk` | ~177 MB |
| Japan | Daily | `jp` | `d_jp_txt.zip` | `daily_jp` | ~219 MB |
| Hong Kong | Daily | `hk` | `d_hk_txt.zip` | `daily_hk` | ~104 MB |
| Hong Kong | Hourly | `hk` | `h_hk_txt.zip` | `hourly_hk` | ~42 MB |
| Hong Kong | 5-min | `hk` | `5_hk_txt.zip` | `5min_hk` | ~51 MB |
| Poland | Daily | `pl` | `d_pl_txt.zip` | `daily_pl` | ~200 MB zip / ~1.4 GB extracted |
| Poland | Hourly | `pl` | `h_pl_txt.zip` | `hourly_pl` | ~29 MB |
| Poland | 5-min | `pl` | `5_pl_txt.zip` | `5min_pl` | ~28 MB |
| Hungary | Daily | `hu` | `d_hu_txt.zip` | `daily_hu` | ~1.7 MB |
| Hungary | Hourly | `hu` | `h_hu_txt.zip` | `hourly_hu` | ~1.0 MB |
| Hungary | 5-min | `hu` | `5_hu_txt.zip` | `5min_hu` | ~0.8 MB |
| Macroeconomy | Daily | `macro` | `d_macro_txt.zip` | `daily_macro` | ~0.9 MB |

**Zip structure:** Each zip contains one CSV file per ticker (e.g. `AAPL.US.txt`), nested in
subdirectories by region/exchange. `daily_pl` contains ~13,000 files. pgloader extracts the
zip to its own temp directory (not the PVC) and streams each file sequentially.

**CSV schema:** `<TICKER>,<PER>,<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOL>,<OPENINT>`

**Important:** `VOL` (volume) and `OPENINT` can be floating-point values (e.g.
`6337948.989247318`) — these must be stored as `NUMERIC(28,8)`, not `BIGINT`.

**Split adjustments:** Stooq retroactively adjusts historical OHLCV for all tickers when a
split occurs. Every import is a full replacement — there is no incremental format and no value
in caching extracted CSVs between imports.

---

## Architecture

```
Admin browser
  │
  ├─ 1. Admin selects dataset (e.g. daily_pl) + zip file
  │
  ├─ 2. POST /api/admin/jobs/stooq-import/upload?dataset=daily_pl
  │      multipart/form-data: { file: <zip> }
  │      dataset is a query param (read before touching multipart body)
  │      → portfoliost-admin
  │           → busboy streams file to hostPath PVC on kaczka
  │              /tmp/stooq-uploads/daily_pl-<uuid>.zip
  │              returns { uploadId, dataset, sizeBytes }
  │
  ├─ 3. POST /api/admin/jobs/stooq-import/run
  │      { dataset: "daily_pl", uploadId }
  │      → portfoliost-admin
  │           → POST jobshot /api/run-job  (job spec with volumes, nodeSelector)
  │                → jobshot BatchV1Api.createNamespacedJob(...)
  │                   returns { jobName, namespace }
  │
  └─ 4. GET /api/admin/jobs/stooq-import/status?dataset=daily_pl  (every 30s, no timeout)
           → portfoliost-admin → jobshot GET /api/job-status/:jobName?namespace=pfire
              → { status: "Running"|"Succeeded"|"Failed"|"NotFound" }
```

### Upload: busboy streaming, dataset as query param

`multer` was replaced with `busboy` + Node.js `pipeline()` to stream the zip directly to disk
with zero heap allocation. The `dataset` param is read from the URL query string
(`?dataset=daily_pl`) before touching the multipart body — this avoids any need to parse the
body to get the dataset value before streaming starts.

### Volume strategy: hostPath on kaczka

The original design used a Longhorn RWX PVC. This was changed to a **hostPath PV** on node
`kaczka` for better I/O throughput (direct NVMe, no Longhorn engine overhead).

- `kaczka` has the most free disk: ~120 GB free of 232 GB (45% used)
- `kura` (where Postgres runs) was 85% full — unsuitable
- Both the portfoliost-admin pod and the pgloader Job pod are pinned to `kaczka` via
  `nodeSelector: kubernetes.io/hostname: kaczka`

| Resource | Value |
|---|---|
| PV name | `stooq-upload-pv` |
| PVC name | `stooq-upload-pvc` |
| Host path | `/var/lib/stooq-uploads` on `kaczka` |
| Capacity | 2 Gi |
| Access mode | ReadWriteMany |
| Storage class | `""` (hostPath, no provisioner) |

### Import Kubernetes Job

portfoliost-admin sends the following to jobshot `/api/run-job`:

```json
{
  "name": "stooq-importer-daily-pl",
  "namespace": "pfire",
  "container": "dimitri/pgloader:ccl.latest",
  "entrypoint": ["/bin/sh"],
  "parameters": ["-c", "<shell script>"],
  "secretName": "postgres-pfire-pguser-postgres",
  "volumes": [{ "name": "stooq-upload", "persistentVolumeClaim": { "claimName": "stooq-upload-pvc" } }],
  "volumeMounts": [{ "name": "stooq-upload", "mountPath": "/tmp/stooq-uploads" }],
  "nodeSelector": { "kubernetes.io/hostname": "kaczka" },
  "resources": { "requests": { "cpu": "500m", "memory": "1Gi" }, "limits": { "cpu": "2000m", "memory": "4Gi" } }
}
```

`backoffLimit` is set to `0` in jobshot — failed jobs never auto-restart. A failed import must
be re-triggered manually from the UI after fixing the root cause.

### pgloader shell script (two-phase)

The job runs a shell script with two pgloader invocations:

**Phase 1 — bulk load into staging table:**

```
set -e
LOAD ARCHIVE
  FROM <zip>
  INTO postgres://postgres:$password@postgres-pfire-primary.pfire.svc:5432/stooq
  BEFORE LOAD DO
    $$ DROP TABLE IF EXISTS daily_pl_new; $$,
    $$ CREATE UNLOGGED TABLE daily_pl_new (...); $$
  LOAD CSV
    FROM ALL FILENAMES MATCHING ~/./
    INTO <dsn>
      TARGET TABLE daily_pl_new
      TARGET COLUMNS (ticker, period, date, time, open, high, low, close, volume, openint)
    WITH no truncate,
      skip header = 1,
      fields terminated by ',',
      fields not enclosed,
      batch size = 100 MB,
      batch concurrency = 4,
      workers = 8,
      concurrency = 2,
      disable triggers
    SET work_mem to '512 MB',
        maintenance_work_mem to '1024 MB',
        synchronous_commit to 'off',
        statement_timeout to '0',
        lock_timeout to '0',
        idle_in_transaction_session_timeout to '0',
        tcp_keepalives_idle to '60',
        tcp_keepalives_interval to '10',
        tcp_keepalives_count to '6';
```

**Phase 2 — post-load: SET LOGGED, build PK, atomic swap:**

Uses a second pgloader invocation (`LOAD CSV FROM INLINE`) with a single dummy row to execute
post-load SQL via `BEFORE LOAD DO`. This avoids any dependency on `psql` (not available in
the pgloader image — apt sources are broken on Debian Bullseye).

Zero-row `INLINE` crashes pgloader (known NIL type bug), so a real `pgloader_dummy` table is
created and one dummy row is loaded. `AFTER LOAD DO` drops it.

```
LOAD CSV
  FROM INLINE
  INTO <dsn>
  TARGET TABLE pgloader_dummy
  BEFORE LOAD DO
    $$ DROP TABLE IF EXISTS pgloader_dummy; $$,
    $$ CREATE TABLE pgloader_dummy (x int); $$,
    $$ SET maintenance_work_mem = '2GB'; $$,
    $$ SET statement_timeout = 0; $$,
    $$ ALTER TABLE daily_pl_new SET LOGGED; $$,
    $$ DELETE FROM daily_pl_new WHERE ctid IN (SELECT ctid FROM (SELECT ctid, row_number() OVER (PARTITION BY ticker, date, time ORDER BY ctid) AS rn FROM daily_pl_new) sub WHERE rn > 1); $$,
    $$ ALTER TABLE daily_pl_new ADD PRIMARY KEY (ticker, date, time); $$,
    $$ DO $swap$ BEGIN
         DROP TABLE IF EXISTS daily_pl;
         ALTER TABLE daily_pl_new RENAME TO daily_pl;
       END $swap$; $$
  AFTER LOAD DO
    $$ DROP TABLE IF EXISTS pgloader_dummy; $$
  WITH skip header = 0, fields terminated by ',';
1
```

**Why staging table + atomic swap:**
- `daily_pl` (the live table) stays queryable via `postgres_fdw` throughout the entire import
- Downtime window is the single `DO $swap$` block — sub-millisecond
- `UNLOGGED` table during load skips WAL entirely (~3-5x faster inserts)
- `ALTER TABLE ... SET LOGGED` before going live makes it durable
- `ADD PRIMARY KEY` after full load — single index build over complete dataset vs. incremental
  updates per batch (orders of magnitude faster for 20M+ rows)

**Tested locally** with pgloader 3.6.10 + postgres:16 in docker-compose on Apple Silicon
(native pgloader via Homebrew — the `dimitri/pgloader:ccl.latest` Docker image cannot run on
arm64 due to an SBCL/Rosetta signal handling bug).

### Postgres credentials

The PGO-managed secret `postgres-pfire-pguser-postgres` is injected via `envFrom`. The shell
variable `$password` (the key name in the secret) is used directly in the DSN:
`postgres://postgres:$password@postgres-pfire-primary.pfire.svc:5432/stooq`

No new SOPS secrets or manually managed Kubernetes Secrets are required.

---

## Performance tuning

### pgloader settings

| Setting | Value | Reason |
|---|---|---|
| `CREATE UNLOGGED TABLE` | staging table only | Skips WAL during bulk insert — 3-5x faster |
| `ALTER TABLE SET LOGGED` | before ADD PRIMARY KEY | Durable before going live |
| `synchronous_commit = off` | pgloader session | No WAL flush wait per batch commit |
| `batch size = 100 MB` | pgloader | Fewer COPY round-trips; 8 workers × 100 MB = 800 MB peak |
| `workers = 8, concurrency = 2` | pgloader | More parallel COPY streams |
| `maintenance_work_mem = 2 GB` | psql post-load step | Faster single-pass PK index build |
| `statement_timeout = 0` | pgloader + post-load | No per-statement kill during long COPY |
| `tcp_keepalives_idle = 60` | pgloader | Prevents network from killing idle COPY connection |
| Pod memory limit | 4 Gi | 8 workers × 100 MB batches + runtime headroom |

### Postgres cluster tuning (applied 2026-08-30)

Applied via `patroni.dynamicConfiguration.postgresql.parameters` in `postgrescluster-pfire.yaml`.
Requires pod restart (applied after the daily_pl import was complete):

| Parameter | Old | New | Reason |
|---|---|---|---|
| `shared_buffers` | 128 MB (default) | 2 GB | Larger page cache; fewer dirty page writeouts to Longhorn |
| `effective_cache_size` | unset | 8 GB | Planner hint (no RAM cost) |
| `wal_buffers` | 4 MB | 32 MB | WAL writes batched larger before flush |
| `max_wal_size` | 1 GB | 4 GB | Checkpoints 4× less frequent under bulk load |
| `min_wal_size` | 80 MB | 512 MB | Pre-allocated WAL segments |
| `wal_compression` | off | on | Reduces WAL I/O volume ~3×, no RAM cost |
| Pod memory request | unset | 2 Gi | Scheduler now reserves RAM for Postgres |
| Pod memory limit | unset | 5 Gi | Covers shared_buffers + working memory + connections |

**Note:** Postgres runs on `kura` (85% full disk, Longhorn PVC) — this is the primary
performance bottleneck. The Postgres data PVC is Longhorn on `kura`; every write goes through
the Longhorn engine. Moving Postgres to `kaczka` was considered but not done (non-trivial PGO
migration). The tuning above mitigates but does not eliminate this bottleneck.

**Observed import performance (daily_pl, ~24.7M rows, 1.4 GB extracted, 2026-08-31):**
- Extraction: ~15 seconds (200 MB zip → 1.4 GB, ~13,000 files)
- Bulk load (COPY): ~8 hours (Longhorn on kura bottleneck; UNLOGGED + no index active)
- Post-load (SET LOGGED + dedup + ADD PRIMARY KEY + rename): ~3 minutes
- Final row count: 24,733,409 (1987-01-02 → 2026-08-28)

---

## Status polling

The UI polls `GET /api/admin/jobs/stooq-import/status?dataset=...` every **30 seconds**
with **no timeout**. Imports take hours; the browser tab can be closed and reopened. Polling
stops only when the job reaches `Succeeded`, `Failed`, or disappears after having been
`Running` (jobshot cleans up completed jobs).

The previous 5-minute timeout (`MAX_POLL_MS`) was removed — it caused the UI to show
"Timed out" while the Kubernetes job was still running normally.

---

## API endpoints

### Upload

```
POST /api/admin/jobs/stooq-import/upload?dataset=<StooqDataset>
Authorization: Bearer <admin JWT>
Content-Type: multipart/form-data
Fields: file (.zip binary)

200: { uploadId, dataset, sizeBytes }
400: { error: "Invalid dataset" } | { error: "File must be a .zip archive" }
413: { error: "File exceeds 1 GB limit" }
```

`dataset` is a **query param** (not a form field) so the server can validate before touching
the multipart body. Uses `busboy` + `pipeline()` for zero-copy streaming to disk.

### Run

```
POST /api/admin/jobs/stooq-import/run
Authorization: Bearer <admin JWT>
Body: { dataset: "daily_pl", uploadId: "<uuid>" }

200: { jobName: "stooq-importer-daily-pl", namespace: "pfire", status: "Running" }
404: { error: "Upload not found. Upload the file first." }
409: { error: "A stooq-importer-daily-pl job is already running" }
```

### Status

```
GET /api/admin/jobs/stooq-import/status?dataset=daily_pl
Authorization: Bearer <admin JWT>

200: { dataset, jobName, status: "Running"|"Succeeded"|"Failed"|"NotFound", details: { active, succeeded, failed } }
```

### Log

```
GET /api/admin/jobs/stooq-import/log
Authorization: Bearer <admin JWT>

200: [ { dataset, latestDate, importedAt, rowsDeleted }, ... ]  — one entry per dataset
```

---

## jobshot changes

jobshot was extended in two stages:

**v1.5.0 → v1.6.0:** Added `volumes`, `volumeMounts`, and `nodeSelector` pass-through to the
K8s Job pod spec in `runK8sJob`:

```js
volumeMounts: job.volumeMounts ? job.volumeMounts : undefined,
volumes:      job.volumes      ? job.volumes      : undefined,
nodeSelector: job.nodeSelector ? job.nodeSelector : undefined,
```

**v1.6.0 → v1.6.1:** `backoffLimit` changed from `1` to `0` — failed jobs never auto-restart.

---

## Cluster resources (homelab GitOps)

### PV + PVC: hostPath on kaczka

```yaml
# stooq-upload-pvc.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: stooq-upload-pv
spec:
  capacity: { storage: 2Gi }
  accessModes: [ReadWriteMany]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  hostPath:
    path: /var/lib/stooq-uploads
    type: DirectoryOrCreate
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [kaczka]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: stooq-upload-pvc
  namespace: pfire
spec:
  storageClassName: ""
  volumeName: stooq-upload-pv
  accessModes: [ReadWriteMany]
  resources: { requests: { storage: 2Gi } }
```

### portfoliost-admin HelmRelease

Key settings (current, v1.0.19):
- `nodeSelector: kubernetes.io/hostname: kaczka`
- `memory limit: 512Mi` (busboy streaming; file never enters heap)
- `STOOQ_UPLOAD_DIR: /tmp/stooq-uploads`
- `API_JOBSHOT_URL: http://jobshot.pfire.svc.cluster.local:3000`
- PVC mount: `stooq-upload-pvc` → `/tmp/stooq-uploads`

### nginx ingress

`nginx.ingress.kubernetes.io/proxy-body-size: "1100m"` on the portfoliost ingress — raised
from the default 1 MB to allow zip uploads up to ~1 GB.

---

## Known issues / lessons learned

### `psql` not available in pgloader image

The `dimitri/pgloader:ccl.latest` image (Debian Bullseye) does not include `psql`, and its
apt sources have stale GPG keys making runtime `apt-get install` unreliable. Post-load SQL
(SET LOGGED, ADD PRIMARY KEY, atomic rename) is run via a second `pgloader` invocation using
`LOAD CSV FROM INLINE`.

### Zero-row INLINE crashes pgloader

`LOAD CSV FROM INLINE` with no data rows crashes pgloader with `NIL is not of type NUMBER`
(known bug). Workaround: create a real `pgloader_dummy (x int)` table in `BEFORE LOAD DO`,
insert one dummy row in the inline section, drop the table in `AFTER LOAD DO`.

### FINALLY DO not supported in LOAD ARCHIVE

Despite appearing in pgloader docs, `FINALLY DO` is not a valid top-level clause in
`LOAD ARCHIVE`. The grammar only accepts `BEFORE LOAD DO`, `EXECUTE`, and `LOAD` after the
archive `FROM`/`INTO` clauses.

### UNLOGGED table wiped on Postgres restart

`UNLOGGED` tables are truncated automatically when Postgres restarts (crash recovery). The
Postgres config change (shared_buffers etc.) was applied while an import was in progress,
causing a pod restart and loss of ~9 hours of imported data. Lesson: apply config changes
that require a Postgres restart only when no import job is running.

### busboy finish event race

`busboy`'s `finish` event fires when multipart parsing completes, but before `pipeline()` has
finished flushing to disk. The original code used a single `resolved` flag for both "file
part seen" and "pipeline done", causing false "No file received" errors. Fixed by separating
`fileReceived` (set on `file` event) from `settled` (set when pipeline resolves/rejects).

### volume/openint: BIGINT → NUMERIC(28,8)

Stooq encodes some volume and openint values as floats (e.g. `6337948.989247318`). BIGINT
rejects these with error `22P02`. Schema uses `NUMERIC(28,8)` for both columns.

### Duplicate rows from cross-file tickers (2026-08-31)

Stooq zips can include the same ticker in more than one CSV file (e.g. `daily_pl.zip` contained
ENGP in two separate files, producing 8 exact-duplicate rows). `ADD PRIMARY KEY` aborts with
`23505` if any `(ticker, date, time)` tuple appears more than once.

Fix: a `DELETE ... WHERE ctid IN (...)` dedup step was added to the post-load script between
`SET LOGGED` and `ADD PRIMARY KEY` (`src/jobs.ts`, portfoliost-admin v1.0.20). The `daily_pl`
import that failed on this date was recovered manually by running the three post-load steps
directly against the Postgres pod; the final table contains 24,733,409 rows (1987-01-02 to
2026-08-28).

### pgloader here-doc escaping

Inside a shell here-doc (`<< EOF`), single quotes are literal — no escaping is needed or
valid. The original `\\'` sequences produced `\'` in the shell script which pgloader rejected
with `OPTION-TERMINATED-BY` parse errors. Fixed to bare `','` and `'512 MB'`.

---

## Open items

1. **stooq_import_log for all 20 datasets** — `price-data-architecture.md` defines
   `stooq_import_log.dataset` with values `daily_us`, `daily_pl`, `daily_world` only. Extend
   to the full 20-entry StooqDataset enum when the instruments module is updated.

2. **Post-import hook** — the portfoliost-instruments post-import hook
   (`POST /internal/stooq-imported`) is not yet called from the import job. Currently the log
   endpoint returns nulls for `latestDate`/`importedAt`/`rowsDeleted`. The hook should be
   triggered by portfoliost-admin after detecting job `Succeeded` status.

3. **Postgres on kura (85% full disk)** — the primary performance bottleneck. Longhorn on a
   nearly-full disk with high fragmentation makes every write slow. Moving Postgres to `kaczka`
   would require a PGO cluster migration (non-trivial). Monitor disk usage and consider
   expanding the Longhorn volume or migrating when the import of larger datasets (daily_world,
   daily_us) becomes unacceptably slow.

4. **pgloader image replacement** — `dimitri/pgloader:ccl.latest` has a broken apt environment
   and cannot run on arm64. Consider building a custom image based on it with `postgresql-client`
   baked in at build time (fixing the `psql not found` issue cleanly), or switching to the
   pgloader apt package on `postgres:16-alpine` when a maintained pgloader image for arm64
   becomes available.
