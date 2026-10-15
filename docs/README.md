# docs

Ordered documentation index for the example-service.ai parity build.

## Working docs

| File | Purpose |
| --- | --- |
| [plan.md](plan.md) | Long-running parity plan. Each step is implemented, verified (build + unit + mock + e2e), committed, then marked `[x]`. |
| [APPLICATION_INVENTORY.md](APPLICATION_INVENTORY.md) | Application / feature inventory. |

## API

| File | Purpose |
| --- | --- |
| [api/example-service-real-api.yaml](api/example-service-real-api.yaml) | **Source of truth.** REST contract reverse-engineered from the live Example service API. The mock gateway (`mocks/gateway`, container `example-service-mock`) serves these paths; the mock is seeded by `mocks/shared/data/` (see `scripts/regen-seed.mjs`). |
| [api/EXAMPLE_SERVICE_API.md](api/EXAMPLE_SERVICE_API.md) | Human-readable endpoint reference mirroring the real Example service API. |

> Note: the earlier UI-inferred `example-service-openapi.yaml` draft was superseded by
> `api/example-service-real-api.yaml` and removed. Keep contract updates in the real-api
> YAML and this reference doc only.

## Exploration captures

[exploration/](exploration/) — screenshots and a11y snapshots of `app.example-service.ai`
gathered while discovering the UI. Historical reference only; the browser-based
parity workflow captures fresh snapshots under `.playwright-mcp/` (git-ignored).
