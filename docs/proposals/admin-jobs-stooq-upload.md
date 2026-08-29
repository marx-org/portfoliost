# Admin Jobs Tab — Stooq Zip Upload & Import

Date: 2026-08-29  
Status: Draft — agreed in discussion, pending implementation

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
a separate table in the `stooq` database. This extends the three-table model from
`price-data-architecture.md` to the full stooq catalogue:

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
| Poland | Daily | `pl` | `d_pl_txt.zip` | `daily_pl` | ~191 MB |
| Poland | Hourly | `pl` | `h_pl_txt.zip` | `hourly_pl` | ~29 MB |
| Poland | 5-min | `pl` | `5_pl_txt.zip` | `5min_pl` | ~28 MB |
| Hungary | Daily | `hu` | `d_hu_txt.zip` | `daily_hu` | ~1.7 MB |
| Hungary | Hourly | `hu` | `h_hu_txt.zip` | `hourly_hu` | ~1.0 MB |
| Hungary | 5-min | `hu` | `5_hu_txt.zip` | `5min_hu` | ~0.8 MB |
| Macroeconomy | Daily | `macro` | `d_macro_txt.zip` | `daily_macro` | ~0.9 MB |

**Maximum expected file size: ~1 GB** (U.S. 5-min at ~595 MB; the 1 GB limit provides safe headroom).

The `dataset` identifier sent by the admin UI is derived from the table name (e.g. `daily_us`,
`hourly_world`). The target table name is specified as an env var passed to the import Job —
it does not depend on the filename uploaded by the user.

**`price-data-architecture.md` must be updated** to extend the foreign table list from three
entries to the full set above. The `price_bars_all` view routing logic (country_code →
stooq table) will also cover hourly and 5-min tables for the analytics engine.

---

## Contracts-first approach

New API endpoints must be defined in `portfoliost-contracts` (`@marx2/contracts`, at
`/Users/marx/prv/pfire/portfoliost-contracts`) before implementation. The OpenAPI spec
(`openapi.yaml`) currently has no admin paths. A new `/admin/jobs` path group is added as
part of this feature.

Schemas and paths to add to `openapi.yaml`:

```yaml
# Schemas
StooqDataset:
  type: string
  enum:
    - daily_us
    - hourly_us
    - 5min_us
    - daily_world
    - hourly_world
    - 5min_world
    - daily_uk
    - hourly_uk
    - 5min_uk
    - daily_jp
    - daily_hk
    - hourly_hk
    - 5min_hk
    - daily_pl
    - hourly_pl
    - 5min_pl
    - daily_hu
    - hourly_hu
    - 5min_hu
    - daily_macro

StooqImportUploadResponse:
  type: object
  required: [uploadId, dataset, sizeBytes]
  properties:
    uploadId:   { type: string, format: uuid }
    dataset:    { $ref: '#/components/schemas/StooqDataset' }
    sizeBytes:  { type: integer }

StooqImportRunRequest:
  type: object
  required: [dataset, uploadId]
  properties:
    dataset:  { $ref: '#/components/schemas/StooqDataset' }
    uploadId: { type: string, format: uuid }

StooqImportRunResponse:
  type: object
  required: [jobName, namespace, status]
  properties:
    jobName:   { type: string }
    namespace: { type: string }
    status:    { type: string, enum: [Running, Succeeded, Failed, NotFound] }

StooqImportStatusResponse:
  type: object
  required: [dataset, jobName, status]
  properties:
    dataset:  { $ref: '#/components/schemas/StooqDataset' }
    jobName:  { type: string }
    status:   { type: string, enum: [Running, Succeeded, Failed, NotFound] }
    details:
      type: object
      properties:
        active:    { type: integer }
        succeeded: { type: integer }
        failed:    { type: integer }

StooqImportLogEntry:
  type: object
  required: [dataset]
  properties:
    dataset:    { $ref: '#/components/schemas/StooqDataset' }
    latestDate: { type: string, format: date, nullable: true }
    importedAt: { type: string, format: date-time, nullable: true }
    rowsDeleted:{ type: integer, nullable: true }

# Paths
/admin/jobs/stooq-import/upload:
  post:
    summary: Upload a stooq zip file for import
    security: [{ bearerAuth: [] }]
    requestBody:
      content:
        multipart/form-data:
          schema:
            type: object
            required: [dataset, file]
            properties:
              dataset: { $ref: '#/components/schemas/StooqDataset' }
              file: { type: string, format: binary }
    responses:
      '200': { content: { application/json: { schema: { $ref: '#/components/schemas/StooqImportUploadResponse' } } } }
      '400': { description: Invalid dataset or file type }
      '413': { description: File exceeds 1 GB limit }

/admin/jobs/stooq-import/run:
  post:
    summary: Trigger a stooq import Kubernetes Job
    security: [{ bearerAuth: [] }]
    requestBody:
      content:
        application/json:
          schema: { $ref: '#/components/schemas/StooqImportRunRequest' }
    responses:
      '200': { content: { application/json: { schema: { $ref: '#/components/schemas/StooqImportRunResponse' } } } }
      '404': { description: Upload not found }
      '409': { description: Job already running }

/admin/jobs/stooq-import/status:
  get:
    summary: Get current status of a stooq import job
    security: [{ bearerAuth: [] }]
    parameters:
      - name: dataset
        in: query
        required: true
        schema: { $ref: '#/components/schemas/StooqDataset' }
    responses:
      '200': { content: { application/json: { schema: { $ref: '#/components/schemas/StooqImportStatusResponse' } } } }

/admin/jobs/stooq-import/log:
  get:
    summary: Get last import log for all stooq datasets
    security: [{ bearerAuth: [] }]
    responses:
      '200':
        content:
          application/json:
            schema:
              type: array
              items: { $ref: '#/components/schemas/StooqImportLogEntry' }
```

The contracts package is bumped with a minor version before implementation begins.

---

## Architecture

```
Admin browser
  │
  ├─ 1. Admin selects dataset (e.g. daily_us) + zip file
  │
  ├─ 2. POST /api/admin/jobs/stooq-import/upload
  │      multipart/form-data: { dataset: "daily_us", file: <zip> }
  │      → portfoliost-admin
  │           → streams file to stooq-upload-pvc (1 Gi Longhorn RWX)
  │              mounted at /tmp/stooq-uploads in portfoliost-admin pod
  │              stored as daily_us-<uuid>.zip
  │              returns { uploadId, dataset, sizeBytes }
  │
  ├─ 3. POST /api/admin/jobs/stooq-import/run
  │      { dataset: "daily_us", uploadId }
  │      → portfoliost-admin
  │           → POST jobshot /api/run-job  (job spec with volumes — see below)
  │                → jobshot BatchV1Api.createNamespacedJob(...)
  │                   returns { jobName, namespace }
  │
  └─ 4. GET /api/admin/jobs/stooq-import/status?dataset=daily_us
           → portfoliost-admin → jobshot GET /api/job-status/:jobName?namespace=pfire
              → { status: "Running"|"Succeeded"|"Failed", ... }
```

### jobshot integration

jobshot (`ghcr.io/marx2/jobshot`) is already deployed in the `pfire` namespace and exposes:

- `POST /api/run-job` — creates a K8s BatchV1 Job from a JSON job spec
- `GET /api/job-status/:jobName?namespace=<ns>` — polls job status

portfoliost-admin calls jobshot's cluster-internal service:
`JOBSHOT_URL=http://jobshot.pfire.svc:3000` (env var, configured in HelmRelease).

### File upload: portfoliost-admin writes directly to shared PVC

The upload endpoint lives on **portfoliost-admin**, not on jobshot. portfoliost-admin
mounts the shared `stooq-upload-pvc` and writes the uploaded file directly to it. There is
no intermediate upload to jobshot — jobshot is only called at step 3 (run-job) to create
the K8s Job that will read the already-written file.

This design:
- Keeps jobshot unchanged (no new upload endpoint needed)
- Avoids double-copying the file through jobshot's pod memory
- The pgloader Job pod also mounts the same PVC and reads the file directly

### Volume strategy

A `stooq-upload-pvc` PVC (1 Gi, Longhorn `ReadWriteMany`) is created in the `pfire` namespace.
`ReadWriteMany` is needed because portfoliost-admin and the pgloader Job pod may both need
the volume mounted at the same time (admin pod writes, job pod reads).

| Pod | Mount path | Access |
|---|---|---|
| portfoliost-admin Deployment | `/tmp/stooq-uploads` | ReadWrite (stores uploaded zip) |
| pgloader Job pod | `/tmp/stooq-uploads` | ReadOnly sufficient (reads zip, then deletes) |

portfoliost-admin stores files as `<dataset>-<uploadId>.zip` (e.g. `daily_us-abc123.zip`)
to avoid collisions between simultaneous uploads for different datasets.

### Import Kubernetes Job spec

portfoliost-admin sends the following job definition to `POST jobshot /api/run-job`.
**jobshot already supports `volumes` and `volumeMounts` pass-through** — the `run-job`
handler passes the full job body to `runK8sJob`, which needs a one-line extension to include
`job.volumes` and `job.volumeMounts` in the pod spec (see "jobshot changes required" below).

```json
{
  "name": "stooq-importer-daily-us",
  "namespace": "pfire",
  "container": "dimitri/pgloader:ccl.latest",
  "entrypoint": ["/bin/sh"],
  "parameters": [
    "-c",
    "UPLOAD_ID=daily_us-abc123 TARGET_TABLE=daily_us; trap 'rm -f /tmp/stooq-uploads/${UPLOAD_ID}.zip' EXIT; cat > /tmp/import.load <<'EOF'\nLOAD ARCHIVE\n  FROM /tmp/stooq-uploads/${UPLOAD_ID}.zip\n  INTO postgres://postgres:$(SECRET_POSTGRESQL_PASSWORD)@postgres-pfire-primary.pfire.svc:5432/stooq\n  LOAD CSV FROM ALL FILENAMES MATCHING ~/./\n  INTO postgres://postgres:$(SECRET_POSTGRESQL_PASSWORD)@postgres-pfire-primary.pfire.svc:5432/stooq\n    TARGET TABLE ${TARGET_TABLE}\n    TARGET COLUMNS (ticker, period, date, time, open, high, low, close, volume, openint)\n  WITH truncate, skip header = 1, fields terminated by ',', fields not enclosed,\n    batch concurrency = 1, workers = 2, concurrency = 1, disable triggers\n  SET work_mem to '512 MB', maintenance_work_mem to '1024 MB';\nEOF\npgloader --debug /tmp/import.load"
  ],
  "secretName": "postgres-pfire-pguser-postgres",
  "volumes": [
    {
      "name": "stooq-upload",
      "persistentVolumeClaim": { "claimName": "stooq-upload-pvc" }
    }
  ],
  "volumeMounts": [
    {
      "name": "stooq-upload",
      "mountPath": "/tmp/stooq-uploads"
    }
  ],
  "resources": {
    "requests": { "cpu": "500m", "memory": "1Gi" },
    "limits":   { "cpu": "2",   "memory": "2Gi" }
  }
}
```

### Postgres credentials: reuse PGO auto-created secret

Crunchy PGO automatically creates a secret **`postgres-pfire-pguser-postgres`** in the `pfire`
namespace for the `postgres` superuser. This secret already contains:

```
host, port, dbname, user, password, uri, pgbouncer-uri, verifier
```

The `password` key holds the postgres superuser password. Since the `stooq` database is owned
by the `postgres` user (as defined in `postgrescluster-pfire.yaml`), this secret is sufficient
for the pgloader import.

The job spec uses `secretName: "postgres-pfire-pguser-postgres"` — jobshot injects it as
`envFrom: [{ secretRef: { name: "postgres-pfire-pguser-postgres" } }]`. The pgloader load
script references `$(password)` (the key name from the PGO secret) as the password in the
connection string.

**No new SOPS secrets or manually managed Kubernetes Secrets are required.**

---

## Frontend: Admin Jobs tab

Adds `JobsView.vue` to `src/modules/admin/` and `/en/admin/jobs` route to the router.

### Tab layout

```
┌─ System ──── Currency Rates ──── Users ──── Jobs ┐
│                                                   │
│  Stooq Import Jobs                               │
│  ─────────────────────────────────────────────── │
│                                                   │
│  [USA — Daily]                          daily_us  │
│  Last run: 2026-08-28 14:32  ● Succeeded         │
│  ┌──────────────────────────────┐ ┌────────────┐  │
│  │  Choose file…  d_us_txt.zip │ │ Run Import │  │
│  └──────────────────────────────┘ └────────────┘  │
│                                                   │
│  [USA — Hourly]                        hourly_us  │
│  Last run: never                    Status: —    │
│  ┌──────────────────────────────┐ ┌────────────┐  │
│  │  Choose file…               │ │ Run Import │  │
│  └──────────────────────────────┘ └────────────┘  │
│                                                   │
│  [USA — 5-min]                          5min_us  │
│  …                                               │
│  (and so on for all 20 datasets)                 │
│                                                   │
└───────────────────────────────────────────────────┘
```

Datasets are grouped by region (World, U.S., U.K., Japan, Hong Kong, Poland, Hungary,
Macroeconomy) with a section header per group. Within each group, timeframes appear in order:
Daily, Hourly, 5-min.

### Import button states

| State | Enabled? | Label |
|---|---|---|
| No file selected | No (disabled) | "Run Import" |
| File selected, no job running | Yes | "Run Import" |
| Upload in progress | No | "Uploading… 42%" |
| Job running (polling) | No | "Running…" |
| Job succeeded | Yes (re-run) | "Run Import" |
| Job failed | Yes (retry) | "Run Import" |

### Status badge

Polled every 5 seconds while a job is active. Uses jobshot status values:
`Running` / `Succeeded` / `Failed` / `—` (no previous run).

Last-run timestamp and status come from `stooq_import_log` (updated by the
portfoliost-instruments post-import hook), fetched on tab load via
`GET /api/admin/jobs/stooq-import/log`.

---

## API endpoints

Defined in contracts (`openapi.yaml`) first — see "Contracts-first approach" section.

### Upload

```
POST /api/admin/jobs/stooq-import/upload
Authorization: Bearer <admin JWT>
Content-Type: multipart/form-data
Fields: dataset (StooqDataset), file (.zip binary)

200: { uploadId, dataset, sizeBytes }
400: { error: "Invalid dataset" } | { error: "File must be a .zip archive" }
413: { error: "File exceeds 1 GB limit" }
```

portfoliost-admin uses `multer` diskStorage, writing to `/tmp/stooq-uploads/<dataset>-<uuid>.zip`
(the PVC mount). File content is streamed directly to disk — never buffered to memory.

### Run

```
POST /api/admin/jobs/stooq-import/run
Authorization: Bearer <admin JWT>
Body: { dataset: "daily_us", uploadId: "<uuid>" }

200: { jobName: "stooq-importer-daily-us", namespace: "pfire", status: "Running" }
404: { error: "Upload not found. Upload the file first." }
409: { error: "A stooq-importer-daily-us job is already running" }
```

### Status

```
GET /api/admin/jobs/stooq-import/status?dataset=daily_us
Authorization: Bearer <admin JWT>

200: { dataset, jobName, status: "Running"|"Succeeded"|"Failed"|"NotFound", details: { active, succeeded, failed } }
```

### Log

```
GET /api/admin/jobs/stooq-import/log
Authorization: Bearer <admin JWT>

200: [ { dataset, latestDate, importedAt, rowsDeleted }, ... ]  — one entry per dataset
```

Reads from `stooq_import_log` in portfoliost-instruments (via internal service call or shared
DB access).

---

## jobshot changes required

jobshot currently does **not** pass `volumes` or `volumeMounts` from the job definition into
the K8s Job pod spec. This is the only jobshot change needed — a minimal two-line addition to
`runK8sJob` in `server.js`:

```js
// server.js — runK8sJob (current spec.template.spec)
spec: {
  containers: [{
    // ... existing fields
    volumeMounts: job.volumeMounts || [],   // ADD THIS LINE
  }],
  volumes: job.volumes || [],               // ADD THIS LINE
  imagePullSecrets: [{ name: 'regcred' }],
  restartPolicy: 'Never',
}
```

**No upload endpoint, no PVC mount on the jobshot Deployment, no multer dependency** — these
are not needed because portfoliost-admin handles the upload directly.

The `configLoader.ts` `Job` interface is extended with:
```typescript
volumes?:      object[];   // K8s V1Volume array (passed through as-is)
volumeMounts?: object[];   // K8s V1VolumeMount array (passed through as-is)
```

jobshot image is bumped via semantic-release after this change.

---

## Cluster changes (homelab GitOps repo)

### New PVC: `stooq-upload-pvc`

```yaml
# cluster/apps/pfire/stooq-upload-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: stooq-upload-pvc
  namespace: pfire
spec:
  storageClassName: longhorn
  accessModes: [ReadWriteMany]
  resources:
    requests:
      storage: 1Gi
```

1 Gi is sufficient: largest expected file is ~600 MB; only one file per dataset lives on the
PVC at any time (deleted by the Job on EXIT).

### portfoliost-admin Deployment: add PVC mount

```yaml
# In portfoliost-admin HelmRelease / Deployment
volumes:
  - name: stooq-upload
    persistentVolumeClaim:
      claimName: stooq-upload-pvc
containers:
  - name: portfoliost-admin
    volumeMounts:
      - name: stooq-upload
        mountPath: /tmp/stooq-uploads
    env:
      - name: JOBSHOT_URL
        value: http://jobshot.pfire.svc:3000
      - name: STOOQ_UPLOAD_DIR
        value: /tmp/stooq-uploads
```

### Existing stooq-importer CronJob

Left in place as a fallback for NFS-backed imports. No conflict: jobshot uses job names
`stooq-importer-<dataset>` (e.g. `stooq-importer-daily-us`), which differ from the existing
CronJob name `stooq-importer`.

### No new SOPS secrets

The PGO-managed secret `postgres-pfire-pguser-postgres` already exists in the `pfire`
namespace. No SOPS extension, no new Secret manifests.

---

## Implementation plan

### Step N1 — contracts: add admin/jobs paths + schemas

1. Add `StooqDataset` enum, upload/run/status/log schemas, and four paths to `openapi.yaml`
   in `portfoliost-contracts`
2. Bump contracts package minor version
3. Update `@marx2/contracts` reference in portfoliost and portfoliost-admin

### Step N2 — jobshot: volumes pass-through

1. Add `volumeMounts: job.volumeMounts || []` and `volumes: job.volumes || []` to `runK8sJob`
   in `server.js`
2. Extend `configLoader.ts` `Job` interface with `volumes?` + `volumeMounts?`
3. Build + smoke test
4. Push new image via semantic-release

### Step N3 — homelab: PVC + portfoliost-admin volume mount + jobshot URL env

1. Add `stooq-upload-pvc.yaml` to `cluster/apps/pfire/`
2. Add PVC volume + mount + `JOBSHOT_URL` + `STOOQ_UPLOAD_DIR` to portfoliost-admin HelmRelease
3. Update `kustomization.yaml`
4. Flux reconcile + verify PVC bound

### Step N4 — portfoliost-admin: upload + run API routes

1. Add `multer` with diskStorage to portfoliost-admin
2. Implement `POST /api/admin/jobs/stooq-import/upload`
   - Validate `dataset` against enum; reject non-.zip files; enforce 1 GB limit
   - Stream to `/tmp/stooq-uploads/<dataset>-<uuid>.zip`
   - Return `{ uploadId, dataset, sizeBytes }`
3. Implement `POST /api/admin/jobs/stooq-import/run`
   - Verify file exists on PVC (otherwise 404)
   - Check jobshot for existing running job (409 if running)
   - Build pgloader job spec (dataset → TARGET_TABLE mapping, volume/volumeMount, secretName)
   - POST to `JOBSHOT_URL/api/run-job`
4. Implement `GET /api/admin/jobs/stooq-import/status` (proxy to jobshot)
5. Implement `GET /api/admin/jobs/stooq-import/log` (read stooq_import_log)
6. Admin JWT guard on all routes
7. Unit tests + mock API tests

### Step N5 — portfoliost frontend: Jobs tab

1. Add `src/modules/admin/JobsView.vue` (20 dataset cards, grouped by region)
2. Add `/en/admin/jobs` route + admin guard
3. Add "Jobs" tab to `AdminLayout.vue` nav
4. Add `src/api/adminJobs.ts`: `uploadStooqZip`, `runStooqImport`, `getStooqImportStatus`, `getStooqImportLog`
5. Use `XMLHttpRequest` for upload (exposes `progress` event; `fetch` does not)
6. Status polling: `setInterval` every 5s while status is `Running`; stop on `Succeeded`/`Failed`
7. Mock responses in `mocks/` for all four endpoints
8. E2E: upload mock, run mock, status poll mock

### Step N6 — integration test + cluster deploy

1. Build portfoliost + portfoliost-admin docker images
2. Push + update HelmReleases
3. `docker compose up --build` + full test suite green
4. Smoke test with `d_pl_txt.zip` (smallest real dataset, ~28–191 MB depending on timeframe)

---

## Data flow on import

```
Admin browser
  1. Selects "Poland — Daily" + file d_pl_txt.zip (191 MB)
  2. POST /api/admin/jobs/stooq-import/upload { dataset: "daily_pl", file }
     → portfoliost-admin multer writes to /tmp/stooq-uploads/daily_pl-abc123.zip (on PVC)
     ← { uploadId: "abc123", dataset: "daily_pl", sizeBytes: 200000000 }
  3. POST /api/admin/jobs/stooq-import/run { dataset: "daily_pl", uploadId: "abc123" }
     → portfoliost-admin POST jobshot /api/run-job {
         name: "stooq-importer-daily-pl",
         container: "dimitri/pgloader:ccl.latest",
         entrypoint: ["/bin/sh"],
         parameters: ["-c", "... pgloader /tmp/import.load"],
         secretName: "postgres-pfire-pguser-postgres",
         volumes: [{ name: "stooq-upload", persistentVolumeClaim: { claimName: "stooq-upload-pvc" } }],
         volumeMounts: [{ name: "stooq-upload", mountPath: "/tmp/stooq-uploads" }]
       }
     → jobshot creates K8s Job "stooq-importer-daily-pl" in pfire namespace
     ← { jobName: "stooq-importer-daily-pl", namespace: "pfire", status: "Running" }
  4. pgloader Job pod:
     - Mounts stooq-upload-pvc at /tmp/stooq-uploads
     - Reads $(password) from envFrom: postgres-pfire-pguser-postgres secret
     - trap removes /tmp/stooq-uploads/daily_pl-abc123.zip on EXIT
     - Runs pgloader: LOAD ARCHIVE FROM zip INTO stooq; TARGET TABLE daily_pl; WITH truncate
  5. pgloader success: (curl to portfoliost-instruments not possible in ccl image without curl;
     see open item 5 — alternative: polling the job status from portfoliost-admin post-completion)
  6. portfoliost-instruments post-import hook fires:
     - MAX(date) FROM stooq_daily_pl
     - Cleanup overflow rows, split adjustments, split candidates
     - Upsert stooq_import_log { dataset: "daily_pl", latestDate, importedAt, rowsDeleted }
  7. UI polls /api/admin/jobs/stooq-import/status?dataset=daily_pl every 5s
     → shows "Succeeded"
     → refresh /api/admin/jobs/stooq-import/log → shows latestDate
```

---

## Open items

1. **Longhorn RWX availability** — verify that the cluster's Longhorn version supports
   `ReadWriteMany`. If not, use an NFS-backed PVC (same pattern as `nfs-pfire-stooq-rw-pvc`
   with a dedicated small export on the Synology NAS).

2. **`curl` in `dimitri/pgloader:ccl.latest`** — the CCL pgloader image is Debian-based and
   likely includes curl, but must be verified. If absent, the post-import notification to
   portfoliost-instruments cannot be sent from the pgloader container. Alternative: portfoliost-admin
   polls the job status and fires the post-import hook itself after detecting `Succeeded`.

3. **PGO secret key name** — the `postgres-pfire-pguser-postgres` secret uses key `password`
   (not `SECRET_POSTGRESQL_PASS`). The pgloader load script must reference `$(password)` —
   the shell-substitution syntax for the env var injected from the secret. Verify the exact key
   name by inspecting the live secret: `kubectl get secret postgres-pfire-pguser-postgres -n pfire -o jsonpath='{.data}' | base64 -d`.

4. **pgloader load script quoting** — the inline `-c` shell argument with heredoc becomes
   unwieldy for large scripts. Preferred approach: portfoliost-admin writes
   `<dataset>-<uuid>.load` to `/tmp/stooq-uploads/` alongside the zip, then the pgloader
   command is simply `pgloader --debug /tmp/stooq-uploads/<dataset>-<uuid>.load`. This also
   avoids shell quoting issues with variable substitution in the pgloader DSN.

5. **Multiple simultaneous imports for different datasets** — the PVC is shared across all
   datasets. Each file has a unique `<dataset>-<uuid>.zip` name so concurrent uploads for
   different datasets do not collide. Each dataset has its own job name so jobshot
   de-duplicates correctly. Only one import per dataset can run at a time; imports for
   different datasets can run concurrently.

6. **stooq_import_log for non-daily tables** — `price-data-architecture.md` defines
   `stooq_import_log.dataset` with values `daily_us`, `daily_pl`, `daily_world` only. This
   must be extended to the full 20-entry StooqDataset enum when the instruments module is
   updated. The post-import hook (`POST /internal/stooq-imported`) must also accept a
   `dataset` query param to identify which table was imported, rather than inferring it from
   table scans.
