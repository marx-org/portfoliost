# D56 — OpenTelemetry Observability: Metrics, Structured Logs, Traces

## Status: Implemented (metrics + structured logs live; traces no-op pending D57)

## Goal

Instrument all six backend services (`portfoliost-admin`, `portfoliost-wallets`,
`portfoliost-instruments`, `portfoliost-users-auth`, `openst`, `cachest`) with
OpenTelemetry so each exposes a Prometheus-compatible `/metrics` endpoint,
emits structured JSON logs, and is trace-SDK-ready.

Configure Prometheus to scrape all services via ServiceMonitor resources in the
homelab cluster. Preserve the existing `/__meta` endpoint unchanged.

---

## Context

No pfire service currently exposes a `/metrics` endpoint or uses OTel.
The cluster has:

- `kube-prometheus-stack` running (Prometheus + Grafana + kube-state-metrics +
  node-exporter + Loki + Promtail)
- `ServiceMonitor` CRD present and active
- **No Tempo, no OTel Collector** — traces have nowhere to go today

Strategy:
- **Metrics** — expose `/metrics` via OTel `PrometheusExporter`, add ServiceMonitors
- **Logs** — switch to structured JSON stdout; Loki/Promtail already collects it
- **Traces** — wire OTel trace SDK now with a no-op/stdout exporter so the
  code is future-ready; wire to Tempo in a separate proposal (D57)

The `/__meta` endpoint is **not replaced**. It serves a different purpose
(service identity for admin version polling) and stays unchanged.

---

## D56-1 — Shared OTel helpers as `@marx-org/otel` (new package in `portfoliost-contracts` monorepo)

The `portfoliost-contracts` repo is restructured into two independently-published
packages that live as subfolders in the same repository:

```
portfoliost-contracts/
  contracts/          ← existing package (@marx-org/contracts) — OpenAPI spec, fx, currencies
    openapi.yaml
    src/
      fx.ts
      currencies.ts
    package.json      ← name: "@marx-org/contracts"
    tsconfig.json
  otel/               ← new package (@marx-org/otel) — OTel bootstrap helpers
    src/
      index.ts
    package.json      ← name: "@marx-org/otel"
    tsconfig.json
  .github/
    workflows/
      release-contracts.yml   ← paths: ['contracts/**']
      release-otel.yml        ← paths: ['otel/**']
  .npmrc
  .gitignore
```

The two sub-packages each have their own `package.json`, `tsconfig.json`, independent
semver version, and a dedicated GHA release workflow triggered only when files in
their respective subfolder change. They share the repo-level `.npmrc` and `.gitignore`.

**`contracts/` subfolder** — no functional changes; this is purely a directory move:
- `openapi.yaml`, `src/fx.ts`, `src/currencies.ts`, `src/fx.test.ts` move under `contracts/`
- `contracts/package.json` retains `name: "@marx-org/contracts"` and all existing exports
- `.github/workflows/release-contracts.yml` — identical logic to the current
  `release.yml` but scoped with `paths: ['contracts/**']` in the `on: push` trigger and
  `working-directory: contracts` on build/test steps
- Consumer import paths (`@marx-org/contracts`, `@marx-org/contracts/fx`, `@marx-org/contracts/currencies`) are **unchanged**

**`otel/` subfolder** — new package `@marx-org/otel`:

1. `otel/src/index.ts` — shared, Hono-agnostic setup helpers:
   - `createResource(serviceName: string)` — builds an OTel `Resource` with
     `service.name`, `service.version` (from `APP_VERSION` env), and
     `deployment.environment`
   - `createSdk(opts: { serviceName, metricReader, instrumentations })` —
     creates and returns a configured `NodeSDK`; includes built-in `views` that
     rename `http.server.request.duration` → `http.server.request.duration.seconds`
     and `http.client.request.duration` → `http.client.request.duration.seconds`
     so the Prometheus exporter produces `_seconds`-suffixed names consistent with
     the Python services (see D56-3 addendum below)
   - `buildMetricsRoute()` — returns a Hono-compatible route handler that
     serves the Prometheus text format from the shared `PrometheusExporter`

2. `otel/package.json`:
   ```json
   {
     "name": "@marx-org/otel",
     "version": "1.0.2",
     "type": "module",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "default": "./dist/index.js"
       }
     },
     "peerDependencies": {
       "@opentelemetry/sdk-node": ">=0.50",
       "@opentelemetry/exporter-prometheus": ">=0.50",
       "@opentelemetry/auto-instrumentations-node": ">=0.50",
       "@opentelemetry/instrumentation-runtime-node": ">=0.4",
       "@opentelemetry/api": ">=1.7",
       "hono": ">=4"
     },
     "devDependencies": {
       "@types/node": "^22.0.0",
       "typescript": "^5.5.0"
     },
     "publishConfig": { "registry": "https://npm.pkg.github.com" }
   }
   ```

3. `.github/workflows/release-otel.yml` — same bump/build/publish pattern as the
   contracts workflow, but:
   - `paths: ['otel/**']` in the `on: push` trigger
   - `working-directory: otel` on all build/test/publish steps
   - `git add otel/package.json otel/package-lock.json` in the commit step
   - Tags prefixed `otel-v*` (e.g. `otel-v1.0.2`) so they don't collide with contracts tags

4. Bump `otel` version via CI as usual on first merge.

No traces exporter is wired into the shared helper yet — `NodeSDK` initialises
with `traceExporter: new NoopSpanExporter()` by default until D57 (Tempo).

---

## D56-2 — Node.js Hono services (×4)

Applies to: `portfoliost-admin`, `portfoliost-wallets`, `portfoliost-instruments`,
`portfoliost-users-auth`.

**New dependencies added to each service's `package.json`:**
```
@marx-org/otel
@opentelemetry/sdk-node
@opentelemetry/api
@opentelemetry/exporter-prometheus
@opentelemetry/auto-instrumentations-node
@opentelemetry/instrumentation-runtime-node
import-in-the-middle          ← required for ESM http instrumentation (see below)
```

**New file per service: `src/instrumentation.ts`**

```typescript
import { createSdk, buildMetricsRoute } from '@marx-org/otel'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'

export const prometheusExporter = new PrometheusExporter({ preventServerStart: true })

const sdk = createSdk({
  serviceName: 'portfoliost-wallets',   // differs per service
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
    }),
    new RuntimeNodeInstrumentation(),
  ],
})

sdk.start()
process.once('beforeExit', async () => { await sdk.shutdown() })

export const metricsRouteHandler = buildMetricsRoute(prometheusExporter)
```

**New file per service: `src/iitm.ts`** (ESM loader registration — must be the
first `--import` flag; see ESM fix note below)

```typescript
import { register } from 'import-in-the-middle/register-hooks.mjs'
register()
```

**New file per service: `src/import-in-the-middle.d.ts`** — ambient TS declaration
for the `.mjs` subpath (no exports map in the package).

**Changes to `src/index.ts`** (each service):
```typescript
import { metricsRouteHandler } from './instrumentation.js'
// ...
app.get('/metrics', metricsRouteHandler)
```

**Dockerfile `CMD`** (each service):
```
CMD ["node", "--import", "./dist/iitm.js", "--import", "./dist/instrumentation.js", "dist/server.js"]
```

The `iitm.js` preload **must come first** — it registers the ESM module hook
before OTel evaluates; reversing the order causes the http server histogram to
remain silent (traces still flow, but server metrics do not record).

### ESM http instrumentation — root cause and fix

All four Hono services run as ESM (`"type": "module"`). `@hono/node-server` imports
`node:http` as an ESM static import (`import { createServer } from "node:http"` at
the top of `@hono/node-server/dist/index.mjs`). OTel's http instrumentation patches
`http.Server.prototype.emit` via module hooks, but:

- **RITM** (`require-in-the-middle`) only intercepts CJS `require()` — it cannot
  intercept ESM static imports.
- **IITM** (`import-in-the-middle`) _can_ intercept ESM imports, but only when its
  loader is registered via `module.registerHooks()` (Node ≥ 22.8) before any ESM
  module graph is evaluated.
- OTel SDK 0.222.0 does **not** call `module.register()` / `module.registerHooks()`
  automatically — nothing wires the IITM loader.

Result without the fix: `node:http` loads unpatched → `http.Server.prototype.emit`
is never wrapped → `_onServerResponseFinish` never fires → `http_server_request_duration`
records zero observations (client/runtime metrics still work because undici patches
globals and runtime-node uses process hooks).

Fix: `src/iitm.ts` calls `register()` from `import-in-the-middle/register-hooks.mjs`,
which uses the sync `module.registerHooks()` API (Node ≥ 22.22.3; containers run
`node:22-alpine` = 22.23.2). It must be the **first** `--import` so the loader is
active before the OTel SDK or `@hono/node-server` module graphs are evaluated.

**Note for `portfoliost-users-auth`:** the HelmRelease overrides the container
command (runs `db:migrate` before the server). The override must explicitly include
both `--import` flags:
```yaml
command:
  - /bin/sh
  - -c
  - npm run db:migrate && node --import ./dist/iitm.js --import ./dist/instrumentation.js dist/server.js
```

**Metrics exposed automatically:**

| Metric | Description |
|---|---|
| `http_server_request_duration_seconds` | HTTP request latency histogram (P50/P99 per route) |
| `http_server_active_requests` | Concurrent in-flight requests |
| `http_client_request_duration_seconds` | Outbound fetch/undici call latency |
| `nodejs.eventloop.delay.*` | Event loop health (p50/p90/p99/mean/max) |
| `v8js.gc.duration` | GC pause histogram |
| `v8js.memory.heap.used` | Heap usage |

---

## D56-3 — Python FastAPI services (openst, cachest)

**New dependencies added to each `requirements.txt`:**
```
opentelemetry-sdk
opentelemetry-api
opentelemetry-instrumentation-fastapi
opentelemetry-instrumentation-httpx     # outbound HTTP calls (critical for cachest)
opentelemetry-exporter-prometheus
prometheus-client                       # needed by opentelemetry-exporter-prometheus
```

**New file per service: `otel.py`**

```python
import os
from opentelemetry import metrics as otel_metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from prometheus_client import make_asgi_app

def setup_otel(app, service_name: str):
    resource = Resource.create({
        SERVICE_NAME: service_name,
        SERVICE_VERSION: os.environ.get("APP_VERSION", "0.0.0-dev"),
    })
    reader = PrometheusMetricReader()
    provider = MeterProvider(resource=resource, metric_readers=[reader])
    otel_metrics.set_meter_provider(provider)

    FastAPIInstrumentor.instrument_app(app, meter_provider=provider)
    HTTPXClientInstrumentor().instrument()

    # Mount /metrics as an ASGI sub-application
    app.mount("/metrics", make_asgi_app())
```

**Changes to `src/main.py` / `main.py`** (each service):
```python
from otel import setup_otel
# ... after app = FastAPI(...) ...
setup_otel(app, "openst")   # or "cachest"
```

Also adds `/health` endpoint to both openst and cachest (currently missing):
```python
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}
```

**Metrics exposed automatically:**

| Metric | Description |
|---|---|
| `http_server_request_duration_seconds` | FastAPI request latency histogram |
| `http_server_active_requests` | In-flight requests |
| `http_client_request_duration_seconds` | **Outbound httpx call latency** (per upstream URL — very useful for cachest to see latency per provider) |

The outbound `http_client_request_duration_seconds` metric on cachest will label calls by
`server_address` (hostname), making it possible to see response times for
`openst`, `alphavantage.co`, `financialmodelingprep.com`, and `dividendhistory.org`
separately — directly useful for the topology visualization in D55.

### D56-3 addendum — metric name alignment across JS and Python

The JS Prometheus exporter (≥ 0.200) emits the bare sanitised OTel name
(`http_server_request_duration`) plus a `# UNIT s` metadata comment, following the
newer OpenMetrics convention. The Python exporter appends the unit into the name
(`http_server_request_duration_seconds`), following the older Prometheus convention.

To make all six services consistent, `@marx-org/otel@1.0.2` adds two `ViewOptions` to
`createSdk` that rename the JS histograms before they reach the exporter:

```typescript
// inside @marx-org/otel src/index.ts
const HTTP_DURATION_VIEWS: ViewOptions[] = [
  { name: 'http.server.request.duration.seconds', instrumentName: 'http.server.request.duration' },
  { name: 'http.client.request.duration.seconds', instrumentName: 'http.client.request.duration' },
]
// passed as `views: HTTP_DURATION_VIEWS` to NodeSDK
```

`http.server.request.duration.seconds` sanitises to `http_server_request_duration_seconds`
— identical to what Python emits. No per-service changes needed; upgrading
`@marx-org/otel` is sufficient.

**Unified PromQL query (all 6 services):**
```promql
sum by (service) (rate(http_server_request_duration_seconds_count[5m]))
```

---

## D56-4 — Structured JSON logging

**Hono services (×4):**

Replace the default Hono `logger()` middleware (plain-text stdout) with a
structured JSON logger using `pino`. Log fields: `time`, `level`, `service`,
`method`, `path`, `status`, `duration_ms`, `request_id`.

Loki/Promtail already collects stdout from all pods — structured JSON logs will
be automatically parseable by Loki's JSON parser without any Promtail config
changes.

**Python services (openst, cachest):**

Replace the existing plain-text `log_requests` middleware (openst) and default
uvicorn logging with `python-json-logger`. Log fields: `timestamp`, `level`,
`service`, `method`, `path`, `status_code`, `duration_ms`.

---

## D56-5 — Trace SDK (no-op export, future-ready)

**Hono services:** `NodeSDK` is initialised with no explicit `traceExporter` —
defaults to `NoopSpanExporter`. The `@opentelemetry/auto-instrumentations-node`
package wires `instrumentation-http` which creates spans automatically. When
Tempo is deployed (D57), only the exporter config needs to change — no
application code changes required.

**Python services:** `opentelemetry-sdk` is installed and a `TracerProvider` is
set globally with a no-op processor. Same: only exporter config changes when
Tempo arrives.

---

## D56-6 — ServiceMonitors in homelab

One `serviceMonitor` block added per service in the existing
`homelab/cluster/apps/pfire/<service>/app/helmrelease.yaml` values.

The `app-template` chart (v5.0.1 and v5.1.0) supports `serviceMonitor` as a
first-class value key. Verified: `ServiceMonitor` CRD is present in the cluster
(`servicemonitors.monitoring.coreos.com`).

**Pattern for each service (Hono, `/metrics` on port 3000):**

```yaml
serviceMonitor:
  app:
    enabled: true
    service:
      identifier: app
    endpoints:
      - port: http        # port 3000
        path: /metrics
        interval: 30s
        scrapeTimeout: 10s
```

**Services getting ServiceMonitors:**
- `portfoliost-admin` (port 3000)
- `portfoliost-wallets` (port 3000)
- `portfoliost-instruments` (port 3000)
- `portfoliost-users-auth` (port 3000)
- `openst` (port 8080)
- `cachest` (port 8080)

Prometheus job names will match the HelmRelease names by default via
`jobLabel: app.kubernetes.io/name`.

---

## D56-7 — Update D55 topology proposal

Once D56 is implemented:

- The `GET /api/admin/topology/traffic` endpoint in D55 can be enriched with
  application-level `http.server.request.duration` metrics from the services
  themselves (not just nginx-ingress metrics), giving more precise per-route
  data.
- The cachest `http.client.request.duration` metric enables showing per-provider
  latency in the details panel.
- The topology proposal should note D56 as a prerequisite for richer live data,
  but D55 is designed to degrade gracefully without it (using ingress metrics
  alone first).

---

## What is NOT in scope

- No Tempo deployment (D57, separate proposal).
- No OTel Collector deployment (needed for trace routing to Tempo — also D57).
- No distributed trace sampling configuration.
- No Grafana dashboard creation (separate work, straightforward once metrics are scraped).
- No changes to the nginx gateway or the SPA.
- No changes to `/__meta` endpoints — they are preserved as-is.
- No instrumentation of scanst, mastra-ticker, scorest, or other non-core services.

---

## Implementation plan

Each step is one commit after its test passes.

- [x] **Step 1** — Restructure `portfoliost-contracts` repo: move existing files under `contracts/` subfolder; add `otel/` subfolder with `src/index.ts`, `package.json`, `tsconfig.json`; add separate GHA workflow `release-otel.yml`; update `release-contracts.yml` with path filter; bump both packages via CI
  - _Test:_ TypeScript compiles in both subfolders (`npm run build` in `contracts/` and `otel/`); `@marx-org/otel` importable; `@marx-org/contracts` consumer imports unchanged
- [x] **Step 2** — Add OTel deps + `src/instrumentation.ts` + `/metrics` route + pino logging to `portfoliost-admin`
  - _Test:_ Unit: `GET /metrics` returns `text/plain` with `http_server_request_duration`; health check passes
- [x] **Step 3** — Same for `portfoliost-wallets`
  - _Test:_ Same as step 2
- [x] **Step 4** — Same for `portfoliost-instruments`
  - _Test:_ Same as step 2
- [x] **Step 5** — Same for `portfoliost-users-auth`
  - _Test:_ Same as step 2
- [x] **Step 6** — Add OTel deps + `otel.py` + `/metrics` + `/health` + structured JSON logging to `openst`
  - _Test:_ `GET /metrics` returns Prometheus text; `GET /health` returns `{"status":"ok"}`
- [x] **Step 7** — Add OTel deps + `otel.py` + `/metrics` + `/health` + structured JSON logging to `cachest`; verify `http_client_request_duration` appears per upstream host
  - _Test:_ `GET /metrics` includes `http_client_request_duration_seconds{server_address="openst"}` — the stable import emits `server_address`/`server_port`, not `http_host`
- [x] **Step 8** — Add `serviceMonitor` values to all 6 HelmReleases in homelab repo; commit + push
  - _Test:_ Prometheus scrape targets show all 6 services as `UP` in `pfire` namespace
- [x] **Step 9** — Fix ESM http instrumentation: add `src/iitm.ts` + `import-in-the-middle` dep to all 4 JS services; update Dockerfile CMD to `--import ./dist/iitm.js --import ./dist/instrumentation.js`; fix users-auth HelmRelease command override to include both preloads
  - _Test:_ `http_server_request_duration_seconds_count` appears in Prometheus for all 4 JS services after traffic
- [x] **Step 10** — Align metric names: bump `@marx-org/otel` to 1.0.2 with `ViewOptions` renaming JS histograms to `*.seconds`; update all 4 consumer repos; redeploy
  - _Test:_ `sum by (service)(rate(http_server_request_duration_seconds_count[5m]))` returns all 6 services
- [x] **Step 11** — Update D55 proposal to reference D56 as prerequisite for richer traffic data

---

## Open questions resolved

**Q: Should `/__meta` be replaced by `/metrics`?**
No. They serve distinct purposes: `/__meta` is a lightweight identity probe
consumed by the admin aggregation endpoint; `/metrics` is a Prometheus scrape
target. Both are kept.

**Q: Shared OTel code — separate repo or contracts?**
New `otel/` subfolder in the `portfoliost-contracts` monorepo, published as the
independent package `@marx-org/otel`. This keeps OTel helpers physically co-located
with the rest of the shared code (same repo, same `.npmrc`, same CI runner) while
keeping the two packages cleanly separated: `@marx-org/contracts` stays a lean
OpenAPI + pure-function library with no runtime deps; `@marx-org/otel` carries the
heavy OTel peer deps without polluting contracts consumers. Each subfolder has its
own `package.json`, `tsconfig.json`, versioning, and release workflow.

**Q: Traces — what to do without Tempo?**
Wire OTel SDK with no-op exporter. Application code is ready; only the exporter
config needs to change when Tempo is deployed (D57).

**Q: ServiceMonitor CRD present?**
Confirmed: `servicemonitors.monitoring.coreos.com` CRD exists in cluster.
`app-template` v5.1.0/5.0.1 both support `serviceMonitor` values natively.
