# Portfoliost

A Vue 3 investment portfolio tracker — parity build of [example-service.ai](https://app.example-service.ai).

## Tech stack

- **Vue 3** + TypeScript + `<script setup>` SFCs
- **Pinia** state management, **vue-router**
- **Tailwind CSS** for styling
- **ApexCharts** via vue3-apexcharts
- **Vite** build tool
- **Vitest** unit tests, **Playwright** E2E tests
- **KrakenD** API gateway for per-module backend routing

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

## Architecture

```
Browser → krakend (port 8080)
              ├── /api/*  → example-service-mock:4010  (or real backend)
              └── /*      → portfoliost:80    (static SPA files)
```

Three independent services in Docker Compose:

| Service | Port | Role |
| --- | --- | --- |
| `krakend` | `8080` (exposed) | API gateway — single entry point for browser |
| `portfoliost` | `80` (internal) | Static Vue SPA files |
| `example-service-mock` | `4010` (internal) | Mock REST API (seeded with captured data) |

## Environment variables

Each API module has its own backend URL, allowing modules to be migrated to a
real backend independently. All default to the local mock.

### Per-module backend URLs (KrakenD gateway)

| Variable | KrakenD endpoint | Default |
| --- | --- | --- |
| `API_AUTH_URL` | `/api/auth/*` | `http://example-service-mock:4010` |
| `API_USERS_URL` | `/api/users/*` | `http://example-service-mock:4010` |
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

Set the env var for the module you want to migrate — only that module's
traffic goes to the new backend, everything else still hits the mock:

```sh
# Migrate auth to a real backend, keep everything else on mock
API_AUTH_URL=https://api.real.com docker compose up -d --build
```

Multiple modules can be migrated independently:

```sh
API_AUTH_URL=https://api.real.com \
API_PORTFOLIOS_URL=https://api.real.com \
  docker compose up -d --build
```

The frontend code uses only relative paths (`/api/...`) — no code changes
needed. Routing is handled entirely by KrakenD at the infrastructure layer.

## Docker

```sh
docker compose up -d --build
```

To deploy without the mock, set all `API_*_URL` vars to your real backend and
remove or disable the `example-service-mock` service from the compose file.

## Testing

```sh
npm run test         # unit tests (vitest)
npm run test:mock    # mock API contract tests (138 checks)
npm run test:e2e     # Playwright E2E against docker compose stack
```

All tests must pass before committing:

```sh
npm run build && npm run test && npm run test:mock && npm run test:e2e
```
