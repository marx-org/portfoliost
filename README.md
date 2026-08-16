# Portfoliost

A Vue 3 investment portfolio tracker — parity build of [example-service.ai](https://app.example-service.ai).

## Tech stack

- **Vue 3** + TypeScript + `<script setup>` SFCs
- **Pinia** state management, **vue-router**
- **Tailwind CSS** for styling
- **ApexCharts** via vue3-apexcharts
- **Vite** build tool
- **Vitest** unit tests, **Playwright** E2E tests

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

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `API_BACKEND_URL` | `http://example-service-mock:4010` | Full URL of the API backend that nginx proxies `/api` requests to |
| `VITE_API_PROXY_TARGET` | `http://localhost:4010` | Backend URL for the Vite dev server proxy (`npm run dev` only) |

Both default to the local mock backend. When deploying against a real API,
override them:

```sh
# Docker Compose — point at a remote backend
API_BACKEND_URL=https://api.example.com docker compose up -d --build

# Dev server — point at a remote backend
VITE_API_PROXY_TARGET=https://api.example.com npm run dev
```

The frontend code itself uses only relative paths (`/api/...`) — no runtime
config change is needed in the Vue app. The backend target is resolved entirely
by the proxy layer (nginx in production, Vite in development).

## Docker

```sh
docker compose up -d --build
```

| Service | Port | Description |
| --- | --- | --- |
| `portfoliost` | `8080` | Nginx serving the Vue SPA + reverse-proxying `/api` |
| `example-service-mock` | `4010` | Mock REST API (seeded with captured data) |

To deploy without the mock, point `API_BACKEND_URL` at your real backend and
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
