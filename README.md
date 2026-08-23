# Portfoliost

A Vue 3 investment portfolio tracker — parity build of [example-service.ai](https://app.example-service.ai).

## Tech stack

- **Vue 3** + TypeScript + `<script setup>` SFCs
- **Pinia** state management, **vue-router**
- **Tailwind CSS** for styling
- **ApexCharts** via vue3-apexcharts
- **Vite** build tool
- **Vitest** unit tests, **Playwright** E2E tests
- **nginx** edge gateway for per-module backend routing (`deploy/services.env`)

## Getting started

### Prerequisites

- Node >= 20
- npm

### Install

```sh
npm ci
```

### Development

```sh
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` requests to a backend. By default it expects a
backend at `http://localhost:4010`. Point it elsewhere:

```sh
VITE_API_PROXY_TARGET=http://your-backend:8080 npm run dev
```

### Production build

```sh
npm run build        # typecheck + vite build → dist/
npm run preview      # preview the build locally
```

## Modularisation

Backend modules live in separate projects, each producing its own container.
`users-auth` (repo `../portfoliost-users-auth`) is the reference
implementation. Conventions and the extraction checklist:
[docs/MODULARISATION.md](docs/MODULARISATION.md).

## Architecture

```
Browser → portfoliost (port 3000, static SPA)
              └── /api/* → gateway (port 8080, nginx)
                              ├── /api/auth/*   → API_USERS_AUTH_URL (users-auth module)
                              ├── /api/users/*  → API_USERS_AUTH_URL (users-auth module)
                              ├── /api/...      → per-module upstreams
                              └── catch-all     → API_BACKEND_URL
```

Services in Docker Compose:

| Service | Port | Role |
| --- | --- | --- |
| `gateway` | `8080` (exposed) | nginx edge — proxies `/api/*` to per-module upstreams from `deploy/services.env` |
| `portfoliost` | `3000` (exposed) | Static Vue SPA files |
| `example-service-mock` | `4010` (internal) | Mock REST API (seeded with captured data) |
| `users-auth` | `3000` (internal) | users-auth module — real backend (Hono + Postgres), repo `../portfoliost-users-auth` |
| `postgres` | `5432` (internal) | Module databases (volatile, re-seeded on start) |

## Environment variables

Each API module has its own backend URL, allowing modules to be migrated to a
real backend independently. All default to the local mock.

### Per-module backend URLs (nginx gateway)

All values live in `deploy/services.env` — the single source of truth consumed
by the gateway (and later by backend modules calling each other internally).

| Variable | Gateway route | Default |
| --- | --- | --- |
| `API_USERS_AUTH_URL` | `/api/auth/*`, `/api/users/*`, `/.well-known/*` | `http://example-service-mock:4010` |
| `API_PORTFOLIOS_URL` | `/api/portfolios/*` | `http://example-service-mock:4010` |
| `API_WALLETS_URL` | `/api/wallets/*` | `http://example-service-mock:4010` |
| `API_INSTRUMENTS_URL` | `/api/instruments/*` | `http://example-service-mock:4010` |
| `API_WATCHLISTS_URL` | `/api/watchlists/*` | `http://example-service-mock:4010` |
| `API_NOTIFICATIONS_URL` | `/api/notifications/*` | `http://example-service-mock:4010` |
| `API_NEWS_URL` | `/api/news/*` | `http://example-service-mock:4010` |
| `API_BILLING_URL` | `/api/billing/*` | `http://example-service-mock:4010` |
| `API_CHARTING_URL` | `/api/charting/*` | `http://example-service-mock:4010` |
| `API_COPILOT_URL` | `/api/conversations`, `/api/chatbot/*` | `http://example-service-mock:4010` |
| `API_LOGOS_URL` | `/api/logos/*` | `http://example-service-mock:4010` |
| `API_EXCHANGE_RATES_URL` | `/api/exchange-rates` | `http://example-service-mock:4010` |
| `API_SNAPTRADE_URL` | `/api/snaptrade/*` | `http://example-service-mock:4010` |
| `API_PUBLIC_URL` | `/api/public/*` | `http://example-service-mock:4010` |
| `API_BACKEND_URL` | catch-all `/api/*` | `http://example-service-mock:4010` |

### Dev server proxy

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://localhost:4010` | Backend URL for the Vite dev server proxy (`npm run dev` only) |

### Migrating a module to a real backend

Edit the module's value in `deploy/services.env` — only that module's traffic
goes to the new backend, everything else still hits the mock — then recreate
the consumers:

```sh
# Migrate users-auth to the real module, keep everything else on mock:
#   deploy/services.env → API_USERS_AUTH_URL=http://users-auth:3000
docker compose up -d --build gateway
```

Multiple modules can be migrated independently (one line each in
`deploy/services.env`). The frontend code uses only relative paths
(`/api/...`) — no code changes needed. Routing is handled entirely by the
nginx gateway at the infrastructure layer.

## Docker

```sh
docker compose up -d --build
```

To deploy without the mock, set all `API_*_URL` values in
`deploy/services.env` to your real backend and remove or disable the
`example-service-mock` service from the compose file.

## Testing

```sh
npm run test         # unit tests (vitest)
npm run test:mock    # mock API contract tests (140 checks)
npm run test:stack   # instruments stack contract test (29 checks, real|mock|any)
npm run test:e2e     # Playwright E2E against docker compose stack
```

`test:stack` exercises every `/api/instruments/*` endpoint through the nginx
gateway with contract-shape assertions and detects whether the upstream is the
real module stack (instruments+cachest+openst) or example-service-mock:

```sh
docker compose up -d --build   # once
npm run test:stack -- real     # or: mock | any
```

E2E runs against a **freshly recreated** stack for deterministic results (the
mock is stateful): `docker compose down && docker compose up -d --build` first.

All tests must pass before committing:

```sh
npm run build && npm run test && npm run test:mock && npm run test:e2e
```
